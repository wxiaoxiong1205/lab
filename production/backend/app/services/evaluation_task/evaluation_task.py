import os
import re
import uuid
import json
import asyncio
import tempfile
import zipfile
from datetime import datetime
from typing import List, Optional, Dict, Any
from jinja2 import Template

from fastapi import HTTPException
from starlette.responses import StreamingResponse
from fastapi_pagination import Page
from sqlalchemy import select, desc

from app.core.logging import logger
from app.common.status import AnnotationStatus, TaskStatus
from app.common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from app.models.basic_metric_manager import EvaluationMetrics, MetricType
from app.models.evaluation_task_manager import (
    EvaluationTask,
    EvaluationTaskDatasetModelRelation,
    EvaluationReport
)
from app.models.inference_result_manager import InferenceResultDataset
from app.models.models import JwtUserInfo, TaskExecution
from app.repository.evaluation_task_mapper import (
    EvaluationTaskMapper,
    EvaluationTaskDatasetModelRelationMapper,
    EvaluationReportMapper,
    EvaluationMetricsMapper,
    EvaluationMetricMetadataRelationMapper
)
from app.schemas.evaluation_task import (
    EvaluationTaskCreate, EvaluationTaskSummaryResponse, EvaluationTaskDetailResponse,
    EvaluationReportResponse, TaskLogResponse,
    BasicMetricResponse, EvaluationType, EvaluationMethod,
    CalculationMethod, EvaluationTaskDatasetModelRelation as RelationSchema,
    EvaluationReportCreate, EvaluationReportUpdate,
    EvaluationDataSource, EvaluationMetricUpdate, EvaluationMetricCreate, EvaluationMetricResponse,
    AggregativeMetric, ModelReportData, ModelMetricSummary, EvaluationPromptMetricConfig, EvaluationPromptConfig,
    ManualEvaluationItemBatchUpdate, ManualEvaluationItemResponse, parse_status, PageItemResponse
)
from app.schemas.training_dataset import DatasetFormat
from app.schemas.inference_result import InferenceResultDatasetCreate, InferenceMethod as InferenceMethodEnum, \
    InferenceResultDatasetResponse
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.services.inference_result.interface import InferenceResultDatasetService
from app.services.storage.interface import StorageService
from app.utils.name_validator import validate_name_format
from app.utils.timezone_utils import to_local_tz
from .interface import EvaluationTaskService
from ..business_inference_result_dataset.business_inference_result_dataset import \
    DefaultBusinessInferenceResultDatasetServiceService

from ..common_config.interface import CommonConfigService
from ..project.interface import ProjectService
from ...common.common_config_enum import CommonConfigEnum
from ...common.status import TaskStatus, AnnotationStatus
from ...schemas.business_inference_result_dataset import BusinessInferenceResultDatasetCreate
from ...repository.task_execution_mapper import TaskExecutionMapper
from ...schemas.common_config import CommonConfigResponse
from ...utils import app_runtime_context
from ...utils.storage_enum import StoragePath
from ...utils.evaluation_result_file_parser import analyze_export_evaluation_result_file_single
from ...utils.dataset_file_parser import FILE_TYPE_CONFIG


def _increment_version(version: str) -> str:
    """递增版本号（v1 -> v2, v2 -> v3）

    Args:
        version: 当前版本号（如：v1, v2, v3）

    Returns:
        递增后的版本号
    """
    # 提取数字部分
    match = re.match(r'^v(\d+)$', version)
    if match:
        num = int(match.group(1))
        return f"v{num + 1}"
    else:
        # 如果格式不符合，默认从v1开始
        logger.warning(f"版本号格式不符合预期: {version}，将使用v1")
        return "v1"


def _get_max_version(versions: List[str]) -> Optional[str]:
    """获取最大版本号

    Args:
        versions: 版本号列表（如：['v1', 'v2', 'v3']）

    Returns:
        最大版本号，如果列表为空则返回None
    """
    if not versions:
        return None

    # 提取数字并排序
    version_nums = []
    for v in versions:
        match = re.match(r'^v(\d+)$', v)
        if match:
            version_nums.append((int(match.group(1)), v))

    if not version_nums:
        return None

    # 按数字排序，返回最大的版本号
    version_nums.sort(key=lambda x: x[0], reverse=True)
    return version_nums[0][1]


class DefaultEvaluationTaskService(EvaluationTaskService):
    """评估任务服务实现类"""

    @staticmethod
    def _reset_task_execution_state(db_task: EvaluationTask, schedule_at: Optional[datetime]) -> None:
        """重置任务执行态，供重新编辑/重新提交时复用。"""
        db_task.status = TaskStatus.SCHEDULED_PENDING.value if schedule_at else TaskStatus.CREATED.value
        db_task.schedule_at = schedule_at
        db_task.progress = 0
        db_task.celery_task_id = None
        db_task.error_message = None
        db_task.started_at = None
        db_task.finished_at = None
        db_task.lab_k8s_uuid = str(uuid.uuid4())

    def __init__(self,
                 task_mapper: EvaluationTaskMapper,
                 relation_mapper: EvaluationTaskDatasetModelRelationMapper,
                 report_mapper: EvaluationReportMapper,
                 evaluation_metrics_mapper: EvaluationMetricsMapper,
                 metric_metadata_relation_mapper: EvaluationMetricMetadataRelationMapper,
                 task_execution_mapper: TaskExecutionMapper,
                 common_config_service: CommonConfigService,
                 project_service: ProjectService,
                 storage: StorageService,
                 inference_result_service: InferenceResultDatasetService,
                 business_inference_result_dataset_service: DefaultBusinessInferenceResultDatasetServiceService
                 ) -> None:
        self.task_mapper = task_mapper
        self.relation_mapper = relation_mapper
        self.report_mapper = report_mapper
        self.evaluation_metrics_mapper = evaluation_metrics_mapper
        self.metric_metadata_relation_mapper = metric_metadata_relation_mapper
        self.task_execution_mapper = task_execution_mapper
        self.common_config_service = common_config_service
        self.project_service = project_service
        self.storage = storage
        self.inference_result_service = inference_result_service
        self.business_inference_result_dataset_service = business_inference_result_dataset_service

    # ------------------------------ 基础验证方法实现 ------------------------------

    async def validate_task(self, task_id: int, project_id: int) -> EvaluationTask:
        """验证评估任务是否存在且属于指定项目"""
        result = await self.task_mapper.query_one(
            select(EvaluationTask).filter(
                EvaluationTask.id == task_id,
                EvaluationTask.project_id == project_id
            )
        )
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"评估任务不存在: task_id={task_id}, project_id={project_id}"
            )
        return result

    # ------------------------------ 核心业务方法实现 ------------------------------
    async def run_create_evaluation_task_post_process(
            self,
            task_id: int,
            namespace: str,
            task_payload: dict,
            tenant_id: str
    ) -> Optional[str]:
        """提交评估任务到 Celery 并回写 celery_task_id"""
        from app.tasks.evaluation_tasks import create_evaluation_task_async

        logger.info(f"准备提交评估任务到Celery队列: task_id={task_id}, namespace={namespace}, tenant_id={tenant_id}")
        celery_result = create_evaluation_task_async.apply_async(
            args=[task_id, namespace, task_payload, tenant_id],
            countdown=1
        )
        if not celery_result.id:
            raise ValueError("Celery任务ID为空，任务可能未成功提交")

        db_task = await self.task_mapper.query_one(
            select(EvaluationTask).filter(EvaluationTask.id == task_id)
        )
        if not db_task:
            raise HTTPException(status_code=404, detail=f"评估任务不存在: task_id={task_id}")

        db_task.celery_task_id = celery_result.id
        await self.task_mapper.commit()
        logger.info(f"评估任务已成功提交到Celery队列: task_id={task_id}, Celery任务ID: {celery_result.id}")
        return celery_result.id

    async def create_evaluation_task(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            task: EvaluationTaskCreate
    ) -> EvaluationTaskDetailResponse:
        """创建或更新评估任务

        如果提供了 task.id 且任务存在，则执行更新操作
        否则创建新任务
        """
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 如果提供了 id，检查是否为更新操作
        is_update = False
        existing_task = None
        if task.id:
            existing_task = await self.task_mapper.query_one(
                select(EvaluationTask).filter(
                    EvaluationTask.id == task.id,
                    EvaluationTask.project_id == project_id
                )
            )
            if existing_task:
                is_update = True
                # 只有已创建/定时待启动/失败/已终止的任务可以进行编辑
                if existing_task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                                                TaskStatus.TERMINATED.value, TaskStatus.FAILED.value]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"只能更新状态为 已创建、定时待启动、失败、已终止的任务，当前任务状态为: {existing_task.status}"
                    )
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"评估任务不存在: task_id={task.id}"
                )

        # 验证任务名称
        try:
            validate_name_format(task.name, "任务名称")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # 检查名称是否重复（租户 + 项目空间id + name 唯一）
        # 如果是更新操作，排除当前任务本身
        tenant_id = app_runtime_context.get_tenant_id()
        if tenant_id:
            name_check_query = select(EvaluationTask).filter(
                EvaluationTask.name == task.name,
                EvaluationTask.project_id == project_id,
                EvaluationTask.tenant_id == tenant_id
            )
            if EvaluationMethod.MANUAL.value == task.evaluation_method:
                name_check_query = name_check_query.filter(
                    EvaluationTask.evaluation_method == EvaluationMethod.MANUAL.value)
            else:
                name_check_query = name_check_query.filter(
                    EvaluationTask.evaluation_method != EvaluationMethod.MANUAL.value)
            # 如果是更新操作，排除当前任务
            if is_update and existing_task:
                name_check_query = name_check_query.filter(EvaluationTask.id != existing_task.id)

            existing_task_with_same_name = await self.task_mapper.query_one(name_check_query)
            if existing_task_with_same_name:
                raise HTTPException(
                    status_code=400,
                    detail=f"已存在同名评估任务：{task.name}（同一租户和项目空间下名称必须唯一）"
                )

        # 验证评估类型和推理结果集数量
        if task.evaluation_type == EvaluationType.SINGLE:
            # 单个评估：至少需要1个推理结果集
            if len(task.dataset_model_relations) < 1:
                raise HTTPException(status_code=400, detail="单个评估至少需要1个推理结果集")
        elif task.evaluation_type == EvaluationType.COMPARISON:
            # 对比评估：至少需要2个推理结果集
            if len(task.dataset_model_relations) < 2:
                raise HTTPException(status_code=400, detail="对比评估至少需要2个推理结果集")

        # 验证评估方法对应的配置
        if task.evaluation_method == EvaluationMethod.REFEREE:
            if not task.referee_model_id:
                raise HTTPException(status_code=400, detail="裁判员评估需要提供裁判模型ID")
            if not task.referee_type:
                raise HTTPException(status_code=400, detail="裁判员评估需要提供referee_type（model或service）")
            if task.referee_type not in ["model", "service"]:
                raise HTTPException(status_code=400, detail="referee_type必须是model（离线模型）或service（在线服务）")
            if task.referee_type == "model" and not task.graphics_card_resource:
                raise HTTPException(status_code=400,
                                    detail="裁判员评估使用离线模型（referee_type=model）时，需要提供graphics_card_resource")
            if not task.evaluation_prompt_config:
                raise HTTPException(status_code=400, detail="裁判员评估需要提供评估Prompt配置")
            if task.basic_metric_config:
                raise HTTPException(status_code=400,
                                    detail="单独使用裁判员评估时，不能同时提供basic_metric_config。如需同时使用，请选择evaluation_method=all")
        elif task.evaluation_method == EvaluationMethod.BASIC_METRIC:
            if not task.basic_metric_config:
                raise HTTPException(status_code=400, detail="基础指标评估需要提供基础指标配置")
            if not task.basic_metric_config.metrics or len(task.basic_metric_config.metrics) == 0:
                raise HTTPException(status_code=400, detail="基础指标评估需要至少选择一个指标")
            if task.referee_model_id or task.evaluation_prompt_config:
                raise HTTPException(status_code=400,
                                    detail="单独使用基础指标评估时，不能同时提供referee_model_id或evaluation_prompt_config。如需同时使用，请选择evaluation_method=all")
        elif task.evaluation_method == EvaluationMethod.ALL:
            # 同时进行两种评估：必须同时提供裁判员评估和基础指标评估的配置
            if not task.referee_model_id:
                raise HTTPException(status_code=400, detail="同时评估需要提供referee_model_id")
            if not task.referee_type:
                raise HTTPException(status_code=400, detail="同时评估需要提供referee_type（model或service）")
            if task.referee_type not in ["model", "service"]:
                raise HTTPException(status_code=400, detail="referee_type必须是model（离线模型）或service（在线服务）")
            if task.referee_type == "model" and not task.graphics_card_resource:
                raise HTTPException(status_code=400,
                                    detail="同时评估使用离线模型（referee_type=model）时，需要提供graphics_card_resource")
            if not task.evaluation_prompt_config:
                raise HTTPException(status_code=400, detail="同时评估需要提供evaluation_prompt_config")
            if not task.basic_metric_config:
                raise HTTPException(status_code=400, detail="同时评估需要提供basic_metric_config")
            if not task.basic_metric_config.metrics or len(task.basic_metric_config.metrics) == 0:
                raise HTTPException(status_code=400, detail="同时评估需要至少选择一个基础指标")

        # 根据数据来源进行不同的验证和处理
        if task.data_source == EvaluationDataSource.EXISTING:
            # 已有推理结果集：验证推理结果集是否存在且不重复，并补全缺失字段
            dataset_ids = []
            source_dataset_ids = []  # 收集所有推理结果集的来源数据集ID
            datasets_for_validation = []  # 用于数量一致性校验
            for relation in task.dataset_model_relations:
                if not relation.inference_result_dataset_id:
                    raise HTTPException(status_code=400, detail="已有推理结果集时，必须提供inference_result_dataset_id")
                dataset_ids.append(relation.inference_result_dataset_id)

                # 验证推理结果集是否存在
                dataset = await self.task_mapper.query_one(
                    select(InferenceResultDataset).filter(
                        InferenceResultDataset.id == relation.inference_result_dataset_id,
                        InferenceResultDataset.project_id == project_id
                    )
                )
                if not dataset:
                    raise HTTPException(
                        status_code=404,
                        detail=f"推理结果集不存在: dataset_id={relation.inference_result_dataset_id}"
                    )
                datasets_for_validation.append(dataset)

                # 收集来源数据集ID
                if dataset.source_dataset_id:
                    source_dataset_ids.append(dataset.source_dataset_id)

                # 补全评估数据类型
                task.dataset_format = dataset.dataset_format
                task.dataset_type = dataset.dataset_type

                # 补全缺失的 evaluated_model_id（从推理结果集中获取）
                if not relation.evaluated_model_id or relation.evaluated_model_id == 0:
                    if dataset.inference_method == "offline":
                        # 离线推理：使用 model_id
                        relation.evaluated_model_id = dataset.model_id
                        relation.evaluated_model_source = dataset.model_source or "base_model"
                        logger.info(
                            f"补全 evaluated_model_id: 从推理结果集 {relation.inference_result_dataset_id} 获取 model_id={dataset.model_id}")
                    elif dataset.inference_method == "online":
                        # 在线推理：使用 online_service_id
                        relation.evaluated_model_id = dataset.online_service_id
                        logger.info(
                            f"补全 evaluated_model_id: 从推理结果集 {relation.inference_result_dataset_id} 获取 online_service_id={dataset.online_service_id}")
                    else:
                        # 导入的推理结果集：特殊处理，可能只有 model_name，没有 model_id
                        # 如果推理结果集中有 model_id 或 online_service_id，使用它们
                        relation.evaluated_model_id = dataset.model_id or dataset.online_service_id
                        if dataset.model_id:
                            relation.evaluated_model_source = dataset.model_source or "base_model"
                        logger.info(
                            f"补全 evaluated_model_id: 从推理结果集 {relation.inference_result_dataset_id} 获取 model_id={dataset.model_id} 或 online_service_id={dataset.online_service_id}")

                        # 如果推理结果集中也没有 model_id 和 online_service_id，这是导入的推理结果集的特殊情况
                        # 此时只能依赖用户提供的 evaluated_model_name，evaluated_model_id 需要设置为 0 或特殊值
                        if not relation.evaluated_model_id:
                            # 导入的推理结果集：如果没有 evaluated_model_name，使用推理结果集的 model_name
                            if not relation.evaluated_model_name:
                                relation.evaluated_model_name = dataset.model_name

                            # 对于导入的推理结果集，如果没有 model_id，evaluated_model_id 设置为 0（表示未知/导入的模型）
                            if not relation.evaluated_model_id:
                                relation.evaluated_model_id = 0
                                logger.warning(
                                    f"导入的推理结果集 {relation.inference_result_dataset_id} 没有 model_id，evaluated_model_id 设置为 0，evaluated_model_name={relation.evaluated_model_name}")

                    # 非导入的推理结果集，必须要有 evaluated_model_id
                    if dataset.inference_method != "import" and not relation.evaluated_model_id:
                        raise HTTPException(
                            status_code=400,
                            detail=f"推理结果集 {relation.inference_result_dataset_id} 无法确定待评估模型ID，请手动指定 evaluated_model_id"
                        )

                # 补全缺失的 evaluated_model_name（从推理结果集中获取）
                if not relation.evaluated_model_name:
                    relation.evaluated_model_name = dataset.model_name

                # 补全缺失的 evaluated_model_source，支持前端显式区分 base_model / trained_model / service
                if not relation.evaluated_model_source:
                    if dataset.inference_method in ["offline", "import"]:
                        relation.evaluated_model_source = (
                            dataset.model_source or "base_model"
                        ) if getattr(dataset, "model_source", None) else "base_model"
                    else:
                        relation.evaluated_model_source = "service"

            # 验证推理结果集不重复
            if len(dataset_ids) != len(set(dataset_ids)):
                raise HTTPException(status_code=400, detail="对比评估时，推理结果集不能重复")

            # 验证所有推理结果集的来源数据集必须相同
            if source_dataset_ids:
                unique_source_dataset_ids = set(source_dataset_ids)
                if len(unique_source_dataset_ids) > 1:
                    raise HTTPException(
                        status_code=400,
                        detail=f"所有推理结果集的来源数据集必须相同，当前包含多个不同的来源数据集: {unique_source_dataset_ids}"
                    )

            # 验证推理结果集数量是否一致（多个推理结果集时，各数据集的数据量必须相同）
            if len(datasets_for_validation) >= 2:
                total_items_values = [d.total_items for d in datasets_for_validation]
                if any(v is None or v == 0 for v in total_items_values):
                    raise HTTPException(
                        status_code=400,
                        detail="推理结果集数据量未就绪（存在空或未统计的数据集），请等待推理完成后再创建评估任务"
                    )
                unique_counts = set(total_items_values)
                if len(unique_counts) > 1:
                    details = [f"{d.name}(id={d.id}): {d.total_items}条" for d in datasets_for_validation]
                    raise HTTPException(
                        status_code=400,
                        detail=f"各推理结果集的数据量必须一致。当前各数据集数量: {'; '.join(details)}"
                    )

        elif task.data_source == EvaluationDataSource.NEW:
            # 新建推理结果集：验证创建推理结果集所需的参数
            if not task.dataset_model_relations:
                raise HTTPException(status_code=400, detail="新建推理结果集时，必须提供dataset_model_relations")

            # 验证所有关联关系都包含创建推理结果集所需的参数
            for idx, relation in enumerate(task.dataset_model_relations):
                if not relation.inference_method:
                    raise HTTPException(status_code=400, detail=f"第{idx + 1}个关联关系缺少inference_method（推理方式）")

                if relation.inference_method == "offline":
                    # 离线推理：需要模型ID、待推理数据
                    # graphics_card_resource 有默认值，不需要强制验证
                    if not relation.model_id:
                        raise HTTPException(status_code=400, detail=f"第{idx + 1}个关联关系（离线推理）缺少model_id")
                    if not relation.source_dataset_id:
                        raise HTTPException(status_code=400,
                                            detail=f"第{idx + 1}个关联关系（离线推理）缺少source_dataset_id")
                elif relation.inference_method == "online":
                    # 在线推理：需要服务ID、待推理数据
                    if not relation.online_service_id:
                        raise HTTPException(status_code=400,
                                            detail=f"第{idx + 1}个关联关系（在线推理）缺少online_service_id")
                    if not relation.source_dataset_id:
                        raise HTTPException(status_code=400,
                                            detail=f"第{idx + 1}个关联关系（在线推理）缺少source_dataset_id")
                elif relation.inference_method == "third_api":
                    if not relation.online_service_id:
                        raise HTTPException(status_code=400, detail=f"第{idx + 1}个关联关系（三方api）缺少api_id")
                    if not relation.source_dataset_id:
                        raise HTTPException(status_code=400,
                                            detail=f"第{idx + 1}个关联关系（在线推理）缺少source_dataset_id")
                else:
                    raise HTTPException(status_code=400,
                                        detail=f"第{idx + 1}个关联关系的inference_method不支持: {relation.inference_method}")

                # 验证待推理数据是否存在
                from app.models.training_dataset_manager import TrainingDataset
                source_dataset = await self.task_mapper.query_one(
                    select(TrainingDataset).filter(
                        TrainingDataset.id == relation.source_dataset_id,
                        TrainingDataset.project_id == project_id
                    )
                )
                if not source_dataset:
                    raise HTTPException(
                        status_code=404,
                        detail=f"待推理数据不存在: source_dataset_id={relation.source_dataset_id}"
                    )
                # 补全评估数据类型
                task.dataset_format = source_dataset.dataset_format
                task.dataset_type = source_dataset.dataset_type

            # 验证所有关联关系的来源数据集必须相同
            source_dataset_ids = [relation.source_dataset_id for relation in task.dataset_model_relations if
                                  relation.source_dataset_id]
            if source_dataset_ids:
                unique_source_dataset_ids = set(source_dataset_ids)
                if len(unique_source_dataset_ids) > 1:
                    raise HTTPException(
                        status_code=400,
                        detail=f"所有推理结果集的来源数据集必须相同，当前包含多个不同的来源数据集: {unique_source_dataset_ids}"
                    )

        # 如果data_source=new，先创建推理结果集（事务：任一步失败则回滚已创建的推理结果集并返回错误）
        if task.data_source == EvaluationDataSource.NEW:
            if not self.inference_result_service:
                raise HTTPException(status_code=500, detail="推理结果集服务未初始化，无法创建推理结果集")

            if not self.business_inference_result_dataset_service:
                raise HTTPException(status_code=500, detail="推理结果集服务未初始化，无法创建推理结果集")

            created_dataset_ids: List[tuple] = []  # [(project_id, dataset_id), ...]，用于失败时回滚
            try:
                for relation in task.dataset_model_relations:
                    # 生成数据集名称（如果没有提供）
                    dataset_name = relation.dataset_name
                    if not dataset_name:
                        # 根据模型名称自动生成：模型名称-推理结果
                        dataset_name = f"{task.name}-推理结果集-{int(datetime.now().timestamp())}"
                    # 判断是不是第三方api推理
                    if relation.inference_method == "third_api":
                        # 创建业务推理结果集合
                        inference_dataset_create = BusinessInferenceResultDatasetCreate(
                            name=f"{dataset_name}-{relation.sort_order}",
                            description=dataset_name,
                            inference_type=relation.inference_method,
                            api_name=relation.online_service_name,
                            api_id=relation.online_service_id,
                            dataset_name=relation.source_dataset_name,
                            dataset_id=relation.source_dataset_id,
                            param=relation.api_params,
                            schedule_at=task.schedule_at

                        )
                        inference_dataset_response = await self.business_inference_result_dataset_service.create_by_em(
                            project_id=project_id,
                            current_user=current_user,
                            request=inference_dataset_create
                        )
                        print("三方api推理")
                        print(f"业务推理结果集对象：{inference_dataset_response}")
                    else:
                        # 构建推理结果集创建请求
                        inference_dataset_create = InferenceResultDatasetCreate(
                            name=dataset_name,
                            description=relation.dataset_description,
                            inference_method=InferenceMethodEnum(relation.inference_method),
                            model_source=relation.model_source or "base_model",
                            model_id=relation.model_id,
                            model_name=relation.model_name,
                            online_service_id=relation.online_service_id,
                            online_service_name=relation.online_service_name,
                            source_dataset_id=relation.source_dataset_id,
                            source_dataset_name=relation.source_dataset_name,
                            inference_params=relation.inference_params,
                            graphics_card_resource=relation.graphics_card_resource,
                            usage=relation.usage,
                            schedule_at=task.schedule_at
                        )

                        # 创建推理结果集
                        manual_trigger_required = True
                        if task.evaluation_method == EvaluationMethod.MANUAL.value:
                            manual_trigger_required = False

                        inference_dataset_response = await self.inference_result_service.create_inference_result_dataset(
                            current_user=current_user,
                            project_id=project_id,
                            dataset=inference_dataset_create,
                            files=None,  # 评估任务创建时不支持文件上传
                            manual_trigger_required=manual_trigger_required  # 是否需要手动执行
                        )

                    created_dataset_ids.append((project_id, inference_dataset_response.id))
                    # 更新关联关系中的推理结果集ID
                    relation.inference_result_dataset_id = inference_dataset_response.id
            except HTTPException:
                raise
            except Exception as e:
                # 新建推理结果集失败：回滚已创建的推理结果集，并返回错误信息
                error_detail = str(e)
                for pid, did in created_dataset_ids:
                    try:
                        await self.inference_result_service.delete_inference_result_dataset(
                            project_id=pid, dataset_id=did
                        )
                        logger.info(f"已回滚新建的推理结果集: project_id={pid}, dataset_id={did}")
                    except Exception as rollback_e:
                        logger.warning(f"回滚删除推理结果集失败 dataset_id={did}: {rollback_e}")
                raise HTTPException(
                    status_code=400,
                    detail=f"创建推理结果集失败，已回滚已创建的推理结果集。错误信息: {error_detail}"
                )

        # 获取裁判模型名称
        referee_model_name = None
        referee_model_source = (
                    task.referee_model_source or "base_model").lower() if task.referee_model_source else "base_model"
        if task.referee_model_id and task.referee_type:
            if task.referee_type == "model":
                if referee_model_source == "trained_model":
                    from app.models.model_manager import TrainedModel
                    referee_model = await self.task_mapper.query_one(
                        select(TrainedModel).filter(TrainedModel.id == task.referee_model_id)
                    )
                    if referee_model:
                        referee_model_name = referee_model.name
                else:
                    from app.models.model_manager import BaseModel
                    referee_model = await self.task_mapper.query_one(
                        select(BaseModel).filter(BaseModel.id == task.referee_model_id)
                    )
                    if referee_model:
                        referee_model_name = referee_model.name
            elif task.referee_type == "service":
                from app.models.models import InferenceService
                referee_service = await self.task_mapper.query_one(
                    select(InferenceService).filter(InferenceService.id == task.referee_model_id)
                )
                if referee_service:
                    referee_model_name = referee_service.name

        # 如果是裁判员评估（REFEREE 或 ALL）或人工评估（MANUAL），补全 evaluation_prompt_config 中的 score_min 和 score_max
        if task.evaluation_prompt_config and (task.evaluation_method == EvaluationMethod.REFEREE or
                                              task.evaluation_method == EvaluationMethod.ALL or
                                              task.evaluation_method == EvaluationMethod.MANUAL):
            # 调用公共方法补充分值范围信息
            await self.append_evaluation_metrics_score(task.evaluation_prompt_config)

        if is_update:
            # 更新现有任务
            db_task = existing_task
            # 更新任务字段（保留创建信息）
            db_task.name = task.name
            db_task.description = task.description
            db_task.evaluation_type = task.evaluation_type.value
            db_task.data_source = task.data_source.value
            db_task.dataset_format = task.dataset_format if task.dataset_format else None
            db_task.evaluation_method = task.evaluation_method.value
            db_task.referee_model_id = task.referee_model_id
            db_task.referee_model_name = referee_model_name
            db_task.referee_model_source = referee_model_source if task.referee_type == "model" else None
            db_task.referee_type = task.referee_type
            db_task.referee_inference_params = task.referee_inference_params
            db_task.graphics_card_resource = task.graphics_card_resource.model_dump(
                mode='json') if task.graphics_card_resource else None
            db_task.evaluation_prompt_config = task.evaluation_prompt_config.model_dump(
                mode='json') if task.evaluation_prompt_config else None
            db_task.basic_metric_config = task.basic_metric_config.model_dump() if task.basic_metric_config else None
            # 人工评估相关字段
            db_task.dataset_type = task.dataset_type
            db_task.sampling_rate = task.sampling_rate
            db_task.total_items = None  # 更新时重置为None，后续从JSONL文件统计后更新
            db_task.completed_items = None  # 更新时重置为None，后续从JSONL文件统计后更新
            self._reset_task_execution_state(db_task, task.schedule_at)

            # 删除旧的关联关系
            old_relations = await self.relation_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == db_task.id
                )
            )
            for old_relation in old_relations:
                await self.relation_mapper.delete(old_relation)
            await self.relation_mapper.commit()

            # 提交任务更新
            await self.task_mapper.commit()
        else:
            # 创建新任务
            # 生成 lab_k8s_uuid
            k8s_uuid = str(uuid.uuid4())

            # 创建评估任务记录
            db_task = EvaluationTask(
                name=task.name,
                description=task.description,
                project_id=project_id,
                version="v1",  # 首次创建默认为v1
                parent_task_id=None,  # 首次创建为NULL
                evaluation_type=task.evaluation_type.value,
                data_source=task.data_source.value,
                dataset_format=task.dataset_format if task.dataset_format else None,
                evaluation_method=task.evaluation_method.value,
                referee_model_id=task.referee_model_id,
                referee_model_name=referee_model_name,
                referee_model_source=referee_model_source if task.referee_type == "model" else None,
                referee_type=task.referee_type,
                referee_inference_params=task.referee_inference_params,
                graphics_card_resource=task.graphics_card_resource.model_dump(
                    mode='json') if task.graphics_card_resource else None,
                evaluation_prompt_config=task.evaluation_prompt_config.model_dump(
                    mode='json') if task.evaluation_prompt_config else None,
                basic_metric_config=task.basic_metric_config.model_dump() if task.basic_metric_config else None,
                # 人工评估相关字段
                dataset_type=task.dataset_type,
                sampling_rate=task.sampling_rate,
                total_items=None,  # 创建时初始化为None，后续从JSONL文件统计后更新
                completed_items=None,  # 创建时初始化为None，后续从JSONL文件统计后更新
                status=TaskStatus.SCHEDULED_PENDING.value if task.schedule_at else TaskStatus.CREATED.value,
                schedule_at=task.schedule_at,
                progress=0,
                lab_k8s_uuid=k8s_uuid,
                celery_task_id=None,
                created_id=current_user.userId,
                created_by=current_user.username
            )

            # 保存任务以获取ID
            await self.task_mapper.insert(db_task)
            await self.task_mapper.commit()

        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        # 统计唯一的数据集ID
        unique_dataset_ids = list(
            set([relation.inference_result_dataset_id for relation in task.dataset_model_relations]))
        # 为每个数据集生成文件路径（根据evaluation_method生成不同的文件路径）
        file_paths = self._generate_file_path(db_task.id, namespace, task.name, unique_dataset_ids,
                                              db_task.evaluation_method)
        db_task.result_file_path = file_paths

        # 创建关联关系（字段已在验证阶段补全）
        for relation in task.dataset_model_relations:
            # 获取推理结果集信息（用于获取数据集名称）
            dataset: InferenceResultDataset = await self.task_mapper.query_one(
                select(InferenceResultDataset).filter(
                    InferenceResultDataset.id == relation.inference_result_dataset_id
                )
            )

            if not dataset:
                raise HTTPException(
                    status_code=404,
                    detail=f"推理结果集不存在: dataset_id={relation.inference_result_dataset_id}"
                )

            # 确保 evaluated_model_id 和 evaluated_model_name 已补全（如果验证阶段未补全，这里再次补全）
            if not relation.evaluated_model_id or relation.evaluated_model_id == 0:
                if dataset.inference_method == "offline":
                    relation.evaluated_model_id = dataset.model_id
                elif dataset.inference_method == "online":
                    relation.evaluated_model_id = dataset.online_service_id
                elif dataset.inference_method == "third_api":
                    relation.evaluated_model_id = dataset.online_service_id
                elif dataset.inference_method == "import":
                    # 导入的推理结果集：特殊处理，可能只有 model_name，没有 model_id
                    relation.evaluated_model_id = dataset.model_id or dataset.online_service_id
                    if not relation.evaluated_model_id:
                        # 导入的推理结果集没有 model_id，设置为 0（表示未知/导入的模型）
                        relation.evaluated_model_id = 0
                        logger.warning(
                            f"导入的推理结果集 {relation.inference_result_dataset_id} 没有 model_id，evaluated_model_id 设置为 0")
                else:
                    relation.evaluated_model_id = dataset.model_id or dataset.online_service_id

                # 非导入的推理结果集，必须要有 evaluated_model_id
                if dataset.inference_method != "import" and not relation.evaluated_model_id:
                    raise HTTPException(
                        status_code=400,
                        detail=f"推理结果集 {relation.inference_result_dataset_id} 无法确定待评估模型ID，请手动指定 evaluated_model_id"
                    )

            if not relation.evaluated_model_name:
                relation.evaluated_model_name = dataset.model_name

            if not relation.evaluated_model_source:
                if dataset.inference_method in ["offline", "import"]:
                    relation.evaluated_model_source = (
                        dataset.model_source or "base_model"
                    ) if getattr(dataset, "model_source", None) else "base_model"
                else:
                    relation.evaluated_model_source = "service"

        # 处理重复的模型名称：为重复的名称添加后缀（1）（2）等
        #
        # 规则说明：
        # - 对于重复的名称，所有出现都要添加后缀，从（1）开始
        # - 第一个出现的添加（1），第二个出现的添加（2），以此类推
        # - 唯一的名称（不重复）保持不变
        # - 使用英文括号 () 而不是中文括号（）
        #
        # 示例：
        #   demo1:
        #     原：["model_name", "model_name_ss", "model_name"]
        #     变为：["model_name(1)", "model_name_ss", "model_name(2)"]
        #
        #   demo2:
        #     原：["qwen", "qwen", "qwen", "chatglm"]
        #     变为：["qwen(1)", "qwen(2)", "qwen(3)", "chatglm"]
        #
        #   demo3:
        #     原：["gpt-4", "claude", "gpt-4", "gpt-4", "claude"]
        #     变为：["gpt-4(1)", "claude(1)", "gpt-4(2)", "gpt-4(3)", "claude(2)"]
        #
        #   demo4:
        #     原：["model_a", "model_b", "model_c"]  # 全部唯一
        #     变为：["model_a", "model_b", "model_c"]  # 保持不变
        #
        # 统计每个模型名称出现的次数
        name_count: Dict[str, int] = {}
        for relation in task.dataset_model_relations:
            model_name = relation.evaluated_model_name
            if model_name:
                name_count[model_name] = name_count.get(model_name, 0) + 1

        # 为重复的名称添加后缀
        processed_names: Dict[str, int] = {}  # 记录每个名称已处理的次数
        for relation in task.dataset_model_relations:
            original_name = relation.evaluated_model_name
            if not original_name:
                continue

            # 如果名称出现多次，需要为所有出现添加后缀
            if name_count[original_name] > 1:
                if original_name not in processed_names:
                    processed_names[original_name] = 0

                processed_names[original_name] += 1
                suffix_num = processed_names[original_name]  # 第一个添加（1），第二个添加（2）

                new_name = f"{original_name}({suffix_num})"
                relation.evaluated_model_name = new_name
                logger.info(
                    f"模型名称去重: {original_name} -> {new_name} (evaluated_model_id={relation.evaluated_model_id})")

        # 创建关联关系（字段已在验证阶段补全，名称已去重）
        for relation in task.dataset_model_relations:
            # 获取推理结果集信息（用于获取数据集名称）
            dataset: InferenceResultDataset = await self.task_mapper.query_one(
                select(InferenceResultDataset).filter(
                    InferenceResultDataset.id == relation.inference_result_dataset_id
                )
            )

            if not dataset:
                raise HTTPException(
                    status_code=404,
                    detail=f"推理结果集不存在: dataset_id={relation.inference_result_dataset_id}"
                )

            db_relation = EvaluationTaskDatasetModelRelation(
                evaluation_task_id=db_task.id,
                inference_result_dataset_id=relation.inference_result_dataset_id,
                inference_result_dataset_name=dataset.name,
                evaluated_model_id=relation.evaluated_model_id,
                evaluated_model_name=relation.evaluated_model_name,
                evaluated_model_source=relation.evaluated_model_source,
                sort_order=relation.sort_order,
                created_id=current_user.userId,
                created_by=current_user.username,
                api_params=relation.api_params if relation.api_params else {}
            )
            await self.relation_mapper.insert(db_relation)

        await self.relation_mapper.commit()

        # 创建执行任务（可定时 / 立即执行）
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        from app.utils.app_runtime_context import get_tenant_id
        tenant_id = get_tenant_id()
        if not tenant_id:
            tenant_id = db_task.tenant_id
        task_payload = task.model_dump(mode='json')

        try:
            # if task.schedule_at:
            #     execution = TaskExecution(
            #         business_type=TaskExecutionBusinessType.EVALUATION_TASK.value,
            #         business_id=db_task.id,
            #         schedule_at=task.schedule_at,
            #         status=TaskExecutionStatus.PENDING.value,
            #         executor=TaskExecutionExecutor.EVALUATION_TASK.value,
            #         method=TaskExecutionMethod.START.value,
            #         kwargs={
            #             "namespace": namespace,
            #             "task_payload": task_payload,
            #             "tenant_id": tenant_id
            #         }
            #     )
            #     await self.task_mapper.insert(execution)
            #     await self.task_mapper.commit()
            #     logger.info(f"评估任务已创建并等待执行: task_id={db_task.id}, schedule_at={task.schedule_at}")
            # else:
            #     await self.run_create_evaluation_task_post_process(
            #         task_id=db_task.id,
            #         namespace=namespace,
            #         task_payload=task_payload,
            #         tenant_id=tenant_id
            #     )
            if task.evaluation_method == EvaluationMethod.MANUAL.value:
                await self.run_create_evaluation_task_post_process(
                    task_id=db_task.id,
                    namespace=namespace,
                    task_payload=task_payload,
                    tenant_id=tenant_id
                )
            else:
                post_kwargs = {
                    "namespace": namespace,
                    "task_payload": task_payload,
                    "tenant_id": tenant_id
                }
                execution = await self.task_execution_mapper.query_one(
                    select(TaskExecution).filter(
                        TaskExecution.business_type == TaskExecutionBusinessType.EVALUATION_TASK.value,
                        TaskExecution.business_id == db_task.id
                    ).order_by(desc(TaskExecution.created_at))
                )
                if execution:
                    execution.schedule_at = task.schedule_at
                    execution.status = TaskExecutionStatus.PENDING.value
                    execution.executor = TaskExecutionExecutor.EVALUATION_TASK.value
                    execution.method = TaskExecutionMethod.START.value
                    execution.kwargs = post_kwargs
                    execution.retry_count = 0
                    execution.last_error = None
                    execution.locked_at = None
                    execution.locked_by = None
                else:
                    execution = TaskExecution(
                        business_type=TaskExecutionBusinessType.EVALUATION_TASK.value,
                        business_id=db_task.id,
                        schedule_at=task.schedule_at,
                        status=TaskExecutionStatus.PENDING.value,
                        executor=TaskExecutionExecutor.EVALUATION_TASK.value,
                        method=TaskExecutionMethod.START.value,
                        kwargs=post_kwargs
                    )
                    await self.task_execution_mapper.insert(execution)
                await self.task_execution_mapper.commit()
                logger.info(
                    f"评估任务执行器已{'更新' if is_update else '创建'}并等待执行: "
                    f"task_id={db_task.id}, schedule_at={task.schedule_at}"
                )
        except Exception as e:
            # 记录错误但不阻止响应返回（任务可以在后续重试）
            logger.error(
                f"提交评估任务到Celery队列失败: task_id={db_task.id}, "
                f"错误: {str(e)}, 错误类型: {type(e).__name__}",
                exc_info=True
            )
            # 更新任务状态为失败
            db_task.status = TaskStatus.FAILED.value
            await self.task_mapper.commit()
            # 可以选择抛出异常或继续（根据业务需求）
            raise HTTPException(
                status_code=500,
                detail=f"提交评估任务到队列失败: {str(e)}。请检查Celery broker连接和worker状态。"
            )

        # 转换为响应模型
        return await self._task_to_detail_response(db_task)

    async def list_evaluation_tasks(
            self,
            project_id: int,
            name: Optional[str] = None,
            status: Optional[TaskStatus] = None,
            evaluation_type: Optional[str] = None,
            evaluation_method: Optional[str] = None,
            dataset_format: Optional[str] = None,
            dataset_type: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[EvaluationTaskSummaryResponse]:
        """获取项目下的评估任务列表（分页）

        默认只返回模型评估任务（排除人工评估），如果指定了evaluation_method则按指定方法筛选
        """
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 构建查询
        query = select(EvaluationTask).filter(EvaluationTask.project_id == project_id)

        # 如果未指定evaluation_method，默认排除人工评估（只返回模型评估任务）
        if evaluation_method:
            query = query.filter(EvaluationTask.evaluation_method == evaluation_method)
        else:
            # 排除人工评估，只返回模型评估任务（referee、basic_metric、all）
            query = query.filter(EvaluationTask.evaluation_method != EvaluationMethod.MANUAL.value)

        if name:
            query = query.filter(EvaluationTask.name.like(f"%{name}%"))
        if status:
            query = query.filter(EvaluationTask.status == status.value)
        if evaluation_type:
            query = query.filter(EvaluationTask.evaluation_type == evaluation_type)
        if dataset_format:
            query = query.filter(EvaluationTask.dataset_format == dataset_format)
        if dataset_type:
            query = query.filter(EvaluationTask.dataset_type == dataset_type)

        query = query.order_by(desc(EvaluationTask.created_at))

        # 分页查询
        tasks = await self.task_mapper.query_page(query, page, size)

        # 转换为响应模型
        items = []
        for task in tasks.items:
            # 获取关联的推理结果集和模型名称
            relations = await self.relation_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == task.id
                )
            )

            # 确保 relations 不为 None，并提取名称列表（单循环保证 dataset_names 与 model_names 相对顺序一致）
            if relations is None:
                relations = []

            dataset_names = []
            model_names = []
            for r in relations:
                dataset_names.append(r.inference_result_dataset_name or "")
                model_names.append(r.evaluated_model_name or "")

            # 确保列表不为 None，至少是空列表
            if dataset_names is None:
                dataset_names = []
            if model_names is None:
                model_names = []

            item = EvaluationTaskSummaryResponse(
                id=task.id,
                name=task.name,
                version=task.version,
                status=parse_status(task.status),
                schedule_at=to_local_tz(task.schedule_at) if task.schedule_at else None,
                progress=task.progress,
                evaluation_type=EvaluationType(task.evaluation_type),
                dataset_format=DatasetFormat(task.dataset_format) if task.dataset_format else None,
                dataset_type=task.dataset_type,
                evaluation_method=EvaluationMethod(task.evaluation_method),
                inference_result_dataset_names=dataset_names,
                evaluated_model_names=model_names,
                created_by=task.created_by,
                created_at=to_local_tz(task.created_at),
                started_at=task.started_at,
                finished_at=datetime.now() if task.finished_at is None else task.finished_at,
                data_source=task.data_source,
            )
            items.append(item)

        # 返回分页结果
        # 手动构建分页响应
        total_pages = (tasks.total + size - 1) // size if tasks.total > 0 else 1

        # 创建分页响应
        return Page(
            items=items,
            total=tasks.total,
            page=page,
            size=size,
            pages=total_pages
        )

    async def get_evaluation_task(
            self,
            project_id: int,
            task_id: int
    ) -> EvaluationTaskDetailResponse:
        """获取指定评估任务详情"""
        task = await self.validate_task(task_id, project_id)
        return await self._task_to_detail_response(task)

    async def get_evaluation_task_versions(
            self,
            project_id: int,
            task_name: str
    ) -> List[EvaluationTaskSummaryResponse]:
        """根据任务名称获取所有版本列表"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 查询该任务名称下的所有版本
        tasks = await self.task_mapper.query(
            select(EvaluationTask).filter(
                EvaluationTask.project_id == project_id,
                EvaluationTask.name == task_name
            ).order_by(desc(EvaluationTask.version))
        )

        if not tasks:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{task_name}' 的评估任务"
            )

        # 转换为响应模型
        items = []
        for task in tasks:
            # 获取关联的推理结果集和模型名称
            relations = await self.relation_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == task.id
                )
            )

            # 确保 relations 不为 None，并提取名称列表（单循环保证 dataset_names 与 model_names 相对顺序一致）
            if relations is None:
                relations = []

            dataset_names = []
            model_names = []
            for r in relations:
                dataset_names.append(r.inference_result_dataset_name or "")
                model_names.append(r.evaluated_model_name or "")

            # 确保列表不为 None，至少是空列表
            if dataset_names is None:
                dataset_names = []
            if model_names is None:
                model_names = []

            item = EvaluationTaskSummaryResponse(
                id=task.id,
                name=task.name,
                version=task.version,
                status=parse_status(task.status),
                schedule_at=to_local_tz(task.schedule_at) if task.schedule_at else None,
                progress=task.progress,
                evaluation_type=EvaluationType(task.evaluation_type),
                dataset_format=DatasetFormat(task.dataset_format) if task.dataset_format else None,
                dataset_type=task.dataset_type,
                evaluation_method=EvaluationMethod(task.evaluation_method),
                inference_result_dataset_names=dataset_names,
                evaluated_model_names=model_names,
                created_by=task.created_by,
                created_at=to_local_tz(task.created_at)
            )
            items.append(item)

        return items

    async def clone_evaluation_task(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            task_id: int
    ) -> EvaluationTaskDetailResponse:
        """克隆评估任务（创建新任务，版本为v1）"""
        # 验证原始任务存在
        original_task = await self.validate_task(task_id, project_id)

        # 获取原始任务的关联关系
        original_relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == original_task.id
            )
        )

        # 创建克隆任务（新任务名称，版本为v1）
        cloned_task = EvaluationTask(
            name=f"{original_task.name}_clone",
            description=original_task.description,
            project_id=project_id,
            version="v1",
            parent_task_id=None,  # 克隆任务没有父任务
            evaluation_type=original_task.evaluation_type,
            data_source=original_task.data_source,
            dataset_format=original_task.dataset_format,
            evaluation_method=original_task.evaluation_method,
            referee_model_id=original_task.referee_model_id,
            referee_model_name=original_task.referee_model_name,
            referee_model_source=original_task.referee_model_source,
            referee_type=original_task.referee_type,
            referee_inference_params=original_task.referee_inference_params,
            graphics_card_resource=original_task.graphics_card_resource,
            evaluation_prompt_config=original_task.evaluation_prompt_config,
            basic_metric_config=original_task.basic_metric_config,
            # 人工评估相关字段
            dataset_type=original_task.dataset_type,
            sampling_rate=original_task.sampling_rate,
            total_items=None,  # 克隆时重置为None，后续从JSONL文件统计后更新
            completed_items=None,  # 克隆时重置为None，后续从JSONL文件统计后更新
            status=TaskStatus.CREATED.value,
            progress=0,
            lab_k8s_uuid=str(uuid.uuid4()),
            celery_task_id=None,
            result_file_path=None,
            created_id=current_user.userId,
            created_by=current_user.username
        )

        await self.task_mapper.insert(cloned_task)
        await self.task_mapper.commit()

        # 复制关联关系
        for orig_relation in original_relations:
            new_relation = EvaluationTaskDatasetModelRelation(
                evaluation_task_id=cloned_task.id,
                inference_result_dataset_id=orig_relation.inference_result_dataset_id,
                inference_result_dataset_name=orig_relation.inference_result_dataset_name,
                evaluated_model_id=orig_relation.evaluated_model_id,
                evaluated_model_name=orig_relation.evaluated_model_name,
                evaluated_model_source=getattr(orig_relation, "evaluated_model_source", None),
                sort_order=orig_relation.sort_order,
                created_id=current_user.userId,
                created_by=current_user.username,
                api_params=orig_relation.api_params,

            )
            await self.relation_mapper.insert(new_relation)

        await self.relation_mapper.commit()

        return await self._task_to_detail_response(cloned_task)

    async def delete_evaluation_task(
            self,
            project_id: int,
            task_id: int
    ) -> None:
        """删除评估任务"""
        task = await self.validate_task(task_id, project_id)

        # 删除关联关系
        relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
            )
        )
        for relation in relations:
            await self.relation_mapper.delete(relation)

        # 删除报告
        reports = await self.report_mapper.query(
            select(EvaluationReport).filter(
                EvaluationReport.evaluation_task_id == task_id
            )
        )
        for report in reports:
            await self.report_mapper.delete(report)

        # 删除任务
        await self.task_mapper.delete(task)
        await self.task_mapper.commit()

    # ------------------------------ 辅助方法 ------------------------------

    async def _task_to_detail_response(self, task: EvaluationTask) -> EvaluationTaskDetailResponse:
        """将数据库任务对象转换为详情响应模型"""
        # 获取关联关系
        relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task.id
            )
        )

        relation_schemas = []
        for r in relations:
            schema = RelationSchema.model_validate(r)
            # data_source=new 时从推理结果集回显 source_dataset_id、source_dataset_name
            if task.data_source == "new" and r.inference_result_dataset_id:
                inf_ds: InferenceResultDataset = await self.inference_result_service.dataset_mapper.query_one(
                    select(InferenceResultDataset).filter(
                        InferenceResultDataset.id == r.inference_result_dataset_id
                    )
                )
                if inf_ds is not None:
                    schema = schema.model_copy(update={
                        "source_dataset_id": inf_ds.source_dataset_id,
                        "source_dataset_name": inf_ds.source_dataset_name,
                        "inference_params": inf_ds.inference_params,
                    })
            relation_schemas.append(schema)

        # 解析JSON配置
        evaluation_prompt_config = None
        if task.evaluation_prompt_config:
            from app.schemas.evaluation_task import EvaluationPromptConfig
            evaluation_prompt_config = EvaluationPromptConfig(**task.evaluation_prompt_config)

            # 封装一个方法来处理额外的参数
            await self.append_evaluation_metrics_score(evaluation_prompt_config)

        basic_metric_config = None
        if task.basic_metric_config:
            from app.schemas.evaluation_task import BasicMetricConfig
            basic_metric_config = BasicMetricConfig(**task.basic_metric_config)

        graphics_card_resource = None
        if task.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**task.graphics_card_resource)

        # 解析状态（支持TaskStatus和AnnotationStatus）
        parsed_status = parse_status(task.status)

        return EvaluationTaskDetailResponse(
            id=task.id,
            name=task.name,
            description=task.description,
            project_id=task.project_id,
            version=task.version,
            parent_task_id=task.parent_task_id,
            evaluation_type=EvaluationType(task.evaluation_type),
            data_source=task.data_source,
            dataset_format=DatasetFormat(task.dataset_format) if task.dataset_format else None,
            evaluation_method=EvaluationMethod(task.evaluation_method),
            dataset_model_relations=relation_schemas,
            referee_model_id=task.referee_model_id,
            referee_model_name=task.referee_model_name,
            referee_model_source=getattr(task, 'referee_model_source', None),
            referee_type=task.referee_type,
            referee_inference_params=task.referee_inference_params,
            graphics_card_resource=graphics_card_resource,
            evaluation_prompt_config=evaluation_prompt_config,
            basic_metric_config=basic_metric_config,
            # 人工评估相关字段
            dataset_type=task.dataset_type,
            sampling_rate=float(task.sampling_rate) if task.sampling_rate is not None else None,
            total_items=task.total_items,
            completed_items=task.completed_items,
            status=parsed_status,
            schedule_at=to_local_tz(task.schedule_at) if task.schedule_at else None,
            progress=task.progress,
            started_at=to_local_tz(task.started_at) if task.started_at else None,
            finished_at=to_local_tz(task.finished_at) if task.finished_at else None,
            created_by=task.created_by,
            created_at=to_local_tz(task.created_at)
        )

    # ------------------------------ 占位方法（待实现） ------------------------------

    async def get_evaluation_results(
            self,
            project_id: int,
            task_id: int,
            dataset_id: int,
            page: int = 1,
            size: int = 10,
            evaluation_method: Optional[str] = "referee"
    ) -> "PageItemResponse":
        """获取评估结果明细（从JuiceFS读取，分页）

        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            dataset_id: 推理结果集ID
            page: 页码
            size: 每页数量
            evaluation_method: 评估方法筛选（referee/basic_metric），默认为referee
        """
        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        # 2. 根据evaluation_method筛选文件路径
        import re
        target_file_path = None

        # 如果evaluation_method是all，需要根据指定的评估方法筛选
        if task.evaluation_method == "all":
            # 使用正则表达式匹配包含任务ID的标识符
            if evaluation_method == "referee":
                # 匹配裁判员评估文件：source_{dataset_id}__REFEREE_T{task_id}__
                pattern = re.compile(rf'source_{dataset_id}__REFEREE_T{task_id}__')
            elif evaluation_method == "basic_metric":
                # 匹配基础指标评估文件：source_{dataset_id}__BASIC_METRIC_T{task_id}__
                pattern = re.compile(rf'source_{dataset_id}__BASIC_METRIC_T{task_id}__')
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"不支持的评估方法: {evaluation_method}，仅支持 referee 或 basic_metric"
                )

            for path in task.result_file_path or []:
                filename = os.path.basename(path)
                if pattern.search(filename):
                    target_file_path = path
                    break
        else:
            # 非all模式，直接匹配source_{dataset_id}
            # 兼容新旧格式：source_{dataset_id}_ 或 source_{dataset_id}__
            target_pattern = re.compile(rf'source_{dataset_id}(?:_|__)')
            for path in task.result_file_path or []:
                filename = os.path.basename(path)
                if target_pattern.search(filename):
                    target_file_path = path
                    break

        if not target_file_path:
            raise HTTPException(
                status_code=404,
                detail=f"在评估结果中未找到对应推理结果集 (ID: {dataset_id}) 的{evaluation_method}评估文件"
            )

        # 3. 获取 JuiceFS 客户端并读取文件
        jfs = await self.storage.JUICEFS_CLIENT()
        if not jfs.exists(target_file_path):
            logger.error(f"评估结果文件丢失: {target_file_path}")
            raise HTTPException(status_code=404, detail="评估结果文件在存储系统中未找到")

        # 4. 读取并处理数据
        all_items = []
        try:
            with jfs.open(target_file_path, 'r', encoding='utf-8') as f:
                for idx, line in enumerate(f):
                    if not line.strip():
                        continue
                    item = json.loads(line)

                    # 打平 evaluations 列
                    evaluations = item.pop("evaluations", [])
                    # 为每个指标添加百分比分数
                    for evaluation in evaluations:
                        if isinstance(evaluation, dict):
                            score = evaluation.get("score")
                            score_max = evaluation.get("score_max")
                            # 计算百分比分数：当前分数 / 最大值
                            if score is not None and score_max is not None and score_max > 0:
                                percentage_score = round((score / score_max) * 100, 2)
                                evaluation["percentage_score"] = percentage_score
                            else:
                                evaluation["percentage_score"] = None

                    # 指标不打平，直接返回给前端 sample
                    # "metrics" : [
                    #         {
                    #             "metric_name": "语义连贯性",
                    #             "description": "语义是否通顺连贯",
                    #             "score_min": 0,
                    #             "score_max": 10,
                    #             "score": 9,
                    #             "percentage_score": 90.0,
                    #             "reason": "生成的摘要信息清晰，准确传达了原文的核心意思，*",
                    #             "error": false,
                    #             "raw_response": "{\n  \"语义连贯性\": {\n    \"score\": 9,\n    \"reason\": \"生成的摘要信息清晰，*。\"\n  }\n}"
                    #         }
                    #     ]
                    item["metrics"] = evaluations
                    # 序号
                    item["serial_no"] = idx + 1
                    all_items.append(item)
        except Exception as e:
            logger.error(f"解析评估结果文件失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"解析评估结果失败: {str(e)}")

        # 5. 查询推理结果集以获取 dataset_format
        dataset = await self.task_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        dataset_format = dataset.dataset_format if dataset else None

        # 6. 分页处理
        total = len(all_items)
        start = (page - 1) * size
        end = start + size
        items = all_items[start:end]

        from fastapi_pagination import Params
        # 手动构造 Page 对象
        return PageItemResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            pages=(total + size - 1) // size if size > 0 else 0,
            base_url=
            self.inference_result_service._build_base_url(
                project_id=project_id,
                dataset_id=dataset_id,
                data_format=dataset_format),
        )

    async def download_evaluation_results(
            self,
            project_id: int,
            task_id: int,
            format: str = "jsonl",
            dataset_id: Optional[int] = None,
            evaluation_method: Optional[str] = "referee"
    ):
        """下载评估结果（从JuiceFS读取原始 .jsonl 文件 并转化为对应的format格式）

        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            format: 下载格式（xlsx/csv/json/jsonl）
            dataset_id: 数据集ID筛选
            evaluation_method: 评估方法筛选（referee/basic_metric），默认为referee
        """
        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        if task.status != TaskStatus.COMPLETED.value:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有已完成的任务可以下载结果"
            )

        if not task.result_file_path:
            raise HTTPException(status_code=404, detail="评估结果文件路径为空，请检查任务执行情况")

        # 2. 根据evaluation_method筛选文件路径
        target_file_path = None

        if dataset_id:
            # 如果evaluation_method是all，需要根据指定的评估方法筛选
            if task.evaluation_method == "all":
                # 使用正则表达式匹配包含任务ID的标识符
                if evaluation_method == "referee":
                    # 匹配裁判员评估文件：source_{dataset_id}__REFEREE_T{task_id}__
                    pattern = re.compile(rf'source_{dataset_id}__REFEREE_T{task_id}__')
                elif evaluation_method == "basic_metric":
                    # 匹配基础指标评估文件：source_{dataset_id}__BASIC_METRIC_T{task_id}__
                    pattern = re.compile(rf'source_{dataset_id}__BASIC_METRIC_T{task_id}__')
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"不支持的评估方法: {evaluation_method}，仅支持 referee 或 basic_metric"
                    )

                for path in task.result_file_path:
                    filename = os.path.basename(path)
                    if pattern.search(filename):
                        target_file_path = path
                        break
            else:
                # 非all模式，直接匹配source_{dataset_id}
                # 兼容新旧格式：source_{dataset_id}_ 或 source_{dataset_id}__
                target_pattern = re.compile(rf'source_{dataset_id}(?:_|__)')
                for path in task.result_file_path:
                    filename = os.path.basename(path)
                    if target_pattern.search(filename):
                        target_file_path = path
                        break

            if not target_file_path:
                raise HTTPException(
                    status_code=404,
                    detail=f"在评估结果中未找到对应推理结果集 (ID: {dataset_id}) 的{evaluation_method}评估文件"
                )
        else:
            # 未指定数据集 ID，根据evaluation_method筛选
            if task.evaluation_method == "all":
                # 筛选指定评估方法的文件
                if evaluation_method == "referee":
                    pattern = re.compile(rf'__REFEREE_T{task_id}__')
                elif evaluation_method == "basic_metric":
                    pattern = re.compile(rf'__BASIC_METRIC_T{task_id}__')
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"不支持的评估方法: {evaluation_method}，仅支持 referee 或 basic_metric"
                    )

                for path in task.result_file_path:
                    filename = os.path.basename(path)
                    if pattern.search(filename):
                        target_file_path = path
                        break

                if not target_file_path:
                    raise HTTPException(
                        status_code=404,
                        detail=f"未找到{evaluation_method}评估结果文件"
                    )
            else:
                # 非all模式，如果只有一个文件则直接返回；多个文件则默认返回第一个
                target_file_path = task.result_file_path[0]

        if not target_file_path:
            raise HTTPException(status_code=404, detail="未找到符合条件的评估结果文件")

        # 3. 构建下载文件名：评估任务名称_推理结果集name_BASIC_METRIC.{format 对应后缀}
        relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
            )
        )
        dataset_id_to_name = {
            r.inference_result_dataset_id: (
                        r.inference_result_dataset_name or f"dataset_{r.inference_result_dataset_id}")
            for r in relations if r.inference_result_dataset_id
        }

        # 确定当前文件对应的 dataset_id：请求指定则用；否则从路径中提取 source_{dataset_id}
        resolved_dataset_id = dataset_id
        if resolved_dataset_id is None:
            match = re.search(r'source_(\d+)(?:_|__)', os.path.basename(target_file_path))
            if match:
                try:
                    resolved_dataset_id = int(match.group(1))
                except ValueError:
                    pass
        dataset_name = dataset_id_to_name.get(resolved_dataset_id,
                                              "result") if resolved_dataset_id is not None else "result"
        method_display = "BASIC_METRIC" if (evaluation_method or "").lower() == "basic_metric" else "REFEREE"

        export_format = (format or "jsonl").lower()
        if export_format not in ("jsonl", "json", "xlsx", "csv"):
            raise HTTPException(status_code=400, detail="不支持的导出格式，仅支持 jsonl、json、xlsx、csv")

        # 4. 从 JuiceFS 读取并返回（多格式时调用转换方法）
        jfs = await self.storage.JUICEFS_CLIENT()
        if not jfs.exists(target_file_path):
            logger.error(f"评估结果文件丢失: {target_file_path}")
            raise HTTPException(status_code=404, detail="评估结果文件在存储系统中未找到")

        from app.utils.http_util import build_content_disposition_header

        safe_task_name = re.sub(r'[<>:"/\\|?*]', '_', task.name or "evaluation")
        if export_format == "jsonl":
            download_filename = f"{safe_task_name}-评估详情.jsonl"

            def generate_file_content():
                with jfs.open(target_file_path, 'rb') as f:
                    while True:
                        chunk = f.read(64 * 1024)
                        if not chunk:
                            break
                        yield chunk

            return StreamingResponse(
                generate_file_content(),
                media_type='application/octet-stream',
                headers={"Content-Disposition": build_content_disposition_header(download_filename)}
            )

        # 多格式导出：调用 analyze_export_evaluation_result_file_single 转换后返回
        try:
            file_content = await analyze_export_evaluation_result_file_single(
                target_file_path=target_file_path,
                export_file_type=export_format,
                storage_service=self.storage,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        suffix_media = {
            "json": (".json", "application/json"),
            "xlsx": (".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "csv": (".csv", "text/csv; charset=utf-8"),
        }
        suffix, media_type = suffix_media.get(export_format, (".jsonl", "application/octet-stream"))
        download_filename = f"{safe_task_name}-评估详情{suffix}"
        return StreamingResponse(
            iter([file_content]),
            media_type=media_type,
            headers={"Content-Disposition": build_content_disposition_header(download_filename)}
        )

    async def get_evaluation_report(
            self,
            project_id: int,
            task_id: int,
            evaluation_method: Optional[EvaluationMethod] = None,
            calculation_method: Optional[CalculationMethod] = None,
            model_id: Optional[int] = None
    ) -> Optional[EvaluationReportResponse]:
        """获取评估报告（汇总统计信息）

        从数据库直接查询评估报告数据，返回每个模型的聚合指标数组。
        如果提供了 evaluation_method 参数，则只返回该评估方法的报告。
        如果提供了 calculation_method 参数，则只返回该计算方式的结果。
        如果提供了 model_id 参数，则只返回该模型的报告。

        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            evaluation_method: 评估方法筛选（referee/basic_metric），如果提供则只返回该评估方法的报告
            calculation_method: 计算方式筛选（average/max/min），如果提供则只返回该计算方式的结果
            model_id: 模型ID筛选（对比评估时使用）

        Returns:
            EvaluationReportResponse: 评估报告响应，如果不存在则返回 None
        """
        from collections import defaultdict

        # 1. 验证任务存在且属于指定项目
        task = await self.validate_task(task_id, project_id)

        # 2. 查询数据库中的评估报告
        query = select(EvaluationReport).filter(
            EvaluationReport.evaluation_task_id == task_id
        )

        # 根据 evaluation_method 过滤
        if evaluation_method is not None:
            query = query.filter(EvaluationReport.evaluation_method == evaluation_method.value)

        # 根据 model_id 过滤
        if model_id is not None:
            query = query.filter(EvaluationReport.evaluated_model_id == model_id)

        # 注意：如果任务类型是 all，可能会返回多条报告（referee 和 basic_metric 各一条）
        reports = await self.report_mapper.query(query)

        if not reports:
            return None

        # 若有基础指标评估报告，加载 code->id 和 code->name 映射（报告中存储的是 metric_code）
        basic_metric_code_to_id: Dict[str, int] = {}
        basic_metric_code_to_name: Dict[str, str] = {}
        if any(r.evaluation_method == EvaluationMethod.BASIC_METRIC.value for r in reports):
            basic_metrics = await self.evaluation_metrics_mapper.query(
                select(EvaluationMetrics).filter(
                    EvaluationMetrics.metric_type == MetricType.BASIC_METRIC
                ).order_by(EvaluationMetrics.id.asc())
            )
            for m in basic_metrics:
                if m.metric_code:
                    basic_metric_code_to_id[m.metric_code] = m.id
                    basic_metric_code_to_name[m.metric_code] = m.name

        # 3. 按模型分组并转换为响应格式
        model_reports = []

        for report in reports:
            # 处理聚合指标
            aggregative_metrics_list = []

            if report.metric_summary and isinstance(report.metric_summary, list):
                # 按计算方式分组指标
                metrics_by_method: Dict[str, Dict[str, ModelMetricSummary]] = defaultdict(dict)

                for agg_metric in report.metric_summary:
                    if isinstance(agg_metric, dict):
                        method = agg_metric.get("calculation_method")
                        metric_summary = agg_metric.get("metric_summary")

                        if method and metric_summary and isinstance(metric_summary, dict):
                            # 新格式：Dict[str, ModelMetricSummary]（字典格式），直接使用
                            # 从数据库读取的是字典格式的 ModelMetricSummary，需要转换为对象
                            model_metric_summary_dict = {}
                            for metric_name, metric_data in metric_summary.items():
                                if isinstance(metric_data, dict):
                                    # 新格式：字典格式的 ModelMetricSummary，转换为对象
                                    try:
                                        model_metric_summary_dict[metric_name] = ModelMetricSummary(**metric_data)
                                    except Exception as e:
                                        logger.warning(f"无法转换指标 {metric_name} 的数据: {e}")
                                        continue
                                elif isinstance(metric_data, (int, float)):
                                    # 兼容老格式：Dict[str, float]，转换为 ModelMetricSummary
                                    # 不存在的字段（score_min, score_max, percentage_score）直接为 None
                                    try:
                                        old_data = ModelMetricSummary(
                                            metric_name=metric_name,
                                            score=float(metric_data),
                                            score_min=None,
                                            score_max=None,
                                            percentage_score=None
                                        )
                                        model_metric_summary_dict[metric_name] = old_data
                                    except Exception as e:
                                        logger.warning(f"无法转换老格式指标 {metric_name} 的数据: {e}")
                                        continue
                                else:
                                    logger.warning(
                                        f"指标 {metric_name} 的数据格式不正确，期望字典或数字: {type(metric_data)}")
                                    continue

                            if model_metric_summary_dict:
                                # 按计算方式分组，直接使用 ModelMetricSummary 对象
                                if method not in metrics_by_method:
                                    metrics_by_method[method] = {}
                                metrics_by_method[method].update(model_metric_summary_dict)

                # 根据 calculation_method 过滤
                if calculation_method is not None:
                    method_value = calculation_method.value
                    if method_value in metrics_by_method:
                        filtered_metrics = {
                            method_value: metrics_by_method[method_value]
                        }
                    else:
                        filtered_metrics = {}
                else:
                    filtered_metrics = dict(metrics_by_method)

                # 构建 AggregativeMetric 列表，直接使用 ModelMetricSummary 对象
                for method, metric_summary in filtered_metrics.items():
                    if metric_summary:  # 只添加非空的指标汇总
                        # 基础指标评估：报告中存储的是 code，需按 id 排序并将 code 转为 name
                        if report.evaluation_method == EvaluationMethod.BASIC_METRIC.value and basic_metric_code_to_id:
                            ordered_items = sorted(
                                metric_summary.items(),
                                key=lambda x: (basic_metric_code_to_id.get(x[0], 999999), x[0])
                            )
                            # 将 code 转为 name 作为 key，并更新 ModelMetricSummary.metric_name
                            converted = {}
                            for code, summary_obj in ordered_items:
                                display_name = basic_metric_code_to_name.get(code, code)
                                if isinstance(summary_obj, ModelMetricSummary):
                                    summary_dict = summary_obj.model_dump()
                                    summary_dict["metric_name"] = display_name
                                    converted[display_name] = ModelMetricSummary(**summary_dict)
                                elif isinstance(summary_obj, dict):
                                    converted[display_name] = ModelMetricSummary(
                                        **{**summary_obj, "metric_name": display_name}
                                    )
                                else:
                                    converted[display_name] = summary_obj
                            metric_summary = converted
                        aggregative_metrics_list.append(
                            AggregativeMetric(
                                calculation_method=CalculationMethod(method),
                                metric_summary=metric_summary
                            )
                        )

            # 处理对比数据
            comparison_data = None
            if report.comparison_data and isinstance(report.comparison_data, dict):
                # TODO: 如果需要，可以转换为 ComparisonData 对象
                comparison_data = report.comparison_data

            if aggregative_metrics_list:
                # 从数据库读取 evaluation_method，如果不存在则使用任务的方法（向后兼容）
                evaluation_method_value = report.evaluation_method if hasattr(report,
                                                                              'evaluation_method') and report.evaluation_method else task.evaluation_method
                model_reports.append(
                    ModelReportData(
                        model_id=report.evaluated_model_id,
                        model_name=report.evaluated_model_name or f"模型_{report.evaluated_model_id}",
                        evaluated_model_source=getattr(report, "evaluated_model_source", None),
                        evaluation_method=EvaluationMethod(evaluation_method_value),
                        aggregative_metrics=aggregative_metrics_list,
                        comparison_data=comparison_data
                    )
                )

        if not model_reports:
            return None

        # 4. 构建返回响应
        return EvaluationReportResponse(
            evaluation_task_id=task_id,
            evaluation_type=EvaluationType(task.evaluation_type),
            model_reports=model_reports
        )

    async def download_evaluation_report_docx(
            self,
            project_id: int,
            task_id: int,
            evaluation_method: Optional[EvaluationMethod] = None,
            calculation_method: CalculationMethod = CalculationMethod.AVERAGE
    ):
        """下载评估报告DOCX文件

        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            evaluation_method: 评估方法筛选（referee/basic_metric），如果提供则只导出该评估方法的报告。如果不提供且任务使用了all方法，则导出所有评估方法的结果。
            calculation_method: 计算方式（average/max/min），默认使用average

        Returns:
            StreamingResponse: DOCX文件流
        """
        # 1. 获取任务基本信息
        task_data = await self.get_evaluation_task(project_id, task_id)

        # 2. 获取评估报告数据
        report_data = await self.get_evaluation_report(
            project_id, task_id, evaluation_method, calculation_method
        )

        if report_data is None:
            raise HTTPException(
                status_code=404,
                detail=f"评估任务 {task_id} 没有找到评估报告数据"
            )

        # 3. 生成DOCX
        from app.utils.evaluation_report_docx_generator import EvaluationReportDocxGenerator
        generator = EvaluationReportDocxGenerator(task_data, report_data)
        docx_bytes = generator.generate()

        # 4. 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # 清理文件名中的特殊字符
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', task_data.name)
        filename = f"评估报告_{safe_name}_{timestamp}.docx"

        # 5. 返回文件流（使用 build_content_disposition_header 支持中文文件名）
        from app.utils.http_util import build_content_disposition_header

        return StreamingResponse(
            iter([docx_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": build_content_disposition_header(filename)}
        )

    async def get_task_logs(
            self,
            project_id: int,
            task_id: int,
            end_time: datetime,
            days: Optional[int] = 30,
    ) -> TaskLogResponse:
        """获取任务日志（分页）
        :param end_time:
        :param days:
        """
        # 导入公共日志服务
        from app.utils.log_service import log_service
        # 验证任务存在
        # 验证项目和任务存在
        task: EvaluationTask = await self.validate_task(task_id, project_id)

        # 判断日志来源
        if task.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(task.log_path)
            return TaskLogResponse(archived=True, logs=logs)
        else:
            # 从Loki获取实时日志
            if not task.lab_k8s_uuid:
                raise HTTPException(
                    status_code=400,
                    detail="任务没有关联的K8S UUID"
                )
            # 使用传入的结束时间和天数参数
            logs = log_service.get_logs_from_loki(
                task.lab_k8s_uuid,
                end_time=end_time,
                days=days if days else 30
            )
            return TaskLogResponse(archived=False, logs=logs)

    async def download_task_logs(
            self,
            project_id: int,
            task_id: int
    ):
        """下载任务日志文件

        Args:
            project_id: 项目ID
            task_id: 评估任务ID

        Returns:
            StreamingResponse: 日志文件流
        """
        # 导入公共日志服务
        from app.utils.log_service import log_service

        # 验证任务存在
        task: EvaluationTask = await self.validate_task(task_id, project_id)

        # 检查是否有归档日志
        if not task.log_path:
            raise HTTPException(
                status_code=404,
                detail="任务没有归档日志，无法下载。请等待任务完成后日志归档。"
            )

        # 从MinIO下载日志文件
        if not log_service.minio_client:
            raise HTTPException(
                status_code=500,
                detail="MinIO客户端未初始化，无法下载日志"
            )

        try:
            # 检查文件是否存在
            try:
                log_service.minio_client.stat_object(
                    bucket_name=log_service.bucket,
                    object_name=task.log_path
                )
            except Exception as e:
                logger.error(f"检查日志文件失败: {e}")
                raise HTTPException(
                    status_code=404,
                    detail=f"日志文件不存在: {task.log_path}"
                )

            # 生成下载文件名
            download_filename = f"evaluation_task_{task_id}_logs.log"

            # 定义生成器，流式返回文件内容
            def generate_file_content():
                try:
                    # 从MinIO获取对象并流式返回
                    response = log_service.minio_client.get_object(
                        bucket_name=log_service.bucket,
                        object_name=task.log_path
                    )
                    try:
                        while True:
                            chunk = response.read(64 * 1024)  # 64KB chunks
                            if not chunk:
                                break
                            yield chunk
                    finally:
                        response.close()
                        response.release_conn()
                except Exception as e:
                    logger.error(f"下载日志文件失败: {e}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"下载日志文件失败: {str(e)}"
                    )

            from app.utils.http_util import build_content_disposition_header

            return StreamingResponse(
                generate_file_content(),
                media_type='text/plain',
                headers={"Content-Disposition": build_content_disposition_header(download_filename)}
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"下载任务日志失败: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"下载任务日志失败: {str(e)}"
            )

    async def stop_evaluation_task(
            self,
            project_id: int,
            task_id: int
    ) -> None:
        """停止评估任务

        Args:
            project_id: 项目ID
            task_id: 评估任务ID

        功能：
            1. 更新任务状态为终止
            2. 在K8s上删除对应的Jobs
        """
        from app.common.status import TaskStatus
        from app.utils.k8s_launcher import K8sLauncher
        from sqlalchemy import select
        from app.models.models import KubernetesResource, ProjectKubernetesRelation

        # 1. 验证任务存在
        task = await self.validate_task(task_id, project_id)

        # 只有运行中/排队中可以终止
        if task.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有运行中、排队中的任务才能停止"
            )

        # 3. 更新任务状态为终止
        task.status = TaskStatus.TERMINATED.value
        task.error_message = "任务已被用户停止"

        # 4. 更新任务结束时间
        task.finished_at = datetime.now()
        # 兜底逻辑，若此时任务开始时间为空，设置开始时间为任务创建时间
        if not task.started_at:
            # 优先使用 created_at
            task.started_at = task.created_at
            logger.warning(
                f"评估任务 {task.id} 在终态时 started_at 为空，"
                f"使用 created_at ({task.started_at}) 作为兜底值"
            )

        await self.task_mapper.commit()
        logger.info(f"评估任务 {task_id} 状态已更新为终止")

        # 4. 在K8s上删除对应的Jobs
        try:
            # 获取K8s配置
            k8s_configs = await self.task_mapper.query(
                select(KubernetesResource.config)
                .join(ProjectKubernetesRelation,
                      ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                .filter(ProjectKubernetesRelation.project_id == project_id)
            )

            if not k8s_configs:
                logger.warning(f"项目 {project_id} 没有找到K8s配置，跳过删除Job")
                return

            kubeconfig_str = k8s_configs[0]
            launcher = K8sLauncher(config_str=kubeconfig_str)

            # 生成命名空间
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

            # 根据关联关系判断是离线还是在线评估
            # 查询关联关系
            relations = await self.relation_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
                )
            )

            # 判断是离线还是在线评估
            # 如果有关联的推理结果集，从推理结果集的 inference_method 字段获取
            is_offline = None  # None 表示未知，需要尝试两种
            if relations:
                first_relation = relations[0]
                first_dataset_id = first_relation.inference_result_dataset_id
                if first_dataset_id:
                    dataset = await self.task_mapper.query_one(
                        select(InferenceResultDataset).filter(
                            InferenceResultDataset.id == first_dataset_id
                        )
                    )
                    if dataset and dataset.inference_method:
                        is_offline = (dataset.inference_method == "offline")

            # 构建基础Job名称列表（可能需要尝试两种）
            base_job_names = []
            if is_offline is not None:
                # 已知是离线或在线，只尝试一种
                if is_offline:
                    base_job_names = [f"offline-evaluation-{task_id}"]
                else:
                    base_job_names = [f"online-evaluation-{task_id}"]
            else:
                # 未知，尝试两种（删除不存在的Job不会报错）
                base_job_names = [
                    f"offline-evaluation-{task_id}",
                    f"online-evaluation-{task_id}"
                ]

            # 根据 evaluation_method 确定需要删除的Job列表
            job_names = []
            evaluation_method = task.evaluation_method

            for base_job_name in base_job_names:
                # 现在 all 类型也只有一个Job（包含两个容器），Job名称需要拼接 -all
                if evaluation_method == "all":
                    job_names.append(f"{base_job_name}-all")
                else:
                    job_names.append(base_job_name)

            # 删除所有相关的Jobs
            deleted_count = 0
            for job_name in job_names:
                try:
                    success = await launcher.delete_job(
                        namespace=namespace,
                        job_name=job_name
                    )
                    if success:
                        deleted_count += 1
                        logger.info(f"成功删除Job: {job_name}")
                    else:
                        logger.warning(f"Job {job_name} 不存在或删除失败")
                except Exception as e:
                    logger.error(f"删除Job {job_name} 时发生错误: {e}")
                    # 继续删除其他Job，不中断流程

            logger.info(f"评估任务 {task_id} 停止完成，共删除 {deleted_count}/{len(job_names)} 个Job")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"停止评估任务 {task_id} 时删除K8s Job失败: {e}")
            # 即使删除Job失败，任务状态已经更新为终止，所以不抛出异常
            # 只记录错误日志

    async def get_basic_metrics(
            self
    ) -> List[BasicMetricResponse]:
        """获取基础评估指标列表（只读）"""
        query = select(EvaluationMetrics).filter(
            EvaluationMetrics.metric_type == MetricType.BASIC_METRIC
        ).order_by(EvaluationMetrics.created_at.asc())

        metrics = await self.evaluation_metrics_mapper.query(query)
        return [BasicMetricResponse.from_model(metric) for metric in metrics]

    async def get_evaluation_metrics(self,
                                     project_id: int,
                                     name: Optional[str] = None,
                                     page=None,
                                     size=None) \
            -> Page[EvaluationMetricResponse]:
        """获取裁判员评估系统指标列表（包含项目指标 + 系统默认指标）"""
        from sqlalchemy import or_, and_

        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 获取当前租户ID
        current_tenant = app_runtime_context.get_tenant_id()

        # 查询逻辑：
        # 1. 当前租户 + 当前项目的指标
        # 2. 或 系统默认指标（project_id=0, tenant_id='0'）
        query = select(EvaluationMetrics).filter(
            EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
            or_(
                # 当前租户的项目指标
                and_(
                    EvaluationMetrics.tenant_id == current_tenant,
                    EvaluationMetrics.project_id == project_id
                ),
                # 系统默认指标：project_id=0, tenant_id='0'（内置数据）
                and_(
                    EvaluationMetrics.tenant_id == '0',
                    EvaluationMetrics.project_id == 0
                )
            )
        )

        if name:
            query = query.filter(EvaluationMetrics.name.ilike(f"%{name}%"))

        # 按 is_builtin 降序（系统指标优先）+ sort_order 升序 + created_at 降序
        query = query.order_by(
            EvaluationMetrics.is_builtin.desc(),
            EvaluationMetrics.sort_order.asc(),
            EvaluationMetrics.created_at.desc()
        )

        # 直接使用 paginate，绕过 append_tenant_id（因为已手动添加租户条件）
        from fastapi_pagination.ext.sqlalchemy import paginate
        from fastapi_pagination import Page

        session = await self.evaluation_metrics_mapper.get_session()
        page_result = await paginate(session, query)

        # 转换为响应模型
        items = [EvaluationMetricResponse.from_model(metric) for metric in page_result.items]

        # 返回分页结果
        return Page(
            items=items,
            total=page_result.total,
            page=page_result.page,
            size=page_result.size,
            pages=page_result.pages
        )

    async def get_evaluation_metric(
            self,
            project_id: int,
            metric_id: int
    ) -> EvaluationMetricResponse:
        """获取裁判员评估系统指标详情（支持项目指标和系统默认指标）"""
        from sqlalchemy import or_, and_

        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 获取当前租户ID
        current_tenant = app_runtime_context.get_tenant_id()

        # 查询：当前租户的项目指标 或 系统默认指标（project_id=0, tenant_id='0'）
        metric = await self.evaluation_metrics_mapper.query_one(
            select(EvaluationMetrics).filter(
                EvaluationMetrics.id == metric_id,
                EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
                or_(
                    # 当前租户的项目指标
                    and_(
                        EvaluationMetrics.tenant_id == current_tenant,
                        EvaluationMetrics.project_id == project_id
                    ),
                    # 系统默认指标（tenant_id='0', project_id=0）
                    and_(
                        EvaluationMetrics.tenant_id == '0',
                        EvaluationMetrics.project_id == 0
                    )
                )
            )
        )

        if not metric:
            raise HTTPException(status_code=404, detail=f"裁判员评估系统指标不存在: metric_id={metric_id}")

        return EvaluationMetricResponse.from_model(metric)

    async def create_evaluation_metric(
            self,
            project_id: int,
            current_user: JwtUserInfo,
            metric: EvaluationMetricCreate
    ) -> EvaluationMetricResponse:
        """创建裁判员评估系统指标"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 检查名称是否已存在（同一项目下，同一类型）
        existing = await self.evaluation_metrics_mapper.query_one(
            select(EvaluationMetrics).filter(
                EvaluationMetrics.name == metric.name,
                EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
                EvaluationMetrics.project_id == project_id
            )
        )

        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"裁判员评估系统指标名称已存在: {metric.name}"
            )

        # 将枚举列表转换为字符串列表存储
        metrics_param_values = None
        if metric.metrics_param:
            metrics_param_values = [param.value for param in metric.metrics_param]

        # 处理 score_scope：转换为字典列表存储
        score_scope_data = None
        if metric.score_scope and len(metric.score_scope) > 0:
            score_scope_data = [
                {
                    "score_min": scope.score_min,
                    "score_max": scope.score_max,
                    "score_definitions": scope.score_definitions or ""
                }
                for scope in metric.score_scope
            ]

        # 创建新指标
        new_metric = EvaluationMetrics(
            name=metric.name,
            description=metric.description,
            metric_type=MetricType.REFEREE_SYSTEM_METRIC,
            project_id=project_id,
            score_scope=score_scope_data,
            created_id=current_user.userId,
            created_by=current_user.username,
            metrics_param=metrics_param_values
        )

        await self.evaluation_metrics_mapper.insert(new_metric)
        await self.evaluation_metrics_mapper.commit()
        await self.evaluation_metrics_mapper.refresh(new_metric)

        # 如果提供了评估任务ID，验证任务是否存在
        if metric.evaluation_task_id:
            task = await self.task_mapper.query_one(
                select(EvaluationTask).filter(EvaluationTask.id == metric.evaluation_task_id)
            )
            if not task:
                raise HTTPException(
                    status_code=404,
                    detail=f"评估任务不存在: {metric.evaluation_task_id}"
                )

        # 如果提供了评估任务ID和元数据字段绑定，创建关联关系
        if metric.evaluation_task_id and metric.metadata_fields:
            from app.models.evaluation_metric_metadata_relation import EvaluationMetricMetadataRelation

            for field_binding in metric.metadata_fields:
                relation = EvaluationMetricMetadataRelation(
                    metric_id=new_metric.id,
                    evaluation_task_id=metric.evaluation_task_id,
                    metadata_field=field_binding.metadata_field,
                    metrics_param_field=field_binding.metrics_param_field,
                    created_id=current_user.userId,
                    created_by=current_user.username
                )
                await self.metric_metadata_relation_mapper.insert(relation)

            await self.metric_metadata_relation_mapper.commit()
            logger.info(f"为指标 {new_metric.id} 创建了 {len(metric.metadata_fields)} 个元数据字段绑定")

        return EvaluationMetricResponse.from_model(new_metric)

    async def update_evaluation_metric(
            self,
            project_id: int,
            metric_id: int,
            metric: EvaluationMetricUpdate
    ) -> EvaluationMetricResponse:
        """更新裁判员评估系统指标"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 查询指标
        existing_metric = await self.evaluation_metrics_mapper.query_one(
            select(EvaluationMetrics).filter(
                EvaluationMetrics.id == metric_id,
                EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
                EvaluationMetrics.project_id == project_id
            )
        )

        if not existing_metric:
            raise HTTPException(
                status_code=404,
                detail=f"裁判员评估系统指标不存在: metric_id={metric_id}"
            )

        # 系统默认指标不可编辑
        if existing_metric.is_builtin:
            raise HTTPException(
                status_code=403,
                detail="系统默认指标不可编辑"
            )

        # 如果更新名称，检查新名称是否与其他指标冲突（同一项目下）
        if metric.name and metric.name != existing_metric.name:
            name_conflict = await self.evaluation_metrics_mapper.query_one(
                select(EvaluationMetrics).filter(
                    EvaluationMetrics.name == metric.name,
                    EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
                    EvaluationMetrics.project_id == project_id,
                    EvaluationMetrics.id != metric_id
                )
            )

            if name_conflict:
                raise HTTPException(
                    status_code=409,
                    detail=f"裁判员评估系统指标名称已存在: {metric.name}"
                )

        # 更新字段
        if metric.name is not None:
            existing_metric.name = metric.name
        if metric.description is not None:
            existing_metric.description = metric.description
        # 处理 score_scope 更新
        if metric.score_scope is not None:
            # 转换为字典列表存储
            if len(metric.score_scope) > 0:
                score_scope_data = [
                    {
                        "score_min": scope.score_min,
                        "score_max": scope.score_max,
                        "score_definitions": scope.score_definitions or ""
                    }
                    for scope in metric.score_scope
                ]
                existing_metric.score_scope = score_scope_data
            else:
                # 如果为空列表，清空分值范围
                existing_metric.score_scope = None
        if metric.metrics_param is not None:
            # 将枚举列表转换为字符串列表存储
            existing_metric.metrics_param = [param.value for param in metric.metrics_param]

        await self.evaluation_metrics_mapper.commit()
        await self.evaluation_metrics_mapper.refresh(existing_metric)

        return EvaluationMetricResponse.from_model(existing_metric)

    async def delete_evaluation_metric(
            self,
            project_id: int,
            metric_id: int
    ) -> None:
        """删除裁判员评估系统指标"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 查询指标
        metric = await self.evaluation_metrics_mapper.query_one(
            select(EvaluationMetrics).filter(
                EvaluationMetrics.id == metric_id,
                EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
                EvaluationMetrics.project_id == project_id
            )
        )

        if not metric:
            raise HTTPException(
                status_code=404,
                detail=f"裁判员评估系统指标不存在: metric_id={metric_id}"
            )

        # 系统默认指标不可删除
        if metric.is_builtin:
            raise HTTPException(
                status_code=403,
                detail="系统默认指标不可删除"
            )

        # 检查指标是否被评估任务使用（同一项目下）
        # 查询所有使用裁判员评估的任务
        tasks = await self.task_mapper.query(
            select(EvaluationTask).filter(
                EvaluationTask.evaluation_method == EvaluationMethod.REFEREE.value,
                EvaluationTask.project_id == project_id
            )
        )

        # 检查指标名称是否在任务的 evaluation_prompt_config.metrics 中
        metric_name = metric.name
        for task in tasks:
            if task.evaluation_prompt_config:
                metrics = task.evaluation_prompt_config.get("metrics", [])
                for m in metrics:
                    if isinstance(m, dict) and m.get("name") == metric_name:
                        raise HTTPException(
                            status_code=400,
                            detail=f"无法删除指标，该指标正在被评估任务使用: task_id={task.id}, task_name={task.name}"
                        )

        # 删除指标
        await self.evaluation_metrics_mapper.delete(metric)
        await self.evaluation_metrics_mapper.commit()

    async def render_evaluation_template(
            self,
            metric: EvaluationMetricCreate
    ) -> str:
        """渲染评估模板

        根据评估指标和数据集元数据字段，渲染Prompt模板

        Args:
            metric: 评估指标（包含指标信息和映射关系）

        Returns:
            str: 渲染后的模板内容
        """
        # 1. 获取默认模板路径
        from pathlib import Path
        # app/services/evaluation_task/evaluation_task.py -> 4 levels up to project root
        project_root = Path(__file__).parent.parent.parent.parent
        template_path = project_root / "scripts/inference/config/prompt_template.evaluate.example.j2"

        if not template_path.exists():
            logger.error(f"默认评估模板文件不存在: {template_path}")
            raise HTTPException(status_code=500, detail="默认评估模板文件不存在")

        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                template_content = f.read()

            # 2. 准备指标相关的渲染数据
            score_min = 0
            score_max = 0
            score_definitions_text = ""

            if metric.score_scope and len(metric.score_scope) > 0:
                first_scope = metric.score_scope[0]
                score_min = first_scope.score_min
                # 合并所有范围的分值定义（现在是字符串，直接拼接）
                definitions_list = []
                for scope in metric.score_scope:
                    if scope.score_definitions:
                        definitions_list.append(f"{scope.score_min}-{scope.score_max}分：{scope.score_definitions}")
                    score_max = scope.score_max

                # 将所有分值定义合并为字符串（用于模板显示）
                if definitions_list:
                    score_definitions_text = "\n".join(definitions_list)

            render_data = {
                "metric": {
                    "name": metric.name,
                    "description": metric.description or "",
                    "score_min": score_min,
                    "score_max": score_max,
                    "score_definitions": score_definitions_text
                }
            }

            # 3. 根据 metrics_param 设置待评估内容的占位符
            if metric.metrics_param:
                for param in metric.metrics_param:
                    # MetricsParam 的 value 是 "input_content", "actual_output" 等
                    # 因为模板中使用了 {% if input_content is defined %}，所以必须定义该键
                    # 使用原变量名作为占位符，方便前端展示
                    render_data[param.value] = f"{{{{ {param.value} }}}}"

            # 4. 执行渲染
            template = Template(template_content)
            return template.render(**render_data)
        except Exception as e:
            logger.error(f"渲染评估模板失败: {e}")
            raise HTTPException(status_code=500, detail=f"渲染模板失败: {str(e)}")

    async def update_task_status(
            self,
            task_id: int,
            status: TaskStatus
    ) -> None:
        """更新任务状态"""
        task = await self.task_mapper.query_one(
            select(EvaluationTask).filter(EvaluationTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"评估任务不存在: task_id={task_id}")

        task.status = status.value
        await self.task_mapper.commit()

    async def create_or_update_evaluation_report(
            self,
            report: EvaluationReportCreate
    ) -> None:
        """创建或更新评估报告（跨服务调用）"""
        # 查询是否已存在（根据 task_id, model_name 和 evaluation_method 查询）
        # 注意：改为根据 model_name 判断，而不是 model_id，以支持相同名称的模型区分
        existing_report = None
        if report.evaluated_model_name:
            existing_report = await self.report_mapper.query_one(
                select(EvaluationReport).filter(
                    EvaluationReport.evaluation_task_id == report.evaluation_task_id,
                    EvaluationReport.evaluated_model_name == report.evaluated_model_name,
                    EvaluationReport.evaluation_method == report.evaluation_method.value
                )
            )

        # 准备数据：将 aggregative_metrics 转换为数组格式
        # metric_summary 是 Dict[str, ModelMetricSummary]，需要将 ModelMetricSummary 对象转换为字典
        aggregative_metrics_list = []
        for metric in report.aggregative_metrics:
            metric_summary_dict = {}
            for metric_name, metric_data in metric.metric_summary.items():
                if isinstance(metric_data, ModelMetricSummary):
                    # ModelMetricSummary 对象，转换为字典
                    metric_summary_dict[metric_name] = metric_data.model_dump()
                else:
                    logger.warning(
                        f"指标 {metric_name} 的数据格式不正确，期望 ModelMetricSummary 对象: {type(metric_data)}")
                    continue

            aggregative_metrics_list.append({
                "calculation_method": metric.calculation_method.value,
                "metric_summary": metric_summary_dict
            })
        comparison_data_dict = report.comparison_data.model_dump() if report.comparison_data else None

        if existing_report:
            # 更新现有报告
            existing_report.evaluated_model_name = report.evaluated_model_name or existing_report.evaluated_model_name
            if report.evaluated_model_source is not None:
                existing_report.evaluated_model_source = report.evaluated_model_source
            existing_report.evaluation_method = report.evaluation_method.value
            # 兼容字段：保留第一个计算方式作为 calculation_method（向后兼容）
            if aggregative_metrics_list:
                existing_report.calculation_method = aggregative_metrics_list[0].get("calculation_method")
            existing_report.metric_summary = aggregative_metrics_list
            if comparison_data_dict is not None:
                existing_report.comparison_data = comparison_data_dict
            await self.report_mapper.commit()
        else:
            # 创建新报告
            new_report = EvaluationReport(
                evaluation_task_id=report.evaluation_task_id,
                evaluated_model_id=report.evaluated_model_id,
                evaluated_model_name=report.evaluated_model_name,
                evaluated_model_source=report.evaluated_model_source,
                evaluation_method=report.evaluation_method.value,
                calculation_method=aggregative_metrics_list[0].get(
                    "calculation_method") if aggregative_metrics_list else None,
                metric_summary=aggregative_metrics_list,
                comparison_data=comparison_data_dict
            )
            await self.report_mapper.insert(new_report)
            await self.report_mapper.commit()

    async def update_evaluation_report(
            self,
            evaluation_task_id: int,
            evaluated_model_id: int,
            evaluation_method: EvaluationMethod,
            report_update: EvaluationReportUpdate
    ) -> None:
        """更新评估报告（跨服务调用）"""
        # 查询报告是否存在（根据 task_id, model_id 和 evaluation_method 查询）
        report = await self.report_mapper.query_one(
            select(EvaluationReport).filter(
                EvaluationReport.evaluation_task_id == evaluation_task_id,
                EvaluationReport.evaluated_model_id == evaluated_model_id,
                EvaluationReport.evaluation_method == evaluation_method.value
            )
        )

        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"评估报告不存在: evaluation_task_id={evaluation_task_id}, evaluated_model_id={evaluated_model_id}"
            )

        # 更新字段
        if report_update.aggregative_metrics is not None:
            # 将 aggregative_metrics 转换为数组格式
            # metric_summary 是 Dict[str, ModelMetricSummary]，需要将 ModelMetricSummary 对象转换为字典
            aggregative_metrics_list = []
            for metric in report_update.aggregative_metrics:
                metric_summary_dict = {}
                for metric_name, metric_data in metric.metric_summary.items():
                    if isinstance(metric_data, ModelMetricSummary):
                        # ModelMetricSummary 对象，转换为字典
                        metric_summary_dict[metric_name] = metric_data.model_dump()
                    else:
                        logger.warning(
                            f"指标 {metric_name} 的数据格式不正确，期望 ModelMetricSummary 对象: {type(metric_data)}")
                        continue

                aggregative_metrics_list.append({
                    "calculation_method": metric.calculation_method.value,
                    "metric_summary": metric_summary_dict
                })
            report.metric_summary = aggregative_metrics_list
            # 兼容字段：保留第一个计算方式作为 calculation_method（向后兼容）
            if aggregative_metrics_list:
                report.calculation_method = aggregative_metrics_list[0].get("calculation_method")
        if report_update.comparison_data is not None:
            report.comparison_data = report_update.comparison_data.model_dump()

        await self.report_mapper.commit()

    # ------------------------------ 内部辅助方法 ------------------------------
    def _generate_file_path(self, task_id: int, namespace: str, evaluation_name: str, dataset_ids: List[int],
                            evaluation_method: str = None) -> List[str]:
        """
        生成文件路径列表

        Args:
            task_id: 评估任务ID
            namespace: 项目命名空间
            evaluation_name: 评估任务名称
            dataset_ids: 关联的数据集ID列表（唯一）
            evaluation_method: 评估方法（basic_metric, referee, all）

        Returns:
            List[str]: 文件路径列表
            - basic_metric: 每个数据集对应一个基础指标评估文件路径
            - referee: 每个数据集对应一个裁判员评估文件路径
            - all: 每个数据集对应两个文件路径（基础指标评估和裁判员评估）
        """
        base_path = StoragePath.REAL_EVALUATION.format_storage_path(namespace=namespace, task_id=task_id)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        file_paths = []

        # 使用特殊标识符来区分评估类型，放在 source_{dataset_id} 和 timestamp 之间
        # 使用双下划线+大写字母+任务ID的格式，避免与任务名称冲突，并确保唯一性
        # 格式：__BASIC_METRIC_T{task_id}__ 或 __REFEREE_T{task_id}__
        BASIC_METRIC_MARKER = f"__BASIC_METRIC_T{task_id}__"
        REFEREE_MARKER = f"__REFEREE_T{task_id}__"

        # 根据evaluation_method生成不同的文件路径
        if evaluation_method == "all":
            # all模式：为每个数据集生成两个文件路径（基础指标评估和裁判员评估）
            for dataset_id in dataset_ids:
                # 基础指标评估文件路径：标识符放在 source_{dataset_id} 之后
                basic_metric_filename = f"evaluation_result_{evaluation_name}_source_{dataset_id}{BASIC_METRIC_MARKER}{timestamp}.jsonl"
                basic_metric_path = f"{base_path}{basic_metric_filename}"
                file_paths.append(basic_metric_path)

                # 裁判员评估文件路径：标识符放在 source_{dataset_id} 之后
                referee_filename = f"evaluation_result_{evaluation_name}_source_{dataset_id}{REFEREE_MARKER}{timestamp}.jsonl"
                referee_path = f"{base_path}{referee_filename}"
                file_paths.append(referee_path)
        elif evaluation_method == "basic_metric":
            # basic_metric模式：为每个数据集生成基础指标评估文件路径
            for dataset_id in dataset_ids:
                filename = f"evaluation_result_{evaluation_name}_source_{dataset_id}{BASIC_METRIC_MARKER}{timestamp}.jsonl"
                file_path = f"{base_path}{filename}"
                file_paths.append(file_path)
        elif evaluation_method == "referee":
            # referee模式：为每个数据集生成裁判员评估文件路径
            for dataset_id in dataset_ids:
                filename = f"evaluation_result_{evaluation_name}_source_{dataset_id}{REFEREE_MARKER}{timestamp}.jsonl"
                file_path = f"{base_path}{filename}"
                file_paths.append(file_path)
        else:
            # 默认情况（兼容旧代码）：生成通用文件路径
            for dataset_id in dataset_ids:
                filename = f"evaluation_result_{evaluation_name}_source_{dataset_id}_{timestamp}.jsonl"
                file_path = f"{base_path}{filename}"
                file_paths.append(file_path)

        return file_paths

    async def get_inference_result_datasets_by_task_id(
            self,
            task_id: int
    ) -> List[InferenceResultDatasetResponse]:
        """根据评估任务ID获取所关联的推理结果集列表"""
        # 验证任务是否存在
        task = await self.task_mapper.query_one(
            select(EvaluationTask).filter(EvaluationTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"评估任务不存在: task_id={task_id}")

        # 查询关联关系
        relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
            )
        )

        if not relations:
            return []

        # 获取所有推理结果集ID（去重）
        dataset_ids = list(set([r.inference_result_dataset_id for r in relations if r.inference_result_dataset_id]))

        if not dataset_ids:
            return []

        # 查询推理结果集
        datasets = await self.task_mapper.query(
            select(InferenceResultDataset).filter(
                InferenceResultDataset.id.in_(dataset_ids)
            )
        )

        # 转换为响应模型
        result = []
        for dataset in datasets:
            # 使用 Pydantic 的 model_validate 从 ORM 模型转换为响应模型
            result.append(InferenceResultDatasetResponse.model_validate(dataset))

        return result

    async def upload_stopwords_file(
            self,
            project_id: int,
            file: bytes,
            filename: str
    ) -> str:
        """上传停用词文件到JuiceFS

        Args:
            project_id: 项目ID
            file: 文件内容（字节）
            filename: 文件名

        Returns:
            str: JuiceFS存储路径（URL）
        """
        # 1. 验证文件名
        if not filename:
            raise HTTPException(status_code=400, detail="文件名不能为空")

        # 2. 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

        # 3. 构建存储路径（项目级别，供多个任务共享）
        # 格式: /{namespace}/evaluation/stopwords/{filename}
        base_path = f"/{namespace}/evaluation/stopwords/"

        # 4. 确保文件名安全（移除路径分隔符等）
        safe_filename = os.path.basename(filename)
        if not safe_filename:
            # 如果文件名无效，使用时间戳生成
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = f"stopwords_{timestamp}.txt"

        # 5. 构建完整路径
        storage_path = f"{base_path}{safe_filename}"

        # 6. 获取 JuiceFS 客户端
        jfs = await self.storage.JUICEFS_CLIENT()

        # 7. 确保目录存在
        try:
            jfs.makedirs(base_path, exist_ok=True)
        except Exception as e:
            logger.warning(f"创建目录失败 {base_path}: {e}")

        # 8. 上传文件
        try:
            with jfs.open(storage_path, 'wb') as remote_file:
                remote_file.write(file)
            logger.info(f"停用词文件上传成功: {storage_path}")
        except Exception as e:
            logger.error(f"上传停用词文件失败 {storage_path}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"上传停用词文件失败: {str(e)}"
            )

        # 9. 返回存储路径
        return storage_path

    async def append_evaluation_metrics_score(self, evaluation_prompt_config: EvaluationPromptConfig):
        metrics: List[EvaluationPromptMetricConfig] = evaluation_prompt_config.metrics

        # 遍历每个指标，补充分值范围信息
        for metric in metrics:
            await self.append_evaluation_metric_score(metric)

    async def append_evaluation_metric_score(self, evaluation_prompt_metric_config: EvaluationPromptMetricConfig):
        tenant_id = app_runtime_context.get_tenant_id()
        app_runtime_context.set_tenant_id(None)
        system_metric_id = evaluation_prompt_metric_config.system_metric_id
        evaluation_metric: EvaluationMetrics = await self.task_mapper.query_one(
            select(EvaluationMetrics).filter(EvaluationMetrics.id == system_metric_id)
        )
        app_runtime_context.set_tenant_id(tenant_id)
        if evaluation_metric and evaluation_metric.score_scope and len(evaluation_metric.score_scope) > 0:
            # score_scope 是一个列表，需要转换
            score_scopes = evaluation_metric.score_scope

            # 获取所有 score_min 和 score_max
            score_mins = [scope.get("score_min") for scope in score_scopes if scope.get("score_min") is not None]
            score_maxs = [scope.get("score_max") for scope in score_scopes if scope.get("score_max") is not None]

            # score_min 取最小值，score_max 取最大值
            if score_mins and score_maxs:
                evaluation_prompt_metric_config.score_min = min(score_mins)
                evaluation_prompt_metric_config.score_max = max(score_maxs)

                # 直接使用数据库中的 score_definitions 内容，仅进行换行拼接
                score_definitions_list = []
                for scope in score_scopes:
                    score_min = scope.get("score_min")
                    score_max = scope.get("score_max")
                    score_definitions = scope.get("score_definitions", "")

                    if score_min is not None and score_max is not None and score_definitions:
                        # 格式：score_min-score_max分:score_definitions
                        definition_str = f"{score_min}-{score_max}分：{score_definitions}"
                        score_definitions_list.append(definition_str)

                evaluation_prompt_metric_config.score_definitions = (
                    score_definitions_list) if score_definitions_list else ""
            else:
                logger.warning(f"系统指标 {system_metric_id} 的分值范围配置无效")
        else:
            logger.warning(f"系统指标 {system_metric_id} 没有分值范围配置")
        pass

    # ------------------------------ 人工评估相关方法实现 ------------------------------

    @staticmethod
    def _parse_dataset_id_from_manual_result_path(path: str) -> Optional[int]:
        """从人工评估结果文件路径解析推理结果集 ID。文件名格式：manual_evaluation_result_dataset_{dataset_id}.jsonl"""
        basename = os.path.basename(path)
        if basename.startswith("manual_evaluation_result_dataset_") and basename.endswith(".jsonl"):
            try:
                return int(basename[33:-6])  # len("manual_evaluation_result_dataset_")=33, len(".jsonl")=6
            except ValueError:
                return None
        return None

    async def _get_model_name_by_dataset_id(self, task_id: int, dataset_id: int) -> str:
        """根据任务 ID 和推理结果集 ID 查询关联的 model_name（用于人工评估 items 的 path -> model_name 映射）"""
        relation = await self.relation_mapper.query_one(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id,
                EvaluationTaskDatasetModelRelation.inference_result_dataset_id == dataset_id
            )
        )
        if relation:
            return relation.evaluated_model_name or f"model_{relation.evaluated_model_id}"
        return f"model_unknown_{dataset_id}"

    async def get_manual_evaluation_items(
            self,
            project_id: int,
            task_id: int,
            status: Optional[str] = "all",
            page: int = 1,
            size: int = 10
    ) -> Page[ManualEvaluationItemResponse]:
        """分页查询人工评估项列表（从Redis合并标注数据）

        优化点：
        1. 分页逻辑：按item_index分组，相同item_index的所有数据都要返回
           - 当page size=1时，返回1个item_index的所有数据（对比评估时可能是多条）
           - 当page size=10时，返回10个item_index的所有数据（每个item_index可能有多个模型）
        2. 从数据库获取总数：使用task.total_items，不再读取文件统计
        3. 当任务状态为COMPLETED时，不从Redis读取，直接从JSONL文件读取（因为标注数据已写入文件）

        Args:
            status: 状态筛选（枚举值或"all"）
                - "未评估": 未评估
                - "已完成": 已完成
                - "all": 返回所有状态的项
        """
        from app.core.config import settings

        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        # 2. 验证是否为人工评估任务
        if task.evaluation_method != EvaluationMethod.MANUAL:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 不是人工评估任务（evaluation_method={task.evaluation_method}）"
            )

        # 3. 获取JSONL文件路径列表
        if not task.result_file_path or len(task.result_file_path) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"任务 {task_id} 没有评估结果文件"
            )

        # 4. 判断任务是否已完成（已完成时从文件读取，未完成时从Redis读取）
        is_task_completed = (
                task.status == TaskStatus.COMPLETED.value
        )

        # 5. 根据文件名中的推理结果集 ID 建立 file_index -> model_name 映射（不再依赖排序）
        file_to_model_map: Dict[int, str] = {}
        for file_index, path in enumerate(task.result_file_path or []):
            dataset_id = self._parse_dataset_id_from_manual_result_path(path)
            if dataset_id is not None:
                file_to_model_map[file_index] = await self._get_model_name_by_dataset_id(task_id, dataset_id)
            else:
                file_to_model_map[file_index] = f"model_{file_index}"

        # 5.5 按文件路径解析 dataset_id，逐个查询 base_url（与 file_index 一一对应）
        base_urls_list: List[Optional[str]] = []
        if self.inference_result_service:
            for path in task.result_file_path or []:
                url = None
                dataset_id = self._parse_dataset_id_from_manual_result_path(path)
                if dataset_id is not None:
                    inf_ds = await self.task_mapper.query_one(
                        select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
                    )
                    if inf_ds is not None:
                        url = self.inference_result_service._build_base_url(
                            project_id=project_id,
                            dataset_id=dataset_id,
                            data_format=inf_ds.dataset_format,
                        )
                base_urls_list.append(url)
        else:
            base_urls_list = [None] * len(task.result_file_path or [])

        # 6. 获取Redis客户端（仅在任务未完成时需要）
        redis_client = None
        if not is_task_completed:
            redis_client = settings.REDIS_CLIENT
            if not redis_client:
                raise HTTPException(
                    status_code=500,
                    detail="Redis客户端未初始化"
                )

        # 7. 先判断筛选条件和任务状态，决定数据读取策略
        # 策略：
        # 1. 任务已完成：从JSONL读取，然后按status筛选
        # 2. 任务未完成 + 筛选"未评估"：只从JSONL读取（不查Redis）
        # 3. 任务未完成 + 筛选"已完成"：先扫描Redis找到已完成的item_index，只读取这些item_index的JSONL数据
        # 4. 任务未完成 + 筛选"all"：读取所有JSONL，批量查询Redis（使用pipeline）

        # 需要读取的item_index集合（None表示读取所有）
        target_item_indices = None
        # 用于统计已完成item_index的数量（用于计算"未评估"的总数）
        completed_item_indices_count = 0

        if not is_task_completed:
            # 任务未完成：根据筛选条件决定策略
            if status == TaskStatus.COMPLETED.value:
                # 筛选"已完成"：先扫描Redis找到已完成的item_index
                target_item_indices = set()
                redis_pattern = f"manual_evaluation:annotation:{task_id}:*"

                # 第一步：扫描Redis获取所有有标注的item_index（收集所有item_index）
                item_index_set = set()
                cursor = 0
                while True:
                    cursor, keys = await redis_client.scan(cursor, match=redis_pattern, count=1000)
                    for key in keys:
                        # 解析key：manual_evaluation:annotation:{task_id}:{file_index}:{item_index}
                        parts = key.split(":")
                        if len(parts) >= 5:
                            try:
                                item_index = int(parts[-1])
                                item_index_set.add(item_index)
                            except ValueError:
                                continue

                    if cursor == 0:
                        break

                # 第二步：批量查询每个item_index的所有模型的标注状态
                # 使用pipeline批量查询，提升性能
                for item_index in item_index_set:
                    # 构建所有file_index对应的key
                    keys_to_check = [
                        f"manual_evaluation:annotation:{task_id}:{file_idx}:{item_index}"
                        for file_idx in range(len(task.result_file_path))
                    ]

                    # 批量查询
                    annotation_jsons = await redis_client.mget(keys_to_check)

                    # 检查所有模型是否都已完成
                    all_completed = True
                    for annotation_json in annotation_jsons:
                        if annotation_json:
                            annotation_data = json.loads(annotation_json)
                            if annotation_data.get("status") != TaskStatus.COMPLETED.value:
                                all_completed = False
                                break
                        else:
                            all_completed = False
                            break

                    if all_completed:
                        target_item_indices.add(item_index)
                        completed_item_indices_count += 1

                logger.info(f"任务未完成+筛选已完成：找到 {len(target_item_indices)} 个已完成的item_index")
            elif status == AnnotationStatus.PENDING.value:
                # 筛选"未评估"：只从JSONL读取，不查Redis（因为未评估的数据annotation是pending，在JSONL中）
                target_item_indices = None  # 读取所有，但不需要查Redis
                logger.info("任务未完成+筛选未评估：只从JSONL读取，不查Redis")
            else:
                # 筛选"all"：读取所有JSONL，批量查询Redis
                target_item_indices = None
                logger.info("任务未完成+筛选all：读取所有JSONL，批量查询Redis")

        # 9. 计算分页范围（按item_index分页）
        start_item_index = (page - 1) * size + 1  # item_index从1开始
        end_item_index = start_item_index + size - 1

        jfs = await self.storage.JUICEFS_CLIENT()

        # 10. 按item_index分组收集数据
        # 结构：{item_index: {model_name: item}}，对比评估时同一个item_index会有多个item（每个模型一个）
        items_by_index = {}  # {item_index: {model_name: item}}

        # 对于"all"筛选，先收集所有需要查询的Redis key，然后批量查询
        redis_keys_to_query = {}  # {(file_index, item_index): redis_key}

        # 用于统计符合筛选条件的item_index总数（在读取数据时同时统计）
        matching_item_indices_for_total = set()  # 用于统计总数的item_index集合

        try:
            # 读取JSONL文件，按item_index分组
            for file_index, jsonl_file_path in enumerate(task.result_file_path):
                if not jfs.exists(jsonl_file_path):
                    logger.warning(f"评估结果文件不存在: {jsonl_file_path}")
                    continue

                with jfs.open(jsonl_file_path, 'r', encoding='utf-8') as f:
                    for idx, line in enumerate(f, start=1):
                        if not line.strip():
                            continue

                        try:
                            # JSONL格式：ManualEvaluationItem（不包含item_index）
                            # item_index 由行号决定（从1开始）
                            item_index = idx

                            # 如果指定了target_item_indices，只读取这些item_index
                            if target_item_indices is not None and item_index not in target_item_indices:
                                continue

                            # 读取JSONL行（ManualEvaluationItem格式）
                            manual_item = json.loads(line)

                            # 字段名称映射：确保JSONL文件格式与ManualEvaluationItem一致
                            if "standard_response" in manual_item and "response" not in manual_item:
                                manual_item["response"] = manual_item.pop("standard_response")

                            # 获取当前文件对应的模型名称：优先使用文件中写入的 model_name，避免依赖 file_index 顺序
                            model_name = file_to_model_map.get(file_index, f"model_{file_index}")

                            # 从Redis或文件读取标注数据
                            annotation_data = None
                            if is_task_completed:
                                # 任务已完成：从文件读取（标注数据已写入文件）
                                if "annotation" in manual_item:
                                    annotation_data = manual_item["annotation"]

                                if annotation_data is None:
                                    annotation_data = {
                                        "status": AnnotationStatus.PENDING.value,
                                        "metrics": None,
                                        "annotated_at": None,
                                        "annotated_by": None
                                    }
                            else:
                                # 任务未完成：根据筛选条件决定是否查Redis
                                if status == AnnotationStatus.PENDING.value:
                                    # 筛选"未评估"：需要查Redis，排除那些在Redis中有标注的item_index
                                    redis_key = f"manual_evaluation:annotation:{task_id}:{file_index}:{item_index}"
                                    annotation_json = await redis_client.get(redis_key)

                                    if annotation_json:
                                        # 如果在Redis中有标注，说明不是未评估，跳过
                                        continue
                                    else:
                                        # 不在Redis中，使用默认pending状态（真正的未评估）
                                        annotation_data = {
                                            "status": AnnotationStatus.PENDING.value,
                                            "metrics": None,
                                            "annotated_at": None,
                                            "annotated_by": None
                                        }
                                else:
                                    # 筛选"已完成"或"all"：需要从Redis读取
                                    redis_key = f"manual_evaluation:annotation:{task_id}:{file_index}:{item_index}"

                                    if status == "all":
                                        # 对于"all"，先收集key，稍后批量查询
                                        redis_keys_to_query[(file_index, item_index)] = redis_key
                                        # 先使用默认值，稍后会更新
                                        annotation_data = {
                                            "status": AnnotationStatus.PENDING.value,
                                            "metrics": None,
                                            "annotated_at": None,
                                            "annotated_by": None
                                        }
                                    else:
                                        # 对于"已完成"，直接查询（因为已经通过target_item_indices筛选过了）
                                        annotation_json = await redis_client.get(redis_key)

                                        if annotation_json:
                                            annotation_data = json.loads(annotation_json)
                                        else:
                                            annotation_data = {
                                                "status": AnnotationStatus.PENDING.value,
                                                "metrics": None,
                                                "annotated_at": None,
                                                "annotated_by": None
                                            }

                            # 状态筛选：如果指定了status且不匹配，跳过
                            # 注意：对于"all"筛选，先收集所有数据，批量查询Redis后再筛选
                            # 对于其他状态，在读取时就可以筛选
                            item_status = annotation_data.get("status", AnnotationStatus.PENDING.value)

                            # 统计符合筛选条件的item_index（用于计算总数）
                            # 注意：在状态筛选之前统计，确保统计的是所有符合筛选条件的item_index
                            # 对于对比评估，一个item_index对应多个模型，只要有一个模型的状态匹配就算匹配

                            if item_status == status:
                                # 对于其他状态，只有匹配的item_index才符合
                                matching_item_indices_for_total.add(item_index)

                            # 状态筛选：如果指定了status且不匹配，跳过（不加入items_by_index）
                            # 注意：这里只影响items_by_index，不影响matching_item_indices_for_total的统计
                            if status != "all":
                                if item_status != status:
                                    continue

                            # 按item_index和model_name分组
                            if item_index not in items_by_index:
                                items_by_index[item_index] = {}
                            items_by_index[item_index][model_name] = {
                                "item": manual_item,
                                "model_name": model_name,
                                "annotation": annotation_data
                            }

                        except json.JSONDecodeError as e:
                            logger.warning(f"跳过无效的JSON行 {idx} in {jsonl_file_path}: {e}")
                            continue

            # 对于"all"筛选，批量查询Redis（使用mget提升性能）
            if not is_task_completed and status == "all" and redis_keys_to_query:
                # 批量查询所有key
                keys_list = list(redis_keys_to_query.values())
                annotation_jsons = await redis_client.mget(keys_list)

                # 更新items_by_index中的annotation_data
                for (file_index, item_index), annotation_json in zip(redis_keys_to_query.keys(), annotation_jsons):
                    if item_index in items_by_index:
                        model_name = file_to_model_map.get(file_index, f"model_{file_index}")
                        if model_name in items_by_index[item_index]:
                            if annotation_json:
                                annotation_data = json.loads(annotation_json)
                                items_by_index[item_index][model_name]["annotation"] = annotation_data
                                # 更新统计：如果状态不是pending，说明有标注，item_index应该被统计
                                item_status = annotation_data.get("status", AnnotationStatus.PENDING.value)
                                if item_status != AnnotationStatus.PENDING.value:
                                    matching_item_indices_for_total.add(item_index)

            # 11. 根据筛选条件计算实际的总数
            # 注意：在读取数据时已经统计了matching_item_indices_for_total，这里直接使用
            total = 0

            if is_task_completed:
                # 任务已完成：使用读取时统计的matching_item_indices_for_total
                # 注意：对于任务已完成，target_item_indices应该是None，所以会读取所有数据
                if status == "all":
                    total = task.total_items if task.total_items is not None else 0
                elif status == TaskStatus.COMPLETED.value:
                    # 筛选"已完成"：需要统计所有状态为completed的item_index
                    # 遍历所有读取到的数据，统计状态为completed的item_index
                    completed_item_indices = set()
                    for item_index, items_for_index in items_by_index.items():
                        # 检查是否有任何模型的状态是completed
                        has_completed = False
                        for model_name, data in items_for_index.items():
                            annotation_data = data.get("annotation", {})
                            item_status = annotation_data.get("status", AnnotationStatus.PENDING.value)
                            if item_status == TaskStatus.COMPLETED.value:
                                has_completed = True
                                break
                        if has_completed:
                            completed_item_indices.add(item_index)
                    total = len(completed_item_indices)
                else:
                    # 使用读取时统计的符合筛选条件的item_index数量
                    # matching_item_indices_for_total已经包含了所有符合筛选条件的item_index
                    total = len(matching_item_indices_for_total)
            else:
                # 任务未完成：根据筛选条件计算总数
                if status == "all":
                    total = task.total_items if task.total_items is not None else 0
                elif status == TaskStatus.COMPLETED.value:
                    # 筛选"已完成"：使用target_item_indices的长度（已经在扫描Redis时计算了）
                    total = len(target_item_indices) if target_item_indices is not None else 0
                elif status == AnnotationStatus.PENDING.value:
                    # 筛选"未评估"：总数 - 所有有标注的item_index数量
                    # 需要统计所有在Redis中有标注的item_index（不仅仅是已完成的，包括所有状态的）
                    redis_pattern = f"manual_evaluation:annotation:{task_id}:*"
                    annotated_item_indices = set()
                    cursor = 0
                    while True:
                        cursor, keys = await redis_client.scan(cursor, match=redis_pattern, count=1000)
                        for key in keys:
                            parts = key.split(":")
                            if len(parts) >= 5:
                                try:
                                    item_index = int(parts[-1])
                                    annotated_item_indices.add(item_index)
                                except ValueError:
                                    continue
                        if cursor == 0:
                            break

                    # 统计所有有标注的item_index数量（只要有一个模型有标注就算）
                    annotated_count = len(annotated_item_indices)
                    total_items = task.total_items if task.total_items is not None else 0
                    total = total_items - annotated_count
                    if total < 0:
                        total = 0
                else:
                    # 其他状态筛选：使用读取时统计的matching_item_indices_for_total
                    total = len(matching_item_indices_for_total)

            # 12. 按item_index排序，筛选出当前页的item_index
            # 注意：分页应该基于符合筛选条件的item_index列表，而不是所有item_index的范围
            sorted_item_indices = sorted(items_by_index.keys())

            # 计算当前页的item_index范围（按符合筛选条件的item_index分页，不是按所有item_index分页）
            # 例如：如果符合筛选条件的item_index是[5, 10, 15, 20]，page=1, size=2
            # 那么应该返回item_index为5和10的数据，而不是item_index为1和2的数据
            page_item_indices = []
            # 使用符合筛选条件的item_index列表进行分页
            for idx, item_index in enumerate(sorted_item_indices, start=1):
                # idx是从1开始的序号，表示这是第几个符合筛选条件的item_index
                if start_item_index <= idx <= end_item_index:
                    page_item_indices.append(item_index)

            # 13. 收集当前页的数据，转换为新的格式（ManualEvaluationItemResponse）
            filtered_items = []
            for item_index in page_item_indices:
                items_for_index = items_by_index[item_index]

                # 按 file_index 顺序构建 content 列表（model_name 来自路径解析+推理结果集 id 查询）
                content_list = []
                sorted_file_indices = sorted(file_to_model_map.keys())
                for file_index in sorted_file_indices:
                    model_name = file_to_model_map[file_index]
                    if model_name not in items_for_index:
                        continue
                    data = items_for_index[model_name]
                    item_data = data["item"]
                    annotation_data = data["annotation"]
                    manual_item = {
                        "messages": item_data.get("messages"),
                        "images": item_data.get("images"),
                        "system": item_data.get("system"),
                        "prompt": item_data.get("prompt", ""),
                        "response": item_data.get("response"),
                        "model_response": item_data.get("model_response"),
                        "annotation": annotation_data if annotation_data else {
                            "status": AnnotationStatus.PENDING.value,
                            "metrics": None,
                            "annotated_at": None,
                            "annotated_by": None
                        },
                        "model_name": item_data.get("model_name") or model_name,
                        "base_url": base_urls_list[file_index] if file_index < len(base_urls_list) else None,
                    }
                    content_list.append(manual_item)

                # 构建ManualEvaluationItemResponse
                response_item = {
                    "item_index": item_index,
                    "content": content_list
                }

                filtered_items.append(response_item)

        except Exception as e:
            logger.error(f"读取评估结果文件失败: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"读取评估结果文件失败: {str(e)}"
            )

        # 14. 构建分页响应（使用根据筛选条件计算的实际总数）
        total_pages = (total + size - 1) // size if total > 0 else 1

        # 11. 转换为响应模型
        from app.schemas.evaluation_task import ManualEvaluationItemPageResponse, ManualEvaluationItemResponse

        # 转换 items 为响应模型
        items = [ManualEvaluationItemResponse.model_validate(item) for item in filtered_items]

        # 计算评估数量（对比评估时，每个item_index对应多个模型）
        evaluation_num = len(task.result_file_path)

        return ManualEvaluationItemPageResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            pages=total_pages,
            evalution_num=evaluation_num
        )

    async def batch_update_manual_evaluation_items(
            self,
            project_id: int,
            task_id: int,
            batch_update: ManualEvaluationItemBatchUpdate,
            current_user: JwtUserInfo
    ) -> None:
        """批量更新人工评估项评分（使用Redis存储标注数据）

        更新后，评估项的状态自动设置为"标注完成"
        如果任务状态为"已创建"（created），会自动更新为"标注中"（annotating）
        当所有项都完成时，任务状态会更新为"已完成"（completed）

        数据格式：
        - 请求格式：ManualEvaluationItemBatchUpdate，包含 model_metrics: List[MetricInfos]
        - Redis存储格式：AnnotationInfo（每个模型一个annotation）
        - JSONL格式：ManualEvaluationItem（每个文件对应一个模型）
        """
        from app.core.config import settings
        from app.schemas.evaluation_task import AnnotationInfo, ModelMetricSummary
        from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation

        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        # 2. 验证是否为人工评估任务
        if task.evaluation_method != EvaluationMethod.MANUAL:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 不是人工评估任务"
            )

        # 3. 获取JSONL文件路径列表
        if not task.result_file_path or len(task.result_file_path) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"任务 {task_id} 没有评估结果文件"
            )

        # 4. 获取任务关联关系，建立file_index到model_name的映射
        relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
            ).order_by(EvaluationTaskDatasetModelRelation.sort_order)
        )

        if not relations:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 没有关联的模型和数据集"
            )

        file_to_model_map = {}  # {file_index: model_name}
        for file_index, relation in enumerate(relations):
            model_name = relation.evaluated_model_name or f"model_{relation.evaluated_model_id}"
            file_to_model_map[file_index] = model_name

        # 5. 从 evaluation_prompt_config 获取指标配置（创建任务时 score_min/score_max 已写入）
        evaluation_prompt_config = task.evaluation_prompt_config or {}
        metrics_config = evaluation_prompt_config.get("metrics", [])
        metric_config_map = {m.get("name"): m for m in metrics_config}

        # 6. 获取Redis客户端
        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            raise HTTPException(
                status_code=500,
                detail="Redis客户端未初始化"
            )

        # 7. 验证并写入Redis
        updated_count = 0

        for update_item in batch_update.items:
            item_index = update_item.item_index
            model_metrics_list = update_item.model_metrics  # List[MetricInfos]

            # 验证 model_metrics 列表非空
            if not model_metrics_list or len(model_metrics_list) == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"评估项 {item_index} 的 model_metrics 列表不能为空"
                )

            # 验证列表长度与关联关系数量一致
            if len(model_metrics_list) != len(relations):
                raise HTTPException(
                    status_code=400,
                    detail=f"评估项 {item_index} 的 model_metrics 列表长度 ({len(model_metrics_list)}) 与任务关联关系数量 ({len(relations)}) 不一致"
                )

            # 处理每个模型的指标（按照创建task时关联的推理结果集的顺序）
            for file_index, metric_infos in enumerate(model_metrics_list):
                # 获取该file_index对应的model_name
                if file_index >= len(relations):
                    raise HTTPException(
                        status_code=400,
                        detail=f"评估项 {item_index} 的 model_metrics 列表索引 {file_index} 超出范围"
                    )

                relation = relations[file_index]
                model_name = relation.evaluated_model_name or f"model_{relation.evaluated_model_id}"

                # 验证 metrics 列表非空
                if not metric_infos.metrics or len(metric_infos.metrics) == 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"评估项 {item_index} 的模型 {model_name} (索引 {file_index}) 的 metrics 列表不能为空"
                    )

                # 验证所有指标的分数范围并构建 ModelMetricSummary 列表
                metric_summaries = []
                for model_metric_create in metric_infos.metrics:
                    metric_name = model_metric_create.metric_name
                    score = model_metric_create.score

                    # 验证分数范围
                    score_min, score_max = None, None
                    if metric_name in metric_config_map:
                        metric_cfg = metric_config_map[metric_name]
                        score_min = metric_cfg.get("score_min")
                        score_max = metric_cfg.get("score_max")
                        if score_min is not None and score < score_min:
                            raise HTTPException(
                                status_code=400,
                                detail=f"模型 {model_name} 的指标 {metric_name} 的分数 {score} 低于最小值 {score_min}"
                            )
                        if score_max is not None and score > score_max:
                            raise HTTPException(
                                status_code=400,
                                detail=f"模型 {model_name} 的指标 {metric_name} 的分数 {score} 高于最大值 {score_max}"
                            )

                    # 构建 ModelMetricSummary，score_min/score_max 从 evaluation_prompt_config 获取
                    metric_summary = ModelMetricSummary(
                        metric_name=metric_name,
                        score=score,
                        score_min=score_min,
                        score_max=score_max,
                        reason=model_metric_create.reason
                    )
                    metric_summaries.append(metric_summary)

                # 构建 AnnotationInfo（支持多个指标）
                annotation_info = AnnotationInfo(
                    status=TaskStatus.COMPLETED.value,
                    metrics=metric_summaries if metric_summaries else None,
                    annotated_at=datetime.now(),
                    annotated_by=current_user.username
                )

                # 存储到Redis（使用file_index构建key）
                redis_key = f"manual_evaluation:annotation:{task_id}:{file_index}:{item_index}"
                await redis_client.set(
                    redis_key,
                    json.dumps(annotation_info.model_dump(mode='json'), ensure_ascii=False, default=str)
                )

                updated_count += 1

        if updated_count == 0:
            raise HTTPException(
                status_code=400,
                detail="没有找到需要更新的评估项"
            )

        # 8. 更新任务进度（从Redis统计已完成项数）
        # 通过扫描Redis key来统计已完成的item_index（去重）
        completed_item_indices = set()
        pattern = f"manual_evaluation:annotation:{task_id}:*"
        keys = await redis_client.keys(pattern)
        for key in keys:
            # key格式：manual_evaluation:annotation:{task_id}:{file_index}:{item_index}
            parts = key.split(":")
            if len(parts) >= 5:
                try:
                    item_index = int(parts[4])
                    completed_item_indices.add(item_index)
                except ValueError:
                    continue

        # 去重后的完成项数量
        total_completed = len(completed_item_indices)

        task.completed_items = total_completed

        # 如果total_items为空，从文件统计
        if not task.total_items:
            jfs = await self.storage.JUICEFS_CLIENT()
            total_count = 0
            for jsonl_file_path in task.result_file_path:
                if jfs.exists(jsonl_file_path):
                    with jfs.open(jsonl_file_path, 'r', encoding='utf-8') as f:
                        total_count = max(total_count, sum(1 for line in f if line.strip()))
            task.total_items = total_count if total_count > 0 else task.total_items

        # 更新进度百分比
        if task.total_items and task.total_items > 0:
            task.progress = int((total_completed / task.total_items) * 100)

        # 更新任务状态
        if task.status == AnnotationStatus.PENDING.value:
            task.status = AnnotationStatus.ANNOTATING.value

        await self.task_mapper.update_by_id(task_id, task)
        await self.task_mapper.commit()

        logger.info(
            f"批量更新评估项成功: task_id={task_id}, updated_count={updated_count}, total_completed={total_completed}")

    async def submit_manual_evaluation_task(
            self,
            project_id: int,
            task_id: int,
            current_user: JwtUserInfo
    ) -> None:
        """提交人工评估任务，触发标注结果写入JSONL"""
        from app.core.config import settings
        from app.managers.scheduled_tasks import ScheduledTasks

        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        # 2. 验证是否为人工评估任务
        if task.evaluation_method != EvaluationMethod.MANUAL:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 不是人工评估任务"
            )

        # 3. 获取JSONL文件路径列表
        if not task.result_file_path or len(task.result_file_path) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"任务 {task_id} 没有评估结果文件"
            )

        # 4. 获取Redis客户端
        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            raise HTTPException(
                status_code=500,
                detail="Redis客户端未初始化"
            )

        # 5. 统计已完成项数量
        completed_item_indices = set()
        pattern = f"manual_evaluation:annotation:{task_id}:*"
        keys = await redis_client.keys(pattern)
        for key in keys:
            parts = key.split(":")
            if len(parts) >= 5:
                try:
                    item_index = int(parts[4])
                    completed_item_indices.add(item_index)
                except ValueError:
                    continue

        total_completed = len(completed_item_indices)
        task.completed_items = total_completed

        # 6. 如果total_items为空，从文件统计
        if not task.total_items:
            jfs = await self.storage.JUICEFS_CLIENT()
            total_count = 0
            for jsonl_file_path in task.result_file_path:
                if jfs.exists(jsonl_file_path):
                    with jfs.open(jsonl_file_path, 'r', encoding='utf-8') as f:
                        total_count = max(total_count, sum(1 for line in f if line.strip()))
            task.total_items = total_count if total_count > 0 else task.total_items

        if not task.total_items or total_completed != task.total_items:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 标注未完成，无法提交"
            )

        # 7. 写入Redis提交集合并更新任务状态
        completed_tasks_key = "manual_evaluation:completed_tasks"
        await redis_client.sadd(completed_tasks_key, str(task_id))
        task.status = AnnotationStatus.REPORT_GENERATION_ING.value

        await self.task_mapper.update_by_id(task_id, task)
        await self.task_mapper.commit()

        # 8. 触发写入JSONL
        scheduled_tasks = ScheduledTasks(asyncio.get_running_loop())
        asyncio.create_task(scheduled_tasks.write_manual_evaluation_annotations_to_jsonl())

        logger.info(f"人工评估任务提交成功: task_id={task_id}, submitted_by={current_user.username}")

    async def download_manual_evaluation_results(
            self,
            project_id: int,
            task_id: int,
            format: str = "jsonl"
    ):
        """下载人工评估结果（从 JFS 读取 JSONL 文件）。单文件流式返回，多文件打包为 zip。支持多格式导出（jsonl/json/xlsx/csv）。"""
        export_format = (format or "jsonl").lower()
        if export_format not in ("jsonl", "json", "xlsx", "csv"):
            raise HTTPException(status_code=400, detail="不支持的导出格式，仅支持 jsonl、json、xlsx、csv")

        task = await self.validate_task(task_id, project_id)
        if task.evaluation_method != EvaluationMethod.MANUAL:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 不是人工评估任务"
            )
        if not task.result_file_path or len(task.result_file_path) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"任务 {task_id} 没有评估结果文件"
            )

        jfs = await self.storage.JUICEFS_CLIENT()

        # 构建 dataset_id -> inference_result_dataset_name 映射，用于生成友好文件名
        relations = await self.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).filter(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
            ).order_by(EvaluationTaskDatasetModelRelation.sort_order)
        )
        dataset_id_to_name = {r.inference_result_dataset_id: (r.inference_result_dataset_name or f"dataset_{r.inference_result_dataset_id}") for r in relations}

        def _sanitize_filename(s: str) -> str:
            """替换文件名非法字符为下划线"""
            for c in r'\/:*?"<>|':
                s = s.replace(c, '_')
            return s.strip() or "unnamed"

        eval_name_safe = _sanitize_filename(task.name or f"evaluation_{task_id}")

        if len(task.result_file_path) == 1:
            target_path = task.result_file_path[0]
            if not jfs.exists(target_path):
                logger.error(f"评估结果文件丢失: {target_path}")
                raise HTTPException(status_code=404, detail="评估结果文件在存储系统中未找到")
            # 从路径提取 dataset_id：manual_evaluation_result_dataset_{dataset_id}.jsonl
            basename = os.path.basename(target_path)
            dataset_id = None
            if basename.startswith("manual_evaluation_result_dataset_") and basename.endswith(".jsonl"):
                try:
                    dataset_id = int(basename[33:-6])  # len("manual_evaluation_result_dataset_")=33
                except ValueError:
                    pass
            dataset_name = dataset_id_to_name.get(dataset_id,basename.replace(".jsonl", "")) if dataset_id else basename.replace(".jsonl", "")
            suffix_media = {
                "jsonl": (".jsonl", "application/octet-stream"),
                "json": (".json", "application/json"),
                "xlsx": (".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "csv": (".csv", "text/csv; charset=utf-8"),
            }
            suffix, media_type = suffix_media.get(export_format, (".jsonl", "application/octet-stream"))
            download_filename = f"{eval_name_safe}-评估详情{suffix}"

            from app.utils.http_util import build_content_disposition_header
            if export_format == "jsonl":
                def generate():
                    with jfs.open(target_path, 'rb') as f:
                        while True:
                            chunk = f.read(64 * 1024)
                            if not chunk:
                                break
                            yield chunk

                return StreamingResponse(
                    generate(),
                    media_type=media_type,
                    headers={"Content-Disposition": build_content_disposition_header(download_filename)}
                )
            # 多格式导出：调用转换方法后返回
            try:
                file_content = await analyze_export_evaluation_result_file_single(
                    target_file_path=target_path,
                    export_file_type=export_format,
                    storage_service=self.storage,
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            return StreamingResponse(
                iter([file_content]),
                media_type=media_type,
                headers={"Content-Disposition": build_content_disposition_header(download_filename)}
            )

        for fp in task.result_file_path:
            if not jfs.exists(fp):
                logger.error(f"评估结果文件丢失: {fp}")
                raise HTTPException(status_code=404, detail="评估结果文件在存储系统中未找到")

        suffix_by_format = {"jsonl": ".jsonl", "json": ".json", "xlsx": ".xlsx", "csv": ".csv"}
        entry_suffix = suffix_by_format.get(export_format, ".jsonl")

        fd, zip_path = tempfile.mkstemp(prefix=f"manual_eval_{task_id}_", suffix=".zip")
        os.close(fd)
        try:
            used_names: Dict[str, int] = {}
            with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
                for fp in task.result_file_path:
                    basename = os.path.basename(fp)
                    dataset_id = None
                    if basename.startswith("manual_evaluation_result_dataset_") and basename.endswith(".jsonl"):
                        try:
                            dataset_id = int(basename[33:-6])  # len("manual_evaluation_result_dataset_")=33
                        except ValueError:
                            pass
                    dataset_name = dataset_id_to_name.get(dataset_id, basename.replace(".jsonl",
                                                                                       "")) if dataset_id else basename.replace(
                        ".jsonl", "")
                    base_entry = f"{eval_name_safe}_{_sanitize_filename(dataset_name)}{entry_suffix}"
                    if base_entry in used_names:
                        used_names[base_entry] += 1
                        zip_entry_name = f"{eval_name_safe}_{_sanitize_filename(dataset_name)}({used_names[base_entry]}){entry_suffix}"
                    else:
                        used_names[base_entry] = 1
                        zip_entry_name = base_entry
                    if export_format == "jsonl":
                        with jfs.open(fp, 'rb') as f:
                            zf.writestr(zip_entry_name, f.read())
                    else:
                        try:
                            file_content = await analyze_export_evaluation_result_file_single(
                                target_file_path=fp,
                                export_file_type=export_format,
                                storage_service=self.storage,
                            )
                            zf.writestr(zip_entry_name, file_content)
                        except ValueError as e:
                            raise HTTPException(status_code=400, detail=str(e))

            download_filename = f"{eval_name_safe}-评估详情.zip"

            def generate_zip():
                try:
                    with open(zip_path, 'rb') as f:
                        while True:
                            chunk = f.read(64 * 1024)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    if os.path.exists(zip_path):
                        try:
                            os.remove(zip_path)
                        except OSError:
                            pass

            from app.utils.http_util import build_content_disposition_header
            return StreamingResponse(
                generate_zip(),
                media_type='application/octet-stream',
                headers={"Content-Disposition": build_content_disposition_header(download_filename)}
            )
        except Exception:
            if os.path.exists(zip_path):
                try:
                    os.remove(zip_path)
                except OSError:
                    pass
            raise

    async def get_first_unannotated_item(
            self,
            project_id: int,
            task_id: int
    ) -> Optional[ManualEvaluationItemResponse]:
        """获取第一个未评估的项（使用Redis已评估行号集合快速查找）"""
        from app.core.config import settings

        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        # 2. 验证是否为人工评估任务
        if task.evaluation_method != EvaluationMethod.MANUAL:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 不是人工评估任务"
            )

        # 3. 获取JSONL文件路径列表
        if not task.result_file_path or len(task.result_file_path) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"任务 {task_id} 没有评估结果文件"
            )

        # 4. 获取Redis客户端
        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            raise HTTPException(
                status_code=500,
                detail="Redis客户端未初始化"
            )

        # 5. 根据文件名中的推理结果集 ID 建立 file_index -> model_name 映射（不再依赖排序）
        from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
        file_to_model_map = {}
        for file_index, path in enumerate(task.result_file_path or []):
            dataset_id = self._parse_dataset_id_from_manual_result_path(path)
            if dataset_id is not None:
                file_to_model_map[file_index] = await self._get_model_name_by_dataset_id(task_id, dataset_id)
            else:
                file_to_model_map[file_index] = f"model_{file_index}"

        # 5.5 按文件路径解析 dataset_id 计算 base_url
        base_urls_list = []
        if self.inference_result_service:
            for path in task.result_file_path or []:
                url = None
                dataset_id = self._parse_dataset_id_from_manual_result_path(path)
                if dataset_id is not None:
                    inf_ds = await self.task_mapper.query_one(
                        select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
                    )
                    if inf_ds is not None:
                        url = self.inference_result_service._build_base_url(
                            project_id=project_id,
                            dataset_id=dataset_id,
                            data_format=inf_ds.dataset_format,
                        )
                base_urls_list.append(url)
        else:
            base_urls_list = [None] * len(task.result_file_path or [])

        # 6. 遍历所有文件，查找第一个未评估的项
        jfs = await self.storage.JUICEFS_CLIENT()

        # 先扫描Redis，获取所有已完成的item_index（通过扫描所有annotation key）
        pattern = f"manual_evaluation:annotation:{task_id}:*"
        keys = await redis_client.keys(pattern)
        completed_item_indices = set()
        for key in keys:
            # key格式：manual_evaluation:annotation:{task_id}:{file_index}:{item_index}
            parts = key.split(":")
            if len(parts) >= 5:
                try:
                    item_index = int(parts[4])
                    completed_item_indices.add(item_index)
                except ValueError:
                    continue

        for file_index, jsonl_file_path in enumerate(task.result_file_path):
            if not jfs.exists(jsonl_file_path):
                continue

            model_name = file_to_model_map.get(file_index, f"model_{file_index}")

            # 读取文件，找到第一个未评估的项
            with jfs.open(jsonl_file_path, 'r', encoding='utf-8') as f:
                for idx, line in enumerate(f, start=1):
                    if not line.strip():
                        continue

                    item = json.loads(line)
                    item_index = item.get("item_index", idx)

                    # 如果该行未评估，返回该项
                    if item_index not in completed_item_indices:
                        # 按 model_name 收集该 item_index 在各文件中的内容（优先使用文件中写入的 model_name）
                        content_by_model: Dict[str, Dict] = {}
                        for f_idx, f_path in enumerate(task.result_file_path):
                            if not jfs.exists(f_path):
                                continue
                            with jfs.open(f_path, 'r', encoding='utf-8') as f2:
                                for idx2, line2 in enumerate(f2, start=1):
                                    if not line2.strip():
                                        continue
                                    item2 = json.loads(line2)
                                    item_index2 = item2.get("item_index", idx2)
                                    if item_index2 != item_index:
                                        continue
                                    redis_key2 = f"manual_evaluation:annotation:{task_id}:{f_idx}:{item_index}"
                                    annotation_json2 = await redis_client.get(redis_key2)
                                    annotation_data = json.loads(annotation_json2) if annotation_json2 else {
                                        "status": AnnotationStatus.PENDING.value,
                                        "metrics": None,
                                        "annotated_at": None,
                                        "annotated_by": None
                                    }
                                    content_by_model[model_name] = {"item": item2, "annotation": annotation_data}
                                    break
                        # 按 file_index 顺序构建 content_list（model_name 来自路径解析+推理结果集 id 查询）
                        content_list = []
                        for f_idx in sorted(file_to_model_map.keys()):
                            m_name = file_to_model_map.get(f_idx, f"model_{f_idx}")
                            if m_name not in content_by_model:
                                continue
                            rec = content_by_model[m_name]
                            item2 = rec["item"]
                            annotation_data = rec["annotation"]
                            base_url = base_urls_list[f_idx] if f_idx < len(base_urls_list) else None
                            manual_item = {
                                "messages": item2.get("messages"),
                                "images": item2.get("images"),
                                "system": item2.get("system"),
                                "prompt": item2.get("prompt", ""),
                                "response": item2.get("response"),
                                "model_response": item2.get("model_response"),
                                "annotation": annotation_data,
                                "model_name": model_name,
                                "base_url": base_url,
                            }
                            content_list.append(manual_item)

                        response_item = {
                            "item_index": item_index,
                            "content": content_list
                        }
                        from app.schemas.evaluation_task import ManualEvaluationItemResponse
                        return ManualEvaluationItemResponse.model_validate(response_item)

        # 所有项都已评估
        return None

    async def get_manual_evaluation_annotation_stats(
            self,
            project_id: int,
            task_id: int
    ) -> "ManualEvaluationAnnotationStatsResponse":
        """获取人工评估标注统计信息

        Args:
            project_id: 项目ID
            task_id: 任务ID

        Returns:
            ManualEvaluationAnnotationStatsResponse: 标注统计信息
        """
        from app.schemas.evaluation_task import ManualEvaluationAnnotationStatsResponse

        # 1. 验证任务
        task = await self.validate_task(task_id, project_id)

        # 2. 验证是否为人工评估任务
        if task.evaluation_method != EvaluationMethod.MANUAL:
            raise HTTPException(
                status_code=400,
                detail=f"任务 {task_id} 不是人工评估任务（evaluation_method={task.evaluation_method}）"
            )

        # 3. 从数据库读取统计数据
        total_tasks = task.total_items or 0
        completed_count = task.completed_items or 0

        # 4. 计算未标注数量
        unannotated_count = total_tasks - completed_count

        # 5. 标注中数量目前固定为0
        annotating_count = 0

        return ManualEvaluationAnnotationStatsResponse(
            total_tasks=total_tasks,
            completed_count=completed_count,
            annotating_count=annotating_count,
            unannotated_count=unannotated_count
        )


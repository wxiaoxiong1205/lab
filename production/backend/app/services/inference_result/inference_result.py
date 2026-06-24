import json
import os
import urllib.parse
import uuid
import pandas as pd
import tempfile
import zipfile
import asyncio
import shutil
from io import BytesIO
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi_pagination import Page, Params
from sqlalchemy import select, desc, or_, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse
from twine.commands.upload import upload

from app.core.config import settings
from app.core.logging import logger

from app.models import TrainedModel
from app.models.models import (
    JwtUserInfo,
    Project,
    KubernetesResource,
    ProjectKubernetesRelation,
    TaskExecution,
    BusinessAttrValue,
    BusinessAttrValueOption,
)
from app.models.inference_result_manager import InferenceResultDataset
from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
from app.repository.inference_result_mapper import InferenceResultDatasetMapper
from app.schemas.inference_result import (
    InferenceResultDatasetCreate, InferenceResultDatasetResponse,
    InferenceResultDatasetSummaryResponse, InferenceResultItemResponse,
    InferenceResultDetailResponse, InferenceResultDatasetBatchCreate,
    InferenceResultDatasetBatchResponse, InferenceMethod, UploadMethod, InferenceResultDatasetUploadType,
    TaskLogResponse, InferenceResultItemResponsePage, InferenceResultItemFlexibleResponsePage,
    InferenceResultItemFlexibleResponse,
    InferenceDatasetUsage,
    InferenceResultDatasetExportType,
    InferenceResultAggregationResponse,
    InferenceResultDatasetBasicInfoUpdate,
)
from app.services.storage.interface import StorageService
from app.utils.storage_enum import StoragePath
from app.utils.timezone_utils import to_local_tz, get_current_shanghai_time
from app.utils.validators import validate_project_exists
from app.utils.name_validator import validate_name_format
from app.utils.business_attr_utils import BusinessAttrValueHelper
from app.schemas.business_attr_value import (
    BusinessAttrValueBusinessType,
    BusinessAttrValueResponse,
    DATASET_USAGE_TO_BUSINESS_TYPE,
    INFERENCE_RESULT_USAGE_TO_BUSINESS_TYPE,
    INFERENCE_RESULT_DATASET_RELATED_BUSINESS_TYPES,
)
from app.schemas.training_dataset import CountByValueItem, AttrOptionGroupItem
from .interface import InferenceResultDatasetService
from ..project.interface import ProjectService
from ...common.status import TaskStatus
from ...common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from ...repository.task_execution_mapper import TaskExecutionMapper
from ...schemas import DatasetFormat
from ...schemas.common import InferenceResultSampleFileCategory
from ...schemas.training_task import TrainingTypeCategory
from ...utils import app_runtime_context
from ...utils.dataset_file_parser import (
    analyze_image_understanding_dataset_file_content,
    FILE_TYPE_CONFIG,
    LineIndex,
    load_or_build_index as load_or_build_index_util,
)
from ...utils.inference_result_file_parser import analyze_export_inference_result_file_single
from ...utils.k8s_launcher import K8sLauncher
from ...tasks.celery_app import celery_app


class DefaultInferenceResultDatasetService(InferenceResultDatasetService):
    """推理结果数据集服务实现类"""

    def __init__(self, dataset_mapper: InferenceResultDatasetMapper,
                 project_service: ProjectService,
                 task_mapper: TaskExecutionMapper,
                 storage: StorageService) -> None:
        self.dataset_mapper = dataset_mapper
        self.project_service = project_service
        self.task_mapper = task_mapper
        self.storage = storage
        self.attr_helper = BusinessAttrValueHelper(dataset_mapper)
        self.executor = ThreadPoolExecutor(max_workers=2)

    # ------------------------------ 基础验证方法实现 ------------------------------

    async def validate_dataset(self, dataset_id: int, project_id: int) -> InferenceResultDataset:
        """验证推理结果数据集是否存在且属于指定项目"""
        result = await self.dataset_mapper.query_one(
            select(InferenceResultDataset).filter(
                InferenceResultDataset.id == dataset_id,
                InferenceResultDataset.project_id == project_id
            )
        )
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"推理结果数据集不存在: dataset_id={dataset_id}, project_id={project_id}"
            )
        if result.inference_method== InferenceMethod.THIRD_API.value:
            result.inference_params={}
        return result

    # ------------------------------ 核心业务方法实现 ------------------------------
    async def run_create_inference_result_dataset_post_process(
            self,
            dataset_id: int,
            namespace: str,
            dataset_payload: dict,
            tenant_id: str
    ) -> Optional[str]:
        """提交离线/在线推理结果集任务到 Celery 并回写 celery_task_id"""
        from app.tasks.inference_result_tasks import create_inference_result_dataset_async

        celery_result = create_inference_result_dataset_async.apply_async(
            args=[dataset_id, namespace, dataset_payload, tenant_id],
            countdown=1
        )

        db_dataset = await self.dataset_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        if not db_dataset:
            raise HTTPException(status_code=404, detail=f"推理结果数据集不存在: {dataset_id}")
        db_dataset.celery_task_id = celery_result.id
        await self.dataset_mapper.commit()
        return celery_result.id

    def get_sample_dataset_path(
            self,
            dataset_type: TrainingTypeCategory,
            dataset_format: Optional[DatasetFormat],
            file_type: InferenceResultDatasetUploadType
    ) -> str:
        # 计算样例文件基础路径
        current_dir = os.path.dirname(os.path.abspath(__file__))
        api_dir = os.path.dirname(current_dir)  # api
        app_dir = os.path.dirname(api_dir)  # app
        base_sample_dir = os.path.join(app_dir, "sample_datasets", "inference_result")

        if dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING:
            # 图像理解数据集特殊处理
            if dataset_format == DatasetFormat.ROLE_BASED:
                # role-based
                sample_path = os.path.join(
                    base_sample_dir,
                    InferenceResultSampleFileCategory.IMAGE_UNDERSTANDING_ROLE_BASED + "." + file_type
                )

            else:
                # 不支持的数据集格式
                raise HTTPException(
                    status_code=400,
                    detail=f"暂无当前数据集格式：{dataset_format} 的样例数据集"
                )

        elif dataset_type == TrainingTypeCategory.TEXT_GENERATION:
            # 文本生成数据集
            if dataset_format == DatasetFormat.PROMPT_RESPONSE:
                # prompt_response
                sample_path = os.path.join(
                    base_sample_dir,
                    InferenceResultSampleFileCategory.TEXT_GENERATION_PROMPT_RESPONSE + "." + file_type
                )

            elif dataset_format == DatasetFormat.ROLE_BASED:
                # role_based
                sample_path = os.path.join(
                    base_sample_dir,
                    InferenceResultSampleFileCategory.TEXT_GENERATION_ROLE_BASED + "_" + file_type + ".zip"
                )

            else:
                # 不支持的数据集格式
                raise HTTPException(
                    status_code=400,
                    detail=f"暂无当前数据集格式：{dataset_format} 的样例数据集"
                )

        elif dataset_type == TrainingTypeCategory.BUSINESS:
            # 业务测试数据集：
            sample_path = os.path.join(
                base_sample_dir,
                InferenceResultSampleFileCategory.BUSINESS_TEST_BUSINESS + "." + file_type
            )

        else:
            # 不支持的数据集类型
            raise HTTPException(
                status_code=400,
                detail=f"暂无当前数据集类型：{dataset_type} 的样例数据集"
            )

        sample_path = os.path.normpath(sample_path)

        if not os.path.exists(sample_path):
            raise HTTPException(
                status_code=404,
                detail=f"样例文件缺失: {sample_path}"
            )

        return sample_path

    async def download_sample_dataset(
            self,
            current_user: JwtUserInfo,
            file_type: InferenceResultDatasetUploadType,
            dataset_type: TrainingTypeCategory,
            dataset_format: DatasetFormat
    ) -> FileResponse:
        """下载样例数据集"""
        try:
            # 获取样例数据集文件路径
            sample_path = self.get_sample_dataset_path(dataset_type, dataset_format, file_type)

            # 检查文件是否存在
            if not os.path.exists(sample_path):
                raise HTTPException(
                    status_code=404,
                    detail=f"暂无 {dataset_type.value} + {dataset_format.value} 的样例数据集，请联系管理员添加"
                )

            # 根据样例文件的原始名称作生成中文下载文件名
            origin_download_filename = os.path.basename(sample_path)
            prefix, suffix = os.path.splitext(origin_download_filename)

            # 从枚举中获取描述
            description = InferenceResultSampleFileCategory.get_description_by_value(prefix)

            if description:
                download_filename = f"{description}{suffix}"
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"暂无 {dataset_type.value} + {dataset_format.value} 的样例数据集，请联系管理员添加"
                )

            # 直接用 suffix 设置 Content-Type（与下载文件名一致，zip 时为 application/zip）
            from app.utils.dataset_file_parser import FILE_TYPE_CONFIG
            ext_key = (suffix or "").strip().lstrip(".").lower()
            media_type = FILE_TYPE_CONFIG.get(ext_key, FILE_TYPE_CONFIG["jsonl"])["media_type"]

            # 需要将 header 头中的文件名改为 utf-8 格式，否则在下载中文文件名将导致字符编码错误
            filename_utf8 = urllib.parse.quote(download_filename)
            # 返回文件下载响应
            return FileResponse(
                path=sample_path,
                filename=download_filename,
                media_type=media_type,
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"下载样例数据集失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"下载样例数据集失败: {str(e)}"
            )

    async def create_inference_result_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset: InferenceResultDatasetCreate,
            files: Optional[List[UploadFile]] = None,
            manual_trigger_required: bool = True,
    ) -> InferenceResultDatasetResponse:
        """创建推理结果数据集"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 验证数据集名称
        try:
            validate_name_format(dataset.name, "数据集名称")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # 检查名称是否重复（租户 + 项目空间id + name 唯一）
        existing_dataset = await self.dataset_mapper.query_one(
            select(InferenceResultDataset).filter(
                InferenceResultDataset.name == dataset.name,
                InferenceResultDataset.project_id == project_id
            )
        )
        if existing_dataset:
            raise HTTPException(
                status_code=400,
                detail=f"已存在同名推理结果集：{dataset.name}（同一租户和项目空间下名称必须唯一）"
            )

        # 验证推理结果集相关字段
        self._validate_dataset_field(dataset, files)
        upload_ids = dataset.upload_ids

        # 生成 lab_k8s_uuid（仅对离线推理和在线推理）
        k8s_uuid = None
        if dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]:
            k8s_uuid = str(uuid.uuid4())

        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

        initial_status = (
            TaskStatus.SCHEDULED_PENDING.value
            if dataset.schedule_at and dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]
            else TaskStatus.CREATED.value
        )

        # 创建数据集记录
        db_dataset = InferenceResultDataset(
            name=dataset.name,
            description=dataset.description,
            project_id=project_id,
            inference_method=dataset.inference_method.value,
            schedule_at=dataset.schedule_at,
            model_source=dataset.model_source or "base_model",
            model_id=dataset.model_id,
            model_name=dataset.model_name,
            online_service_id=dataset.online_service_id,
            online_service_name=dataset.online_service_name,
            source_dataset_id=dataset.source_dataset_id,
            source_dataset_name=dataset.source_dataset_name,
            # 待推理模型参数（字典格式，转换为字符串键的字典存储）
            inference_params=(
                {k.value if hasattr(k, 'value') else k: v for k, v in dataset.inference_params.items()}
                if dataset.inference_params and isinstance(dataset.inference_params, dict)
                else (dataset.inference_params if isinstance(dataset.inference_params, dict) else None)
            ),
            # 显卡资源配置（转换为字典存储）（只有离线推理需要）
            graphics_card_resource=dataset.graphics_card_resource.model_dump() if dataset.graphics_card_resource and dataset.inference_method == InferenceMethod.OFFLINE else None,
            upload_method=dataset.upload_method.value if dataset.upload_method else None,
            status=initial_status,
            progress=0,
            lab_k8s_uuid=k8s_uuid,
            celery_task_id=None,  # 初始为None，后续更新
            created_id=current_user.userId,
            created_by=current_user.username,
            usage=dataset.usage,  # usage 已在 controller 层处理默认值
            manual_trigger_required=manual_trigger_required  # usage 已在 controller 层处理默认值
        )

        # 先保存数据集以获取ID
        await self.dataset_mapper.insert(db_dataset)
        await self.dataset_mapper.commit()

        # 获取数据集格式（如果已设置），用于生成正确的路径
        # 对于导入推理结果集，从请求中获取；对于离线/在线推理，从源数据集获取
        dataset_format = None
        dataset_type = None
        usage = dataset.usage
        if dataset.inference_method == InferenceMethod.IMPORT:
            # 导入推理结果集：使用前端传递的 dataset_format 和 dataset_type
            if dataset.dataset_format:
                dataset_format = dataset.dataset_format.value if hasattr(dataset.dataset_format, 'value') else str(
                    dataset.dataset_format)
            if dataset.dataset_type:
                dataset_type = dataset.dataset_type.value if hasattr(dataset.dataset_type, 'value') else str(
                    dataset.dataset_type)
        elif dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]:
            # 离线/在线推理：从源数据集获取 dataset_format 和 dataset_type
            if dataset.source_dataset_id:
                from app.models.training_dataset_manager import TrainingDataset
                source_dataset = await self.dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
                )
                if source_dataset and source_dataset.dataset_format:
                    dataset_format = source_dataset.dataset_format
                if source_dataset and source_dataset.dataset_type:
                    dataset_type = source_dataset.dataset_type

        file_path = self._generate_file_path(db_dataset.id, namespace, dataset.name, dataset_format)
        dataset.file_url = file_path

        # 执行对应的结果集相关处理逻辑
        # 如果是导入推理结果集，启动异步Celery任务处理文件上传（支持直接上传和分片上传）
        if dataset.inference_method == InferenceMethod.IMPORT and (files or upload_ids):
            await self.process_inference_result_file_import(dataset, db_dataset, usage, files, upload_ids, namespace)

        # 如果是离线推理或在线推理，启动异步Celery任务
        if dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]:

            db_dataset.file_path = file_path
            db_dataset.progress = 0

            # 从源数据集获取total_items（数据量）、dataset_type和dataset_format
            if dataset.source_dataset_id:
                from app.models.training_dataset_manager import TrainingDataset
                source_dataset = await self.dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
                )
                if source_dataset:
                    if source_dataset.total_samples:
                        db_dataset.total_items = source_dataset.total_samples
                        logger.info(
                            f"从源数据集 {dataset.source_dataset_id} 获取数据量: {source_dataset.total_samples}")
                    # 从源数据集获取 dataset_type 和 dataset_format
                    if source_dataset.dataset_type:
                        db_dataset.dataset_type = source_dataset.dataset_type
                        logger.info(
                            f"从源数据集 {dataset.source_dataset_id} 获取数据集类型: {source_dataset.dataset_type}")
                    if source_dataset.dataset_format:
                        db_dataset.dataset_format = source_dataset.dataset_format
                        logger.info(
                            f"从源数据集 {dataset.source_dataset_id} 获取数据格式: {source_dataset.dataset_format}")
                    
                    # 继承关联业务属性值与选项
                    if source_dataset:
                        source_bt = DATASET_USAGE_TO_BUSINESS_TYPE.get(source_dataset.usage)
                        target_attr_bt = INFERENCE_RESULT_USAGE_TO_BUSINESS_TYPE.get(db_dataset.usage)
                        if source_bt and target_attr_bt:
                            db_dataset.attr_values = await self.attr_helper.copy_attr_values_between_references(
                                source_reference_id=source_dataset.id,
                                source_business_type=source_bt.value,
                                target_reference_id=db_dataset.id,
                                target_business_type=target_attr_bt.value,
                                current_user=current_user,
                            )

                else:
                    logger.warning(f"源数据集 {dataset.source_dataset_id} 不存在")

            # 获取当前租户ID（Celery worker 进程需要）
            from app.utils.app_runtime_context import get_tenant_id
            tenant_id = get_tenant_id()
            if not tenant_id:
                # 如果上下文没有，从数据库记录中获取（已自动填充）
                tenant_id = db_dataset.tenant_id

            post_kwargs = {
                "namespace": namespace,
                "dataset_payload": dataset.model_dump(mode='json'),
                "tenant_id": tenant_id
            }
            # if dataset.schedule_at:
            #     execution = TaskExecution(
            #         business_type=TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value,
            #         business_id=db_dataset.id,
            #         schedule_at=dataset.schedule_at,
            #         status=TaskExecutionStatus.PENDING.value,
            #         executor=TaskExecutionExecutor.INFERENCE_RESULT_DATASETS.value,
            #         method=TaskExecutionMethod.START.value,
            #         kwargs=post_kwargs
            #     )
            #     await self.dataset_mapper.insert(execution)
            #     await self.dataset_mapper.commit()
            #     logger.info(f"推理结果数据集已创建并等待定时执行: {db_dataset.id}, schedule_at={dataset.schedule_at}")
            # else:
            #     celery_task_id = await self.run_create_inference_result_dataset_post_process(
            #         dataset_id=db_dataset.id,
            #         namespace=namespace,
            #         dataset_payload=post_kwargs["dataset_payload"],
            #         tenant_id=tenant_id
            #     )
            #     logger.info(f"推理结果数据集已提交到Celery队列: {db_dataset.id}, Celery任务ID: {celery_task_id}")

            if manual_trigger_required:
                execution = TaskExecution(
                    business_type=TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value,
                    business_id=db_dataset.id,
                    schedule_at=dataset.schedule_at,
                    status=TaskExecutionStatus.PENDING.value,
                    executor=TaskExecutionExecutor.INFERENCE_RESULT_DATASETS.value,
                    method=TaskExecutionMethod.START.value,
                    kwargs=post_kwargs
                )
                await self.task_mapper.insert(execution)
                await self.task_mapper.commit()
                logger.info(f"推理结果数据集已创建并等待执行: {db_dataset.id}, schedule_at={dataset.schedule_at}")
            else:
                celery_task_id = await self.run_create_inference_result_dataset_post_process(
                    dataset_id=db_dataset.id,
                    namespace=namespace,
                    dataset_payload=post_kwargs["dataset_payload"],
                    tenant_id=tenant_id
                )
                logger.info(f"推理结果数据集已提交到Celery队列: {db_dataset.id}, Celery任务ID: {celery_task_id}")
        # 转换为响应模型
        return InferenceResultDatasetResponse.model_validate(db_dataset)

    async def update_inference_result_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_id: int,
            dataset: InferenceResultDatasetCreate,
            files: Optional[List[UploadFile]] = None,
    ) -> InferenceResultDatasetResponse:
        """编辑推理结果数据集（参数与创建一致），并同步执行任务"""
        await self.project_service.is_existed(project_id)
        db_dataset = await self.validate_dataset(dataset_id, project_id)

        # 只有已创建/定时待启动/失败/已终止的任务可以进行编辑
        if db_dataset.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                               TaskStatus.TERMINATED.value, TaskStatus.FAILED.value]:
            raise HTTPException(status_code=400, detail=f"当前状态为 {db_dataset.status}，不允许编辑")

        try:
            validate_name_format(dataset.name, "数据集名称")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        existing_dataset = await self.dataset_mapper.query_one(
            select(InferenceResultDataset).filter(
                InferenceResultDataset.name == dataset.name,
                InferenceResultDataset.project_id == project_id,
                InferenceResultDataset.id != dataset_id
            )
        )
        if existing_dataset:
            raise HTTPException(status_code=400, detail=f"已存在同名推理结果集：{dataset.name}（同一租户和项目空间下名称必须唯一）")

        self._validate_dataset_field(dataset, files)
        upload_ids = dataset.upload_ids
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

        # 全量覆盖与创建同参
        db_dataset.name = dataset.name
        db_dataset.description = dataset.description
        db_dataset.inference_method = dataset.inference_method.value
        db_dataset.schedule_at = dataset.schedule_at
        db_dataset.model_source = dataset.model_source or "base_model"
        db_dataset.model_id = dataset.model_id
        db_dataset.model_name = dataset.model_name
        db_dataset.online_service_id = dataset.online_service_id
        db_dataset.online_service_name = dataset.online_service_name
        db_dataset.source_dataset_id = dataset.source_dataset_id
        db_dataset.source_dataset_name = dataset.source_dataset_name
        db_dataset.inference_params = (
            {k.value if hasattr(k, "value") else k: v for k, v in dataset.inference_params.items()}
            if dataset.inference_params and isinstance(dataset.inference_params, dict)
            else (dataset.inference_params if isinstance(dataset.inference_params, dict) else None)
        )
        db_dataset.graphics_card_resource = (
            dataset.graphics_card_resource.model_dump()
            if dataset.graphics_card_resource and dataset.inference_method == InferenceMethod.OFFLINE
            else None
        )
        db_dataset.upload_method = dataset.upload_method.value if dataset.upload_method else None
        db_dataset.status = (
            TaskStatus.SCHEDULED_PENDING.value
            if dataset.schedule_at and dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]
            else TaskStatus.CREATED.value
        )
        db_dataset.progress = 0
        db_dataset.celery_task_id = None
        db_dataset.usage = dataset.usage
        db_dataset.total_items = None
        if dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]:
            db_dataset.lab_k8s_uuid = str(uuid.uuid4())
        else:
            db_dataset.lab_k8s_uuid = None

        dataset_format = None
        dataset_type = None
        usage = dataset.usage
        if dataset.inference_method == InferenceMethod.IMPORT:
            if dataset.dataset_format:
                dataset_format = dataset.dataset_format.value if hasattr(dataset.dataset_format, "value") else str(dataset.dataset_format)
            if dataset.dataset_type:
                dataset_type = dataset.dataset_type.value if hasattr(dataset.dataset_type, "value") else str(dataset.dataset_type)
        elif dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]:
            if dataset.source_dataset_id:
                from app.models.training_dataset_manager import TrainingDataset
                source_dataset = await self.dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
                )
                if source_dataset and source_dataset.dataset_format:
                    dataset_format = source_dataset.dataset_format
                if source_dataset and source_dataset.dataset_type:
                    dataset_type = source_dataset.dataset_type

        file_path = self._generate_file_path(db_dataset.id, namespace, dataset.name, dataset_format)
        dataset.file_url = file_path

        if dataset.inference_method == InferenceMethod.IMPORT and (files or upload_ids):
            await self.process_inference_result_file_import(dataset, db_dataset, usage, files, upload_ids, namespace)

        # 查询旧执行任务（若存在）
        execution = await self.task_mapper.query_one(
            select(TaskExecution).filter(
                TaskExecution.business_type == TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value,
                TaskExecution.business_id == db_dataset.id
            ).order_by(desc(TaskExecution.created_at))
        )

        # 保存来自源数据集的属性值
        target_attr_bt = INFERENCE_RESULT_USAGE_TO_BUSINESS_TYPE.get(db_dataset.usage)
        if dataset.source_dataset_id:
            from app.models.training_dataset_manager import TrainingDataset
            source_dataset = await self.dataset_mapper.query_one(
                select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
            )
            if source_dataset:
                source_bt = DATASET_USAGE_TO_BUSINESS_TYPE.get(source_dataset.usage)
                if source_bt and target_attr_bt:
                    await self.attr_helper.replace_attr_values_between_references(
                        source_reference_id=source_dataset.id,
                        source_business_type=source_bt.value,
                        target_reference_id=db_dataset.id,
                        target_business_type=target_attr_bt.value,
                        current_user=current_user,
                    )
        elif target_attr_bt:
            await self.attr_helper.delete_by_reference_ids(
                [db_dataset.id],
                target_attr_bt.value,
            )

        if dataset.inference_method in [InferenceMethod.OFFLINE, InferenceMethod.ONLINE]:
            db_dataset.file_path = file_path
            db_dataset.progress = 0
            if dataset.source_dataset_id:
                from app.models.training_dataset_manager import TrainingDataset
                source_dataset = await self.dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
                )
                if source_dataset:
                    if source_dataset.total_samples:
                        db_dataset.total_items = source_dataset.total_samples
                    if source_dataset.dataset_type:
                        db_dataset.dataset_type = source_dataset.dataset_type
                    if source_dataset.dataset_format:
                        db_dataset.dataset_format = source_dataset.dataset_format

            from app.utils.app_runtime_context import get_tenant_id
            tenant_id = get_tenant_id()
            if not tenant_id:
                tenant_id = db_dataset.tenant_id
            post_kwargs = {
                "namespace": namespace,
                "dataset_payload": dataset.model_dump(mode='json'),
                "tenant_id": tenant_id
            }

            if execution:
                if execution.status in [TaskExecutionStatus.RUNNING.value]:
                    raise HTTPException(status_code=400, detail=f"执行任务状态为 {execution.status}，不允许编辑")
                execution.schedule_at = dataset.schedule_at
                execution.status = TaskExecutionStatus.PENDING.value
                execution.executor = TaskExecutionExecutor.INFERENCE_RESULT_DATASETS.value
                execution.method = TaskExecutionMethod.START.value
                execution.retry_count = 0
                execution.last_error = None
                execution.locked_at = None
                execution.locked_by = None
                execution.kwargs = post_kwargs
            else:
                execution = TaskExecution(
                    business_type=TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value,
                    business_id=db_dataset.id,
                    schedule_at=dataset.schedule_at,
                    status=TaskExecutionStatus.PENDING.value,
                    executor=TaskExecutionExecutor.INFERENCE_RESULT_DATASETS.value,
                    method=TaskExecutionMethod.START.value,
                    kwargs=post_kwargs
                )
                await self.task_mapper.insert(execution)
        else:
            # 切换为导入模式，避免遗留执行器任务被调度
            if execution:
                if execution.status == TaskExecutionStatus.RUNNING.value:
                    raise HTTPException(status_code=400, detail="执行任务运行中，不允许切换为导入模式")
                execution.status = TaskExecutionStatus.FAILED.value
                execution.last_error = "任务已切换为导入模式，原执行器任务失效"
                execution.locked_at = None
                execution.locked_by = None

        await self.dataset_mapper.commit()
        return InferenceResultDatasetResponse.model_validate(db_dataset)

    async def update_inference_result_dataset_basic_info(
            self,
            project_id: int,
            dataset_id: int,
            update_data: InferenceResultDatasetBasicInfoUpdate,
    ) -> bool:
        """仅编辑推理结果集名称和描述。"""
        await self.project_service.is_existed(project_id)
        db_dataset = await self.validate_dataset(dataset_id, project_id)

        if update_data.name is not None:
            try:
                validate_name_format(update_data.name, "数据集名称")
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            existing_dataset = await self.dataset_mapper.query_one(
                select(InferenceResultDataset).filter(
                    InferenceResultDataset.name == update_data.name,
                    InferenceResultDataset.project_id == project_id,
                    InferenceResultDataset.id != dataset_id,
                )
            )
            if existing_dataset:
                raise HTTPException(
                    status_code=400,
                    detail=f"已存在同名推理结果集：{update_data.name}"
                )
            db_dataset.name = update_data.name
            await self.dataset_mapper.execute(
                update(EvaluationTaskDatasetModelRelation)
                .where(EvaluationTaskDatasetModelRelation.inference_result_dataset_id == dataset_id)
                .values(inference_result_dataset_name=update_data.name)
            )

        if "description" in update_data.model_fields_set:
            db_dataset.description = update_data.description

        await self.dataset_mapper.commit()
        return True

    async def list_inference_result_datasets(
            self,
            project_id: int,
            name: Optional[str] = None,
            inference_method: Optional[InferenceMethod] = None,
            status: Optional[TaskStatus] = None,
            dataset_type: Optional[str] = None,
            dataset_format: Optional[str] = None,
            source_dataset_id: Optional[int] = None,
            usage: Optional[InferenceDatasetUsage] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[InferenceResultDatasetSummaryResponse]:
        """获取项目下的推理结果数据集列表（分页）"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 构建查询
        query = select(InferenceResultDataset).filter(
            InferenceResultDataset.project_id == project_id
        )

        if name:
            query = query.filter(InferenceResultDataset.name.like(f"%{name}%"))
        if inference_method:
            query = query.filter(InferenceResultDataset.inference_method == inference_method.value)
        if status:
            query = query.filter(InferenceResultDataset.status == status.value)
        if dataset_type:
            query = query.filter(InferenceResultDataset.dataset_type == dataset_type)
        if dataset_format:
            query = query.filter(InferenceResultDataset.dataset_format == dataset_format)
        if source_dataset_id is not None:
            query = query.filter(InferenceResultDataset.source_dataset_id == source_dataset_id)
        # 兼容旧数据：当查询 default_inference 时，usage 为 None 的记录也视为 default_inference
        if usage == InferenceDatasetUsage.DEFAULT_INFERENCE:
            query = query.filter(
                or_(
                    InferenceResultDataset.usage == usage.value,
                    InferenceResultDataset.usage.is_(None)  # 兼容旧数据
                )
            )
        else:
            query = query.filter(InferenceResultDataset.usage == usage.value)

        # 按创建时间降序排列
        query = query.order_by(desc(InferenceResultDataset.created_at))

        # 分页查询
        result = await self.dataset_mapper.query_page(query, page, size)

        # 转换为响应模型
        items = [InferenceResultDatasetSummaryResponse.model_validate(item) for item in result.items]
        result.items = items

        return result

    async def get_inference_result_dataset(
            self,
            project_id: int,
            dataset_id: int
    ) -> InferenceResultDatasetResponse:
        """获取指定推理结果数据集详情（含关联业务属性值与选项）"""
        dataset = await self.validate_dataset(dataset_id, project_id)
        response = InferenceResultDatasetResponse.model_validate(dataset)
        response_update = {"attr_values": []}

        if dataset.model_source == "trained_model" and dataset.model_id:
            trained_model = await self.dataset_mapper.query_one(
                select(TrainedModel).filter(
                    TrainedModel.id == dataset.model_id,
                    TrainedModel.project_id == dataset.project_id,
                )
            )
            response_update["model_version"] = (
                trained_model.model_version if trained_model else None
            )
        
        target_attr_bt = INFERENCE_RESULT_USAGE_TO_BUSINESS_TYPE.get(dataset.usage)
        if target_attr_bt:
            attr_values = await self.attr_helper.query_attr_values_with_options(
                reference_id=dataset.id,
                business_type=target_attr_bt.value,
            )
            await self.attr_helper.attach_attr_options(attr_values)
            response_update["attr_values"] = [
                BusinessAttrValueResponse.model_validate(av) for av in attr_values
            ]
        return response.model_copy(update=response_update)

    async def get_inference_result_detail(
            self,
            project_id: int,
            dataset_id: int,
            page: int = 1,
            size: int = 10
    ) -> InferenceResultDetailResponse:
        """获取推理结果数据集详情（包含数据预览）"""
        # 验证数据集
        dataset = await self.validate_dataset(dataset_id, project_id)

        # 获取数据项（分页）
        items_result = await self.preview_inference_result_items(project_id, dataset_id, page, size)

        # 构建响应
        # items_result.items 可能是 List[InferenceResultItemResponse] 或 List[InferenceResultItemFlexibleResponse]
        detail = InferenceResultDetailResponse(
            id=dataset.id,
            name=dataset.name,
            description=dataset.description,
            inference_method=InferenceMethod(dataset.inference_method),
            model_name=dataset.model_name or dataset.online_service_name,
            source_dataset_name=dataset.source_dataset_name,
            total_items=dataset.total_items,
            created_at=to_local_tz(dataset.created_at),
            created_by=dataset.created_by,
            status=TaskStatus(dataset.status),
            progress=dataset.progress,
            started_at=to_local_tz(dataset.started_at) if dataset.started_at else None,
            finished_at=to_local_tz(dataset.finished_at) if dataset.finished_at else None,
            items=items_result.items  # 类型兼容：Union[List[InferenceResultItemResponse], List[InferenceResultItemFlexibleResponse]]
        )

        return detail

    async def preview_inference_result_items(
        self,
        project_id: int,
        dataset_id: int,
        page: int = 1,
        size: int = 10
    ) -> InferenceResultItemResponsePage | InferenceResultItemFlexibleResponsePage:
        """预览推理结果数据项（分页展示，从文件读取）

        根据数据集的 usage 字段判断返回格式：
        - business-inference: 返回宽松格式，直接返回原始JSON对象
        - default-inference: 返回固定格式，提取固定字段
        """
        # 验证数据集
        dataset = await self.validate_dataset(dataset_id, project_id)
        
        if not dataset.file_path:
            raise HTTPException(status_code=404, detail="数据集文件不存在")
        
        # 从 JuiceFS 读取文件
        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset.file_path):
            raise HTTPException(status_code=404, detail=f"数据集文件不存在: {dataset.file_path}")
        
        is_business_inference = dataset.usage == InferenceDatasetUsage.BUSINESS_INFERENCE.value
        total_items = dataset.total_items or 0
        if total_items == 0:
            empty_page_class = InferenceResultItemFlexibleResponsePage if is_business_inference else InferenceResultItemResponsePage
            return empty_page_class(
                items=[],
                total=0,
                page=page,
                size=size,
                pages=1,
                base_url=self._build_base_url(project_id=project_id, dataset_id=dataset_id, data_format=dataset.dataset_format)
            )

        indices = await load_or_build_index_util(self.executor, jfs, dataset.file_path)
        total = min(total_items, len(indices))
        if total < total_items:
            logger.warning(
                f"推理结果集 {dataset.name} 的 total_items({total_items}) 大于索引条数({len(indices)})，以索引条数为准"
            )

        start = (page - 1) * size
        if start >= total:
            empty_page_class = InferenceResultItemFlexibleResponsePage if is_business_inference else InferenceResultItemResponsePage
            return empty_page_class(
                items=[],
                total=total,
                page=page,
                size=size,
                pages=(total + size - 1) // size if total > 0 else 1,
                base_url=self._build_base_url(project_id=project_id, dataset_id=dataset_id, data_format=dataset.dataset_format)
            )

        page_items = await self._read_inference_result_lines_by_index(
            jfs=jfs,
            dataset_path=dataset.file_path,
            indices=indices,
            start_index=start,
            size=size,
            dataset_id=dataset_id,
            is_business_inference=is_business_inference,
        )
        
        # 手动构建分页响应
        total_pages = (total + size - 1) // size if total > 0 else 1
        base_url = self._build_base_url(project_id=project_id, dataset_id=dataset_id, data_format=dataset.dataset_format)

        if is_business_inference:
            # 业务推理结果集：返回宽松格式
            items = [
                InferenceResultItemFlexibleResponse(
                    id=item['id'],
                    dataset_id=item['dataset_id'],
                    sequence=item['sequence'],
                    data=item['data']  # 直接返回原始JSON对象
                )
                for item in page_items
            ]
            return InferenceResultItemFlexibleResponsePage(
                items=items,
                total=total,
                page=page,
                size=size,
                pages=total_pages,
                base_url=base_url
            )
        else:
            # 默认推理结果集：返回固定格式
            items = [
                InferenceResultItemResponse(
                    id=item['id'],
                    dataset_id=item['dataset_id'],
                    sequence=item['sequence'],
                    system=item['system'],
                    prompt=item['prompt'],
                    standard_response=item['standard_response'],
                    model_response=item['model_response'],
                    messages=item.get('messages'),  # 可选：多轮对话的消息内容（role-based格式）
                    images=item.get('images'),  # 可选：图片理解用到的图片材料相对路径（role-based格式）
                    error=item['error'],
                    error_message=item['error_message'],
                )
                for item in page_items
            ]
            return InferenceResultItemResponsePage(
                items=items,
                total=total,
                page=page,
                size=size,
                pages=total_pages,
                base_url=base_url
            )

    async def _read_inference_result_lines_by_index(
        self,
        jfs: Any,
        dataset_path: str,
        indices: List[LineIndex],
        start_index: int,
        size: int,
        dataset_id: int,
        is_business_inference: bool,
    ) -> List[Dict[str, Any]]:
        page_items: List[Dict[str, Any]] = []
        end_index = min(start_index + size, len(indices))
        if start_index >= len(indices):
            return page_items

        def read_line_sync(line_index: LineIndex) -> Optional[Dict[str, Any]]:
            try:
                with jfs.open(dataset_path, "rb") as file_obj:
                    file_obj.seek(line_index.file_offset)
                    line_bytes = file_obj.read(line_index.line_length)
                line_text = line_bytes.decode("utf-8", errors="ignore").strip()
                if not line_text or line_text.startswith("#"):
                    return None
                item_data = json.loads(line_text)
                row_number = line_index.line_number + 1
                if is_business_inference:
                    return {
                        "id": row_number,
                        "dataset_id": dataset_id,
                        "sequence": row_number,
                        "data": item_data,
                    }
                return {
                    "id": row_number,
                    "dataset_id": dataset_id,
                    "sequence": row_number,
                    "system": item_data.get("system", ""),
                    "prompt": item_data.get("prompt", ""),
                    "standard_response": item_data.get("response", ""),
                    "model_response": item_data.get("model_response", ""),
                    "messages": item_data.get("messages"),
                    "images": item_data.get("images"),
                    "error": item_data.get("error", False),
                    "error_message": item_data.get("error_message", ""),
                }
            except Exception as exc:
                logger.warning(f"读取推理结果行 {line_index.line_number + 1} 失败: {str(exc)}")
                return None

        loop = asyncio.get_event_loop()
        read_tasks = [
            loop.run_in_executor(self.executor, read_line_sync, indices[index])
            for index in range(start_index, end_index)
        ]
        results = await asyncio.gather(*read_tasks)
        for result in results:
            if result is not None:
                page_items.append(result)
        return page_items

    async def download_inference_result_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_id: int,
            file_type: InferenceResultDatasetExportType
    ):
        """下载推理结果数据集（支持多格式导出）"""
        # 验证数据集
        dataset = await self.validate_dataset(dataset_id, project_id)

        if not dataset.file_path:
            raise HTTPException(status_code=404, detail="数据集文件不存在")

        supported_types = {
            TrainingTypeCategory.IMAGE_UNDERSTANDING.value,
            TrainingTypeCategory.TEXT_GENERATION.value,
            TrainingTypeCategory.BUSINESS.value,
        }
        if dataset.dataset_type not in supported_types:
            # 目前仅支持图像理解与文本生成以及业务类型·
            raise HTTPException(
                status_code=400,
                detail=f"不支持的推理结果数据集类型: {dataset.dataset_type}，目前仅支持图像理解、文本生成、业务类型"
            )

        return await self._download_inference_result_from_export_cache(
            current_user=current_user,
            project_id=project_id,
            dataset=dataset,
            file_type=file_type,
        )

    async def _download_inference_result_from_export_cache(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset: InferenceResultDataset,
            file_type: InferenceResultDatasetExportType,
    ):
        if dataset.dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value and file_type.value != "zip":
            raise HTTPException(
                status_code=500,
                detail=f"当前导出格式不支持：{file_type.value}"
            )

        jfs = await self._get_juicefs_client()
        export_root, meta_path, default_artifact_path = self._get_inference_result_export_paths(
            dataset.file_path, dataset.id, file_type.value
        )

        def stream_jfs_file(path: str, chunk_size: int = 1024 * 1024):
            with jfs.open(path, "rb") as src:
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk

        meta = None
        if jfs.exists(meta_path):
            try:
                with jfs.open(meta_path, "r", encoding="utf-8") as f:
                    parsed = json.loads(f.read() or "{}")
                    if isinstance(parsed, dict):
                        meta = parsed
            except Exception as meta_read_err:
                logger.warning(
                    f"读取推理结果集导出缓存元信息失败 dataset_id={dataset.id}, format={file_type.value}: {meta_read_err}"
                )

        if meta and meta.get("status") == "success":
            artifact_path = str(meta.get("artifact_path") or default_artifact_path)
            if jfs.exists(artifact_path):
                suffix = os.path.splitext(artifact_path)[1].lstrip(".").lower() or file_type.value
                media_type = FILE_TYPE_CONFIG.get(suffix, FILE_TYPE_CONFIG[file_type.value])["media_type"]
                download_filename = f"{dataset.name}.{suffix}"
                filename_utf8 = urllib.parse.quote(download_filename)
                logger.info(
                    f"用户 {current_user.userId} 在项目 {project_id} 中下载推理结果集缓存: {dataset.name}，格式: {suffix}"
                )
                return StreamingResponse(
                    stream_jfs_file(artifact_path),
                    media_type=media_type,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
                )

        if meta and meta.get("status") == "processing":
            return JSONResponse(
                status_code=202,
                content={
                    "status": "processing",
                    "task_id": meta.get("task_id"),
                    "dataset_id": dataset.id,
                    "export_format": file_type.value,
                    "message": "导出任务处理中，请稍后重试下载",
                },
            )

        from app.tasks.inference_result_tasks import build_inference_result_export_cache
        from app.utils.app_runtime_context import get_tenant_id

        celery_result = build_inference_result_export_cache.apply_async(kwargs={
            "tenant_id": get_tenant_id(),
            "dataset_id": dataset.id,
            "project_id": project_id,
            "export_file_type": file_type.value,
        })
        return JSONResponse(
            status_code=202,
            content={
                "status": "processing",
                "task_id": celery_result.id,
                "dataset_id": dataset.id,
                "export_format": file_type.value,
                "message": "已提交异步导出任务，请稍后重试下载",
            },
        )

    @staticmethod
    def _get_inference_result_export_paths(file_path: str, dataset_id: int, export_file_type: str) -> Tuple[str, str, str]:
        dataset_dir = os.path.dirname(file_path.rstrip("/")).replace("\\", "/")
        export_root = f"{dataset_dir}/exports/inference_result_dataset_{dataset_id}/{export_file_type}/"
        return export_root, f"{export_root}meta.json", f"{export_root}export.{export_file_type}"


    async def delete_inference_result_dataset(
            self,
            project_id: int,
            dataset_id: int
    ) -> None:
        """删除推理结果数据集（同时删除文件及关联业务属性值、属性值选项）。若状态非已完成，会先停止关联的 Celery 任务与 K8s Job。"""
        # 验证数据集
        dataset = await self.validate_dataset(dataset_id, project_id)

        # 只有已创建/定时待启动/已完成/失败/已终止的任务可以进行删除
        if dataset.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                               TaskStatus.TERMINATED.value, TaskStatus.FAILED.value, TaskStatus.COMPLETED.value]:
            raise HTTPException(
                status_code=400,
                detail=f"当前任务状态为 {dataset.status}，不允许删除"
            )

        # 若状态不是已完成，先停止正在运行的 Celery 任务和 K8s Job
        if dataset.status != TaskStatus.COMPLETED.value:
            # 1. 终止 Celery 任务
            if dataset.celery_task_id:
                try:
                    celery_app.control.revoke(dataset.celery_task_id, terminate=True)
                    logger.info(f"已终止推理结果集关联的 Celery 任务: dataset_id={dataset_id}, celery_task_id={dataset.celery_task_id}")
                except Exception as e:
                    logger.warning(f"终止 Celery 任务失败 dataset_id={dataset_id}, celery_task_id={dataset.celery_task_id}: {e}")
            # 2. 删除 K8s Job（仅离线/在线推理有 Job）
            if dataset.inference_method in ("offline", "online"):
                try:
                    res = await self.dataset_mapper.execute(
                        select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
                        .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                        .where(ProjectKubernetesRelation.project_id == project_id)
                    )
                    row = res.first()
                    if row:
                        kubeconfig_str, k8s_namespace = row[0], row[1]
                        launcher = K8sLauncher(config_str=kubeconfig_str)
                        namespace = k8s_namespace or f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
                        job_name = f"{dataset.inference_method}-inference-{dataset_id}"
                        success = await launcher.delete_job(namespace=namespace, job_name=job_name)
                        if success:
                            logger.info(f"已删除推理结果集关联的 K8s Job: {job_name}")
                        else:
                            logger.warning(f"K8s Job 不存在或已删除: {job_name}")
                    else:
                        logger.warning(f"项目 {project_id} 未绑定 K8s，跳过删除 Job")
                except Exception as e:
                    logger.warning(f"删除推理结果集关联的 K8s Job 失败 dataset_id={dataset_id}: {e}")

        # 删除文件（如果存在）
        if dataset.file_path:
            try:
                jfs = await self._get_juicefs_client()
                if jfs.exists(dataset.file_path):
                    jfs.remove(dataset.file_path)
                    logger.info(f"删除文件: {dataset.file_path}")
            except Exception as e:
                logger.error(f"删除文件失败: {str(e)}")

        target_attr_bt = INFERENCE_RESULT_USAGE_TO_BUSINESS_TYPE.get(dataset.usage)
        if target_attr_bt:
            await self.attr_helper.delete_by_reference_ids(
                [dataset_id],
                target_attr_bt.value,
            )

        # 删除数据集
        await self.dataset_mapper.delete(dataset)
        await self.dataset_mapper.commit()

        logger.info(f"删除推理结果数据集: {dataset_id}")

    async def stop_inference_result_dataset(
            self,
            project_id: int,
            dataset_id: int
    ) -> None:
        """终止推理结果数据集任务，并按 job 名删除 K8s 资源"""
        dataset = await self.validate_dataset(dataset_id, project_id)

        if dataset.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {dataset.status}，只有运行中、排队中的任务才能终止"
            )

        dataset.status = TaskStatus.TERMINATED.value
        dataset.progress = 0
        await self.dataset_mapper.commit()
        logger.info(f"推理结果数据集状态已更新为终止: dataset_id={dataset_id}")

        # 同步执行器状态，避免被调度再次拉起
        execution = await self.task_mapper.query_one(
            select(TaskExecution).filter(
                TaskExecution.business_type == TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value,
                TaskExecution.business_id == dataset_id
            ).order_by(desc(TaskExecution.created_at))
        )
        if execution and execution.status in [TaskExecutionStatus.PENDING.value, TaskExecutionStatus.RUNNING.value]:
            execution.status = TaskExecutionStatus.FAILED.value
            execution.last_error = "任务已被用户终止"
            execution.locked_at = None
            execution.locked_by = None
            await self.task_mapper.commit()

        # 终止 celery（如果存在）
        if dataset.celery_task_id:
            try:
                celery_app.control.revoke(dataset.celery_task_id, terminate=True)
                logger.info(
                    f"已终止推理结果集 Celery 任务: dataset_id={dataset_id}, celery_task_id={dataset.celery_task_id}"
                )
            except Exception as e:
                logger.warning(
                    f"终止推理结果集 Celery 任务失败: dataset_id={dataset_id}, "
                    f"celery_task_id={dataset.celery_task_id}, err={e}"
                )

        # 删除 K8s Job（离线/在线推理）
        if dataset.inference_method in (InferenceMethod.OFFLINE.value, InferenceMethod.ONLINE.value):
            try:
                res = await self.dataset_mapper.execute(
                    select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
                    .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                    .where(ProjectKubernetesRelation.project_id == project_id)
                )
                row = res.first()
                if not row:
                    logger.warning(f"项目 {project_id} 未绑定 K8s，跳过删除推理任务 Job")
                    return

                kubeconfig_str, k8s_namespace = row[0], row[1]
                launcher = K8sLauncher(config_str=kubeconfig_str)
                namespace = k8s_namespace or f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
                job_name = f"{dataset.inference_method}-inference-{dataset_id}"
                try:
                    success = await launcher.delete_job(namespace=namespace, job_name=job_name)
                    if success:
                        logger.info(f"成功删除推理任务 Job: {job_name}")
                    else:
                        logger.warning(f"推理任务 Job 不存在或删除失败: {job_name}")
                except Exception as e:
                    logger.error(f"删除推理任务 Job 失败: {job_name}, err={e}")
            except Exception as e:
                logger.error(f"终止推理结果集时删除 K8s Job 失败: dataset_id={dataset_id}, err={e}")

    async def update_dataset_status(
            self,
            dataset_id: int,
            status: TaskStatus,
            progress: Optional[int] = None
    ) -> None:
        """更新数据集状态和进度"""
        result = await self.dataset_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        if not result:
            raise HTTPException(status_code=404, detail=f"推理结果数据集不存在: {dataset_id}")

        result.status = status.value
        if progress is not None:
            result.progress = progress

        await self.dataset_mapper.commit()

    # ------------------------------ 内部辅助方法 ------------------------------
    def _generate_file_path(self, task_id: int, namespace: str, dataset_name: str, dataset_format: Optional[str] = None) -> str:
        """生成文件路径

        所有格式统一：
            数据集文件: {base_path}/{filename}.jsonl
            图片文件（仅图像理解）: {base_path}/images/
        
        Args:
            task_id: 任务ID（数据集ID）
            namespace: 命名空间
            dataset_name: 数据集名称
            dataset_format: 数据格式（可选，保留参数以兼容现有调用）
        """
        base_path = StoragePath.REAL_INFERENCE_DATASETS.format_storage_path(namespace=namespace, task_id=task_id)
        
        # 统一使用文件名格式（不再区分 role-based 和其他格式）
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"inference_result_{dataset_name}_{timestamp}.jsonl"
        return f"{base_path}{filename}"

    async def _cleanup_failed_dataset(
            self,
            db_dataset: InferenceResultDataset,
            file_path: str,
            dataset_type: Optional[str],
            upload_ids: Optional[List[str]] = None
    ) -> None:
        """清理失败的数据集相关临时数据

        Args:
            db_dataset: 数据集数据库记录（如果已创建）
            file_path: 文件路径（如果已生成）
            dataset_type: 数据集类型（用于判断是否需要清理images目录）
            upload_ids: 分片上传ID列表（如果使用了分片上传）
        """
        # 1. 删除文件（如果已创建）- 即使失败也继续执行后续清理
        if file_path:
            try:
                jfs = await self._get_juicefs_client()

                # 删除主文件
                if jfs.exists(file_path):
                    jfs.remove(file_path)
                    logger.info(f"清理失败数据集：删除文件 {file_path}")

                # 如果是图像理解数据集，还需要删除images目录
                if dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value:
                    file_dir = os.path.dirname(file_path)
                    images_dir = os.path.join(file_dir, "images").replace('\\', '/')
                    if jfs.exists(images_dir):
                        jfs.rmr(images_dir)
                        logger.info(f"清理失败数据集：删除images目录 {images_dir}")

                    # 尝试删除父目录（如果为空）
                    if file_dir and jfs.exists(file_dir):
                        items = list(jfs.listdir(file_dir))
                        if not items:
                            jfs.rmdir(file_dir)
                            logger.info(f"清理失败数据集：删除空目录 {file_dir}")
            except Exception as e:
                logger.error(f"清理失败数据集：删除文件失败 {file_path}, 错误: {str(e)}", exc_info=True)

        # 2. 清理分片上传的文件- 即使失败也继续执行后续清理
        if upload_ids:
            try:
                from app.services.chunk_upload.interface import ChunkUploadService
                from app.core.depend_manager import AutoContainer
                chunk_upload_service: ChunkUploadService = AutoContainer().chunk_upload_service()

                for upload_id in upload_ids:
                    try:
                        await chunk_upload_service.cleanup_upload_data(upload_id)
                        logger.info(f"清理失败数据集：删除分片上传会话 {upload_id}")
                    except Exception as e:
                        logger.error(f"清理失败数据集：删除分片上传会话失败 {upload_id}, 错误: {str(e)}", exc_info=True)
            except Exception as e:
                logger.error(f"清理失败数据集：清理分片上传文件失败, 错误: {str(e)}", exc_info=True)

        # 3. 更新数据集状态为失败（如果已创建）- 必须执行，无论前面的操作是否成功
        # 因为使用了异步上传逻辑，不删除数据集数据库信息，而是修改数据集状态为失败
        if db_dataset:
            try:
                # 重新查询数据集以确保获取最新状态
                dataset = await self.dataset_mapper.query_one(
                    select(InferenceResultDataset).filter(InferenceResultDataset.id == db_dataset.id)
                )
                if dataset:
                    dataset.status = TaskStatus.FAILED.value
                    dataset.progress = 0
                    await self.dataset_mapper.commit()
                    logger.info(f"清理失败数据集：更新数据集状态为失败 dataset_id={db_dataset.id}")
                else:
                    logger.warning(f"清理失败数据集：数据集不存在 dataset_id={db_dataset.id}")
            except Exception as e:
                logger.error(f"清理失败数据集：更新数据集状态失败 dataset_id={db_dataset.id}, 错误: {str(e)}",
                             exc_info=True)
                # 不抛出异常，避免影响其他清理操作

    async def _get_juicefs_client(self):
        """获取JuiceFS客户端"""
        return await self.storage.JUICEFS_CLIENT()

    async def _download_image_understanding_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset: InferenceResultDataset,
            export_file_type: InferenceResultDatasetExportType
    ) -> StreamingResponse:
        """下载图像理解推理结果数据集为 ZIP 文件

        ZIP 文件结构：
        - {filename}.jsonl (从 dataset.file_path 提取文件名)
        - images/
          - image1.jpg
          - image2.jpg
          - ...
        """
        # 图像理解只支持zip格式的导出
        if export_file_type.value != "zip":
            raise HTTPException(
                status_code=500,
                detail=f"当前导出格式不支持：{export_file_type.value}"
            )

        jfs = await self._get_juicefs_client()
        
        # dataset.file_path 是完整的文件路径（如：xxx/inference_result_{name}_{timestamp}.jsonl）
        dataset_file_path = dataset.file_path
        
        # 从 file_path 提取文件名和目录路径
        dataset_filename = os.path.basename(dataset_file_path)  # 获取文件名
        file_dir = os.path.dirname(dataset_file_path)  # 获取目录路径
        images_folder_path = os.path.join(file_dir, "images").replace('\\', '/')
        
        logger.info(f"准备打包图像理解推理结果数据集: {dataset.name}")
        logger.debug(f"数据集文件路径: {dataset_file_path}")
        logger.debug(f"数据集文件名: {dataset_filename}")
        logger.debug(f"图片文件夹路径: {images_folder_path}")
        
        # 检查数据集文件是否存在
        if not jfs.exists(dataset_file_path):
            raise HTTPException(
                status_code=404,
                detail=f"数据集文件不存在: {dataset_file_path}"
            )
        
        # 使用临时目录而不是单个临时文件，避免内存问题
        temp_dir = None
        temp_zip_path = None
        
        try:
            # 创建临时目录
            temp_dir = tempfile.mkdtemp()
            temp_zip_path = os.path.join(temp_dir, "dataset.zip")
            
            # 1. 先将所有文件下载到临时目录
            temp_images_dir = os.path.join(temp_dir, "images")
            os.makedirs(temp_images_dir, exist_ok=True)
            
            # 将数据集文件下载到临时目录（使用实际文件名）
            temp_data_path = os.path.join(temp_dir, dataset_filename)
            
            # 分块复制文件（同步函数，在线程池中执行）
            def copy_file_with_chunks(src_path: str, dst_path: str, chunk_size: int = 1024 * 1024):  # 1MB chunks
                """分块复制文件"""
                try:
                    with jfs.open(src_path, 'rb') as src_file:
                        with open(dst_path, 'wb') as dst_file:
                            while True:
                                chunk = src_file.read(chunk_size)
                                if not chunk:
                                    break
                                dst_file.write(chunk)
                except Exception as e:
                    logger.error(f"复制文件失败 {src_path} -> {dst_path}: {str(e)}")
                    raise
            
            # 递归复制目录（同步函数）
            def copy_directory_recursive(src_dir: str, dst_dir: str):
                """递归复制目录"""
                try:
                    items = jfs.listdir(src_dir)
                except Exception as e:
                    logger.warning(f"无法列出目录内容: {src_dir}, 错误: {str(e)}")
                    return
                
                for item in items:
                    src_item_path = os.path.join(src_dir, item).replace('\\', '/')
                    dst_item_path = os.path.join(dst_dir, item)
                    
                    # 检查是文件还是目录
                    is_directory = False
                    try:
                        jfs.listdir(src_item_path)
                        is_directory = True
                    except:
                        is_directory = False
                    
                    if is_directory:
                        # 如果是目录，递归处理
                        os.makedirs(dst_item_path, exist_ok=True)
                        copy_directory_recursive(src_item_path, dst_item_path)
                    else:
                        # 如果是文件，复制
                        copy_file_with_chunks(src_item_path, dst_item_path)
            
            # 在线程池中执行文件复制操作，避免阻塞事件循环
            await asyncio.to_thread(copy_file_with_chunks, dataset_file_path, temp_data_path)
            logger.debug(f"已复制 {dataset_filename} 到临时目录")
            
            # 2. 复制图片文件（如果存在）
            if jfs.exists(images_folder_path):
                try:
                    await asyncio.to_thread(copy_directory_recursive, images_folder_path, temp_images_dir)
                    logger.info(f"已复制 images 文件夹到临时目录")
                except Exception as e:
                    logger.warning(f"复制 images 文件夹失败: {str(e)}")
            else:
                logger.warning(f"images 文件夹不存在: {images_folder_path}")
            
            # 3. 创建 ZIP 文件
            with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # 添加数据集文件（使用实际文件名）
                zip_file.write(temp_data_path, dataset_filename)
                logger.debug(f"已添加 {dataset_filename} 到 zip")
                
                # 添加 images 文件夹（如果存在）
                if os.path.exists(temp_images_dir) and os.listdir(temp_images_dir):
                    for root, dirs, files in os.walk(temp_images_dir):
                        for file in files:
                            file_path = os.path.join(root, file)
                            # 计算相对路径
                            rel_path = os.path.relpath(file_path, temp_dir)
                            zip_file.write(file_path, rel_path)
                    logger.info("已添加 images 文件夹到 zip")
            
            # 4. 创建生成器来流式返回 ZIP 文件
            def generate_zip_content():
                """生成 ZIP 文件内容"""
                file_handle = None
                try:
                    file_handle = open(temp_zip_path, 'rb')
                    chunk_size = 64 * 1024  # 64KB chunks
                    while True:
                        chunk = file_handle.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    # 读取完成后关闭文件并清理临时目录
                    if file_handle:
                        try:
                            file_handle.close()
                        except:
                            pass
                    # 清理临时目录
                    try:
                        if temp_dir and os.path.exists(temp_dir):
                            shutil.rmtree(temp_dir, ignore_errors=True)
                            logger.debug(f"已清理临时目录: {temp_dir}")
                    except Exception as e:
                        logger.warning(f"清理临时目录失败: {temp_dir}, 错误: {str(e)}")
            
            # 生成下载文件名
            download_filename = f"{dataset.name}.zip"
            filename_utf8 = urllib.parse.quote(download_filename)
            
            logger.info(f"用户 {current_user.userId} 在项目 {project_id} 中下载图像理解推理结果数据集: {dataset.name}")
            
            # 返回流式响应
            return StreamingResponse(
                generate_zip_content(),
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
            )
        
        except HTTPException:
            # 清理临时文件
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    logger.warning(f"清理临时目录失败: {str(e)}")
            raise
        except Exception as e:
            # 清理临时文件
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e2:
                    logger.warning(f"清理临时目录失败: {str(e2)}")
            logger.error(f"下载图像理解推理结果数据集失败: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"下载图像理解推理结果数据集失败: {str(e)}"
            )

    async def _download_text_generation_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset: InferenceResultDataset,
            export_file_type: InferenceResultDatasetExportType
    ) -> StreamingResponse:
        """下载文本生成推理结果数据集，支持多格式导出（jsonl、json、xlsx）"""
        # 使用 analyze_export_inference_result_file_single 进行格式转换
        file_content = await analyze_export_inference_result_file_single(
            db_dataset=dataset,
            export_file_type=export_file_type,
            storage_service=self.storage
        )

        # 获取文件配置（media_type 等）
        file_type_value = export_file_type.value
        file_config = FILE_TYPE_CONFIG.get(file_type_value, FILE_TYPE_CONFIG['jsonl'])
        media_type = file_config['media_type']

        # 生成下载文件名（格式：dataset_name.文件类型）
        download_filename = f"{dataset.name}.{file_type_value}"

        logger.info(f"用户 {current_user.userId} 在项目 {project_id} 中下载推理结果数据集: {dataset.name}，格式: {file_type_value}")

        def generate_file_content():
            yield file_content

        # 使用工具函数构建 Content-Disposition 头，支持非 ASCII 字符
        from app.utils.http_util import build_content_disposition_header

        # 返回流式文件下载响应
        return StreamingResponse(
            generate_file_content(),
            media_type=media_type,
            headers={"Content-Disposition": build_content_disposition_header(download_filename)}
        )

    async def batch_create_inference_result_datasets(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            batch_create: InferenceResultDatasetBatchCreate,
            files_map: Optional[Dict[str, List[UploadFile]]] = None
    ) -> InferenceResultDatasetBatchResponse:
        """批量创建推理结果数据集"""
        # 验证项目存在
        await self.project_service.is_existed(project_id)

        # 验证共用字段
        if batch_create.inference_method == InferenceMethod.OFFLINE:
            if not batch_create.source_dataset_id:
                raise HTTPException(status_code=400, detail="离线推理需要提供待推理数据ID")
        elif batch_create.inference_method == InferenceMethod.ONLINE:
            if not batch_create.source_dataset_id:
                raise HTTPException(status_code=400, detail="在线推理需要提供待推理数据ID")
        elif batch_create.inference_method == InferenceMethod.IMPORT:
            if not batch_create.upload_method:
                raise HTTPException(status_code=400, detail="导入推理结果集需要指定上传方式")

        # 初始化结果
        total = len(batch_create.datasets)
        success_count = 0
        failed_count = 0
        results = []
        errors = []

        files_map = files_map or {}

        # 逐个创建数据集
        for dataset_item in batch_create.datasets:
            try:
                # 验证数据集名称
                try:
                    validate_name_format(dataset_item.name, "数据集名称")
                except ValueError as e:
                    errors.append({
                        "name": dataset_item.name,
                        "error": str(e)
                    })
                    failed_count += 1
                    continue

                # 验证单个数据集的必填字段
                if batch_create.inference_method == InferenceMethod.OFFLINE:
                    if not dataset_item.model_id or not dataset_item.model_name:
                        errors.append({
                            "name": dataset_item.name,
                            "error": "离线推理需要提供模型ID和模型名称"
                        })
                        failed_count += 1
                        continue
                elif batch_create.inference_method == InferenceMethod.ONLINE:
                    if not dataset_item.online_service_id or not dataset_item.online_service_name:
                        errors.append({
                            "name": dataset_item.name,
                            "error": "在线推理需要提供服务ID和服务名称"
                        })
                        failed_count += 1
                        continue

                # 构建单个数据集的创建请求
                # 对于导入推理结果集，使用批量创建中的 dataset_type 和 dataset_format（如果提供）
                # 对于离线/在线推理，这些字段会在服务层从 source_dataset_id 获取
                dataset_create = InferenceResultDatasetCreate(
                    name=dataset_item.name,
                    description=dataset_item.description,
                    inference_method=batch_create.inference_method,
                    model_source=dataset_item.model_source or "base_model",
                    model_id=dataset_item.model_id,
                    model_name=dataset_item.model_name,
                    online_service_id=dataset_item.online_service_id,
                    online_service_name=dataset_item.online_service_name,
                    source_dataset_id=batch_create.source_dataset_id,
                    source_dataset_name=batch_create.source_dataset_name,
                    inference_params=batch_create.inference_params,
                    graphics_card_resource=batch_create.graphics_card_resource,
                    upload_method=batch_create.upload_method,
                    file_url=batch_create.file_url,
                    # 导入推理结果集时使用批量创建中的 dataset_type 和 dataset_format
                    dataset_type=batch_create.dataset_type if batch_create.inference_method == InferenceMethod.IMPORT else None,
                    dataset_format=batch_create.dataset_format if batch_create.inference_method == InferenceMethod.IMPORT else None
                )

                # 获取该数据集的文件（如果有）
                files = files_map.get(dataset_item.name, None)

                # 验证导入推理结果集的必填字段
                if batch_create.inference_method == InferenceMethod.IMPORT:
                    if not files and not batch_create.file_url:
                        errors.append({
                            "name": dataset_item.name,
                            "error": "导入推理结果集需要上传文件或提供文件URL"
                        })
                        failed_count += 1
                        continue
                    if batch_create.upload_method == UploadMethod.URL and not batch_create.file_url:
                        errors.append({
                            "name": dataset_item.name,
                            "error": "URL获取方式需要提供文件URL"
                        })
                        failed_count += 1
                        continue

                # 创建数据集
                result = await self.create_inference_result_dataset(
                    current_user=current_user,
                    project_id=project_id,
                    dataset=dataset_create,
                    files=files,
                    usage=batch_create.usage
                )

                results.append(result)
                success_count += 1

            except HTTPException as e:
                errors.append({
                    "name": dataset_item.name,
                    "error": e.detail
                })
                failed_count += 1
            except Exception as e:
                logger.error(f"批量创建推理结果数据集失败: {dataset_item.name}, 错误: {str(e)}")
                errors.append({
                    "name": dataset_item.name,
                    "error": f"创建失败: {str(e)}"
                })
                failed_count += 1

        return InferenceResultDatasetBatchResponse(
            total=total,
            success=success_count,
            failed=failed_count,
            results=results,
            errors=errors
        )

    async def get_metadata_fields(
            self,
            project_id: int,
            dataset_id: int,
            usage: Optional[InferenceDatasetUsage]
    ) -> List[str]:
        """获取推理结果数据集的元数据字段列表
        :param usage:
        """
        # 验证数据集
        dataset = await self.validate_dataset(dataset_id, project_id)

        if not dataset.file_path:
            raise HTTPException(status_code=404, detail="数据集文件不存在")

        # 从 JuiceFS 读取文件
        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset.file_path):
            raise HTTPException(status_code=404, detail=f"数据集文件不存在: {dataset.file_path}")

        # 读取文件内容并收集所有字段
        all_fields = set()
        sample_count = 0
        max_samples = 100  # 最多读取100条数据来分析字段

        with jfs.open(dataset.file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item_data = json.loads(line)
                        if isinstance(item_data, dict):
                            # 收集所有字段（包括嵌套字段）
                            self._collect_fields(item_data, all_fields)
                            sample_count += 1
                            if sample_count >= max_samples:
                                break
                    except json.JSONDecodeError:
                        continue

        # 业务推理结果集：返回所有字段，不做过滤
        if usage == InferenceDatasetUsage.BUSINESS_INFERENCE:
            result = list(all_fields)
            logger.info(f"从推理结果数据集 {dataset_id} 中提取到 {len(all_fields)} 个字段（business-inference，无过滤）")
            return result

        # 默认推理结果集：仅保留 system、prompt、response、model_response 四个字段，并按此顺序排序
        ordered_fields = ["system", "prompt", "response", "model_response"]
        filtered_fields = [f for f in ordered_fields if f in all_fields]
        logger.info(
            f"从推理结果数据集 {dataset_id} 中提取到 {len(all_fields)} 个字段，过滤后剩余 {len(filtered_fields)} 个字段")
        return filtered_fields

    def _collect_fields(self, data: Dict[str, Any], fields: set, prefix: str = ""):
        """递归收集字典中的所有字段"""
        for key, value in data.items():
            field_name = f"{prefix}.{key}" if prefix else key
            fields.add(field_name)

            # 如果是嵌套字典，递归收集
            if isinstance(value, dict):
                self._collect_fields(value, fields, field_name)
            # 如果是列表且包含字典，也收集
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                # 只处理第一个元素（假设结构一致）
                self._collect_fields(value[0], fields, field_name)

    async def get_task_logs(
            self,
            project_id: int,
            dataset_id: int,
            end_time: datetime,
            days: Optional[int] = 30,
    ) -> TaskLogResponse:
        """获取任务日志（分页）
        :param end_time:
        :param days:
        :param project_id:
        :param dataset_id:
        """
        # 导入公共日志服务
        from app.utils.log_service import log_service
        # 验证任务存在
        # 验证数据集是否存在
        dataset = await self.validate_dataset(dataset_id, project_id)

        # 判断日志来源
        if dataset.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(dataset.log_path)
            return TaskLogResponse(archived=True, logs=logs)
        else:
            # 从Loki获取实时日志
            if not dataset.lab_k8s_uuid:
                raise HTTPException(
                    status_code=400,
                    detail="任务没有关联的K8S UUID"
                )
            # 使用传入的结束时间和天数参数
            logs = log_service.get_logs_from_loki(
                dataset.lab_k8s_uuid,
                end_time=end_time,
                days=days if days else 30
            )
            return TaskLogResponse(archived=False, logs=logs)

    async def download_task_logs(
            self,
            project_id: int,
            dataset_id: int
    ):
        """下载任务日志文件

        Args:
            project_id: 项目ID
            dataset_id: 推理结果数据集id

        Returns:
            StreamingResponse: 日志文件流
        """
        # 导入公共日志服务
        from app.utils.log_service import log_service

        # 验证任务存在
        dataset: InferenceResultDataset = await self.validate_dataset(dataset_id, project_id)

        # 检查是否有归档日志
        if not dataset.log_path:
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
                    object_name=dataset.log_path
                )
            except Exception as e:
                logger.error(f"检查日志文件失败: {e}")
                raise HTTPException(
                    status_code=404,
                    detail=f"日志文件不存在: {dataset.log_path}"
                )

            # 生成下载文件名
            download_filename = f"inference_dataset_{dataset}_logs.log"

            # 定义生成器，流式返回文件内容
            def generate_file_content():
                try:
                    # 从MinIO获取对象并流式返回
                    response = log_service.minio_client.get_object(
                        bucket_name=log_service.bucket,
                        object_name=dataset.log_path
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

    def _build_base_url(self, project_id: int, dataset_id: int, data_format: Optional[str] = None) -> Optional[str]:
        """
        构建图片基础URL路径（仅用于需要图片的数据格式）

        Args:
            project_id: 项目ID
            dataset_id: 数据集ID
            data_format: 数据格式（role-based, prompt-response, prefix-suffix-middle等）

        Returns:
            图片基础URL路径，如果数据格式不需要图片则返回None
        """
        # 只有 role-based 格式需要图片路径
        if data_format != "role-based":
            return None

        path = StoragePath.REAL_INFERENCE_DATASETS.format_storage_path(
            namespace=f"deepexilab-{project_id}",
            task_id=dataset_id
        )

        return f"/{app_runtime_context.get_tenant_id()}{path}images/"


    async def get_inference_result_datasets_by_ids(
        self,
        ids: List[int],
        project_id: int
    ) -> List[InferenceResultDatasetResponse]:
        """根据 IDs，项目id 获取推理结果数据集列表（包含地址信息）"""
        if not ids:
            return []

        # 查询数据集
        datasets = await self.dataset_mapper.query(
            select(InferenceResultDataset).filter(
                InferenceResultDataset.id.in_(ids), InferenceResultDataset.project_id == project_id
            )
        )

        # 转换为响应模型
        result = []
        for dataset in datasets:
            response = InferenceResultDatasetResponse.model_validate(dataset)
            result.append(response)

        return result

    def _validate_dataset_field(self, dataset: InferenceResultDatasetCreate, files: Optional[List[UploadFile]] = None,):
        """验证推理结果集相关字段

        Args:
            dataset: 推理结果集对象
            files: 待上传的文件列表
        """
        # 根据推理方式验证必填字段
        upload_ids = dataset.upload_ids

        # 根据推理方式的不同，有着不同的验证逻辑
        if dataset.inference_method == InferenceMethod.OFFLINE:
            # 离线推理
            # - 需要提供用于推理操作的模型id（基础模型id）
            # - 需要提供用于推理操作的模型name（基础模型name）
            if not dataset.model_id or not dataset.model_name:
                raise HTTPException(status_code=400, detail="离线推理需要提供模型ID和模型名称")
            if not dataset.source_dataset_id:
                raise HTTPException(status_code=400, detail="离线推理需要提供待推理数据ID")
        elif dataset.inference_method == InferenceMethod.ONLINE:
            # 在线推理
            # - 需要提供用于推理操作的在线推理服务id
            # - 需要提供用于推理操作的在线推理服务名称
            if not dataset.online_service_id or not dataset.online_service_name:
                raise HTTPException(status_code=400, detail="在线推理需要提供服务ID和服务名称")
            if not dataset.source_dataset_id:
                raise HTTPException(status_code=400, detail="在线推理需要提供待推理数据ID")
        elif dataset.inference_method == InferenceMethod.IMPORT:
            # 导入数据集
            # - 需要提供文件信息
            #   - 直接上传文件：需要提供files信息
            #   - 分片上传文件：需要提供分片上传id
            #   - files 和 uploadIds 不能同时为空
            if (not files or len(files) == 0) and (not upload_ids or len(upload_ids) == 0):
                raise HTTPException(status_code=400, detail="导入推理结果集需要上传文件")
            if dataset.upload_method == UploadMethod.URL and not dataset.file_url:
                raise HTTPException(status_code=400, detail="URL获取方式需要提供文件URL")

    async def process_inference_result_file_import(
            self,
            dataset: InferenceResultDatasetCreate,
            db_dataset: InferenceResultDataset,
            usage: Optional[InferenceDatasetUsage] = None,
            files: Optional[List[UploadFile]] = None,
            upload_ids: Optional[List[str]] = None,
            namespace: Optional[str] = None,
    ):
        """
        导入推理结果集文件处理方法

        Args:
            dataset: 前端传入的推理结果集对象
            db_dataset: 构建的完整的推理结果集对象
            usage: 结果集用途（default-inference默认推理数据集、business-inference业务推理结果集）
            files: 前端传入的文件列表
            upload_ids: 前端传入的分片上传文件id列表
            namespace: 命名空间
        """

        # 导入结果集，获取前端传入的数据集类型和数据集格式
        # 从前端传入的 dataset 获取 dataset_type 和 dataset_format
        dataset_type = dataset.dataset_type
        dataset_format = dataset.dataset_format

        # 若dataset_type为业务数据集business，且前端未传递dataset_format，给dataset_format默认赋值business
        if dataset_type == TrainingTypeCategory.BUSINESS and dataset_format is None:
            dataset_format = DatasetFormat.BUSINESS

        # 初始化 file_path，用于异常处理
        file_path = None

        try:
            # 导入相关依赖
            from app.utils.timezone_utils import get_current_shanghai_time
            from app.tasks.inference_result_tasks import process_inference_result_import_file
            import uuid

            # 处理文件上传（支持多文件合并）
            # 生成推理结果集文件保存路径
            # 区分dataset_format：结果集格式，目前支持（role-based 和 prompt-response）
            file_path = self._generate_file_path(db_dataset.id, namespace, dataset.name, dataset_format)

            db_dataset.status = TaskStatus.CREATED.value # 更新数据集状态为创建
            db_dataset.progress = 0 # 设置处理进度为0
            db_dataset.file_path = file_path # 添加推理结果集文件保存路径

            # 导入推理结果集：使用前端传递的 dataset_type 和 dataset_format
            if dataset_type:
                db_dataset.dataset_type = dataset_type
            if dataset_format:
                db_dataset.dataset_format = dataset_format

            # 启动异步Celery任务处理文件
            celery_result = process_inference_result_import_file.apply_async(
                args=[
                    db_dataset.id,
                    file_path,
                    dataset_format,
                    dataset_type,
                    usage,
                    upload_ids
                ],
                countdown=1  # 延迟1秒执行，确保数据库事务完成
            )

            # 更新推理结果集的格式和类型这段
            # 保存celery任务id
            db_dataset.celery_task_id = celery_result.id
            await self.dataset_mapper.commit()

            logger.info(f"导入推理结果集，使用前端传递的数据集类型: {db_dataset.dataset_type}")
            logger.info(f"导入推理结果集，使用前端传递的数据格式: {db_dataset.dataset_format}")
            logger.info(f"推理结果数据集已提交到Celery队列（导入结果集文件处理异步任务）: {db_dataset.id}, Celery任务ID: {celery_result.id}")

        except Exception as e:
            logger.error(f"启动导入推理结果集文件处理任务失败: {str(e)}", exc_info=True)
            # 文件处理任务启动失败时，执行清理操作
            try:
                await self._cleanup_failed_dataset(
                    db_dataset=db_dataset,
                    file_path=file_path,
                    dataset_type=dataset_type,  # 使用字符串类型
                    upload_ids=upload_ids
                )
            except Exception as cleanup_error:
                logger.error(f"清理失败数据集临时数据时发生错误: {str(cleanup_error)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"启动文件处理任务失败: {str(e)}")

    async def get_aggregation_stats(
        self,
        project_id: int,
        status: Optional[TaskStatus] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
        usage: Optional[List[InferenceDatasetUsage]] = None,
        dataset_type: Optional[List[TrainingTypeCategory]] = None,
        dataset_format: Optional[List[DatasetFormat]] = None,
    ) -> InferenceResultAggregationResponse:
        """聚合统计：按 dataset_format、dataset_type、attr option 统计数据集条数；支持 status、attr、usage 筛选。

        返回结果不含按 usage 分组的维度；未传 usage 或 usage 为空列表时直接返回空统计，不查库。
        传入非空 usage 时仅在该子集上统计其他维度；当所选用途包含 default-inference 时，与列表/filtered 一致：
        `usage IS NULL` 的历史数据一并计入。
        未传 dataset_type 时不按数据集类型过滤；传入列表时仅统计所列类型。
        未传 dataset_format 时不按数据格式过滤；传入列表时仅统计所列格式。
        """
        if not usage:
            return InferenceResultAggregationResponse()

        await validate_project_exists(await self.dataset_mapper.get_session(), project_id)

        conditions = [
            InferenceResultDataset.project_id == project_id,
        ]
        if usage:
            usage_values = tuple(u.value for u in usage)
            if InferenceDatasetUsage.DEFAULT_INFERENCE in usage:
                conditions.append(
                    or_(
                        InferenceResultDataset.usage.in_(usage_values),
                        InferenceResultDataset.usage.is_(None),
                    )
                )
            else:
                conditions.append(InferenceResultDataset.usage.in_(usage_values))
        if dataset_type:
            conditions.append(
                InferenceResultDataset.dataset_type.in_(tuple(t.value for t in dataset_type))
            )
        if dataset_format:
            conditions.append(
                InferenceResultDataset.dataset_format.in_(tuple(f.value for f in dataset_format))
            )
        if status is not None:
            conditions.append(InferenceResultDataset.status == status.value)
        if attr_name and option_value:
            attr_exists = (
                select(1)
                .select_from(BusinessAttrValue)
                .join(
                    BusinessAttrValueOption,
                    and_(
                        BusinessAttrValueOption.attr_value_id == BusinessAttrValue.id,
                        BusinessAttrValueOption.reference_id == InferenceResultDataset.id,
                    ),
                )
                .where(
                    BusinessAttrValue.reference_id == InferenceResultDataset.id,
                    BusinessAttrValue.name == attr_name,
                    BusinessAttrValueOption.option_value == option_value,
                    BusinessAttrValue.business_type.in_(INFERENCE_RESULT_DATASET_RELATED_BUSINESS_TYPES),
                )
            )
            conditions.append(attr_exists.exists())

        format_stmt = (
            select(
                InferenceResultDataset.dataset_format,
                func.count(InferenceResultDataset.id).label("count"),
            )
            .where(and_(*conditions))
            .group_by(InferenceResultDataset.dataset_format)
        )
        format_res = await self.dataset_mapper.execute(format_stmt)
        by_dataset_format = [CountByValueItem(value=row[0] or "", count=row[1]) for row in format_res.all()]

        type_stmt = (
            select(
                InferenceResultDataset.dataset_type,
                func.count(InferenceResultDataset.id).label("count"),
            )
            .where(and_(*conditions))
            .group_by(InferenceResultDataset.dataset_type)
        )
        type_res = await self.dataset_mapper.execute(type_stmt)
        by_dataset_type = [CountByValueItem(value=row[0] or "", count=row[1]) for row in type_res.all()]

        if not (attr_name and option_value):
            option_stmt_orm = (
                select(
                    BusinessAttrValue.name,
                    BusinessAttrValueOption.option_value,
                    func.count(func.distinct(InferenceResultDataset.id)).label("count"),
                )
                .select_from(InferenceResultDataset)
                .join(
                    BusinessAttrValue,
                    and_(
                        BusinessAttrValue.reference_id == InferenceResultDataset.id,
                        BusinessAttrValue.business_type.in_(INFERENCE_RESULT_DATASET_RELATED_BUSINESS_TYPES),
                    ),
                )
                .join(
                    BusinessAttrValueOption,
                    and_(
                        BusinessAttrValueOption.attr_value_id == BusinessAttrValue.id,
                        BusinessAttrValueOption.reference_id == InferenceResultDataset.id,
                    ),
                )
                .where(and_(*conditions))
                .group_by(BusinessAttrValue.name, BusinessAttrValueOption.option_value)
            )
            option_res = await self.dataset_mapper.execute(option_stmt_orm)
            rows = option_res.all()
            by_attr: Dict[str, List[CountByValueItem]] = defaultdict(list)
            for row_attr_name, row_option_value, count in rows:
                by_attr[row_attr_name].append(
                    CountByValueItem(value=row_option_value or "", count=count)
                )
            by_attr_option = [AttrOptionGroupItem(name=an, options=opts) for an, opts in sorted(by_attr.items())]
        else:
            by_attr_option = None

        return InferenceResultAggregationResponse(
            dataset_format=by_dataset_format,
            dataset_type=by_dataset_type,
            attr_option=by_attr_option,
        )
    
    async def list_inference_result_datasets_by_filters(
        self,
        project_id: int,
        name: Optional[str] = None,
        dataset_type: Optional[TrainingTypeCategory] = None,
        usage: Optional[InferenceDatasetUsage] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        status: Optional[TaskStatus] = None,
        dataset_format: Optional[DatasetFormat] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
    ) -> Page[InferenceResultDatasetSummaryResponse]:
        """多条件过滤分页列表；推理结果集为单表一行一条记录，无训练侧按名称聚合多版本逻辑。

        未传 usage 或传空字符串时：不查库，直接返回空分页。
        已传 usage 时：未传 dataset_type / dataset_format 则不过滤对应维度。
        """
        if usage is None:
            p = page if page is not None else 1
            s = size if size is not None else 10
            return Page(items=[], total=0, page=p, size=s, pages=0)

        await validate_project_exists(await self.dataset_mapper.get_session(), project_id)

        query = select(InferenceResultDataset).where(InferenceResultDataset.project_id == project_id)
        if name:
            query = query.where(InferenceResultDataset.name.ilike(f"%{name}%"))
        if dataset_type:
            query = query.where(InferenceResultDataset.dataset_type == dataset_type.value)
        if usage is not None:
            if usage == InferenceDatasetUsage.DEFAULT_INFERENCE:
                query = query.where(
                    or_(
                        InferenceResultDataset.usage == usage.value,
                        InferenceResultDataset.usage.is_(None),
                    )
                )
            else:
                query = query.where(InferenceResultDataset.usage == usage.value)
        if dataset_format is not None:
            query = query.where(InferenceResultDataset.dataset_format == dataset_format.value)
        if status is not None:
            query = query.where(InferenceResultDataset.status == status.value)
        if attr_name and option_value:
            attr_exists = (
                select(1)
                .select_from(BusinessAttrValue)
                .join(
                    BusinessAttrValueOption,
                    and_(
                        BusinessAttrValueOption.attr_value_id == BusinessAttrValue.id,
                        BusinessAttrValueOption.reference_id == InferenceResultDataset.id,
                    ),
                )
                .where(
                    BusinessAttrValue.reference_id == InferenceResultDataset.id,
                    BusinessAttrValue.name == attr_name,
                    BusinessAttrValueOption.option_value == option_value,
                    BusinessAttrValue.business_type.in_(INFERENCE_RESULT_DATASET_RELATED_BUSINESS_TYPES),
                )
            )
            query = query.where(attr_exists.exists())

        query = query.order_by(desc(InferenceResultDataset.created_at))
        result = await self.dataset_mapper.query_page(query, page, size)
        result.items = [
            InferenceResultDatasetSummaryResponse.model_validate(item) for item in result.items
        ]
        return result


import os
import uuid
import json
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from fastapi_pagination import Page
from fastapi_pagination.default import Params
from sqlalchemy import select, func, and_, desc

from app.common.status import TaskStatus
from app.common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from app.core.config import settings
from app.core.logging import logger
from app.models.models import (
    Project,
    JwtUserInfo,
    TaskExecution,
    KubernetesResource,
    ProjectKubernetesRelation,
)
from app.models.training_task_manager import TrainingTask
from app.models.training_dataset_manager import TrainingDataset
from app.schemas.training_task import (
    TrainingTaskCreate, TrainingTaskResponse, TrainingTaskSummaryResponse,
    TrainingTaskCreatedResponse, MLflowTaskResponse, TrainingTaskLogResponse,
    MLflowRunInfoResponse, MLflowMetricDataPoint, TrainingTypeCategory,
    TrainingMethodType, BaseModelConfigAPI, TrainingTypeConfigAPI,
    DataProcessingConfigAPI, BasicTrainingConfigAPI, AdvancedTrainingConfigAPI,
    LoRAConfigAPI, DPOConfigAPI, EvaluationConfigAPI, SaveConfigAPI,
    MonitoringConfigAPI, DatasetItem, CheckpointInfo
)
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.schemas.repository_image import CardType, CardModel
from app.utils.error_messages import data_not_found_error
from app.utils.log_service import log_service
from app.utils.model_storage_utils import cleanup_training_task
from app.utils.storage_enum import StoragePath
from .interface import TrainingTaskService
from ...repository.training_task_mapper import TrainingTaskMapper
from ...services.storage.interface import StorageService
from ...tasks.celery_app import celery_app
from ...utils.k8s_launcher import K8sLauncher


class DefaultTrainingTaskService(TrainingTaskService):
    """训练任务服务实现类"""

    def __init__(self, mapper: TrainingTaskMapper, storage: StorageService) -> None:
        self.mapper = mapper
        self.storage = storage

    # ------------------------------ 基础验证方法实现 ------------------------------
    async def validate_project(self, project_id: int) -> Project:
        """验证项目是否存在"""
        result = await self.mapper.execute(select(Project).where(Project.id == project_id))
        project = result.scalars().first()
        if not project:
            raise HTTPException(
                status_code=404,
                detail=data_not_found_error("项目")
            )
        return project

    async def validate_training_task(
            self, task_id: int, project_id: int
    ) -> TrainingTask:
        """验证训练任务是否存在且属于指定项目"""
        result = await self.mapper.execute(
            select(TrainingTask).where(
                TrainingTask.id == task_id,
                TrainingTask.project_id == project_id
            )
        )
        task = result.scalars().first()
        if not task:
            raise HTTPException(
                status_code=404,
                detail=data_not_found_error("训练任务")
            )
        return task

    async def _resolve_dataset_format(
            self, project_id: int, dataset_items: List[DatasetItem], label: str
    ) -> Optional[str]:
        """解析数据集格式并校验一致性"""
        if not dataset_items:
            return None

        formats = []
        for item in dataset_items:
            dataset_id = getattr(item, "dataset_id", None)
            if dataset_id:
                result = await self.mapper.execute(
                    select(TrainingDataset).where(
                        TrainingDataset.project_id == project_id,
                        TrainingDataset.id == dataset_id
                    )
                )
                dataset = result.scalars().first()
                if not dataset:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{label}数据集不存在: dataset_id={dataset_id}"
                    )
            else:
                if not item.name or not item.version:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{label}数据集缺少 dataset_id 或 name/version"
                    )
                result = await self.mapper.execute(
                    select(TrainingDataset).where(
                        TrainingDataset.project_id == project_id,
                        TrainingDataset.name == item.name,
                        TrainingDataset.version == item.version
                    )
                )
                dataset = result.scalars().first()
                if not dataset:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{label}数据集不存在: {item.name} {item.version}"
                    )

            if dataset.dataset_format:
                formats.append(dataset.dataset_format)

        if not formats:
            return None

        unique_formats = list(dict.fromkeys(formats))
        if len(unique_formats) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"{label}数据集格式不一致: {unique_formats}"
            )

        return unique_formats[0]

    async def _resolve_dataset_training_method(
            self, project_id: int, dataset_items: List[DatasetItem], label: str
    ) -> Optional[str]:
        """解析数据集训练方法并校验一致性。"""
        if not dataset_items:
            return None

        methods = []
        for item in dataset_items:
            dataset_id = getattr(item, "dataset_id", None)
            if dataset_id:
                result = await self.mapper.execute(
                    select(TrainingDataset).where(
                        TrainingDataset.project_id == project_id,
                        TrainingDataset.id == dataset_id
                    )
                )
                dataset = result.scalars().first()
                if not dataset:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{label}数据集不存在: dataset_id={dataset_id}"
                    )
            else:
                if not item.name or not item.version:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{label}数据集缺少 dataset_id 或 name/version"
                    )
                result = await self.mapper.execute(
                    select(TrainingDataset).where(
                        TrainingDataset.project_id == project_id,
                        TrainingDataset.name == item.name,
                        TrainingDataset.version == item.version
                    )
                )
                dataset = result.scalars().first()
                if not dataset:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{label}数据集不存在: {item.name} {item.version}"
                    )

            if dataset.training_method_type:
                methods.append(dataset.training_method_type)

        if not methods:
            return None

        unique_methods = list(dict.fromkeys(methods))
        if len(unique_methods) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"{label}数据集训练方法不一致: {unique_methods}"
            )

        return unique_methods[0]

    # ------------------------------ 核心业务方法实现 ------------------------------
    async def run_create_training_task_post_process(
            self,
            training_task_id: int,
            namespace: str,
            task_payload: dict,
            tenant_id: str
    ) -> Optional[str]:
        """提交训练任务到 Celery 并回写 celery_task_id"""
        from app.tasks.training_tasks import create_training_task_async

        celery_result = create_training_task_async.apply_async(
            args=[training_task_id, namespace, task_payload, tenant_id],
            countdown=1
        )

        task_query = await self.mapper.execute(
            select(TrainingTask).where(TrainingTask.id == training_task_id)
        )
        training_task = task_query.scalar_one_or_none()
        if not training_task:
            raise HTTPException(status_code=404, detail=f"训练任务不存在: {training_task_id}")
        training_task.celery_task_id = celery_result.id
        await self.mapper.commit()
        return celery_result.id

    async def create_training_task(
            self, current_user: JwtUserInfo, project_id: int, task: TrainingTaskCreate
    ) -> TrainingTaskCreatedResponse:
        # 验证项目存在
        project = await self.validate_project(project_id)

        # 检查同一项目下是否已存在同名同版本的任务
        version = task.version or "v1"
        result = await self.mapper.execute(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task.name,
                TrainingTask.version == version
            )
        )
        if result.scalars().first():
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名同版本的任务: {task.name} (版本: {version})"
            )
        k8s_uuid = str(uuid.uuid4())

        # 校验训练/评估数据集格式一致性
        if not task.evaluation.eval_use_split and task.eval_dataset_items:
            training_format = await self._resolve_dataset_format(project_id, task.dataset_items, "训练")
            eval_format = await self._resolve_dataset_format(project_id, task.eval_dataset_items, "评估")
            if training_format and eval_format and training_format != eval_format:
                raise HTTPException(
                    status_code=400,
                    detail=f"训练数据集与评估数据集格式不一致: {training_format} != {eval_format}"
                )

        expected_method = task.training_type.train_method_type.value
        training_method = await self._resolve_dataset_training_method(project_id, task.dataset_items, "训练")
        if training_method and training_method != expected_method:
            raise HTTPException(
                status_code=400,
                detail=f"训练任务方法与训练数据集方法不一致: {expected_method} != {training_method}"
            )
        if not task.evaluation.eval_use_split and task.eval_dataset_items:
            eval_method = await self._resolve_dataset_training_method(project_id, task.eval_dataset_items, "评估")
            if eval_method and eval_method != expected_method:
                raise HTTPException(
                    status_code=400,
                    detail=f"训练任务方法与评估数据集方法不一致: {expected_method} != {eval_method}"
                )

        advanced_config = task.advanced.model_dump()
        if task.deepspeed is not None:
            advanced_config["deepspeed"] = task.deepspeed.value

        # 创建训练任务记录（状态为CREATED）
        training_task = TrainingTask(
            name=task.name,
            description=task.description,
            project_id=project_id,
            version=version,
            # 基础模型配置 (JSON)
            base_model=task.base_model.to_persist_dict(),
            # 训练类型配置 (JSON)
            training_type=task.training_type.model_dump(),
            # 数据处理配置 (JSON)
            data_processing=task.data_processing.model_dump(),
            # 训练数据集列表 (JSON)
            dataset_items=[item.model_dump() for item in task.dataset_items],
            # 基础训练参数 (JSON)
            basic=task.basic.model_dump(),
            # 高级配置 (JSON)
            advanced=advanced_config,
            # LoRA配置 (JSON)
            lora_config=task.lora_config.model_dump() if task.lora_config else None,
            # DPO配置 (JSON)
            dpo_config=task.dpo_config.model_dump() if task.dpo_config else None,
            # 评估配置 (JSON)
            evaluation=task.evaluation.model_dump(),
            # 评估数据集列表 (JSON)
            eval_dataset_items=[item.model_dump() for item in task.eval_dataset_items],
            # 保存配置 (JSON)
            save=task.save.model_dump(),
            # 监控配置 (JSON)
            monitor=task.monitor.model_dump(),
            # 自定义参数 (JSON)
            additional_params=task.additional_params,
            # 训练资源配置（存储完整的资源配置信息，使用 mode='json' 确保枚举值正确序列化）
            graphics_card_resource=task.graphics_card_resource.model_dump(mode='json'),
            # 训练资源配置（向后兼容字段，从 graphics_card_resource 中提取 count）
            gpu_count=task.graphics_card_resource.count,
            # 任务状态
            status=TaskStatus.SCHEDULED_PENDING if task.schedule_at else TaskStatus.CREATED,
            schedule_at=task.schedule_at,
            # 其他字段使用默认值
            progress=0.0,
            # 模型输出路径（JFS实际存储路径）
            model_output_path="",  # 初始为空，创建后更新
            # Celery任务相关
            celery_task_id=None,  # 初始为None，后续更新
            # 自定义k8s uuid
            lab_k8s_uuid=k8s_uuid,
            # 用户信息（使用baseModel的字段）
            created_id=current_user.userId,
            created_by=current_user.username,

        )

        await self.mapper.insert(training_task)
        await self.mapper.commit()
        await self.mapper.refresh(training_task)

        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

        # 生成模型输出路径（JFS实际存储路径）
        model_output_path = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
            namespace=namespace,
            task_id=training_task.id
        )
        training_task.model_output_path = model_output_path
        await self.mapper.commit()

        # 获取当前租户ID（Celery worker 进程需要）
        from app.utils.app_runtime_context import get_tenant_id
        tenant_id = get_tenant_id()
        if not tenant_id:
            # 如果上下文没有，从数据库记录中获取（已自动填充）
            tenant_id = training_task.tenant_id
        
        celery_task_id = None
        task_payload = task.model_dump(mode='json')
        # if task.schedule_at:
        #     execution = TaskExecution(
        #         business_type=TaskExecutionBusinessType.TRAINING_TASK.value,
        #         business_id=training_task.id,
        #         schedule_at=task.schedule_at,
        #         status=TaskExecutionStatus.PENDING.value,
        #         executor=TaskExecutionExecutor.TRAINING_TASK.value,
        #         method=TaskExecutionMethod.START.value,
        #         kwargs={
        #             "namespace": namespace,
        #             "task_payload": task_payload,
        #             "tenant_id": tenant_id
        #         }
        #     )
        #     await self.mapper.insert(execution)
        #     await self.mapper.commit()
        #     logger.info(f"训练任务已创建并等待执行: {training_task.id}, schedule_at={task.schedule_at}")
        # else:
        #     celery_task_id = await self.run_create_training_task_post_process(
        #         training_task_id=training_task.id,
        #         namespace=namespace,
        #         task_payload=task_payload,
        #         tenant_id=tenant_id
        #     )
        #     logger.info(f"训练任务已提交到Celery队列: {training_task.id}, Celery任务ID: {celery_task_id}")
        execution = TaskExecution(
            business_type=TaskExecutionBusinessType.TRAINING_TASK.value,
            business_id=training_task.id,
            schedule_at=task.schedule_at,
            status=TaskExecutionStatus.PENDING.value,
            executor=TaskExecutionExecutor.TRAINING_TASK.value,
            method=TaskExecutionMethod.START.value,
            kwargs={
                "namespace": namespace,
                "task_payload": task_payload,
                "tenant_id": tenant_id
            }
        )
        await self.mapper.insert(execution)
        await self.mapper.commit()
        logger.info(f"训练任务已创建并等待执行: {training_task.id}, schedule_at={task.schedule_at}")

        return TrainingTaskCreatedResponse(
            id=training_task.id,
            name=training_task.name,
            description=training_task.description,
            project_id=training_task.project_id,
            version=training_task.version,
            status=training_task.status,
            schedule_at=training_task.schedule_at,
            celery_task_id=celery_task_id,
            message="训练任务已创建，等待定时执行" if task.schedule_at else "训练任务已提交，正在后台处理",
            created_at=training_task.created_at,
            updated_at=training_task.updated_at
        )

    async def update_training_task(
            self, current_user: JwtUserInfo, project_id: int, task_id: int, task: TrainingTaskCreate
    ) -> TrainingTaskCreatedResponse:
        """编辑训练任务（参数与创建一致）并同步 task_execution"""
        await self.validate_project(project_id)
        training_task = await self.validate_training_task(task_id, project_id)

        if task.project_id != project_id:
            raise HTTPException(status_code=400, detail="请求参数 project_id 与任务配置 project_id 不一致")

        # 只有已创建/定时待启动/失败/已终止的任务可以进行编辑
        if training_task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                                     TaskStatus.TERMINATED.value, TaskStatus.FAILED.value]:
            raise HTTPException(status_code=400, detail=f"当前任务状态为 {training_task.status}，不允许修改")

        version = task.version or "v1"
        duplicated = await self.mapper.query_one(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task.name,
                TrainingTask.version == version,
                TrainingTask.id != task_id
            )
        )
        if duplicated:
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名同版本的任务: {task.name} (版本: {version})"
            )

        if not task.evaluation.eval_use_split and task.eval_dataset_items:
            training_format = await self._resolve_dataset_format(project_id, task.dataset_items, "训练")
            eval_format = await self._resolve_dataset_format(project_id, task.eval_dataset_items, "评估")
            if training_format and eval_format and training_format != eval_format:
                raise HTTPException(
                    status_code=400,
                    detail=f"训练数据集与评估数据集格式不一致: {training_format} != {eval_format}"
                )

        expected_method = task.training_type.train_method_type.value
        training_method = await self._resolve_dataset_training_method(project_id, task.dataset_items, "训练")
        if training_method and training_method != expected_method:
            raise HTTPException(
                status_code=400,
                detail=f"训练任务方法与训练数据集方法不一致: {expected_method} != {training_method}"
            )
        if not task.evaluation.eval_use_split and task.eval_dataset_items:
            eval_method = await self._resolve_dataset_training_method(project_id, task.eval_dataset_items, "评估")
            if eval_method and eval_method != expected_method:
                raise HTTPException(
                    status_code=400,
                    detail=f"训练任务方法与评估数据集方法不一致: {expected_method} != {eval_method}"
                )

        advanced_config = task.advanced.model_dump()
        if task.deepspeed is not None:
            advanced_config["deepspeed"] = task.deepspeed.value

        # 全量覆盖任务数据（与创建同参）
        training_task.name = task.name
        training_task.description = task.description
        training_task.project_id = project_id
        training_task.version = version
        training_task.base_model = task.base_model.to_persist_dict()
        training_task.training_type = task.training_type.model_dump()
        training_task.data_processing = task.data_processing.model_dump()
        training_task.dataset_items = [item.model_dump() for item in task.dataset_items]
        training_task.basic = task.basic.model_dump()
        training_task.advanced = advanced_config
        training_task.lora_config = task.lora_config.model_dump() if task.lora_config else None
        training_task.dpo_config = task.dpo_config.model_dump() if task.dpo_config else None
        training_task.evaluation = task.evaluation.model_dump()
        training_task.eval_dataset_items = [item.model_dump() for item in task.eval_dataset_items]
        training_task.save = task.save.model_dump()
        training_task.monitor = task.monitor.model_dump()
        training_task.additional_params = task.additional_params
        training_task.graphics_card_resource = task.graphics_card_resource.model_dump(mode='json')
        training_task.gpu_count = task.graphics_card_resource.count
        training_task.status = TaskStatus.SCHEDULED_PENDING if task.schedule_at else TaskStatus.CREATED
        training_task.schedule_at = task.schedule_at
        training_task.progress = 0.0
        training_task.started_at = None
        training_task.finished_at = None
        training_task.estimated_duration = None
        training_task.celery_task_id = None
        training_task.lab_k8s_uuid = str(uuid.uuid4())

        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        training_task.model_output_path = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
            namespace=namespace,
            task_id=training_task.id
        )

        from app.utils.app_runtime_context import get_tenant_id
        tenant_id = get_tenant_id() or training_task.tenant_id
        task_payload = task.model_dump(mode='json')
        post_kwargs = {
            "namespace": namespace,
            "task_payload": task_payload,
            "tenant_id": tenant_id
        }

        execution = await self.mapper.query_one(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.TRAINING_TASK.value,
                TaskExecution.business_id == training_task.id
            ).order_by(desc(TaskExecution.created_at))
        )

        if execution:
            if execution.status in [TaskExecutionStatus.RUNNING.value]:
                raise HTTPException(status_code=400, detail=f"执行任务状态为 {execution.status}，不允许修改")
            execution.schedule_at = task.schedule_at
            execution.status = TaskExecutionStatus.PENDING.value
            execution.executor = TaskExecutionExecutor.TRAINING_TASK.value
            execution.method = TaskExecutionMethod.START.value
            execution.kwargs = post_kwargs
            execution.retry_count = 0
            execution.last_error = None
            execution.locked_at = None
            execution.locked_by = None
        else:
            execution = TaskExecution(
                business_type=TaskExecutionBusinessType.TRAINING_TASK.value,
                business_id=training_task.id,
                schedule_at=task.schedule_at,
                status=TaskExecutionStatus.PENDING.value,
                executor=TaskExecutionExecutor.TRAINING_TASK.value,
                method=TaskExecutionMethod.START.value,
                kwargs=post_kwargs
            )
            await self.mapper.insert(execution)

        await self.mapper.commit()
        await self.mapper.refresh(training_task)

        return TrainingTaskCreatedResponse(
            id=training_task.id,
            name=training_task.name,
            description=training_task.description,
            project_id=training_task.project_id,
            version=training_task.version,
            status=training_task.status,
            schedule_at=training_task.schedule_at,
            celery_task_id=training_task.celery_task_id,
            message="训练任务已更新，等待定时执行" if task.schedule_at else "训练任务已更新，等待手动或调度执行",
            created_at=training_task.created_at,
            updated_at=training_task.updated_at
        )

    async def list_training_tasks(
            self, project_id: int, name: Optional[str] = None,
            train_type_category: Optional[TrainingTypeCategory] = None,
            train_method_type: Optional[TrainingMethodType] = None
    ) -> Page[TrainingTaskSummaryResponse]:
        # 验证项目存在
        await self.validate_project(project_id)

        # 构建查询条件
        conditions = [TrainingTask.project_id == project_id]

        if name:
            conditions.append(TrainingTask.name.ilike(f"%{name}%"))

        # 根据训练类型参数添加筛选条件
        if train_type_category:
            conditions.append(
                TrainingTask.training_type.op('->>')('train_type_category') == train_type_category.value
            )
        if train_method_type:
            conditions.append(
                TrainingTask.training_type.op('->>')('train_method_type') == train_method_type.value
            )

        # 简化查询：直接按任务名称分组，获取汇总信息
        query = (
            select(
                TrainingTask.name.label('task_name'),
                func.count(TrainingTask.id).label('version_count'),
                func.min(TrainingTask.version).label('earliest_version'),
                func.max(TrainingTask.version).label('latest_version'),
                func.min(TrainingTask.created_at).label('created_at'),
                func.max(TrainingTask.updated_at).label('updated_at'),
                TrainingTask.project_id
            )
            .where(and_(*conditions))
            .group_by(TrainingTask.name, TrainingTask.project_id)
            .order_by(func.max(TrainingTask.updated_at).desc())
        )

        # 执行查询获取汇总数据
        result = await self.mapper.execute(query)
        rows = result.fetchall()

        # 为每个任务组获取最新版本的training_type信息
        summary_responses = []
        for row in rows:
            # 查询该任务的最新版本以获取training_type
            latest_task = await self.mapper.query_one(
                select(TrainingTask.training_type)
                .where(
                    and_(
                        TrainingTask.name == row.task_name,
                        TrainingTask.project_id == row.project_id
                    )
                )
                .order_by(TrainingTask.updated_at.desc())
                .limit(1)
            )

            training_type = latest_task or {}

            summary_responses.append(TrainingTaskSummaryResponse(
                task_name=row.task_name,
                version_count=row.version_count,
                training_type_category=training_type.get('train_type_category'),
                training_method_type=training_type.get('train_method_type'),
                project_id=row.project_id,
                latest_version=row.latest_version,
                earliest_version=row.earliest_version,
                created_at=row.created_at,
                updated_at=row.updated_at
            ))

        # 使用 Page.create 方法创建分页响应
        total = len(summary_responses)
        # 创建默认的分页参数
        params = Params(page=1, size=max(1, total) if total > 0 else 10)
        return Page.create(
            items=summary_responses,
            params=params,
            total=total
        )

    async def get_training_task_versions(
            self, project_id: int, task_name: str,  status: Optional[TaskStatus] = None
    ) -> List[TrainingTaskResponse]:
        # 验证项目存在
        # 验证项目存在
        await self.validate_project(project_id)

        # 查询该任务名称下的所有版本
        query = select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task_name
            ).order_by(TrainingTask.id.desc())

        tasks = await self.mapper.query(query)


        if not tasks:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{task_name}' 的训练任务"
            )

        if status is not None:
            tasks = [task for task in tasks if task.status == status]

        # 为每个任务添加检查点信息
        task_responses = []
        for task in tasks:
            # 获取检查点信息 废弃，检查点是每个训练任务的，没必要一次查询出任务下所有版本的检查点信息
            # checkpoints = await self.get_training_checkpoints(task.model_output_path)

            # 创建响应对象，包含检查点信息
            task_response = TrainingTaskResponse.model_validate(task)
            # task_response.checkpoints = checkpoints
            task_responses.append(task_response)

        return task_responses

    async def delete_training_task_version(
            self, project_id: int, task_name: str, version: str
    ) -> None:
        # 验证项目存在
        project = await self.validate_project(project_id)

        # 查找指定版本的任务
        task = await self.mapper.query_one(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task_name,
                TrainingTask.version == version
            )
        )


        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在任务 '{task_name}' 版本 '{version}'"
            )

        # 只有已创建/定时待启动/已完成/失败/已终止的任务可以进行删除
        if task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                                  TaskStatus.TERMINATED.value, TaskStatus.FAILED.value, TaskStatus.COMPLETED.value]:
            # status_desc = TrainingTaskStatus.get_description(task.status)
            raise HTTPException(
                status_code=400,
                detail=f"{task.status}的任务不允许删除: {task_name} (版本: {version})"
            )

        try:
            # 删除任务并清理存储
            await self._delete_training_task_with_cleanup(task, project)
            await self.mapper.commit()
            logger.info(f"成功删除训练任务版本: {task_name} {version}")

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"删除训练任务版本失败: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"删除训练任务版本失败: {str(e)}"
            )

    async def delete_all_training_task_versions(
            self, project_id: int, task_name: str
    ) -> None:
        # 验证项目存在
        project = await self.validate_project(project_id)

        # 查找该任务名称下的所有版本
        tasks = await self.mapper.query(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task_name
            )
        )


        if not tasks:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{task_name}' 的训练任务"
            )

        # 检查是否有运行中的任务版本
        running_versions = [task.version for task in tasks if task.status == TaskStatus.RUNNING]
        if running_versions:
            raise HTTPException(
                status_code=400,
                detail=f"无法删除任务 '{task_name}'，以下版本正在运行中: {', '.join(running_versions)}"
            )

        # 检查是否有不允许删除的状态
        non_deletable_tasks = [
            task for task in tasks
            # 只有已创建/定时待启动/已完成/失败/已终止的任务可以进行删除
            if task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                                   TaskStatus.TERMINATED.value, TaskStatus.FAILED.value, TaskStatus.COMPLETED.value]
        ]
        if non_deletable_tasks:
            non_deletable_versions = [f"{task.version}({task.status})" for task in non_deletable_tasks]
            raise HTTPException(
                status_code=400,
                detail=f"无法删除任务 '{task_name}'，以下版本状态不允许删除: {', '.join(non_deletable_versions)}"
            )

        try:
            deleted_versions = []
            failed_versions = []

            # 删除所有版本
            for task in tasks:
                try:
                    await self._delete_training_task_with_cleanup(task, project)
                    deleted_versions.append(task.version)
                except Exception as e:
                    logger.error(f"删除训练任务版本 {task.version} 失败: {str(e)}")
                    failed_versions.append(f"{task.version}({str(e)})")

            await self.mapper.commit()

            if failed_versions:
                raise HTTPException(
                    status_code=500,
                    detail=f"部分版本删除失败: {', '.join(failed_versions)}"
                )

            logger.info(
                f"成功删除任务 '{task_name}' 的所有 {len(deleted_versions)} 个版本: {', '.join(deleted_versions)}")

        except HTTPException:
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"删除训练任务所有版本失败: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"删除训练任务所有版本失败: {str(e)}"
            )

    async def stop_training_task(
            self, project_id: int, task_id: int
    ) -> None:
        """终止训练任务，并按 Job 名删除 K8s 资源"""
        await self.validate_project(project_id)
        task = await self.validate_training_task(task_id, project_id)

        # 参考 data_cleaning 规则：仅允许运行中/排队中终止
        if task.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有运行中、排队中的任务才能终止"
            )

        task.status = TaskStatus.TERMINATED.value
        task.error_message = "任务已被用户终止"
        task.finished_at = datetime.now()
        if not task.started_at:
            task.started_at = task.created_at

        execution = await self.mapper.query_one(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.TRAINING_TASK.value,
                TaskExecution.business_id == task_id
            ).order_by(desc(TaskExecution.created_at))
        )
        if execution and execution.status in [TaskExecutionStatus.PENDING.value, TaskExecutionStatus.RUNNING.value]:
            execution.status = TaskExecutionStatus.FAILED.value
            execution.last_error = "任务已被用户终止"
            execution.locked_at = None
            execution.locked_by = None

        await self.mapper.commit()
        logger.info(f"训练任务状态已更新为终止: task_id={task_id}")

        # 终止 celery
        if task.celery_task_id:
            try:
                celery_app.control.revoke(task.celery_task_id, terminate=True)
                logger.info(f"已终止训练任务 Celery 任务: task_id={task_id}, celery_task_id={task.celery_task_id}")
            except Exception as e:
                logger.warning(f"终止训练任务 Celery 失败: task_id={task_id}, err={e}")

        # 按 job 名删除 K8s Job
        try:
            res = await self.mapper.execute(
                select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
                .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                .where(ProjectKubernetesRelation.project_id == project_id)
            )
            row = res.first()
            if not row:
                logger.warning(f"项目 {project_id} 未绑定 K8s，跳过训练任务 Job 删除")
                return

            kubeconfig_str, k8s_namespace = row[0], row[1]
            launcher = K8sLauncher(config_str=kubeconfig_str)
            namespace = k8s_namespace or f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            job_name = f"training-{task_id}"
            try:
                success = await launcher.delete_job(namespace=namespace, job_name=job_name)
                if success:
                    logger.info(f"成功删除训练任务 Job: {job_name}")
                else:
                    logger.warning(f"训练任务 Job 不存在或删除失败: {job_name}")
            except Exception as e:
                logger.error(f"删除训练任务 Job 失败: {job_name}, err={e}")
        except Exception as e:
            logger.error(f"终止训练任务时删除 K8s Job 失败: task_id={task_id}, err={e}")

    async def download_llama_factory_config(
            self, project_id: int, task_name: str, version: str
    ) -> str:
        # 验证项目存在
        from fastapi.responses import Response
        await self.validate_project(project_id)

        # 根据项目ID、任务名称和版本查找任务
        task = await self.mapper.query_one(
            select(TrainingTask).filter(
                and_(
                    TrainingTask.project_id == project_id,
                    TrainingTask.name == task_name,
                    TrainingTask.version == version
                )
            )
        )


        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"训练任务不存在: {task_name} {version}"
            )

        # 从数据库读取 graphics_card_resource，如果没有则从 gpu_count 构建（向后兼容）
        if task.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**task.graphics_card_resource)
        else:
            logger.warning(
                f"训练任务 {task.name} (ID: {task.id}, 版本: {task.version}) 使用向后兼容逻辑："
                f"从 gpu_count={task.gpu_count} 构建 GraphicsCardResourceConfig，"
                f"建议更新数据库中的 graphics_card_resource 字段以包含完整的资源配置信息"
            )
            graphics_card_resource = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=task.gpu_count,
                card_memory=None,
                k8s_resource_type="nvidia.com/gpu"
            )

        # 从数据库记录重建TrainingTaskCreate对象
        task_create = TrainingTaskCreate(
            name=task.name,
            description=task.description,
            project_id=task.project_id,
            base_model=BaseModelConfigAPI(**task.base_model),
            training_type=TrainingTypeConfigAPI(**task.training_type),
            data_processing=DataProcessingConfigAPI(**task.data_processing),
            dataset_items=[DatasetItem(**item) for item in task.dataset_items],
            basic=BasicTrainingConfigAPI(**task.basic),
            advanced=AdvancedTrainingConfigAPI(**task.advanced),
            lora_config=LoRAConfigAPI(**task.lora_config) if task.lora_config else None,
            dpo_config=DPOConfigAPI(**task.dpo_config) if task.dpo_config else None,
            evaluation=EvaluationConfigAPI(**task.evaluation),
            eval_dataset_items=[DatasetItem(**item) for item in task.eval_dataset_items],
            save=SaveConfigAPI(**task.save),
            monitor=MonitoringConfigAPI(**task.monitor),
            additional_params=task.additional_params,
            deepspeed=task.advanced.get("deepspeed") if isinstance(task.advanced, dict) else None,
            graphics_card_resource=graphics_card_resource
        )

        # 生成LlamaFactory配置文件
        config_content = task_create.generate_llama_factory_config()

        # 返回YAML文件下载响应
        filename = f"llama_factory_config_{task_name}_{version}.yaml"
        return Response(
            content=config_content,
            media_type="application/x-yaml",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    async def get_training_task_logs(
            self, project_id: int, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainingTaskLogResponse:
        # 导入公共日志服务
        from app.utils.log_service import log_service
        # 验证任务存在
        # 验证项目和任务存在
        await self.validate_project(project_id)
        task = await self.validate_training_task(task_id, project_id)

        # 判断日志来源
        if task.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(task.log_path)
            return TrainingTaskLogResponse(archived=True, logs=logs)
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
            return TrainingTaskLogResponse(archived=False, logs=logs)

    async def get_training_task_logs_by_time_range(self, project_id: int, task_id: int, start_time: datetime,
                                                   end_time: datetime) -> TrainingTaskLogResponse:
        # 验证项目和任务存在
        await self.validate_project(project_id)
        task = await self.validate_training_task(task_id, project_id)
        if not task.lab_k8s_uuid:
            raise HTTPException(
                status_code=400,
                detail="任务没有关联的K8S UUID"
            )
        # 从Loki获取指定天数的日志
        logs = log_service.get_logs_from_loki(task.lab_k8s_uuid, start_time=start_time, end_time=end_time)
        return TrainingTaskLogResponse(archived=False, logs=logs)
        pass

    async def get_training_task_mlflow_info(self, project_id: int, task_name: str, version: str) -> MLflowTaskResponse:
        # 查询训练任务
        query = select(TrainingTask).where(
            and_(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task_name,
                TrainingTask.version == version
            )
        )
        training_task = await self.mapper.query_one(query)

        if not training_task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"训练任务不存在: project_id={project_id}, task_name={task_name}, version={version}"
            )

        # 查询项目信息
        project_query = select(Project).where(Project.id == project_id)
        project = await self.mapper.query_one(project_query)

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"项目不存在: project_id={project_id}"
            )

        # 构建基础响应数据（包含租户ID）
        tenant_id = training_task.tenant_id
        experiment_name = settings.get_mlflow_experiment_name(project.former_name, task_name, tenant_id)
        run_name = settings.get_mlflow_run_name(task_name, version, training_task.id)

        response_data = MLflowTaskResponse(
            task_id=training_task.id,
            task_name=task_name,
            version=version,
            project_name=project.former_name,
            experiment_name=experiment_name,
            run_name=run_name,
            mlflow_available=False
        )

        try:
            # 导入 MLflow 客户端
            from app.utils.mlflow_db_client import mlflow_db_client

            # 获取实验信息
            experiment = await mlflow_db_client.get_experiment_by_name(experiment_name)
            if not experiment:
                response_data.error_message = f"正在初始化训练实验: {experiment_name}"
                return response_data

            # 获取实验的所有运行
            runs = await mlflow_db_client.get_runs_by_experiment(experiment["experiment_id"])

            # 查找匹配的运行（通过运行名称）
            target_run = None
            for run in runs:
                if run.get("name") == run_name:
                    target_run = run
                    break

            if not target_run:
                response_data.error_message = f"正在初始化训练运行: {run_name}"
                return response_data

            # 获取运行的完整信息
            run_summary = await mlflow_db_client.get_run_summary(target_run["run_uuid"])

            if run_summary:
                response_data.mlflow_available = True

                # 设置运行基本信息
                run_info_data = run_summary.get("run_info", {})
                if run_info_data:
                    # 安全地处理数据类型转换
                    response_data.run_info = MLflowRunInfoResponse(
                        run_uuid=str(run_info_data.get("run_uuid", "")),
                        experiment_id=str(run_info_data.get("experiment_id", "")),
                        name=run_info_data.get("name"),
                        status=str(run_info_data.get("status", "UNKNOWN")),
                        start_time=run_info_data.get("start_time"),
                        end_time=run_info_data.get("end_time"),
                        user_id=run_info_data.get("user_id"),
                        artifact_uri=run_info_data.get("artifact_uri")
                    )

                # 设置参数
                response_data.params = run_summary.get("params", {})

                # 设置标签
                response_data.tags = run_summary.get("tags", {})

                # 处理指标数据 - 按指标名称分组，并去重
                metrics_data = run_summary.get("metrics", [])
                grouped_metrics = {}

                for metric in metrics_data:
                    if all(key in metric for key in ["key", "value", "timestamp", "step"]):
                        metric_key = str(metric["key"])
                        step = int(metric["step"])

                        if metric_key not in grouped_metrics:
                            grouped_metrics[metric_key] = {}

                        # 使用step作为key来去重，保留最新的记录（timestamp最大的）
                        if step not in grouped_metrics[metric_key] or int(metric["timestamp"]) > \
                                grouped_metrics[metric_key][step].timestamp:
                            grouped_metrics[metric_key][step] = MLflowMetricDataPoint(
                                value=float(metric["value"]),
                                timestamp=int(metric["timestamp"]),
                                step=step
                            )

                # 转换为列表格式并按步骤排序
                final_grouped_metrics = {}
                for metric_key, step_dict in grouped_metrics.items():
                    final_grouped_metrics[metric_key] = sorted(step_dict.values(), key=lambda x: x.step)

                response_data.metrics = final_grouped_metrics

                # 计算最新指标值
                latest_metrics = {}
                for metric in metrics_data:
                    if all(key in metric for key in ["key", "value", "step"]):
                        key = str(metric["key"])
                        step = int(metric["step"])
                        if key not in latest_metrics or step > latest_metrics[key]["step"]:
                            latest_metrics[key] = metric

                response_data.latest_metrics = {
                    key: float(data["value"]) for key, data in latest_metrics.items()
                    if "value" in data
                }
            else:
                response_data.error_message = "无法获取运行详细信息"

        except Exception as e:
            response_data.error_message = f"获取 MLflow 信息时发生错误: {str(e)}"
            # 记录错误日志
            logger.error(f"获取训练任务 MLflow 信息失败: {str(e)}", exc_info=True)

        return response_data
        pass

    async def _delete_mlflow_data(self, project: Project, task: TrainingTask) -> None:
        """删除训练任务对应的 MLflow 数据

            Args:
                project: 项目对象
                task: 训练任务对象
            """
        try:
            from app.utils.mlflow_db_client import mlflow_db_client

            # 构建实验名称和运行名称（包含租户ID）
            tenant_id = task.tenant_id
            experiment_name = settings.get_mlflow_experiment_name(project.name, task.name, tenant_id)
            run_name = settings.get_mlflow_run_name(task.name, task.version, task.id)

            logger.info(f"开始删除 MLflow 数据: 实验={experiment_name}, 运行={run_name}")

            # 删除特定的运行
            delete_success = await mlflow_db_client.delete_run_by_name(experiment_name, run_name)

            if delete_success:
                logger.info(f"成功删除 MLflow 运行: {run_name}")

                # 检查实验是否还有其他运行，如果没有则删除实验
                experiment = await mlflow_db_client.get_experiment_by_name(experiment_name)
                if experiment:
                    remaining_runs = await mlflow_db_client.get_runs_by_experiment(experiment["experiment_id"])
                    if not remaining_runs:
                        # 实验下没有运行了，删除实验
                        experiment_delete_success = await mlflow_db_client.delete_experiment(
                            experiment["experiment_id"])
                        if experiment_delete_success:
                            logger.info(f"成功删除空的 MLflow 实验: {experiment_name}")
                        else:
                            logger.warning(f"删除空的 MLflow 实验失败: {experiment_name}")
                    else:
                        logger.info(f"MLflow 实验 {experiment_name} 还有 {len(remaining_runs)} 个运行，保留实验")
            else:
                logger.warning(f"删除 MLflow 运行失败或运行不存在: {run_name}")

        except Exception as e:
            logger.error(f"删除 MLflow 数据时发生异常: {str(e)}")
            raise
        pass

    async def _delete_training_task_with_cleanup(self, task: TrainingTask, project: Project) -> None:
        """
            删除训练任务并清理相关存储

            Args:
                db: 数据库会话
                task: 训练任务对象
                project: 项目对象
            """
        try:
            # 1. 查询是否有关联的注册训练模型
            from app.models.model_manager import TrainedModel

            registered_models = await self.mapper.query(
                select(TrainedModel).where(
                    and_(
                        TrainedModel.task_name == task.name,
                        TrainedModel.task_version == task.version,
                        TrainedModel.project_id == task.project_id
                    )
                )
            )

            # 2. 准备注册模型信息列表
            registered_model_infos = []
            if registered_models:
                for model in registered_models:
                    if model.model_path and model.checkpoint:
                        registered_model_infos.append({
                            "path": model.model_path,
                            "checkpoint": model.checkpoint
                        })

            # 3. 生成项目命名空间
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

            # 4. 清理训练任务的存储文件（包括软链接转换逻辑）
            cleanup_success = await cleanup_training_task(
                storage=self.storage,
                namespace=namespace,
                task_id=task.id,
                registered_models=registered_model_infos if registered_model_infos else None
            )

            if not cleanup_success:
                logger.warning(f"清理训练任务存储失败: {task.name} {task.version}")
            else:
                logger.info(f"成功清理训练任务存储: {task.name} {task.version}")

        except Exception as e:
            logger.error(f"清理训练任务存储时出错: {str(e)}")
            # 存储清理失败不阻止数据库删除，但记录错误

        # 5. 删除 MLflow 相关数据
        try:
            await self._delete_mlflow_data(project, task)
        except Exception as e:
            logger.error(f"删除 MLflow 数据时出错: {str(e)}")
            # MLflow 删除失败不阻止数据库删除，但记录错误

        # 6. 删除数据库记录
        await self.mapper.delete(task)
        logger.info(f"已删除训练任务数据库记录: {task.name} {task.version} (ID: {task.id})")

    async def get_training_checkpoints(self, model_output_path: str) -> List[CheckpointInfo]:
        """
        检查训练模型输出路径中的检查点文件夹，并读取每个检查点的 loss 信息
        
        Args:
            model_output_path: 模型输出路径（JFS路径）
            
        Returns:
            检查点信息列表，包含 loss 等详细信息，按步数排序
        """
        if not model_output_path:
            return []
            
        try:
            jfs_client = await self.storage.JUICEFS_CLIENT()
            
            # 检查路径是否存在
            if not jfs_client.exists(model_output_path):
                logger.debug(f"模型输出路径不存在: {model_output_path}")
                return []
            
            # 列出目录下的所有项目
            try:
                items = jfs_client.listdir(model_output_path)
            except Exception as e:
                logger.warning(f"无法读取目录 {model_output_path}: {e}")
                return []
            
            # 筛选出检查点文件夹并读取详细信息
            checkpoints = []
            for item in items:
                item_path = f"{model_output_path.rstrip('/')}/{item}"
                try:
                    # 检查是否为目录且以checkpoint-开头
                    stat_info = jfs_client.stat(item_path)
                    is_dir = bool(stat_info.st_mode & 0o40000)  # 检查是否为目录
                    
                    if is_dir and item.startswith('checkpoint-'):
                        # 从文件夹名称中提取步数
                        try:
                            step = int(item.split('-')[1])
                        except (IndexError, ValueError):
                            logger.warning(f"无法从检查点名称中提取步数: {item}")
                            continue
                        
                        # 读取 trainer_state.json 获取 loss 信息
                        trainer_state_path = f"{item_path}/trainer_state.json"
                        epoch = None
                        train_loss = None
                        eval_loss = None
                        
                        try:
                            if jfs_client.exists(trainer_state_path):
                                # 读取文件内容
                                with jfs_client.open(trainer_state_path, 'r') as f:
                                    trainer_state = json.load(f, parse_constant=lambda c: None)
                                
                                # 提取信息
                                epoch = trainer_state.get('epoch')
                                
                                # 从 log_history 中找到对应步数的 loss
                                # 注意：同一个 step 可能有多条记录（训练loss和评估loss分开记录）
                                log_history = trainer_state.get('log_history', [])
                                for log_entry in reversed(log_history):
                                    if log_entry.get('step') == step:
                                        # 找到训练 loss（直接赋值，不需要判断 is None）
                                        if 'loss' in log_entry:
                                            train_loss = log_entry['loss']
                                        # 找到评估 loss
                                        if 'eval_loss' in log_entry:
                                            eval_loss = log_entry['eval_loss']
                                        # 如果两个都找到了，可以提前退出
                                        if train_loss is not None and eval_loss is not None:
                                            break
                        except Exception as e:
                            logger.warning(f"读取检查点 {item} 的 trainer_state.json 失败: {e}")
                        
                        # 创建 CheckpointInfo 对象
                        checkpoint_info = CheckpointInfo(
                            name=item,
                            step=step,
                            epoch=epoch,
                            train_loss=train_loss,
                            eval_loss=eval_loss
                        )
                        checkpoints.append(checkpoint_info)
                        
                except Exception as e:
                    logger.error(f"检查项目 {item_path} 时出错: {e}")
                    continue
            
            # 按步数排序返回
            return sorted(checkpoints, key=lambda x: x.step)
        except Exception as e:
            logger.error(f"检查训练检查点时出错: {e}")
            return []

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(TrainingTask).where(TrainingTask.id == id_field_value))
        pass

    async def get_training_task_checkpoints(
            self, project_id: int, task_id: int
    ) -> List[CheckpointInfo]:
        """获取训练任务的checkpoints信息"""
        # 验证项目存在
        await self.validate_project(project_id)

        # 查询该任务名称下的所有版本
        task = await self.mapper.query_one(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.id == task_id
            ).order_by(TrainingTask.id.desc())  # 按版本号降序排列
        )

        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"训练任务不存在"
            )

        checkpoints = await self.get_training_checkpoints(task.model_output_path)
        return checkpoints


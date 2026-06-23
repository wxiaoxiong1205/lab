# app/services/inference_service/impl.py
import json
import uuid
import os

from fastapi import HTTPException

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette import status

from app.common.status import TaskStatus
from app.models import InferenceResultDataset
from app.models.models import JwtUserInfo

from app.repository.inference_result_mapper import InferenceResultDatasetMapper
from app.repository.third_party_api_mapper import ThirdPartyApiMapper

from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.business_attr_value import (
    BusinessAttrValueBusinessType,
    DATASET_USAGE_TO_BUSINESS_TYPE,
)
from app.schemas.business_inference_result_dataset import BusinessInferenceResultDatasetCreate
from app.schemas.inference_result import InferenceMethod
from app.schemas.training_dataset import DatasetUsage

from app.services.business_inference_result_dataset.interface import BusinessInferenceResultDatasetService
from app.services.storage.interface import StorageService

from app.utils.business_attr_utils import BusinessAttrValueHelper
from app.utils.error_messages import data_exists_error

from app.repository.task_execution_mapper import TaskExecutionMapper

from app.models.models import TaskExecution
from app.common.task_execution import TaskExecutionBusinessType, TaskExecutionExecutor, TaskExecutionStatus, \
    TaskExecutionMethod
from fastapi.encoders import jsonable_encoder


class DefaultBusinessInferenceResultDatasetServiceService(BusinessInferenceResultDatasetService):

    def __init__(self, mapper: InferenceResultDatasetMapper
                 , trainDataMapper: TrainingDatasetMapper
                 , storage: StorageService
                 , third_party_api_mapper: ThirdPartyApiMapper
                 , task_mapper: TaskExecutionMapper
                 ) -> None:
        self.api_server = None
        self.mapper = mapper
        self.trainDataMapper = trainDataMapper
        self.storage = storage
        self.third_party_api_mapper = third_party_api_mapper
        self.task_mapper = task_mapper
        self.attr_helper = BusinessAttrValueHelper(mapper)

    async def create(self, project_id, current_user: JwtUserInfo, request: BusinessInferenceResultDatasetCreate
                     , manual_trigger_required: bool = True
                     ) -> bool:
        global logger
        list = []
        if request.name:
            is_exists = await self.exists(request.name, project_id, request.id)
            if is_exists:
                raise HTTPException(status_code=400, detail=f"项目中已存在同名推理结果集名称：{request.name}")
        try:
            # 生成 K8s UUID
            k8s_uuid = str(uuid.uuid4())

            # 生成项目命名空间
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

            initial_status = (
                TaskStatus.SCHEDULED_PENDING.value
                if request.schedule_at
                else TaskStatus.CREATED.value
            )

            # 直接插入，捕获唯一性约束
            instance = InferenceResultDataset(
                name=request.name,
                description=request.description,
                project_id=project_id,
                inference_method=InferenceMethod.THIRD_API.value,
                online_service_id=request.api_id,
                online_service_name=request.api_name,
                source_dataset_id=request.dataset_id,
                source_dataset_name=request.dataset_name,
                usage="business-inference",
                inference_params=request.param,  # 保存推理参数
                schedule_at=request.schedule_at,
                model_name=request.api_name
            )
            instance.status = initial_status
            instance.progress = 0
            instance.lab_k8s_uuid = k8s_uuid
            instance.celery_task_id = None  # 初始为None，后续更新
            instance.created_id = current_user.userId
            instance.created_by = current_user.username

            print(instance)
            await self.mapper.insert(instance)
            await self.mapper.commit()

            # 生成文件路径
            from app.utils.storage_enum import StoragePath
            from datetime import datetime
            base_path = StoragePath.REAL_INFERENCE_DATASETS.format_storage_path(namespace=namespace,
                                                                                task_id=instance.id)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"inference_result_{request.name}_{timestamp}.jsonl"
            file_path = f"{base_path}{filename}"
            instance.file_path = file_path

            # 从源数据集获取 dataset_type 和 dataset_format
            if request.dataset_id:
                from app.models.training_dataset_manager import TrainingDataset
                from sqlalchemy import select
                source_dataset = await self.mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == request.dataset_id)
                )
                if source_dataset:
                    if source_dataset.total_samples:
                        instance.total_items = source_dataset.total_samples
                    if source_dataset.dataset_type:
                        instance.dataset_type = source_dataset.dataset_type
                    if source_dataset.dataset_format:
                        instance.dataset_format = source_dataset.dataset_format
                    
                    # 保存关联数据集的属性值
                    source_bt = DATASET_USAGE_TO_BUSINESS_TYPE.get(source_dataset.usage)
                    if source_bt:
                        await self.attr_helper.copy_attr_values_between_references(
                            source_reference_id=source_dataset.id,
                            source_business_type=source_bt.value,
                            target_reference_id=instance.id,
                            target_business_type=BusinessAttrValueBusinessType.BUSINESS_INFERENCE.value,
                            current_user=current_user,
                        )

            print(instance)
            await self.mapper.insert(instance)
            await self.mapper.commit()

            # 获取当前租户ID
            from app.utils.app_runtime_context import get_tenant_id
            tenant_id = get_tenant_id()
            if not tenant_id:
                # 如果上下文没有，从数据库记录中获取（已自动填充）
                tenant_id = instance.tenant_id

            if tenant_id:

                post_kwargs = {
                    "namespace": namespace,
                    "dataset_payload": jsonable_encoder(instance),
                    "tenant_id": tenant_id,
                    "request": jsonable_encoder(request)
                }

                if manual_trigger_required:
                    # 手动触发创建任务
                    execution = TaskExecution(
                        business_type=TaskExecutionBusinessType.BUSINESS_INFERENCE_RESULT_DATASETS.value,
                        business_id=instance.id,
                        schedule_at=instance.schedule_at,
                        status=TaskExecutionStatus.PENDING.value,
                        executor=TaskExecutionExecutor.BUSINESS_INFERENCE_RESULT_DATASETS.value,
                        method=TaskExecutionMethod.START.value,
                        kwargs=post_kwargs
                    )
                    await self.task_mapper.insert(execution)
                    await self.task_mapper.commit()
                    from app.core.logging import logger
                    logger.info(f"推理结果数据集已创建并等待执行: {instance.id}, schedule_at={instance.schedule_at}")
                else:
                    # 提交到 K8s 运行（使用新的任务）
                    from app.tasks.business_inference_result_tasks import create_business_inference_result_dataset_async
                    celery_result = create_business_inference_result_dataset_async.apply_async(
                        args=[instance.id, namespace, request.dict(), tenant_id],
                        countdown=1  # 延迟到计划时间执行，确保数据库事务完成
                    )

                    # 保存 Celery 任务ID
                    instance.celery_task_id = celery_result.id
                    await self.mapper.commit()

                    from app.core.logging import logger
                    logger.info(
                        f"业务推理结果数据集已提交到Celery队列: {instance.id}, Celery任务ID: {celery_result.id}")

            return True

        except IntegrityError as e:
            # 回滚事务
            await self.mapper.rollback()

            # 检查是否是唯一约束冲突
            if 'uq_inference_service_project_name_tenant' in str(e.orig):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=data_exists_error(f"推理结果集名称:{request.name}")
                )
            else:
                # 其他完整性错误
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="创建服务失败：数据完整性错误"
                )

    async def create_by_em(self, project_id, current_user: JwtUserInfo,
                           request: BusinessInferenceResultDatasetCreate
                           , manual_trigger_required: bool = True
                           ) -> InferenceResultDataset:
        global logger
        list = []
        if request.name:
            is_exists = await self.exists(request.name, project_id, request.id)
            if is_exists:
                raise HTTPException(status_code=400, detail=f"项目中已存在同名推理结果集名称：{request.name}")
        try:
            # 生成 K8s UUID
            k8s_uuid = str(uuid.uuid4())

            # 生成项目命名空间
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

            initial_status = (
                TaskStatus.SCHEDULED_PENDING.value
                if request.schedule_at
                else TaskStatus.CREATED.value
            )

            # 直接插入，捕获唯一性约束
            instance = InferenceResultDataset(
                name=request.name,
                description=request.description,
                project_id=project_id,
                inference_method=InferenceMethod.THIRD_API.value,
                online_service_id=request.api_id,
                online_service_name=request.api_name,
                source_dataset_id=request.dataset_id,
                source_dataset_name=request.dataset_name,
                usage="business-inference",
                inference_params=request.param,  # 保存推理参数
                schedule_at=request.schedule_at,
                model_name=request.api_name
            )
            instance.status = initial_status
            instance.progress = 0
            instance.lab_k8s_uuid = k8s_uuid
            instance.celery_task_id = None  # 初始为None，后续更新
            instance.created_id = current_user.userId
            instance.created_by = current_user.username

            print(instance)
            await self.mapper.insert(instance)
            await self.mapper.commit()

            # 生成文件路径
            from app.utils.storage_enum import StoragePath
            from datetime import datetime
            base_path = StoragePath.REAL_INFERENCE_DATASETS.format_storage_path(namespace=namespace,
                                                                                task_id=instance.id)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"inference_result_{request.name}_{timestamp}.jsonl"
            file_path = f"{base_path}{filename}"
            instance.file_path = file_path

            # 从源数据集获取 dataset_type 和 dataset_format
            if request.dataset_id:
                from app.models.training_dataset_manager import TrainingDataset
                from sqlalchemy import select
                source_dataset = await self.mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == request.dataset_id)
                )
                if source_dataset:
                    if source_dataset.total_samples:
                        instance.total_items = source_dataset.total_samples
                    if source_dataset.dataset_type:
                        instance.dataset_type = source_dataset.dataset_type
                    if source_dataset.dataset_format:
                        instance.dataset_format = source_dataset.dataset_format
                    
                    # 保存关联数据集的属性值
                    source_bt = DATASET_USAGE_TO_BUSINESS_TYPE.get(source_dataset.usage)
                    if source_bt:
                        await self.attr_helper.copy_attr_values_between_references(
                            source_reference_id=source_dataset.id,
                            source_business_type=source_bt.value,
                            target_reference_id=instance.id,
                            target_business_type=BusinessAttrValueBusinessType.BUSINESS_INFERENCE.value,
                            current_user=current_user,
                        )

            print(instance)
            await self.mapper.insert(instance)
            await self.mapper.commit()

            # 获取当前租户ID
            from app.utils.app_runtime_context import get_tenant_id
            tenant_id = get_tenant_id()
            if not tenant_id:
                # 如果上下文没有，从数据库记录中获取（已自动填充）
                tenant_id = instance.tenant_id

            if tenant_id:

                post_kwargs = {
                    "namespace": namespace,
                    "dataset_payload": jsonable_encoder(instance),
                    "tenant_id": tenant_id,
                    "request": jsonable_encoder(request)
                }

                if manual_trigger_required:
                    # 手动触发创建任务
                    execution = TaskExecution(
                        business_type=TaskExecutionBusinessType.BUSINESS_INFERENCE_RESULT_DATASETS.value,
                        business_id=instance.id,
                        schedule_at=instance.schedule_at,
                        status=TaskExecutionStatus.PENDING.value,
                        executor=TaskExecutionExecutor.BUSINESS_INFERENCE_RESULT_DATASETS.value,
                        method=TaskExecutionMethod.START.value,
                        kwargs=post_kwargs
                    )
                    await self.task_mapper.insert(execution)
                    await self.task_mapper.commit()
                    from app.core.logging import logger
                    logger.info(f"推理结果数据集已创建并等待执行: {instance.id}, schedule_at={instance.schedule_at}")
                else:
                    # 提交到 K8s 运行（使用新的任务）
                    from app.tasks.business_inference_result_tasks import create_business_inference_result_dataset_async
                    celery_result = create_business_inference_result_dataset_async.apply_async(
                        args=[instance.id, namespace, request.dict(), tenant_id],
                        countdown=1  # 延迟到计划时间执行，确保数据库事务完成
                    )

                    # 保存 Celery 任务ID
                    instance.celery_task_id = celery_result.id
                    await self.mapper.commit()

                    from app.core.logging import logger
                    logger.info(
                        f"业务推理结果数据集已提交到Celery队列: {instance.id}, Celery任务ID: {celery_result.id}")

            return instance

        except IntegrityError as e:
            # 回滚事务
            await self.mapper.rollback()

            # 检查是否是唯一约束冲突
            if 'uq_inference_service_project_name_tenant' in str(e.orig):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=data_exists_error(f"推理结果集名称:{request.name}")
                )
            else:
                # 其他完整性错误
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="创建服务失败：数据完整性错误"
                )

    async def get_by_id(self, id_field_value) -> InferenceResultDataset:
        return await self.mapper.query_one(
            select(InferenceResultDataset).where(InferenceResultDataset.id == id_field_value))

    async def exists(
            self,
            name: str,
            project_id: int,
            id: int | None = None,
    ) -> bool:
        """True 表示已存在"""

        # 基础条件：同 project 内名称不能重复
        query = select(InferenceResultDataset.id).where(
            InferenceResultDataset.name == name,
            InferenceResultDataset.project_id == project_id
        )
        # ,
        # InferenceService.tenant_id == app_runtime_context.get_tenant_id()

        # 修改场景排除自身
        if id is not None:
            query = query.where(InferenceResultDataset.id != id)

        stmt = select(query.exists())
        is_exists = await self.mapper.execute(stmt)
        return is_exists.scalar()

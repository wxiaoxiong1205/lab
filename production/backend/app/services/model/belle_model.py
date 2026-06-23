import os
import uuid
from typing import Optional, List

from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select, and_, update, delete
from starlette import status
from datetime import datetime

from app.common.status import TaskStatus
from app.common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from app.core.logging import logger
from app.database.base import get_db_session
from app.models import BaseModel, TrainedModel, TrainingTask
from app.models.models import JwtUserInfo, Project, TaskExecution
from app.repository.base_mapper import BaseMapper
from app.schemas import BaseModelCreate, FineTuningType
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.schemas.model import ModelStatus, BaseModelResponse, ModelType, ModelProvider, BaseModelUpdate, \
    TrainedModelCreate, TrainedModelLogResponse, ModelTags
from app.services.model.model import DefaultModelService
from app.services.storage.interface import StorageService
from app.utils.app_runtime_context import get_tenant_id, set_tenant_id
from app.utils.belle_model_storage_utils import register_trained_model, register_trained_model_lora, \
    _create_belle_merge_task_async_impl
from app.utils.belle_util import BelleUtil
from app.utils.storage_enum import StoragePath
from app.utils.validators import validate_project_exists, validate_base_model_exists, validate_training_task_exists, \
    validate_training_task_by_name_version


class BelleModelService(DefaultModelService):
    """百丽模型服务实现类"""

    def __init__(self, mapper: BaseMapper, storage: StorageService) -> None:
        super().__init__(mapper, storage)
        self.mapper = mapper
        self.storage = storage


    async def create_base_model(
            self, current_user: JwtUserInfo, base_model: BaseModelCreate
    ) -> BaseModelResponse:
        # 检查是否已存在同名的基础模型
        existing_model = await self.mapper.execute(
            select(BaseModel).filter(BaseModel.name == base_model.name,
                                     BaseModel.model_provider == base_model.model_provider.value)
        )
        if existing_model.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"模型Code '{base_model.name}' 已存在，请使用不同的名称"
            )

        base_code = f'{base_model.model_provider.value}/{base_model.name}'
        tags = ["dp", *[model_type.value for model_type in base_model.model_type]]
        model_data = base_model.model_dump()
        model_data['model_path'] = None
        model_data['status'] = TaskStatus.SCHEDULED_PENDING.value if base_model.schedule_at else TaskStatus.CREATED.value
        model_data['progress'] = "0%"

        mapper_base_model = BaseModel(**model_data)
        mapper_base_model.created_id = current_user.userId
        mapper_base_model.created_by = current_user.username
        lab_k8s_uuid = str(uuid.uuid4())
        mapper_base_model.lab_k8s_uuid = lab_k8s_uuid

        base_model_id = None
        try:
            await self.mapper.insert(mapper_base_model)
            await self.mapper.commit()
            await self.mapper.refresh(mapper_base_model)
            base_model_id = mapper_base_model.id

            post_kwargs = {
                "base_code": base_code,
                "tags": tags,
                "lab_k8s_uuid": lab_k8s_uuid,
            }
            execution = TaskExecution(
                business_type=TaskExecutionBusinessType.BASE_MODEL.value,
                business_id=base_model_id,
                schedule_at=base_model.schedule_at,
                status=TaskExecutionStatus.PENDING.value,
                executor=TaskExecutionExecutor.BASE_MODEL_DOWNLOAD.value,
                method=TaskExecutionMethod.START.value,
                kwargs=post_kwargs
            )
            await self.mapper.insert(execution)
            await self.mapper.commit()

            logger.info(f"成功创建基础模型{base_model.name}执行器 ")
            return BaseModelResponse.model_validate(mapper_base_model)

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"创建基础模型失败: {str(e)}")
            if base_model_id:
                await self.mapper.execute(delete(BaseModel).where(BaseModel.id == base_model_id))
                await self.mapper.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"创建基础模型失败: {str(e)}"
            )

    async def run_create_base_model_post_process(
            self,
            base_model_id: int,
            base_code: str,
            tags: List[str],
            lab_k8s_uuid: str,
    ) -> None:
        belle_client = await BelleUtil.get_instance_with_token()
        belle_base_model = await belle_client.get_model_detail(base_code)
        model_path = None

        if belle_base_model:
            await belle_client.update_model_tags(base_code, tags)
            model_path = belle_base_model.get("minio_url")
        else:
            await belle_client.create_model(base_code, tags=tags)
            await belle_client.sync_model_file(base_code)

        db_base_model = await self.mapper.query_one(select(BaseModel).where(BaseModel.id == base_model_id))
        if not db_base_model:
            raise ValueError(f"基础模型不存在: {base_model_id}")

        if model_path:
            db_base_model.model_path = model_path
            db_base_model.status = TaskStatus.COMPLETED.value
            db_base_model.progress = "100%"
        else:
            db_base_model.status = TaskStatus.RUNNING.value
            db_base_model.progress = "0%"

        await self.mapper.commit()

    async def update_base_model(
            self, current_user: JwtUserInfo, base_model: BaseModelUpdate
    ) -> BaseModelResponse:
        query = await self.mapper.execute(
            select(BaseModel).filter(BaseModel.id == base_model.id)
        )
        model = query.scalar_one_or_none()
        if not model:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"基础模型 ID={base_model.id} 不存在"
            )

        if base_model.model_type is not None:
            model.model_type = base_model.model_type
        model.model_tags = base_model.model_tags
        model.description = base_model.description

        try:
            await self.mapper.commit()
            await self.mapper.refresh(model)

            return BaseModelResponse.model_validate(model)

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"修改基础模型失败: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"修改基础模型失败: {str(e)}"
            )

    # ------------------------------ 基础模型方法实现 ------------------------------
    async def list_base_models(
            self, model_type: Optional[ModelType] = None,
            model_provider: Optional[ModelProvider] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
            is_available: Optional[bool] = None,
            model_tags: Optional[List[ModelTags]] = None
    ) -> Page[BaseModelResponse]:
        # 构建查询
        query = select(BaseModel)

        # 添加筛选条件
        if model_type:
            # model_type 现在是逗号分隔的字符串，使用 LIKE 查询检查是否包含指定的类型
            query = query.filter(BaseModel._model_type.like(f"%{model_type.value}%"))
        if model_provider:
            query = query.filter(BaseModel.model_provider == model_provider.value)
        if is_available:
            query = query.filter(BaseModel.status == TaskStatus.COMPLETED.value)
        elif is_available is False:
            # 仅筛选非成功的模型
            query = query.filter(BaseModel.status != TaskStatus.COMPLETED.value)
        # 按创建时间降序排列
        query = query.order_by(BaseModel.created_at.desc())

        # 使用 fastapi-pagination 进行分页
        return await self.mapper.query_page(query, page, size)

    async def run_create_trained_model_post_process(
            self,
            trained_model_id: int,
            source_path: Optional[str] = None,
            target_path: Optional[str] = None,
            namespace: Optional[str] = None,
            is_lora: bool = False,
            model_provider: Optional[str] = None,
            base_model_name: Optional[str] = None,
            task_id: Optional[int] = None,
            checkpoint: Optional[str] = None,
            name: Optional[str] = None,
            model_version: Optional[str] = None,
            graphics_card_resource: Optional[GraphicsCardResourceConfig] = None,
            belle_task_id: Optional[int] = None,
            **kwargs
    ) -> None:
        if not belle_task_id:
            await super().run_create_trained_model_post_process(
                trained_model_id=trained_model_id,
                source_path=source_path,
                target_path=target_path,
                namespace=namespace,
                is_lora=is_lora,
                model_provider=model_provider,
                base_model_name=base_model_name,
                task_id=task_id,
                checkpoint=checkpoint,
                name=name,
                model_version=model_version,
                graphics_card_resource=graphics_card_resource,
                **kwargs
            )
            return

        db_trained_model = await self.mapper.query_one(
            select(TrainedModel).where(TrainedModel.id == trained_model_id)
        )
        if not db_trained_model:
            raise HTTPException(status_code=404, detail=f"训练模型不存在: {trained_model_id}")

        if not get_tenant_id():
            set_tenant_id(db_trained_model.tenant_id)

        if is_lora:
            if not task_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="LoRA 训练模型缺少关联训练任务ID"
                )

            task = await validate_training_task_exists(self.mapper, task_id)

            lora_payload = type("LoraPayload", (), {})()
            lora_payload.task_id = task.id
            lora_payload.checkpoint = checkpoint or db_trained_model.checkpoint
            lora_payload.name = name or db_trained_model.name
            lora_payload.model_version = model_version or db_trained_model.model_version or "v1"
            lora_payload.base_model_name = base_model_name or db_trained_model.base_model_name
            lora_payload.model_provider = model_provider or task.base_model.get("model_provider", ModelProvider.QWEN.value)
            lora_payload.graphics_card_resource = graphics_card_resource
            if isinstance(graphics_card_resource, dict):
                lora_payload.graphics_card_resource = (
                    GraphicsCardResourceConfig(**graphics_card_resource)
                    if graphics_card_resource else None
                )

            await register_trained_model_lora(
                storage=self.storage,
                task=task,
                namespace=namespace,
                trained_model=lora_payload,
                trained_id=db_trained_model.id,
                belle_task_id=int(belle_task_id)
            )
            k8s_uuid_result = await _create_belle_merge_task_async_impl(
                self.mapper,
                namespace,
                task,
                db_trained_model,
                db_trained_model.tenant_id
            )
            await self.mapper.execute(
                update(TrainedModel)
                .where(TrainedModel.id == db_trained_model.id)
                .values(lab_k8s_uuid=str(k8s_uuid_result.get("id")))
            )
            await self.mapper.commit()
            return

        resolved_target_path = target_path
        if not resolved_target_path:
            resolved_target_path = await register_trained_model(
                belle_task_id=int(belle_task_id),
                checkpoint_name=checkpoint or db_trained_model.checkpoint
            )

        if not resolved_target_path:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"模型产物不存在：belle_task_id={belle_task_id} "
                    f"checkpoint={checkpoint or db_trained_model.checkpoint}，请确认训练已完成并产物已生成"
                )
            )

        await self.mapper.execute(
            update(TrainedModel)
            .where(TrainedModel.id == db_trained_model.id)
            .values(
                model_path=resolved_target_path,
                status=TaskStatus.COMPLETED.value
            )
        )
        await self.mapper.commit()

    async def create_trained_model(
            self, current_user: JwtUserInfo, trained_model: TrainedModelCreate
    ) -> TrainedModel:
        # 验证项目是否存在
        if trained_model.project_id:
            await validate_project_exists(await self.mapper.get_session(), trained_model.project_id)

        # 验证基础模型是否存在（如果提供了base_model_id）
        if trained_model.base_model_id:
            await validate_base_model_exists(self.mapper, trained_model.base_model_id)

        # 验证训练任务是否存在（如果提供了task_id或task_name和task_version）

        task_fine_tuning_type = None
        belle_task_id = None
        task = None
        if trained_model.task_id:
            task = await validate_training_task_exists(self.mapper, trained_model.task_id)
            # 如果同时提供了task_name和task_version，验证是否匹配
            if trained_model.task_name and trained_model.task_version:
                if task.name != trained_model.task_name or task.version != trained_model.task_version:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="训练任务ID与任务名称/版本不匹配"
                    )
            task_fine_tuning_type = task.training_type.get("fine_tuning_type","")
            belle_task_id = task.lab_k8s_uuid
            trained_model.model_provider = task.base_model.get("model_provider",ModelProvider.QWEN.value)
        elif trained_model.task_name and trained_model.task_version:
            # 如果只提供了task_name和task_version，验证任务是否存在
            task = await validate_training_task_by_name_version(
                self.mapper,
                trained_model.project_id,
                trained_model.task_name,
                trained_model.task_version
            )
            task_fine_tuning_type = task.training_type.get("fine_tuning_type", "")
            belle_task_id = task.lab_k8s_uuid
            trained_model.model_provider = task.base_model.get("model_provider", ModelProvider.QWEN.value)

        if task:
            trained_model.task_id = trained_model.task_id or task.id
            trained_model.task_name = trained_model.task_name or task.name
            trained_model.task_version = trained_model.task_version or task.version

        is_lora = bool(task_fine_tuning_type and task_fine_tuning_type == FineTuningType.LORA.value)
        if is_lora and not trained_model.graphics_card_resource:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="LoRA 模型必须填写资源配置"
            )
        if not is_lora:
            trained_model.graphics_card_resource = None

        # 对于从训练任务创建的模型，checkpoint是必需的
        if (trained_model.task_id or (
                trained_model.task_name and trained_model.task_version)) and not trained_model.checkpoint:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="从训练任务创建模型时，必须指定checkpoint"
            )

        # 检查是否已存在相同检查点的注册模型
        if trained_model.task_name and trained_model.task_version:
            existing_models_list = await self.mapper.query(
                select(TrainedModel).where(
                    and_(
                        TrainedModel.project_id == trained_model.project_id,
                        TrainedModel.task_name == trained_model.task_name,
                        TrainedModel.task_version == trained_model.task_version,
                        TrainedModel.checkpoint == trained_model.checkpoint
                    )
                )
            )

            if existing_models_list:
                # 构建已存在模型的描述信息
                existing_model_info = []
                for model in existing_models_list:
                    existing_model_info.append(f"{model.name} {model.model_version}")

                existing_models_str = "、".join(existing_model_info)

                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"训练任务 {trained_model.task_name} {trained_model.task_version} 的检查点 {trained_model.checkpoint} 已被注册为训练模型：{existing_models_str}。无需重复创建，您可以直接使用已有的训练模型。"
                )

        # 获取项目信息
        project = await self.mapper.query_one(select(Project).filter(Project.id == trained_model.project_id))

        # 预生成模型路径，真正的后处理统一交给执行器
        target_path = None
        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"


        task_status = None
        if trained_model.task_name and trained_model.task_version:
            if is_lora:
                pass
            else:
                target_path = await register_trained_model(
                    belle_task_id=int(belle_task_id),
                    checkpoint_name=trained_model.checkpoint
                )
                if target_path is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"模型产物不存在：belle_task_id={belle_task_id} checkpoint={trained_model.checkpoint}，请确认训练已完成并产物已生成"
                    )
            task_status = TaskStatus.SCHEDULED_PENDING.value if trained_model.schedule_at else TaskStatus.CREATED.value

        # 创建训练模型对象
        model_data = trained_model.model_dump()

        # 如果成功注册了模型文件，使用注册模型路径
        if target_path:
            model_data['model_path'] = target_path

        # 移除model_provider
        model_data.pop("model_provider", None)
        mapper_trained_model = TrainedModel(**model_data)
        mapper_trained_model.created_id = current_user.userId
        mapper_trained_model.created_by = current_user.username
        if task_status:
            mapper_trained_model.status = task_status

        trained_model_id = None
        try:
            await self.mapper.insert(mapper_trained_model)
            await self.mapper.commit()
            await self.mapper.refresh(mapper_trained_model)
            trained_model_id = mapper_trained_model.id
            post_kwargs = {
                "target_path": target_path,
                "namespace": namespace,
                "is_lora": is_lora,
                "model_provider": trained_model.model_provider,
                "base_model_name": trained_model.base_model_name,
                "task_id": trained_model.task_id,
                "checkpoint": trained_model.checkpoint,
                "name": trained_model.name,
                "model_version": trained_model.model_version or "v1",
                "graphics_card_resource": trained_model.graphics_card_resource.model_dump() if trained_model.graphics_card_resource else None,
                "belle_task_id": int(belle_task_id) if belle_task_id is not None else None,
            }
            if task_fine_tuning_type != FineTuningType.LORA.value:
                await self.run_create_trained_model_post_process(
                    trained_model_id=mapper_trained_model.id,
                    **post_kwargs
                )
            else:
                execution = TaskExecution(
                    business_type=TaskExecutionBusinessType.TRAINED_MODEL.value,
                    business_id=mapper_trained_model.id,
                    schedule_at=trained_model.schedule_at,
                    status=TaskExecutionStatus.PENDING.value,
                    executor=TaskExecutionExecutor.TRAINED_MODEL.value,
                    method=TaskExecutionMethod.START.value,
                    kwargs=post_kwargs
                )
                await self.mapper.insert(execution)
                await self.mapper.commit()

            logger.info(f"成功创建训练模型 {trained_model.name}，路径: {mapper_trained_model.model_path}")
            return mapper_trained_model

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"创建训练模型失败: {str(e)}")

            # 同时删除trained_model记录
            if trained_model_id:
                await self.mapper.execute(delete(TrainedModel).where(TrainedModel.id == trained_model_id))
                await self.mapper.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"创建训练模型失败: {str(e)}"
            )

    async def get_trained_model_logs(
            self, project_id: int, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainedModelLogResponse:
        """获取训练任务日志（优先归档日志，其次Loki实时日志）"""

        trained_model = await self.mapper.query_by_id(select(TrainedModel).filter(TrainedModel.id == task_id))
        if not trained_model:
            raise HTTPException(status_code=404, detail="trained model not found")

        training_task = await self.mapper.query_by_id(select(TrainingTask).filter(TrainingTask.id == trained_model.task_id))
        if not training_task or training_task.training_type['fine_tuning_type'] != FineTuningType.LORA.value:
            return TrainedModelLogResponse(archived=False, logs=[])

        # 延迟导入以避免循环依赖（belle_training_task 可能导入其他服务）
        from app.services.training_task.belle_training_task import verification_belle_task_id
        
        #校验belle任务id
        verification_belle_task_id(trained_model.lab_k8s_uuid)

        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        result = await belle_client.get_train_task_logs(int(trained_model.lab_k8s_uuid))

        logs = []
        if result:
            logs.append(result[0].get('logs',None))
        return TrainedModelLogResponse(archived=False, logs=logs)

async def sync_belle_base_model():
    """同步基础模型信息"""
    # 获取未完成的模型信息
    async with get_db_session() as db:  # 获取 AsyncSession
        query = await db.execute(
            select(BaseModel).filter(
                BaseModel.status.notin_([
                    TaskStatus.CREATED.value,
                    TaskStatus.FAILED.value,
                    TaskStatus.SCHEDULED_PENDING.value,
                    TaskStatus.COMPLETED.value,
                ])
            )
        )

        base_models = query.scalars().all()

        if not base_models:
            return
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        for base_model in base_models:
            base_code = f'{base_model.model_provider}/{base_model.name}'
            try:
                sync_result = await belle_client.get_sync_status(base_code)
                model_status = None
                model_path = None
                progress = None
                # 处理基础模型文件状态
                if sync_result:
                    if sync_result.get("status") == ModelStatus.SUCCESS.value:
                        # 用base_code获取模型详情
                        belle_base_model = await belle_client.get_model_detail(base_code)
                        # 生成模型路径，最终还是需要模型路径驱动是否可用
                        model_path = belle_base_model.get("minio_url")
                        if model_path:
                            model_status = TaskStatus.COMPLETED.value
                            progress = "100%"
                        else:
                            model_status = TaskStatus.RUNNING.value
                    else:
                        belle_status = sync_result.get("status", ModelStatus.WAITING.value)
                        if belle_status == ModelStatus.RUNNING.value:
                            model_status = TaskStatus.RUNNING.value
                        elif belle_status == ModelStatus.FAILED.value:
                            model_status = TaskStatus.FAILED.value
                        else:
                            # belle接口问题，进行中的任务100%后，会出现一段时间的状态是wait，状态不允许回退
                            pass
                else:
                    model_status = TaskStatus.FAILED.value

                if model_status:
                    base_model.status = model_status

                if model_path:
                    base_model.model_path = model_path

                # 进度
                base_model.progress = progress or sync_result.get("progress", "0%")
                # 成功
                logger.info(f"Successfully Sync BaseModel:{base_code} Info: (STATUS: {base_model.status})")

            except Exception as e:
                logger.error(f"Error Sync BaseModel:{base_code} Info: {e}")

        # 统一提交事物
        await db.commit()

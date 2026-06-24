import asyncio
import io
import os
import re
import shlex
import stat
import uuid
import zipfile
from enum import Enum
from pathlib import Path
from typing import List, Optional, Tuple

import yaml
from fastapi import HTTPException, status
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate
from kubernetes import client
from sqlalchemy import select, delete, and_, func, join, cast, String, literal, update
from modelscope.hub.api import HubApi
from modelscope.hub.errors import NotExistError

from app.utils.log_service import log_service
from datetime import datetime
from app.core.logging import logger
from app.models.model_manager import BaseModel, TrainedModel, MLModel
from app.models.models import JwtUserInfo, Project, KubernetesResource, ProjectKubernetesRelation, \
    KubernetesStorageRelation, KubernetesRepositoryRelation, RepositoryResource, TaskExecution, ChunkUploadSession, Notebook
from app.schemas.model import (
    BaseModelCreate, BaseModelResponse, TrainedModelCreate, TrainedModelResponse,
    TrainedModelSummaryResponse, ModelType, ModelProvider,
    BaseModelUpdate, ModelStatus, ModelTags, TrainedModelLogResponse, ModelSource,
    MlModelCreate, MlModelVersionCreate, MlModelUpdate, MlModelResponse, MlModelSummaryResponse,
    MlModelType, ModelRegisterSourceType,
)
from app.utils import app_runtime_context
from app.utils.model_storage_utils import register_trained_model, unregister_trained_model, register_trained_model_lora
from app.utils.storage_enum import StoragePath, PvcName
from app.utils.timezone_utils import to_local_tz
from app.utils.validators import (
    validate_base_model_exists, validate_training_task_exists,
    validate_training_task_by_name_version, validate_project_exists, validate_notebook_exists,
    validate_llm_models_available
)
from .interface import ModelService
from ..project.project import ensure_pvc_exists
from ...common.status import TaskStatus
from ...common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from ...models import TrainingTask
from ...repository.base_mapper import BaseMapper
from ...schemas import FineTuningType, TrainingMethodType
from ...schemas.resource_config import GraphicsCardResourceConfig
from ...services.storage.interface import StorageService
from ...utils.app_runtime_context import get_tenant_id, set_tenant_id
from ...utils.error_messages import data_is_associated_and_cannot_be_deleted, data_not_found_error
from ...utils.error_messages import data_not_found_error_by_name
from ...utils.k8s_call import get_k8s_api
from ...utils.k8s_launcher import K8sLauncher
from ...utils.k8s_utils import create_harbor_secret, build_node_affinity


class DefaultModelService(ModelService):
    """模型服务实现类"""

    _ML_TASK_TYPE_SAFE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,79}$")
    _ML_MODEL_VERSION_SAFE = re.compile(r"^[Vv](\d+)$")

    def __init__(self, mapper: BaseMapper, storage: StorageService) -> None:
        super().__init__(mapper, storage)
        self.mapper = mapper
        self.storage = storage

    @staticmethod
    def _prefix_tenant_to_model_uri(uri: Optional[str], tenant_id: Optional[str]) -> Optional[str]:
        """返回时为模型产物路径补齐租户前缀，已带前缀时保持不变。"""
        raw = (uri or "").strip()
        if not raw:
            return None

        tid = (tenant_id or "").strip().strip("/")
        normalized = raw.replace("\\", "/")
        if not tid:
            return normalized

        normalized_no_leading = normalized.lstrip("/")
        if normalized_no_leading == tid or normalized_no_leading.startswith(f"{tid}/"):
            return f"/{normalized_no_leading}"
        return f"/{tid}/{normalized_no_leading}"

    @staticmethod
    def _training_method_value(value) -> Optional[str]:
        if value is None:
            return None
        return value.value if hasattr(value, "value") else str(value)

    @classmethod
    def _is_grpo_training_method(cls, value) -> bool:
        return cls._training_method_value(value) == TrainingMethodType.GRPO.value

    @classmethod
    def _requires_training_merge_job(cls, fine_tuning_type: Optional[str], training_method_type) -> bool:
        return fine_tuning_type == FineTuningType.LORA.value or cls._is_grpo_training_method(training_method_type)

    @staticmethod
    def _build_merge_trained_model_path(namespace: str, name: str, model_version: str) -> str:
        registered_base = StoragePath.MERGE_TRAINED_MODELS.format_storage_path(
            namespace=namespace
        )
        return f"{registered_base}{name}_{model_version or 'v1'}"

    @staticmethod
    def _build_verl_actor_checkpoint_mount_path(checkpoint: str) -> str:
        checkpoint_path = str(checkpoint or "").strip().strip("/")
        base_path = f"{StoragePath.UNREGISTERED_TRAINED_MODELS.mount_path.rstrip('/')}/{checkpoint_path}"
        return base_path if base_path.endswith("/actor") else f"{base_path}/actor"

    @staticmethod
    def _build_merge_model_mount_path(name: str, model_version: str) -> str:
        return f"{StoragePath.MERGE_TRAINED_MODELS.mount_path.rstrip('/')}/{name}_{model_version or 'v1'}"

    def _build_ml_model_response(
        self, m: MLModel, notebook_name: Optional[str] = None
    ) -> MlModelResponse:
        tenant_id = get_tenant_id() or getattr(m, "tenant_id", None)
        source_type = (m.source_type or "").strip().lower()
        effective_notebook_name = None
        if source_type == ModelRegisterSourceType.NOTEBOOK.value and m.notebook_id:
            effective_notebook_name = (
                notebook_name if notebook_name is not None else getattr(m, "notebook_name", None)
            )
        return MlModelResponse(
            id=m.id,
            name=m.name,
            model_version=m.model_version,
            description=m.description,
            project_id=m.project_id,
            model_type=m.model_type,
            annotation_type=(m.annotation_type or ""),
            task_type=m.task_type,
            source_type=m.source_type,
            notebook_id=m.notebook_id,
            notebook_name=effective_notebook_name,
            source_ref=m.source_ref,
            tokenizer_source_ref=m.tokenizer_source_ref,
            network_structure=m.network_structure,
            artifact_uri=self._prefix_tenant_to_model_uri(m.artifact_uri, tenant_id),
            tokenizer_uri=self._prefix_tenant_to_model_uri(m.tokenizer_uri, tenant_id),
            status=m.status,
            created_id=m.created_id,
            created_by=m.created_by,
            created_at=to_local_tz(m.created_at),
            updated_at=to_local_tz(m.updated_at),
        )

    async def _get_ml_model_notebook_names(
        self, project_id: int, models: List[MLModel]
    ) -> dict[int, str]:
        notebook_ids = sorted(
            {
                int(m.notebook_id)
                for m in models
                if (m.source_type or "").strip().lower() == ModelRegisterSourceType.NOTEBOOK.value
                and m.notebook_id
            }
        )
        if not notebook_ids:
            return {}

        result = await self.mapper.execute(
            select(Notebook.id, Notebook.instance_name).where(
                Notebook.project_id == project_id,
                Notebook.id.in_(notebook_ids),
            )
        )
        return {int(notebook_id): notebook_name for notebook_id, notebook_name in result.all()}

    def _repo_scripts_ml_task_dir(self, raw: str) -> Path:
        """本机仓库 ``scripts/<ml_task_type>/`` 路径（与 download demo zip 一致）。"""
        return Path(__file__).resolve().parents[3] / "scripts" / raw

    @classmethod
    def _extract_ml_model_version_number(cls, raw: Optional[str]) -> Optional[int]:
        """从 ``V12`` / ``v12`` 中提取数字版本号；不符合格式时返回 ``None``。"""
        version = (raw or "").strip()
        if not version:
            return None
        match = cls._ML_MODEL_VERSION_SAFE.match(version)
        if not match:
            return None
        return int(match.group(1))

    @classmethod
    def _next_ml_model_version(cls, versions: List[Optional[str]]) -> str:
        """根据现有版本列表计算下一个版本号，避免字符串比较导致 ``V10`` 之后重复。"""
        max_version_number = 0
        version_count = 0

        for version in versions:
            version_count += 1
            version_number = cls._extract_ml_model_version_number(version)
            if version_number is None:
                continue
            max_version_number = max(max_version_number, version_number)

        if max_version_number > 0:
            return f"V{max_version_number + 1}"

        # 兼容极少数历史脏数据：即使版本格式异常，也至少在现有条数基础上递增，避免回退成重复的 V1/V2。
        return f"V{version_count + 1}"

    def ensure_local_ml_task_scripts_available(self, ml_task_type: str) -> Path:
        """校验本机存在非空的 ``scripts/{ml_task_type}/``；失败抛出 ``ValueError``。"""
        raw = (ml_task_type or "").strip()
        if not raw or not self._ML_TASK_TYPE_SAFE.match(raw):
            raise ValueError(
                "ml_task_type 无效：须以字母或数字开头，仅含字母、数字、._-，长度 1～80"
            )
        root = self._repo_scripts_ml_task_dir(raw)
        if not root.is_dir():
            raise ValueError(
                f"未找到任务类型「{raw}」的 demo 样例：本机目录 {root} 不存在或为空"
            )
        if not any(p.is_file() for p in root.rglob("*")):
            raise ValueError(
                f"未找到任务类型「{raw}」的 demo 样例：本机目录 {root} 不存在或为空"
            )
        return root

    def ensure_ml_task_scripts_present_http(
        self, ml_task_type: Optional[str], *, required: bool = False
    ) -> Optional[Path]:
        """``task_type`` 非空时校验本机 ``scripts/{task_type}/`` 存在且含文件；失败抛 ``HTTPException``。

        - ``required=True``：空字符串视为无效（用于 demo 下载等必填场景）。
        - ``required=False``：空则跳过（用于模型记录中可选的 ``task_type``）。
        """
        tt = (ml_task_type or "").strip()
        if not tt:
            if required:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "ml_task_type 无效：须以字母或数字开头，仅含字母、数字、._-，长度 1～80"
                    ),
                )
            return None
        try:
            return self.ensure_local_ml_task_scripts_available(tt)
        except ValueError as e:
            msg = str(e)
            if msg.startswith("ml_task_type 无效"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=msg
                ) from e
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=msg
            ) from e

    async def validate_trained_model_task(
            self, task_id: int, project_id: int
    ) -> TrainingTask:
        """验证合并训练任务是否存在且属于指定项目"""
        result = await self.mapper.execute(
            select(TrainedModel).where(
                TrainedModel.id == task_id,
                TrainedModel.project_id == project_id
            )
        )
        task = result.scalars().first()
        if not task:
            raise HTTPException(
                status_code=404,
                detail=data_not_found_error_by_name("合并训练任务")
            )
        return task

    async def validate_base_model_task(
            self, task_id: int
    ) -> BaseModel:
        """验证模型下载任务是否存在"""
        result = await self.mapper.execute(
            select(BaseModel).where(
                BaseModel.id == task_id
            )
        )
        task = result.scalars().first()
        if not task:
            raise HTTPException(
                status_code=404,
                detail=data_not_found_error_by_name("模型下载任务")
            )
        return task

    # ------------------------------ 基础工具方法实现 ------------------------------
    def generate_base_model_path(self, model_name: str, model_provider: ModelProvider) -> str:
        """生成基础模型在存储中的路径"""
        # 处理提供商（支持枚举或字符串）
        provider_str = model_provider.value if isinstance(model_provider, ModelProvider) else str(model_provider)
        # 拼接路径（基础路径/提供商/模型名）
        base_path = StoragePath.BASE_MODELS.storage_path
        return f"{base_path}{provider_str}/{model_name}"

    # ------------------------------ 基础工具方法实现 ------------------------------
    def generate_base_model_provider(self, model_provider: ModelProvider) -> str:
        """生成基础模型在存储中的路径"""
        # 处理提供商（支持枚举或字符串）
        provider_str = model_provider.value if isinstance(model_provider, ModelProvider) else str(model_provider)
        # 拼接路径（基础路径/提供商/模型名）
        base_path = StoragePath.BASE_MODELS.storage_path
        return f"{base_path}{provider_str}"

    # ------------------------------ 内部辅助方法实现 ------------------------------
    async def _validate_project(self, project_id: int) -> Project:
        """验证项目存在，不存在则抛出404"""
        project = await self.mapper.query_one(select(Project).filter(Project.id == project_id))
        if not project:
            raise HTTPException(
                status_code=404,
                detail=f"项目不存在（ID: {project_id}）"
            )
        return project

    async def _register_trained_model_storage(
            self, project: Project, trained_model: TrainedModelCreate
    ) -> str:
        """注册训练模型到存储（返回注册路径）"""
        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"
        # 调用存储注册工具
        return await register_trained_model(
            storage=self.storage,
            namespace=namespace,
            task_id=trained_model.task_id,
            task_name=trained_model.task_name,
            task_version=trained_model.task_version,
            checkpoint_name=trained_model.checkpoint,
            model_name=trained_model.name,
            model_version=trained_model.model_version or "v1"
        )

    async def _unregister_trained_model_storage(self, model_path: str) -> bool:
        """从存储中注销训练模型（返回是否成功）"""
        if not model_path:
            return False
        try:
            return await unregister_trained_model(self.storage, model_path)
        except Exception as e:
            logger.warning(f"注销模型存储失败: {str(e)}")
            return False

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
            # query = query.filter(BaseModel.status == ModelStatus.SUCCESS.value)
            query = query.filter(BaseModel.status == TaskStatus.COMPLETED.value)
        if model_tags:
            tag_values = [
                t.value if hasattr(t, "value") else str(t)
                for t in model_tags
            ]

            for tag in tag_values:
                query = query.filter(BaseModel._model_tags.like(f"%{tag}%"))
        # 按创建时间降序排列
        query = query.order_by(BaseModel.created_at.desc())

        # 使用 fastapi-pagination 进行分页
        return await self.mapper.query_page(query, page, size)

    async def create_base_model(
            self, current_user: JwtUserInfo, base_model: BaseModelCreate
    ) -> BaseModelResponse:
        # 检查模型能力标签
        tags = base_model.model_tags
        if not tags or len(tags) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="模型标签不能为空"
            )

        #校验来源类型，如果有选择集群，那就返回集群
        clusters = await self.verify_source_model(base_model.model_source, base_model.k8s_id)

        # 检查是否已存在同名的基础模型
        existing_model = await self.mapper.execute(
            select(BaseModel).filter(BaseModel.name == base_model.name,
                                     BaseModel.model_provider == base_model.model_provider.value)
        )
        if existing_model.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"同提供商下模型，模型Code '{base_model.name}' 已存在，请使用不同的基础模型"
            )

        jfs_client = await self.storage.JUICEFS_CLIENT()

        # 判断模型提供商
        model_provider_path = self.generate_base_model_provider(
            model_provider=base_model.model_provider
        )

        try:
            provider_exists = jfs_client.exists(model_provider_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"检查权重提供商失败：{e}"
            )

        exists = False
        # 生成模型路径
        model_path = self.generate_base_model_path(
            model_name=base_model.name,
            model_provider=base_model.model_provider
        )
        if provider_exists:
            try:
                exists = jfs_client.exists(model_path)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"检查权重失败：{e}"
                )
        elif base_model.model_source == ModelSource.LOCAL.value:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"无法查询到对应提供商资源：{base_model.model_provider.value} 请确认是否配置模型权重"
            )

        # model_status = ModelStatus.WAITING
        model_status = TaskStatus.SCHEDULED_PENDING.value if base_model.schedule_at else TaskStatus.CREATED.value
        if base_model.model_source == ModelSource.LOCAL.value:
            # 本地使用jfs
            if not exists:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"存储中不存在该模型文件：{base_model.model_provider.value}/{base_model.name}"
                )
            # jfs存在手动上传的模型
            # model_status = ModelStatus.SUCCESS
            model_status = TaskStatus.COMPLETED.value
        else:
            # Modelscope先检查jfs是否存在，存在则不让新增，不存在调用job下载
            if exists:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"存储中已经存在该模型文件：{base_model.model_provider.value}/{base_model.name}"
                )
            await self.check_modelscope_model_exists(model_id=f"{base_model.model_provider.value}/{base_model.name}")


        # 创建基础模型对象
        model_data = base_model.model_dump()
        model_data['model_path'] = model_path

        mapper_base_model = BaseModel(**model_data)
        mapper_base_model.created_id = current_user.userId
        mapper_base_model.created_by = current_user.username
        mapper_base_model.status = model_status
        lab_k8s_uuid = str(uuid.uuid4())
        mapper_base_model.lab_k8s_uuid = lab_k8s_uuid

        # 避免回滚时取不到id
        base_model_id = None
        try:
            await self.mapper.insert(mapper_base_model)
            await self.mapper.commit()
            await self.mapper.refresh(mapper_base_model)
            base_model_id = mapper_base_model.id

            if base_model.model_source == ModelSource.MODELSCOPE.value:
                model_id = f'{base_model.model_provider.value}/{base_model.name}'
                post_kwargs = {
                    "model_id": model_id,
                    "model_source": base_model.model_source,
                    "kubeconfig_str": clusters.config,
                    "lab_k8s_uuid": lab_k8s_uuid,
                    "k8s_id": base_model.k8s_id
                }
                # if schedule_at:
                #     execution = TaskExecution(
                #         business_type=TaskExecutionBusinessType.BASE_MODEL.value,
                #         business_id=base_model_id,
                #         schedule_at=schedule_at,
                #         status=TaskExecutionStatus.PENDING.value,
                #         executor=TaskExecutionExecutor.BASE_MODEL_DOWNLOAD.value,
                #         method=TaskExecutionMethod.START.value,
                #         kwargs=post_kwargs
                #     )
                #     await self.mapper.insert(execution)
                #     await self.mapper.commit()
                # else:
                #     await self.run_create_base_model_post_process(base_model_id=base_model_id, **post_kwargs)
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
            logger.info(f"成功创建基础模型 {base_model.name}，路径: {model_path}")
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
            model_id: str,
            model_source: str,
            kubeconfig_str: str,
            lab_k8s_uuid: str,
            k8s_id: int
    ) -> None:
        await self.start_model_download_job(
            job_id=base_model_id,
            model_id=model_id,
            model_source=model_source,
            kubeconfig_str=kubeconfig_str,
            lab_k8s_uuid=lab_k8s_uuid,
            k8s_id=k8s_id
        )

    async def update_base_model(
            self, current_user: JwtUserInfo, base_model: BaseModelUpdate
    ) -> BaseModelResponse:
        # 检查模型能力标签
        tags = base_model.model_tags
        if not tags or len(tags) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="模型标签不能为空"
            )

        # 检查是否已存在同名的基础模型
        query = await self.mapper.execute(
            select(BaseModel).filter(BaseModel.id == base_model.id)
        )
        model = query.scalar_one_or_none()
        if not model:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"基础模型 ID={base_model.id} 不存在"
            )

        # 下载任务编辑状态限制：仅允许可编辑状态
        if model.model_source == ModelSource.MODELSCOPE.value and model.status not in [
            TaskStatus.CREATED.value,
            TaskStatus.SCHEDULED_PENDING.value,
            TaskStatus.FAILED.value,
            TaskStatus.TERMINATED.value,
            TaskStatus.COMPLETED.value
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"当前模型状态为 {model.status}，不允许编辑下载任务"
            )

        if base_model.model_type is not None:
            model.model_type = base_model.model_type
        model.model_tags = base_model.model_tags
        model.description = base_model.description

        if model.status != TaskStatus.COMPLETED.value:
            # 如果不是已完成，那就可以修改非描述与标签信息，并且重置任务状态
            model.k8s_id = base_model.k8s_id
            model.schedule_at = base_model.schedule_at

            # 同步定时执行器任务（仅 Modelscope 下载任务）
            if model.model_source == ModelSource.MODELSCOPE.value:
                model.status = TaskStatus.SCHEDULED_PENDING.value if model.schedule_at else TaskStatus.CREATED.value

                execution = await self.mapper.query_one(
                    select(TaskExecution).where(
                        TaskExecution.business_type == TaskExecutionBusinessType.BASE_MODEL.value,
                        TaskExecution.business_id == model.id
                    ).order_by(TaskExecution.created_at.desc())
                )

                if execution and execution.status in [TaskExecutionStatus.RUNNING.value]:
                    raise HTTPException(status_code=400, detail=f"执行任务状态为 {execution.status}，不允许编辑")

                # 重新构造执行参数，确保定时变更后调度参数一致
                k8s_id = base_model.k8s_id if base_model.k8s_id is not None else model.k8s_id
                if not k8s_id:
                    raise HTTPException(status_code=400, detail="下载任务缺少 k8s_id，无法更新执行器任务")
                cluster = await self.mapper.query_one(select(KubernetesResource).where(KubernetesResource.id == k8s_id))
                if not cluster:
                    raise HTTPException(status_code=404, detail=f"指定 K8s 资源不存在: {k8s_id}")

                post_kwargs = {
                    "model_id": f"{model.model_provider}/{model.name}",
                    "model_source": model.model_source,
                    "kubeconfig_str": cluster.config,
                    "lab_k8s_uuid": model.lab_k8s_uuid,
                    "k8s_id": k8s_id
                }

                if execution:
                    execution.schedule_at = model.schedule_at
                    execution.status = TaskExecutionStatus.PENDING.value
                    execution.executor = TaskExecutionExecutor.BASE_MODEL_DOWNLOAD.value
                    execution.method = TaskExecutionMethod.START.value
                    execution.kwargs = post_kwargs
                    execution.retry_count = 0
                    execution.last_error = None
                    execution.locked_at = None
                    execution.locked_by = None
                else:
                    execution = TaskExecution(
                        business_type=TaskExecutionBusinessType.BASE_MODEL.value,
                        business_id=model.id,
                        schedule_at=model.schedule_at,
                        status=TaskExecutionStatus.PENDING.value,
                        executor=TaskExecutionExecutor.BASE_MODEL_DOWNLOAD.value,
                        method=TaskExecutionMethod.START.value,
                        kwargs=post_kwargs
                    )
                    await self.mapper.insert(execution)

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

    async def delete_base_model(
            self, current_user: JwtUserInfo, base_model_id: int
    ) -> None:
        res = await self.mapper.execute(select(BaseModel).where(BaseModel.id == base_model_id))
        base_model = res.scalar_one_or_none()
        if not base_model:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=data_not_found_error()
            )

        # 只有已创建/定时待启动/已完成/失败/已终止的任务可以进行删除
        if base_model.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                               TaskStatus.TERMINATED.value, TaskStatus.FAILED.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"当前任务状态为 {base_model.status}，不允许删除"
            )

        try:
            jfs_client = await self.storage.JUICEFS_CLIENT()
            try:
                jfs_client.rmr(base_model.model_path)
            except Exception as e:
                logger.error(f"删除文件失败：{base_model.model_path},错误信息：{e}")

            lock_file = f'/public/models/.lock/{base_model.model_provider}___{base_model.name}'
            try:
                jfs_client.remove(lock_file)
            except Exception as e:
                logger.error(f"删除文件失败：{lock_file},错误信息：{e}")
            await self.mapper.execute(delete(BaseModel).where(BaseModel.id == base_model_id))
            await self.mapper.commit()
            # 统一返回None，符合RESTful规范 - 删除成功返回204无内容
            return None
        except Exception as e:
            await self.mapper.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to delete base_model: {str(e)}")


    # ------------------------------ 训练模型方法实现 ------------------------------
    async def list_trained_models(
            self, project_id: int, name: Optional[str] = None,
            model_type: Optional[ModelType] = None,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[TrainedModelSummaryResponse]:
        # 验证项目存在
        await validate_project_exists(await self.mapper.get_session(), project_id)

        # 构建查询条件
        conditions = [TrainedModel.project_id == project_id]

        if name:
            conditions.append(TrainedModel.name.ilike(f"%{name}%"))

        if model_type:
            conditions.append(TrainedModel.model_type == model_type)

        if status:
            conditions.append(TrainedModel.status == status.value)

        # 构建汇总查询：按模型名称分组，获取汇总信息
        # 使用子查询获取每个模型名称的第一条记录（按创建时间排序）
        subquery = (
            select(
                TrainedModel.id,
                TrainedModel.name,
                TrainedModel.model_type,
                TrainedModel.project_id,
                TrainedModel.base_model_name,
                func.row_number().over(
                    partition_by=TrainedModel.name,
                    order_by=TrainedModel.created_at
                ).label('rn')
            )
            .where(and_(*conditions))
        ).subquery()

        # 主查询：汇总统计信息；id 取 rn=1 那条记录的 id，避免非聚合字段歧义
        query = (
            select(
                subquery.c.id,
                TrainedModel.name.label('model_name'),
                func.count(TrainedModel.id).label('version_count'),
                func.min(TrainedModel.model_version).label('earliest_version'),
                func.max(TrainedModel.model_version).label('latest_version'),
                func.min(TrainedModel.created_at).label('created_at'),
                func.max(TrainedModel.updated_at).label('updated_at'),
                # 从子查询获取第一条记录的字段值
                subquery.c.model_type,
                subquery.c.project_id,
                subquery.c.base_model_name
            )
            .select_from(
                join(
                    TrainedModel,
                    subquery,
                    and_(
                        TrainedModel.name == subquery.c.name,
                        subquery.c.rn == 1
                    )
                )
            )
            .where(and_(*conditions))
            .group_by(
                subquery.c.id,
                TrainedModel.name,
                subquery.c.model_type,
                subquery.c.project_id,
                subquery.c.base_model_name
            )
            .order_by(func.max(TrainedModel.updated_at).desc())  # 按最后更新时间降序
        )

        # 使用 fastapi-pagination 进行分页
        return await self.mapper.query_page(query, page, size)

    async def get_trained_model_versions(
            self, project_id: int, model_name: str,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> List[TrainedModelResponse]:
        # 验证项目存在
        await validate_project_exists(await self.mapper.get_session(), project_id)

        # 查询该模型名称下的所有版本
        conditions = [
            TrainedModel.project_id == project_id,
            TrainedModel.name == model_name
        ]
        if status:
            conditions.append(TrainedModel.status == status.value)
        query = await self.mapper.execute(
            select(TrainedModel, TrainingTask.training_type)
            .outerjoin(
                TrainingTask,
                TrainingTask.id == TrainedModel.task_id
            ).where(and_(*conditions))
            .order_by(TrainedModel.id.desc())  # 按id降序排列
        )
        rows = query.all()

        if not rows:
            return []

        # 转换为响应模型并处理时区
        responses = []
        for row in rows:
            model, training_type = row
            response = TrainedModelResponse.model_validate({
                **model.__dict__,
                "training_type": training_type
            })
            response.created_at = to_local_tz(model.created_at)
            response.updated_at = to_local_tz(model.updated_at)
            responses.append(response)

        return responses

    # ------------------------------ 机器学习模型方法实现 ------------------------------

    async def list_ml_models(
            self, project_id: int, name: Optional[str] = None,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None, size: Optional[int] = None,
    ) -> Page[MlModelSummaryResponse]:
        await validate_project_exists(await self.mapper.get_session(), project_id)
        conditions = [MLModel.project_id == project_id]
        if name:
            conditions.append(MLModel.name.ilike(f"%{name}%"))
        if status:
            conditions.append(MLModel.status == status.value)
        subquery = (
            select(
                MLModel.id,
                MLModel.name,
                MLModel.model_type,
                MLModel.annotation_type,
                MLModel.task_type,
                MLModel.project_id,
                MLModel.notebook_id,
                MLModel.source_type,
                MLModel.source_ref,
                MLModel.tokenizer_source_ref,
                MLModel.network_structure,
                MLModel.artifact_uri,
                MLModel.tokenizer_uri,
                func.row_number().over(
                    partition_by=MLModel.name,
                    order_by=MLModel.created_at
                ).label('rn')
            )
            .where(and_(*conditions))
        ).subquery()
        query = (
            select(
                subquery.c.id,
                MLModel.name.label('model_name'),
                func.count(MLModel.id).label('version_count'),
                func.min(MLModel.model_version).label('earliest_version'),
                func.max(MLModel.model_version).label('latest_version'),
                func.min(MLModel.created_at).label('created_at'),
                func.max(MLModel.updated_at).label('updated_at'),
                subquery.c.model_type,
                subquery.c.annotation_type,
                subquery.c.task_type,
                subquery.c.project_id,
                subquery.c.notebook_id,
                subquery.c.source_type,
                subquery.c.source_ref,
                subquery.c.tokenizer_source_ref,
                subquery.c.network_structure,
                subquery.c.artifact_uri,
                subquery.c.tokenizer_uri,
            )
            .select_from(
                join(
                    MLModel,
                    subquery,
                    and_(MLModel.name == subquery.c.name, subquery.c.rn == 1)
                )
            )
            .where(and_(*conditions))
            .group_by(
                subquery.c.id, MLModel.name, subquery.c.model_type, subquery.c.annotation_type,
                subquery.c.task_type,
                subquery.c.project_id, subquery.c.notebook_id,
                subquery.c.source_type, subquery.c.source_ref, subquery.c.tokenizer_source_ref,
                subquery.c.network_structure, subquery.c.artifact_uri, subquery.c.tokenizer_uri,
            )
            .order_by(func.max(MLModel.updated_at).desc())
        )
        return await self.mapper.query_page(query, page, size)

    async def get_ml_model_versions(
            self, project_id: int, model_name: str,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None, size: Optional[int] = None,
    ) -> List[MlModelResponse]:
        await validate_project_exists(await self.mapper.get_session(), project_id)
        conditions = [MLModel.project_id == project_id, MLModel.name == model_name]
        if status:
            conditions.append(MLModel.status == status.value)
        result = await self.mapper.execute(
            select(MLModel).where(and_(*conditions)).order_by(MLModel.id.desc())
        )
        rows = result.scalars().all()
        if not rows:
            return []
        notebook_names = await self._get_ml_model_notebook_names(project_id, rows)
        return [
            self._build_ml_model_response(
                m,
                notebook_names.get(int(m.notebook_id)) if m.notebook_id else None,
            )
            for m in rows
        ]

    async def get_ml_model_by_name_and_version(
            self, project_id: int, model_name: str, model_version: str,
    ) -> MlModelResponse:
        await validate_project_exists(await self.mapper.get_session(), project_id)
        result = await self.mapper.execute(
            select(MLModel).where(
                and_(
                    MLModel.project_id == project_id,
                    MLModel.name == model_name,
                    MLModel.model_version == model_version,
                )
            )
        )
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"项目中不存在机器学习模型「{model_name}」版本「{model_version}」"
                ),
            )
        notebook_name = None
        if (
            (m.source_type or "").strip().lower() == ModelRegisterSourceType.NOTEBOOK.value
            and m.notebook_id
        ):
            notebook_name = (
                await self._get_ml_model_notebook_names(project_id, [m])
            ).get(int(m.notebook_id))
        return self._build_ml_model_response(m, notebook_name)

    async def _resolve_ml_chunk_upload_source(
        self,
        upload_id: str,
        expected_file_name: str,
        *,
        allowed_suffixes: Optional[Tuple[str, ...]] = None,
    ) -> str:
        """校验分片上传已合并且文件名符合预期，返回 JuiceFS 源路径。"""
        uid = upload_id.strip()
        sess_res = await self.mapper.execute(
            select(ChunkUploadSession).where(ChunkUploadSession.upload_id == uid)
        )
        session = sess_res.scalar_one_or_none()
        if not session or not session.is_complete:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="分片上传会话不存在或尚未合并完成，请先完成合并",
            )
        jfs = await self.storage.JUICEFS_CLIENT()
        src = (session.file_url or "").strip()
        if not src or not jfs.exists(src):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="分片上传源文件不存在，请重新上传并合并",
            )
        try:
            src_stat = jfs.stat(src)
        except OSError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="分片上传源路径无效，请重新上传并合并",
            )
        if (src_stat.st_mode & 0o40000) != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"分片上传源路径为目录，应为单个 {expected_file_name} 文件",
            )
        fname = os.path.basename((session.file_name or "").strip()).lower()
        if allowed_suffixes:
            normalized_suffixes = tuple(suffix.lower() for suffix in allowed_suffixes)
            if not any(fname.endswith(suffix) for suffix in normalized_suffixes):
                suffix_desc = " 或 ".join(normalized_suffixes)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"本地上传文件名必须以 {suffix_desc} 结尾",
                )
        elif fname != expected_file_name.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"本地上传文件名必须为 {expected_file_name}",
            )
        return src

    async def _resolve_ml_local_upload_sources(
            self, upload_id: str, tokenizer_upload_id: Optional[str] = None
    ) -> Tuple[str, Optional[str]]:
        """校验并返回本地上传的 .pt 模型文件与可选 tokenizer.json 源路径。"""
        model_source_path = await self._resolve_ml_chunk_upload_source(
            upload_id,
            "model.pt",
            allowed_suffixes=(".pt",),
        )
        tokenizer_source_path = None
        if (tokenizer_upload_id or "").strip():
            tokenizer_source_path = await self._resolve_ml_chunk_upload_source(
                tokenizer_upload_id, "tokenizer.json"
            )
        return model_source_path, tokenizer_source_path

    async def create_ml_model(
            self, current_user: JwtUserInfo, project_id: int, body: MlModelCreate
    ) -> MlModelResponse:
        await validate_project_exists(await self.mapper.get_session(), project_id)
        dup = await self.mapper.query_one(
            select(MLModel.id).where(
                and_(MLModel.project_id == project_id, MLModel.name == body.name)
            ).limit(1)
        )
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"项目中已存在同名机器学习模型「{body.name}」，请更换名称；"
                    "若需迭代请对该模型使用「新增版本」。"
                ),
            )
        if body.task_type is not None:
            self.ensure_ml_task_scripts_present_http(body.task_type.value)
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        if body.source_type == "local_upload":
            uid = (body.upload_id or "").strip()
            tokenizer_uid = (body.tokenizer_upload_id or "").strip()
            if body.model_type == MlModelType.TEXT and not tokenizer_uid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="文本类型机器学习模型本地上传时必须提供 tokenizer_upload_id",
                )
            source_path, tokenizer_source_path = await self._resolve_ml_local_upload_sources(uid, tokenizer_uid)
            sync_path = "model.pt"
            tokenizer_sync_path = "tokenizer.json" if tokenizer_source_path else None
            source_ref_for_db = uid
            # 与 source_ref 对称：本地上传时持久化 tokenizer 分片 merge 的 uploadId，便于详情/列表回显
            tokenizer_source_ref_for_db = tokenizer_uid or None
            notebook_id_for_db = None
        else:
            await validate_notebook_exists(self.mapper, body.notebook_id)
            source_path, sync_path, tokenizer_source_path, tokenizer_sync_path = await self.register_ml_model(
                namespace,
                project_id,
                body.notebook_id,
                body.source_ref,
                tokenizer_notebook_path=body.tokenizer_source_ref,
                need_tokenizer=body.model_type == MlModelType.TEXT,
            )
            source_ref_for_db = body.source_ref
            tokenizer_source_ref_for_db = body.tokenizer_source_ref
            notebook_id_for_db = body.notebook_id
        model_version = "V1"
        ml = MLModel(
            name=body.name,
            model_version=model_version,
            description=body.description,
            project_id=project_id,
            model_type=body.model_type.value,
            annotation_type=body.annotation_type.value,
            task_type=body.task_type.value if body.task_type else None,
            source_type=body.source_type or "notebook",
            notebook_id=notebook_id_for_db,
            source_ref=source_ref_for_db,
            tokenizer_source_ref=tokenizer_source_ref_for_db,
            network_structure=body.network_structure,
            status=TaskStatus.CREATING.value,
            created_id=current_user.userId,
            created_by=current_user.username,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        await self.mapper.insert(ml)
        await self.mapper.flush()

        path = f"{StoragePath.ML_MODEL.format_storage_path(namespace=namespace, model_id=ml.id)}{sync_path}"
        tokenizer_path = (
            f"{StoragePath.ML_MODEL.format_storage_path(namespace=namespace, model_id=ml.id)}{tokenizer_sync_path}"
            if tokenizer_sync_path else None
        )
        ml.artifact_uri = path
        ml.tokenizer_uri = tokenizer_path
        await self.mapper.update_by_id(ml.id, ml)

        # 复制模型到目标路径
        from app.tasks.model_storage_tasks import copy_registered_model_artifacts_async
        copy_pairs = [(source_path, path)]
        if tokenizer_source_path and tokenizer_path:
            copy_pairs.append((tokenizer_source_path, tokenizer_path))
        copy_registered_model_artifacts_async.apply_async(
            args=[copy_pairs, get_tenant_id()],
            kwargs={"ml_model_id": ml.id},
        )
        logger.info(
            "ML 模型注册：source_type=%s ref=%s -> %s",
            body.source_type,
            source_ref_for_db,
            path,
        )

        return MlModelResponse(
            id=ml.id,
            name=ml.name,
            model_version=ml.model_version,
            description=ml.description,
            project_id=ml.project_id,
            model_type=ml.model_type,
            annotation_type=(ml.annotation_type or ""),
            task_type=ml.task_type,
            source_type=ml.source_type,
            notebook_id=ml.notebook_id,
            source_ref=ml.source_ref,
            tokenizer_source_ref=ml.tokenizer_source_ref,
            network_structure=ml.network_structure,
            artifact_uri=path,
            tokenizer_uri=tokenizer_path,
            status=ml.status,
            created_id=ml.created_id,
            created_by=ml.created_by,
            created_at=to_local_tz(ml.created_at),
            updated_at=to_local_tz(ml.updated_at),
        )

    async def add_ml_model_version(
            self, current_user: JwtUserInfo, project_id: int, model_name: str, body: MlModelVersionCreate
    ) -> MlModelResponse:
        await validate_project_exists(await self.mapper.get_session(), project_id)
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        existing = await self.mapper.execute(
            select(MLModel).where(
                and_(MLModel.project_id == project_id, MLModel.name == model_name)
            ).limit(1)
        )
        first_row = existing.scalars().first()
        if not first_row:
            raise HTTPException(status_code=404, detail=f"项目中不存在名为 '{model_name}' 的机器学习模型")

        if body.source_type == "local_upload":
            uid = (body.upload_id or "").strip()
            tokenizer_uid = (body.tokenizer_upload_id or "").strip()
            if first_row.model_type == MlModelType.TEXT.value and not tokenizer_uid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="文本类型机器学习模型本地上传新版本时必须提供 tokenizer_upload_id",
                )
            source_path, tokenizer_source_path = await self._resolve_ml_local_upload_sources(uid, tokenizer_uid)
            sync_path = "model.pt"
            tokenizer_sync_path = "tokenizer.json" if tokenizer_source_path else None
            source_ref_for_db = uid
            tokenizer_source_ref_for_db = tokenizer_uid or None
            notebook_id_for_db = None
        else:
            await validate_notebook_exists(self.mapper, body.notebook_id)
            if first_row.model_type == MlModelType.TEXT.value and not (body.tokenizer_source_ref or "").strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="文本模型 Notebook 来源必须提供 tokenizer_source_ref",
                )
            source_path, sync_path, tokenizer_source_path, tokenizer_sync_path = await self.register_ml_model(
                namespace,
                project_id,
                body.notebook_id,
                body.source_ref,
                tokenizer_notebook_path=body.tokenizer_source_ref,
                need_tokenizer=first_row.model_type == MlModelType.TEXT.value,
            )
            source_ref_for_db = body.source_ref
            tokenizer_source_ref_for_db = body.tokenizer_source_ref
            notebook_id_for_db = body.notebook_id

        result = await self.mapper.execute(
            select(MLModel.model_version).where(
                and_(MLModel.project_id == project_id, MLModel.name == model_name)
            )
        )
        next_ver = self._next_ml_model_version(result.scalars().all())
        ml = MLModel(
            name=model_name,
            model_version=next_ver,
            description=body.description,
            project_id=project_id,
            model_type=first_row.model_type,
            annotation_type=first_row.annotation_type,
            task_type=first_row.task_type,
            source_type=body.source_type,
            notebook_id=notebook_id_for_db,
            source_ref=source_ref_for_db,
            tokenizer_source_ref=tokenizer_source_ref_for_db,
            network_structure=body.network_structure,
            status=TaskStatus.CREATING.value,
            created_id=current_user.userId,
            created_by=current_user.username,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        await self.mapper.insert(ml)
        await self.mapper.flush()
        path = f"{StoragePath.ML_MODEL.format_storage_path(namespace=namespace, model_id=ml.id)}{sync_path}"
        tokenizer_path = (
            f"{StoragePath.ML_MODEL.format_storage_path(namespace=namespace, model_id=ml.id)}{tokenizer_sync_path}"
            if tokenizer_sync_path else None
        )
        ml.artifact_uri = path
        ml.tokenizer_uri = tokenizer_path
        await self.mapper.update_by_id(ml.id, ml)

        # 复制模型到目标路径
        from app.tasks.model_storage_tasks import copy_registered_model_artifacts_async
        copy_pairs = [(source_path, path)]
        if tokenizer_source_path and tokenizer_path:
            copy_pairs.append((tokenizer_source_path, tokenizer_path))
        copy_registered_model_artifacts_async.apply_async(
            args=[copy_pairs, get_tenant_id()],
            kwargs={"ml_model_id": ml.id},
        )
        logger.info(
            "ML 模型新版本：source_type=%s ref=%s -> %s",
            body.source_type,
            source_ref_for_db,
            path,
        )

        return MlModelResponse(
            id=ml.id,
            name=ml.name,
            model_version=ml.model_version,
            description=ml.description,
            project_id=ml.project_id,
            model_type=ml.model_type,
            annotation_type=(ml.annotation_type or ""),
            task_type=ml.task_type,
            source_type=ml.source_type,
            notebook_id=ml.notebook_id,
            source_ref=ml.source_ref,
            tokenizer_source_ref=ml.tokenizer_source_ref,
            network_structure=ml.network_structure,
            artifact_uri=path,
            tokenizer_uri=tokenizer_path,
            status=ml.status,
            created_id=ml.created_id,
            created_by=ml.created_by,
            created_at=to_local_tz(ml.created_at),
            updated_at=to_local_tz(ml.updated_at),
        )

    async def update_ml_model_version(
            self, current_user: JwtUserInfo, ml_model_id: int, body: MlModelUpdate
    ) -> MlModelResponse:
        result = await self.mapper.execute(select(MLModel).where(MLModel.id == ml_model_id))
        ml = result.scalar_one_or_none()
        if not ml:
            raise HTTPException(status_code=404, detail="机器学习模型版本不存在")
        if ml.status != TaskStatus.FAILED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"仅「失败」状态的机器学习模型版本允许编辑，当前状态为：{ml.status}",
            )
        if body.description is not None:
            ml.description = body.description
        if body.network_structure is not None:
            ml.network_structure = body.network_structure

        wants_source = bool(
            (body.source_type and body.source_type.strip())
            or body.notebook_id is not None
            or body.source_ref is not None
            or body.tokenizer_source_ref is not None
            or (body.upload_id or "").strip()
            or (body.tokenizer_upload_id or "").strip()
        )
        if wants_source:
            st_raw = (body.source_type or "").strip().lower()
            uid = (body.upload_id or "").strip()
            tokenizer_uid = (body.tokenizer_upload_id or "").strip()
            if st_raw:
                effective_st = st_raw
            elif uid:
                effective_st = "local_upload"
            elif tokenizer_uid and (ml.source_type or "").strip().lower() == "local_upload":
                effective_st = "local_upload"
                uid = (ml.source_ref or "").strip()
            else:
                effective_st = (ml.source_type or "notebook").strip().lower()

            if effective_st not in ("notebook", "local_upload"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="source_type 须为 notebook 或 local_upload",
                )

            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{ml.project_id}"

            if effective_st == "local_upload":
                is_text_model = ml.model_type == MlModelType.TEXT.value
                if not uid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="本地上传来源须提供有效的 upload_id（.pt 模型文件的分片合并 ID）",
                    )
                if is_text_model and not tokenizer_uid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="本地上传来源须提供有效的 tokenizer_upload_id（tokenizer.json 的分片合并 ID）",
                    )
                if body.notebook_id is not None or (
                    body.source_ref is not None and (body.source_ref or "").strip()
                ) or (
                    body.tokenizer_source_ref is not None and (body.tokenizer_source_ref or "").strip()
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="本地上传来源请勿同时传递 notebook_id、source_ref 或 tokenizer_source_ref",
                    )
                source_path, tokenizer_source_path = await self._resolve_ml_local_upload_sources(uid, tokenizer_uid)
                sync_path = "model.pt"
                tokenizer_sync_path = "tokenizer.json" if tokenizer_source_path else None
                source_ref_for_db = uid
                tokenizer_source_ref_for_db = tokenizer_uid or None
                notebook_id_for_db = None
            else:
                if uid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Notebook 来源请勿填写 upload_id（.pt 模型文件）",
                    )
                if tokenizer_uid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Notebook 来源的 tokenizer 须使用 tokenizer_source_ref（工作区路径），勿传 tokenizer_upload_id",
                    )
                nid = body.notebook_id if body.notebook_id is not None else ml.notebook_id
                ref = (
                    body.source_ref
                    if body.source_ref is not None
                    else (ml.source_ref or "")
                )
                tokenizer_ref = (
                    body.tokenizer_source_ref
                    if body.tokenizer_source_ref is not None
                    else (ml.tokenizer_source_ref or "")
                )
                ref = (ref or "").strip()
                tokenizer_ref = (tokenizer_ref or "").strip()
                if nid is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Notebook 来源时 notebook_id 不能为空",
                    )
                if not ref:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Notebook 来源时 source_ref 不能为空",
                    )
                if ml.model_type == MlModelType.TEXT.value and not tokenizer_ref:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="文本类型机器学习模型的 Notebook 来源必须提供 tokenizer_source_ref",
                    )
                await validate_notebook_exists(self.mapper, nid)
                source_path, sync_path, tokenizer_source_path, tokenizer_sync_path = await self.register_ml_model(
                    namespace,
                    ml.project_id,
                    nid,
                    ref,
                    tokenizer_notebook_path=tokenizer_ref,
                    need_tokenizer=ml.model_type == MlModelType.TEXT.value,
                )
                source_ref_for_db = ref
                tokenizer_source_ref_for_db = tokenizer_ref or None
                notebook_id_for_db = nid

            ml.source_type = effective_st
            ml.notebook_id = notebook_id_for_db
            ml.source_ref = source_ref_for_db
            ml.tokenizer_source_ref = tokenizer_source_ref_for_db
            path = f"{StoragePath.ML_MODEL.format_storage_path(namespace=namespace, model_id=ml.id)}{sync_path}"
            tokenizer_path = (
                f"{StoragePath.ML_MODEL.format_storage_path(namespace=namespace, model_id=ml.id)}{tokenizer_sync_path}"
                if tokenizer_sync_path else None
            )
            ml.artifact_uri = path
            ml.tokenizer_uri = tokenizer_path
            ml.status = TaskStatus.CREATING.value
            ml.updated_at = datetime.now()

            from app.tasks.model_storage_tasks import copy_registered_model_artifacts_async

            copy_pairs = [(source_path, path)]
            if tokenizer_source_path and tokenizer_path:
                copy_pairs.append((tokenizer_source_path, tokenizer_path))
            copy_registered_model_artifacts_async.apply_async(
                args=[copy_pairs, get_tenant_id()],
                kwargs={"ml_model_id": ml.id},
            )
            logger.info(
                "ML 模型版本更新来源：ml_id=%s source_type=%s ref=%s -> %s",
                ml.id,
                effective_st,
                source_ref_for_db,
                path,
            )

        await self.mapper.commit()
        await self.mapper.refresh(ml)
        return MlModelResponse(
            id=ml.id,
            name=ml.name,
            model_version=ml.model_version,
            description=ml.description,
            project_id=ml.project_id,
            model_type=ml.model_type,
            annotation_type=(ml.annotation_type or ""),
            task_type=ml.task_type,
            source_type=ml.source_type,
            notebook_id=ml.notebook_id,
            source_ref=ml.source_ref,
            tokenizer_source_ref=ml.tokenizer_source_ref,
            network_structure=ml.network_structure,
            artifact_uri=ml.artifact_uri,
            tokenizer_uri=ml.tokenizer_uri,
            status=ml.status,
            created_id=ml.created_id,
            created_by=ml.created_by,
            created_at=to_local_tz(ml.created_at),
            updated_at=to_local_tz(ml.updated_at),
        )

    async def delete_ml_model(
            self, project_id: int, model_name: str, model_version: Optional[str] = None
    ) -> None:
        await validate_project_exists(await self.mapper.get_session(), project_id)
        ver = (model_version or "").strip()
        if ver:
            result = await self.mapper.execute(
                select(MLModel).where(
                    and_(
                        MLModel.project_id == project_id,
                        MLModel.name == model_name,
                        MLModel.model_version == ver,
                    )
                )
            )
            row = result.scalar_one_or_none()
            if not row:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"项目中不存在模型「{model_name}」的版本「{ver}」，"
                        "请确认版本号（如 V1、V2）"
                    ),
                )
            await self.mapper.delete(row)
            # 清理已复制的文件
            try:
                if row.artifact_uri:
                    jfs = await self.storage.JUICEFS_CLIENT()
                    artifact_dir = os.path.dirname(row.artifact_uri.rstrip("/"))
                    try:
                        jfs.rmr(artifact_dir)
                    except Exception:
                        # 兼容：如果不是目录或 rmr 失败，尝试按文件删除
                        jfs.remove(row.artifact_uri)
                        if row.tokenizer_uri:
                            try:
                                jfs.remove(row.tokenizer_uri)
                            except Exception:
                                pass
            except Exception as cleanup_error:
                logger.error(f"清理已复制文件时发生错误: {str(cleanup_error)}")
        else:
            result = await self.mapper.execute(
                select(MLModel).where(
                    and_(MLModel.project_id == project_id, MLModel.name == model_name)
                )
            )
            rows = result.scalars().all()
            if not rows:
                raise HTTPException(
                    status_code=404,
                    detail=f"项目中不存在名为 '{model_name}' 的机器学习模型",
                )
            for row in rows:
                await self.mapper.delete(row)
                # 清理已复制的文件
                try:
                    if row.artifact_uri:
                        jfs = await self.storage.JUICEFS_CLIENT()
                        artifact_dir = os.path.dirname(row.artifact_uri.rstrip("/"))
                        try:
                            jfs.rmr(artifact_dir)
                        except Exception:
                            # 兼容：如果不是目录或 rmr 失败，尝试按文件删除
                            jfs.remove(row.artifact_uri)
                            if row.tokenizer_uri:
                                try:
                                    jfs.remove(row.tokenizer_uri)
                                except Exception:
                                    pass
                except Exception as cleanup_error:
                    logger.error(f"清理已复制文件时发生错误: {str(cleanup_error)}")
        await self.mapper.commit()

    async def get_ml_model_by_id(self, ml_model_id: int) -> Optional[MLModel]:
        result = await self.mapper.execute(select(MLModel).where(MLModel.id == ml_model_id))
        return result.scalar_one_or_none()

    async def download_ml_demo_sample_zip(
        self, project_id: int, ml_task_type: str
    ) -> Tuple[bytes, str]:
        """从本机代码仓库 `scripts/{ml_task_type}/` 递归打包为 zip（服务运行所在机器上的项目目录）。"""
        await self._validate_project(project_id)
        local_demo_root = self.ensure_ml_task_scripts_present_http(
            ml_task_type, required=True
        )
        raw = (ml_task_type or "").strip()

        def _build_zip() -> bytes:
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for path in sorted(local_demo_root.rglob("*"), key=lambda p: str(p)):
                    if path.is_file():
                        rel = path.relative_to(local_demo_root)
                        arc = str(rel).replace("\\", "/")
                        zf.writestr(arc, path.read_bytes())
            return buf.getvalue()

        zip_bytes = await asyncio.to_thread(_build_zip)
        safe_fn = re.sub(r"[^a-zA-Z0-9_.\-]+", "_", raw)[:80] or "demo"
        filename = f"ml-demo-{safe_fn}.zip"
        return zip_bytes, filename

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
            **kwargs
    ) -> None:
        trained_model = await self.mapper.query_one(select(TrainedModel).where(TrainedModel.id == trained_model_id))
        if not trained_model:
            raise HTTPException(status_code=404, detail=f"训练模型不存在: {trained_model_id}")

        # 判断是否没有租户信息
        if not get_tenant_id():
            set_tenant_id(trained_model.tenant_id)
        if source_path and target_path:
            from app.tasks.model_storage_tasks import copy_registered_model_async
            copy_registered_model_async.apply_async(
                args=[source_path, target_path, trained_model.tenant_id, trained_model.id]
            )

        training_method_type = kwargs.get("training_method_type")
        is_grpo = self._is_grpo_training_method(training_method_type)
        if is_lora or is_grpo:
            k8s_uuid = str(uuid.uuid4())
            target_path_lora = None
            if is_lora and not is_grpo:
                lora_payload = type("LoraPayload", (), {})()
                lora_payload.task_id = task_id
                lora_payload.checkpoint = checkpoint
                lora_payload.name = name
                lora_payload.model_version = model_version or "v1"
                lora_payload.base_model_name = base_model_name
                lora_payload.model_provider = model_provider
                lora_payload.graphics_card_resource = graphics_card_resource
                lora_payload.model_source = kwargs.get("model_source")
                lora_payload.trained_model_id = kwargs.get("source_trained_model_id") or kwargs.get("trained_model_id")
                lora_payload.trained_model_name = kwargs.get("source_trained_model_name") or kwargs.get("trained_model_name")
                lora_payload.trained_model_version = kwargs.get("source_trained_model_version") or kwargs.get("trained_model_version")

                if isinstance(graphics_card_resource, dict):
                    lora_payload.graphics_card_resource = GraphicsCardResourceConfig(**graphics_card_resource) if graphics_card_resource else None

                target_path_lora = await register_trained_model_lora(
                    storage=self.storage,
                    namespace=namespace,
                    trained_model=lora_payload,
                    trained_id=trained_model.id
                )
            elif is_grpo:
                source_checkpoint_path = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
                    namespace=namespace,
                    task_id=task_id,
                ) + str(checkpoint or "").strip().strip("/")
                jfs = await self.storage.JUICEFS_CLIENT()
                if not jfs.exists(source_checkpoint_path):
                    raise HTTPException(
                        status_code=404,
                        detail=f"GRPO训练任务输出模型不存在: {source_checkpoint_path}"
                    )
                target_path_lora = target_path or trained_model.model_path or self._build_merge_trained_model_path(
                    namespace,
                    name or trained_model.name,
                    model_version or trained_model.model_version or "v1",
                )
                if jfs.exists(target_path_lora):
                    raise HTTPException(
                        status_code=409,
                        detail=f"注册模型已存在: {target_path_lora}"
                    )
                target_dir = os.path.dirname(target_path_lora)
                if target_dir and not jfs.exists(target_dir):
                    jfs.makedirs(target_dir, exist_ok=True)
            values_to_update = {"lab_k8s_uuid": k8s_uuid}
            # 兼容历史数据：仅当 model_path 为空时回填，避免运行期再切换路径
            if not trained_model.model_path:
                values_to_update["model_path"] = target_path_lora
            await self.mapper.execute(
                update(TrainedModel)
                .where(TrainedModel.id == trained_model.id)
                .values(**values_to_update)
            )
            await self.mapper.commit()

            trained_model = await self.mapper.query_one(select(TrainedModel).where(TrainedModel.id == trained_model_id))
            await self.start_training_merge_job_impl(trained_model, k8s_uuid, namespace)
    
    async def create_trained_model(
            self, current_user: JwtUserInfo, trained_model: TrainedModelCreate
    ) -> TrainedModel:
        # 验证项目是否存在
        if trained_model.project_id:
            await validate_project_exists(await self.mapper.get_session(), trained_model.project_id)

        # 验证基础模型是否存在（如果提供了base_model_id）
        if trained_model.base_model_id:
            await validate_base_model_exists(self.mapper, trained_model.base_model_id)

        # 验证notebook任务
        if trained_model.model_source_type == ModelRegisterSourceType.NOTEBOOK.value and trained_model.notebook_id:
            await validate_notebook_exists(self.mapper, trained_model.notebook_id)
            #校验是否是可用的模型
            jfs_client = await self.storage.JUICEFS_CLIENT()
            model_info = await validate_llm_models_available(self.mapper, jfs_client, trained_model.notebook_id, trained_model.notebook_path)
            logger.info(f"notebook文件地址：{trained_model.notebook_path}，model_info:{model_info}")
            if not model_info.get("is_model"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"选择的文件不是可用模型：{trained_model.notebook_path}"
                )

        # 验证训练任务是否存在（如果提供了task_id或task_name和task_version）

        task_fine_tuning_type = None
        task_training_method_type = None
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
            task_training_method_type = task.training_type.get("train_method_type")
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
            task_training_method_type = task.training_type.get("train_method_type")

        is_lora = bool(task_fine_tuning_type and task_fine_tuning_type == FineTuningType.LORA.value)
        requires_merge_job = self._requires_training_merge_job(task_fine_tuning_type, task_training_method_type)
        if requires_merge_job and not trained_model.graphics_card_resource:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="LoRA/GRPO 模型合并必须填写资源配置"
            )
        if not requires_merge_job:
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

        # 注册训练模型（移动文件）
        target_path = None
        source_path = None
        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"


        task_status = None
        if trained_model.task_name and trained_model.task_version:
            if requires_merge_job:
                target_path = self._build_merge_trained_model_path(
                    namespace,
                    trained_model.name,
                    trained_model.model_version or "v1",
                )
                task_status = TaskStatus.SCHEDULED_PENDING.value if trained_model.schedule_at else TaskStatus.CREATED.value
            else:
                source_path, target_path = await register_trained_model(
                    storage=self.storage,
                    namespace=namespace,
                    task_id=trained_model.task_id,
                    task_name=trained_model.task_name,
                    task_version=trained_model.task_version,
                    checkpoint_name=trained_model.checkpoint,
                    model_name=trained_model.name,
                    model_version=trained_model.model_version or "v1",
                    return_paths=True,
                )
                task_status = TaskStatus.SCHEDULED_PENDING.value if trained_model.schedule_at else TaskStatus.CREATED.value
        elif trained_model.model_source_type == ModelRegisterSourceType.NOTEBOOK.value and trained_model.notebook_id:
            source_path, target_path = await register_trained_model(
                storage=self.storage,
                namespace=namespace,
                task_id=trained_model.task_id,
                task_name=trained_model.task_name,
                task_version=trained_model.task_version,
                checkpoint_name=trained_model.checkpoint,
                model_name=trained_model.name,
                model_version=trained_model.model_version or "v1",
                return_paths=True,
                model_source_type=trained_model.model_source_type,
                notebook_id=trained_model.notebook_id,
                notebook_path=trained_model.notebook_path
            )
            task_status = TaskStatus.CREATED.value
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
                "source_path": source_path,
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
                "notebook_id": trained_model.notebook_id,
                "notebook_name": trained_model.notebook_name,
                "model_source_type": trained_model.model_source_type,
                "notebook_path": trained_model.notebook_path,
                "training_method_type": task_training_method_type,
            }

            # if trained_model.schedule_at:
            #     execution = TaskExecution(
            #         business_type=TaskExecutionBusinessType.TRAINED_MODEL.value,
            #         business_id=mapper_trained_model.id,
            #         schedule_at=trained_model.schedule_at,
            #         status=TaskExecutionStatus.PENDING.value,
            #         executor=TaskExecutionExecutor.TRAINED_MODEL.value,
            #         method=TaskExecutionMethod.START.value,
            #         kwargs=post_kwargs
            #     )
            #     await self.mapper.insert(execution)
            #     await self.mapper.commit()
            # else:
            #     await self.run_create_trained_model_post_process(
            #         trained_model_id=mapper_trained_model.id,
            #         **post_kwargs
            #     )
            if not requires_merge_job:
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
            # 如果数据库操作失败，删除已创建的软链接
            if target_path:
                try:
                    await unregister_trained_model(self.storage, target_path)
                    logger.info(f"已清理创建失败的注册模型: {target_path}")
                except Exception as cleanup_error:
                    logger.error(f"清理注册模型失败: {str(cleanup_error)}")

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"创建训练模型失败: {str(e)}"
            )

    async def update_trained_model(
            self, current_user: JwtUserInfo, trained_model_id: int, trained_model: TrainedModelCreate
    ) -> TrainedModel:
        """编辑训练模型（参数与创建一致），并同步更新执行器定时任务"""
        if trained_model.project_id:
            await validate_project_exists(await self.mapper.get_session(), trained_model.project_id)

        db_model = await self.mapper.query_one(
            select(TrainedModel).where(
                TrainedModel.id == trained_model_id,
                TrainedModel.project_id == trained_model.project_id
            )
        )
        if not db_model:
            raise HTTPException(status_code=404, detail=f"训练模型不存在: {trained_model_id}")

        if db_model.status not in [
            TaskStatus.CREATED.value,
            TaskStatus.SCHEDULED_PENDING.value,
            TaskStatus.FAILED.value,
            TaskStatus.TERMINATED.value
        ]:
            raise HTTPException(status_code=400, detail=f"当前模型状态为 {db_model.status}，不允许编辑")

        if trained_model.base_model_id:
            await validate_base_model_exists(self.mapper, trained_model.base_model_id)

            # 验证notebook任务
            if trained_model.model_source_type == ModelRegisterSourceType.NOTEBOOK.value and trained_model.notebook_id:
                await validate_notebook_exists(self.mapper, trained_model.notebook_id)
                # 校验是否是可用的模型
                jfs_client = await self.storage.JUICEFS_CLIENT()
                model_info = await validate_llm_models_available(self.mapper, jfs_client, trained_model.notebook_id,
                                                                 trained_model.notebook_path)
                logger.info(f"notebook文件地址：{trained_model.notebook_path}，model_info:{model_info}")
                if not model_info.get("is_model"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"选择的文件不是可用模型：{trained_model.notebook_path}"
                    )

        task_fine_tuning_type = None
        task_training_method_type = None
        task = None
        if trained_model.task_id:
            task = await validate_training_task_exists(self.mapper, trained_model.task_id)
            if trained_model.task_name and trained_model.task_version:
                if task.name != trained_model.task_name or task.version != trained_model.task_version:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="训练任务ID与任务名称/版本不匹配"
                    )
            task_fine_tuning_type = task.training_type.get("fine_tuning_type", "")
            task_training_method_type = task.training_type.get("train_method_type")
            trained_model.model_provider = task.base_model.get("model_provider", ModelProvider.QWEN.value)
        elif trained_model.task_name and trained_model.task_version:
            task = await validate_training_task_by_name_version(
                self.mapper,
                trained_model.project_id,
                trained_model.task_name,
                trained_model.task_version
            )
            task_fine_tuning_type = task.training_type.get("fine_tuning_type", "")
            task_training_method_type = task.training_type.get("train_method_type")

        if (trained_model.task_id or (trained_model.task_name and trained_model.task_version)) and not trained_model.checkpoint:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="从训练任务创建模型时，必须指定checkpoint"
            )

        if trained_model.task_name and trained_model.task_version:
            existing_models_list = await self.mapper.query(
                select(TrainedModel).where(
                    and_(
                        TrainedModel.project_id == trained_model.project_id,
                        TrainedModel.task_name == trained_model.task_name,
                        TrainedModel.task_version == trained_model.task_version,
                        TrainedModel.checkpoint == trained_model.checkpoint,
                        TrainedModel.id != trained_model_id
                    )
                )
            )
            if existing_models_list:
                existing_model_info = [f"{model.name} {model.model_version}" for model in existing_models_list]
                existing_models_str = "、".join(existing_model_info)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"训练任务 {trained_model.task_name} {trained_model.task_version} 的检查点 {trained_model.checkpoint} 已被注册为训练模型：{existing_models_str}。无需重复创建，您可以直接使用已有的训练模型。"
                )

        project = await self.mapper.query_one(select(Project).filter(Project.id == trained_model.project_id))
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"
        is_lora = bool(task_fine_tuning_type and task_fine_tuning_type == FineTuningType.LORA.value)
        requires_merge_job = self._requires_training_merge_job(task_fine_tuning_type, task_training_method_type)
        if requires_merge_job and not trained_model.graphics_card_resource:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="LoRA/GRPO 模型合并必须填写资源配置"
            )
        if not requires_merge_job:
            trained_model.graphics_card_resource = None

        # 按创建参数覆盖业务数据
        db_model.name = trained_model.name
        db_model.description = trained_model.description
        db_model.model_type = trained_model.model_type.value if hasattr(trained_model.model_type, "value") else trained_model.model_type
        db_model.model_path = trained_model.model_path
        db_model.model_version = trained_model.model_version or "v1"
        db_model.task_id = trained_model.task_id
        db_model.task_name = trained_model.task_name
        db_model.task_version = trained_model.task_version
        db_model.base_model_id = trained_model.base_model_id
        db_model.base_model_name = trained_model.base_model_name
        db_model.checkpoint = trained_model.checkpoint
        db_model.notebook_id = trained_model.notebook_id
        db_model.notebook_name = trained_model.notebook_name
        db_model.model_source_type = trained_model.model_source_type
        db_model.notebook_path = trained_model.notebook_path
        db_model.schedule_at = trained_model.schedule_at if requires_merge_job else None
        db_model.graphics_card_resource = (
            trained_model.graphics_card_resource.model_dump()
            if trained_model.graphics_card_resource
            else None
        )
        db_model.status = (
            TaskStatus.SCHEDULED_PENDING.value if (requires_merge_job and trained_model.schedule_at) else TaskStatus.CREATED.value
        )
        db_model.started_at = None
        db_model.finished_at = None
        db_model.estimated_duration = None

        executions = await self.mapper.query(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.TRAINED_MODEL.value,
                TaskExecution.business_id == trained_model_id
            ).order_by(TaskExecution.created_at.desc())
        )
        execution = executions[0] if executions else None

        old_kwargs = execution.kwargs if (execution and isinstance(execution.kwargs, dict)) else {}
        source_path = old_kwargs.get("source_path")
        target_path = old_kwargs.get("target_path", db_model.model_path)

        # LoRA/GRPO 编辑时也要提前固定到注册目录，避免运行期仍指向训练原始目录导致误删
        if requires_merge_job:
            source_path = None
            target_path = self._build_merge_trained_model_path(
                namespace,
                trained_model.name,
                trained_model.model_version or "v1",
            )
            db_model.model_path = target_path

        # 切换到全参或notebook时，重建注册模型路径，保证可直接执行后处理
        if not requires_merge_job:
            source_path, target_path = await register_trained_model(
                storage=self.storage,
                namespace=namespace,
                task_id=trained_model.task_id,
                task_name=trained_model.task_name,
                task_version=trained_model.task_version,
                checkpoint_name=trained_model.checkpoint,
                model_name=trained_model.name,
                model_version=trained_model.model_version or "v1",
                return_paths=True,
                model_source_type=trained_model.model_source_type,
                notebook_id=trained_model.notebook_id,
                notebook_path=trained_model.notebook_path
            )
            db_model.model_path = target_path

        try:
            # 编辑，需要清理目标目录
            jfs = await self.storage.JUICEFS_CLIENT()
            if jfs.exists(db_model.model_path):
                jfs.rmr(db_model.model_path)
        except Exception as e:
            raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="编辑保存失败：无法清理模型数据"
                )

        post_kwargs = {
            "source_path": source_path,
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
            "notebook_id": trained_model.notebook_id,
            "notebook_name": trained_model.notebook_name,
            "model_source_type": trained_model.model_source_type,
            "notebook_path": trained_model.notebook_path,
            "training_method_type": task_training_method_type,
        }

        for item in executions:
            if item.status in [TaskExecutionStatus.RUNNING.value]:
                raise HTTPException(status_code=400, detail=f"执行任务状态为 {item.status}，不允许编辑")

        if requires_merge_job:
            if execution:
                execution.schedule_at = trained_model.schedule_at
                execution.status = TaskExecutionStatus.PENDING.value
                execution.executor = TaskExecutionExecutor.TRAINED_MODEL.value
                execution.method = TaskExecutionMethod.START.value
                execution.kwargs = post_kwargs
                execution.retry_count = 0
                execution.last_error = None
                execution.locked_at = None
                execution.locked_by = None
            else:
                execution = TaskExecution(
                    business_type=TaskExecutionBusinessType.TRAINED_MODEL.value,
                    business_id=trained_model_id,
                    schedule_at=trained_model.schedule_at,
                    status=TaskExecutionStatus.PENDING.value,
                    executor=TaskExecutionExecutor.TRAINED_MODEL.value,
                    method=TaskExecutionMethod.START.value,
                    kwargs=post_kwargs
                )
                await self.mapper.insert(execution)
            await self.mapper.commit()
        else:
            # 非GRPO全参与notebook编辑不走执行器：删除历史执行器记录后直接执行
            for item in executions:
                await self.mapper.delete(item)
            await self.mapper.commit()
            await self.run_create_trained_model_post_process(
                trained_model_id=trained_model_id,
                **post_kwargs
            )

        await self.mapper.refresh(db_model)
        return db_model

    async def delete_trained_model_all_versions(
            self, project_id: int, model_name: str
    ) -> None:
        # 验证项目存在
        await validate_project_exists(await self.mapper.get_session(), project_id)

        # 查询该模型名称下的所有版本
        models = await self.mapper.query(
            select(TrainedModel).where(
                TrainedModel.project_id == project_id,
                TrainedModel.name == model_name
            )
        )

        if not models:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{model_name}' 的训练模型"
            )

        # 检查是否有运行中的任务版本
        running_versions = [task.model_version for task in models if task.status == TaskStatus.RUNNING]
        if running_versions:
            raise HTTPException(
                status_code=400,
                detail=f"无法删除模型 '{model_name}'，以下版本正在运行中: {', '.join(running_versions)}"
            )

        # 检查是否有不允许删除的状态
        non_deletable_tasks = [
            task for task in models
            if task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                                   TaskStatus.TERMINATED.value, TaskStatus.FAILED.value, TaskStatus.COMPLETED.value]
        ]
        if non_deletable_tasks:
            non_deletable_versions = [f"{task.model_version}({task.status})" for task in non_deletable_tasks]
            raise HTTPException(
                status_code=400,
                detail=f"无法删除模型 '{model_name}'，以下版本状态不允许删除: {', '.join(non_deletable_versions)}"
            )

        # 删除所有版本的模型文件和数据库记录
        deleted_count = 0
        failed_models = []

        for model in models:
            try:
                # 删除模型文件（如果存在）
                if model.model_path:
                    try:
                        success = await unregister_trained_model(self.storage, model.model_path)
                        if not success:
                            logger.warning(f"删除模型文件失败: {model.model_path}")
                    except Exception as file_error:
                        logger.warning(f"删除模型文件异常: {str(file_error)}")

                # 删除数据库记录
                await self.mapper.execute(delete(TrainedModel).filter(TrainedModel.id == model.id))
                deleted_count += 1
                logger.info(f"成功删除训练模型版本: {model.name} v{model.model_version}")

            except Exception as e:
                logger.error(f"删除训练模型版本失败: {model.name} v{model.model_version}, 错误: {str(e)}")
                failed_models.append(f"{model.name} v{model.model_version}")
                # 不删除数据库记录，保持数据一致性

        # 提交数据库更改
        await self.mapper.commit()

        if failed_models:
            raise HTTPException(
                status_code=500,
                detail=f"部分训练模型删除失败: {', '.join(failed_models)}"
            )

        logger.info(f"成功删除训练模型 '{model_name}' 的所有 {deleted_count} 个版本")

    async def delete_single_trained_model(
            self, project_id: int, model_name: str, version: str
    ) -> None:
        # 验证项目存在
        await validate_project_exists(await self.mapper.get_session(), project_id)

        # 查询训练模型，确保属于指定项目、模型名称和版本
        trained_model = await self.mapper.query_one(
            select(TrainedModel).where(
                TrainedModel.project_id == project_id,
                TrainedModel.name == model_name,
                TrainedModel.model_version == version
            )
        )

        if not trained_model:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在版本为 '{version}' 的训练模型 '{model_name}'"
            )

        # 只有已创建/定时待启动/已完成/失败/已终止的任务可以进行删除
        if trained_model.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                               TaskStatus.TERMINATED.value, TaskStatus.FAILED.value, TaskStatus.COMPLETED.value]:
            # status_desc = TrainingTaskStatus.get_description(task.status)
            raise HTTPException(
                status_code=400,
                detail=f"{trained_model.status}的模型不允许删除: {model_name} (版本: {version})"
            )

        try:
            # 先删除模型文件（如果存在）
            model_path = trained_model.model_path
            if model_path:
                try:
                    # 删除注册模型（软链接或实际目录）
                    success = await unregister_trained_model(self.storage, model_path)
                    if success:
                        logger.info(f"成功删除注册模型: {model_path}")
                    else:
                        logger.warning(f"删除注册模型失败: {model_path}")
                except Exception as file_error:
                    logger.warning(f"删除模型文件异常: {str(file_error)}")
                    # 文件删除失败不影响数据库记录删除

            # 删除数据库记录
            await self.mapper.execute(delete(TrainedModel).filter(TrainedModel.id == trained_model.id))
            await self.mapper.commit()

            logger.info(f"成功删除训练模型: {model_name} v{version} (ID: {trained_model.id})")

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"删除训练模型失败: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"删除训练模型失败: {str(e)}"
            )

    async def stop_trained_model_task(
            self, project_id: int, task_id: int
    ) -> None:
        """终止训练模型任务，并按 Job 名删除 K8s 资源"""
        task = await self.validate_trained_model_task(task_id, project_id)

        # 与其它业务保持一致：仅允许运行中/排队中终止
        if task.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有运行中、排队中的任务才能终止"
            )

        task.status = TaskStatus.TERMINATED.value
        task.finished_at = datetime.now()
        if not task.started_at:
            task.started_at = task.created_at

        execution = await self.mapper.query_one(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.TRAINED_MODEL.value,
                TaskExecution.business_id == task_id
            ).order_by(TaskExecution.created_at.desc())
        )
        if execution and execution.status in [TaskExecutionStatus.PENDING.value, TaskExecutionStatus.RUNNING.value]:
            execution.status = TaskExecutionStatus.FAILED.value
            execution.last_error = "任务已被用户终止"
            execution.locked_at = None
            execution.locked_by = None

        await self.mapper.commit()
        logger.info(f"训练模型任务状态已更新为终止: task_id={task_id}")

        # 按 job 名删除 K8s 资源（LoRA merge 任务）
        try:
            res = await self.mapper.execute(
                select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
                .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                .where(ProjectKubernetesRelation.project_id == project_id)
            )
            row = res.first()
            if not row:
                logger.warning(f"项目 {project_id} 未绑定 K8s，跳过训练模型任务 Job 删除")
                return

            kubeconfig_str, k8s_namespace = row[0], row[1]
            launcher = K8sLauncher(config_str=kubeconfig_str)
            namespace = k8s_namespace or f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            job_name = f"loramerge-{task_id}"

            try:
                success = await launcher.delete_job(namespace=namespace, job_name=job_name)
                if success:
                    logger.info(f"成功删除训练模型任务 Job: {job_name}")
                else:
                    logger.warning(f"训练模型任务 Job 不存在或删除失败: {job_name}")
            except Exception as e:
                logger.error(f"删除训练模型任务 Job 失败: {job_name}, err={e}")
        except Exception as e:
            logger.error(f"终止训练模型任务时删除 K8s Job 失败: task_id={task_id}, err={e}")
        try:
            # 删除模型文件（如果存在）
            model_path = task.model_path
            if model_path:
                try:
                    # 删除注册模型（软链接或实际目录）
                    success = await unregister_trained_model(self.storage, model_path)
                    if success:
                        logger.info(f"成功删除注册模型: {model_path}")
                    else:
                        logger.warning(f"删除注册模型失败: {model_path}")
                except Exception as file_error:
                    logger.warning(f"删除模型文件异常: {str(file_error)}")
                    # 文件删除失败不影响数据库记录删除
        except Exception as e:
            logger.error(f"终止训练模型任务时删除注册模型失败: task_id={task_id}, err={e}")

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(TrainedModel).where(TrainedModel.id == id_field_value))

    async def get_base_model_by_id(self, base_model_id: int):
        """根据 ID 获取基础模型，不存在返回 None"""
        return await self.mapper.query_one(select(BaseModel).where(BaseModel.id == base_model_id))


    async def public_model_list(
            self,
            model_provider: ModelProvider,
            name: Optional[str]
    ) -> List[str]:
        """获取租户下未添加的基础模型，支持按模型类型筛选"""
        jfs_client = await self.storage.JUICEFS_CLIENT()
        base_path = StoragePath.BASE_MODELS.storage_path
        model_path = f'{base_path}{model_provider.value}'
        models = []
        try:
            # 列出模型目录
            model_entries = jfs_client.listdir(model_path, detail=True)
            for model_name, model_stat in model_entries:
                if not bool(model_stat.st_mode & 0o40000):  # 这里就是目录判断
                    continue
                if name and name not in model_name:
                    continue
                models.append(model_name)

            # 查询出已创建的基础模型
            db_models = await self.mapper.query(select(BaseModel).where(BaseModel.model_provider == model_provider.value))

            db_model_names = {m.name for m in db_models}
            # 去掉已存在的
            filtered = [m for m in models if m not in db_model_names]

            return filtered
        except Exception as e:
            logger.error(f"error: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"无法查询到对应提供商资源：{model_provider.value} 请确认是否配置模型权重: {str(e)}"
            )


    async def start_training_merge_job_impl(self, trained_model: TrainedModel, lab_k8s_uuid:str, namespace: str) -> str:
        """
        使用Kubernetes Job启动训练合并任务，返回Job名称。

        参数:
            task_id: 训练合并任务ID
            lab_k8s_uuid: 训练合并任务uuid
            namespace: 项目命名空间（用于构造挂载子路径）

        返回:
            Job名称
        """
        # from app.utils.k8s_utils import build_secret_storage_url
        from app.core.config import settings
        from app.core.logging import logger

        # 查询训练任务，获取GPU资源配置和项目ID
        from app.schemas.resource_config import GraphicsCardResourceConfig
        from app.schemas.repository_image import CardType, CardModel, ImageType
        from app.tasks.image_utils import find_image_with_fallback

        training_task = await self.mapper.query_one(select(TrainingTask).filter(TrainingTask.id == trained_model.task_id))
        if training_task is None:
            raise RuntimeError(f"训练任务不存在: {trained_model.task_id}")
        training_method_type = (training_task.training_type or {}).get("train_method_type")
        is_grpo = self._is_grpo_training_method(training_method_type)

        # 从数据库读取 graphics_card_resource，如果没有则从 gpu_count 构建（向后兼容）
        if training_task.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**training_task.graphics_card_resource)
        else:
            # 向后兼容：从 gpu_count 和环境变量构建
            logger.warning(
                f"训练任务 {training_task.name} (ID: {training_task.task_id}) 使用向后兼容逻辑："
                f"从 gpu_count={training_task.gpu_count} 构建 GraphicsCardResourceConfig，"
                f"建议更新数据库中的 graphics_card_resource 字段以包含完整的资源配置信息"
            )
            graphics_card_resource = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=int(getattr(training_task, "gpu_count", 0) or 0),
                card_memory=None,
                k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
            )

        # 查询集群 kubeconfig 与命名空间
        stmt = (
            select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
            .where(ProjectKubernetesRelation.project_id == trained_model.project_id)
        )
        stmt_query = await self.mapper.execute(stmt)
        row = stmt_query.first()
        if not row:
            raise RuntimeError(f"未绑定K8s集群或命名空间: project_id={trained_model.project_id}")
        kubeconfig_str, namespace = row[0], row[1]

        # 查找镜像逻辑
        card_type_str = (
            graphics_card_resource.card_type.value
            if isinstance(graphics_card_resource.card_type, Enum)
            else graphics_card_resource.card_type
        )
        card_model_str = (
            graphics_card_resource.card_model.value
            if isinstance(graphics_card_resource.card_model, Enum)
            else graphics_card_resource.card_model
        )
        if is_grpo:
            fallback_image = os.getenv("VERL_RAY_IMAGE", "lab-cn-guangzhou.cr.volces.com/fs/verl:v0.8.0-vllm")
            try:
                image = await find_image_with_fallback(
                    project_id=trained_model.project_id,
                    image_type=ImageType.TEXT_GENERATION_GRPO.value,
                    card_category=card_type_str,
                    card_model=card_model_str,
                    error_message_prefix="未找到匹配的GRPO模型合并镜像",
                )
            except RuntimeError as exc:
                logger.warning("使用默认GRPO模型合并镜像: %s, reason=%s", fallback_image, exc)
                image = fallback_image
        else:
            # 延迟导入以避免循环依赖（training_tasks 可能导入 model）
            from ...tasks.training_tasks import find_image as training_tasks_find_image
            image = await training_tasks_find_image(trained_model.project_id, card_type_str, card_model_str)

        # 初始化 K8s 启动器
        launcher = K8sLauncher(config_str=kubeconfig_str)

        # 构建卷与挂载（参考notebook的存储配置）
        storage_items = [
            {"name": "public-pvc", "enum": StoragePath.BASE_MODELS},
            {"name": "llm-training-pvc", "enum": StoragePath.UNREGISTERED_TRAINED_MODELS},
            {"name": "llm-training-pvc", "enum": StoragePath.MERGE_TRAINED_MODELS},
        ]
        volume_mounts, volumes = await launcher.build_storage_volumes(
            storage_items,
            namespace=namespace,
            task_id=trained_model.task_id,
        )
        # merge任务用不同的id
        storage_items_merge = [
            {"name": "llm-training-pvc", "enum": StoragePath.TRAINING_MERGE_CONFIGS}
        ]
        volume_mounts_merge, volumes_merge = await launcher.build_storage_volumes(
            storage_items_merge,
            namespace=namespace,
            task_id=trained_model.id,
        )
        volume_mounts.extend(volume_mounts_merge)
        # 构建亲和
        build_node_affinity(card_model=trained_model.graphics_card_resource.get("card_model",None),
                            card_memory=trained_model.graphics_card_resource.get("card_memory",None),
                            category=trained_model.graphics_card_resource.get("card_type",None))

        if is_grpo:
            actor_checkpoint_path = self._build_verl_actor_checkpoint_mount_path(trained_model.checkpoint)
            merge_target_path = self._build_merge_model_mount_path(
                trained_model.name,
                trained_model.model_version or "v1",
            )
            merge_command = (
                "set -euo pipefail; "
                "if [ -d /workspace/verl ]; then cd /workspace/verl; "
                "elif [ -d /home/ray/verl ]; then cd /home/ray/verl; fi; "
                "python scripts/legacy_model_merger.py merge "
                "--backend fsdp "
                f"--local_dir {shlex.quote(actor_checkpoint_path)} "
                f"--target_dir {shlex.quote(merge_target_path)}"
            )
            command = ["bash", "-lc"]
            args = [merge_command]
            working_dir = None
        else:
            command = ["llamafactory-cli"]
            args = ["export", "configs/merge_config.yaml"]
            working_dir = "/data"

        # 创建合并模型Job
        job_name = f"loramerge-{trained_model.id}"
        result = await launcher.create_job(
            namespace=namespace,
            job_name=job_name,
            image=image,
            service_type="loramerge",
            command=command,
            args=args,
            cpu_limit=trained_model.graphics_card_resource.get("cpu_limit",None),
            memory_limit=trained_model.graphics_card_resource.get("memory_limit",None),
            cpu_request=trained_model.graphics_card_resource.get("cpu_request",None),
            memory_request=trained_model.graphics_card_resource.get("memory_request",None),
            gpu_type=trained_model.graphics_card_resource.get("k8s_resource_type",None),
            gpu_count=trained_model.graphics_card_resource.get("count",""),
            # env_vars=env_vars,
            volume_mounts=volume_mounts,
            volumes=volumes,
            working_dir=working_dir,
            security_context=None,
            automount_service_account_token=True,
            k8s_uuid=lab_k8s_uuid
        )

        return job_name

    async def get_trained_model_logs(
            self, project_id: int, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainedModelLogResponse:
        # 导入公共日志服务
        from app.utils.log_service import log_service
        # 验证任务存在
        # 验证项目和任务存在
        await self._validate_project(project_id)
        task = await self.validate_trained_model_task(task_id, project_id)

        # 判断日志来源
        if task.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(task.log_path)
            return TrainedModelLogResponse(archived=True, logs=logs)
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
            return TrainedModelLogResponse(archived=False, logs=logs)

    async def get_trained_model_logs_by_time_range(self, project_id: int, task_id: int, start_time: datetime,
                                                   end_time: datetime) -> TrainedModelLogResponse:
        # 验证项目和任务存在
        await self._validate_project(project_id)
        task = await self.validate_trained_model_task(task_id, project_id)
        if not task.lab_k8s_uuid:
            raise HTTPException(
                status_code=400,
                detail="任务没有关联的K8S UUID"
            )
        # 从Loki获取指定天数的日志
        logs = log_service.get_logs_from_loki(task.lab_k8s_uuid, start_time=start_time, end_time=end_time)
        return TrainedModelLogResponse(archived=False, logs=logs)
        pass

    async def verify_source_model(self, model_source: str, k8s_id: int):
        if not model_source:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="来源不能为空"
            )
        if model_source not in ModelSource._value2member_map_:
            legal = ", ".join(ModelSource._value2member_map_)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"来源值非法 {model_source}，必须是以下之一：{legal}"
            )
        if model_source != ModelSource.LOCAL.value and not k8s_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"非本地来源，必须选择模型下载所用集群"
            )

        if k8s_id:
            # 查询集群信息
            clusters_query = await self.mapper.execute(select(KubernetesResource
                                                      ).join(
                KubernetesStorageRelation,
                KubernetesStorageRelation.k8s_id == KubernetesResource.id,
                isouter=True,  # LEFT JOIN
            ).join(
                KubernetesRepositoryRelation,
                KubernetesRepositoryRelation.k8s_id == KubernetesResource.id,
                isouter=True,  # LEFT JOIN
            ).where(KubernetesStorageRelation.is_mount == True,
                    KubernetesRepositoryRelation.id != None,KubernetesResource.id == k8s_id))

            clusters = clusters_query.scalars().one_or_none()

            if not clusters:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"所选集群不可用，请重新选择"
                )

            return clusters

    async def validate_base_env_for_download(self, kubeconfig_str: str, namespace: str, k8s_id: int):
        kube_config_dict = yaml.safe_load(kubeconfig_str)
        api_instance = get_k8s_api(kube_config_dict, client.CoreV1Api)
        # 校验是否有用于下载模型的pvc与用于下载的密钥

        # 获取镜像仓库信息
        repository_query = await self.mapper.execute(select(RepositoryResource
                                                          ).join(
            KubernetesRepositoryRelation,
            KubernetesRepositoryRelation.repository_id == RepositoryResource.id,
            isouter=True,  # LEFT JOIN
        ).where(KubernetesRepositoryRelation.k8s_id == k8s_id))
        repository_resource = repository_query.scalars().one_or_none()

        harbor_username = repository_resource.auth_config['username']
        harbor_password = repository_resource.auth_config['password']

        # 创建或者更新dp-pull-secret Harbor secret
        await create_harbor_secret(
            harbor_url=repository_resource.repository_address,
            harbor_user_name=harbor_username,
            harbor_password=harbor_password,
            namespace=namespace,
            secret_name="dp-pull-secret",
            kubeconfig_str=kubeconfig_str
        )

        await ensure_pvc_exists(
            api_instance=api_instance,
            namespace_name=namespace,
            pvc_name=PvcName.PUBLIC_PVC.value,
            labels={"path": "public"},
            access_modes=["ReadWriteMany"],
            size_gi="1Pi",
            storage_class="juicefs-sc"
        )


    async def start_model_download_job(self, job_id: int, model_id: str, model_source: str, kubeconfig_str: str,
                                       lab_k8s_uuid: str, k8s_id: int):
        # 初始化 K8s 启动器
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-model-download"
        # 校验基础环境
        await self.validate_base_env_for_download(kubeconfig_str, namespace, k8s_id)

        launcher = K8sLauncher(config_str=kubeconfig_str)
        storage_items = [
            {"name": PvcName.PUBLIC_PVC.value, "enum": StoragePath.BASE_MODELS}
        ]
        volume_mounts, volumes = await launcher.build_storage_volumes(
            storage_items
        )

        env_vars = {"MODEL_ID": model_id}

        if model_source == ModelSource.MODELSCOPE.value:
            # 创建合并模型Job
            job_name = f"model-download-{job_id}"
            result = await launcher.create_job(
                namespace=namespace,
                job_name=job_name,
                image=await self.find_image(k8s_id),
                service_type="model-download",
                cpu_limit="2",
                memory_limit="4Gi",
                cpu_request="0.5",
                memory_request="1Gi",
                env_vars=env_vars,
                volume_mounts=volume_mounts,
                volumes=volumes,
                security_context=None,
                automount_service_account_token=True,
                k8s_uuid=lab_k8s_uuid
            )

    async def get_base_model_download_logs(
            self, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainedModelLogResponse:
        # 导入公共日志服务
        from app.utils.log_service import log_service
        # 验证任务存在
        # 验证项目和任务存在
        task = await self.validate_base_model_task(task_id)

        # 判断日志来源
        if task.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(task.log_path)
            return TrainedModelLogResponse(archived=True, logs=logs)
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
            return TrainedModelLogResponse(archived=False, logs=logs)

    async def get_base_model_download_logs_by_time_range(self, task_id: int, start_time: datetime,
                                                   end_time: datetime) -> TrainedModelLogResponse:
        # 验证项目和任务存在
        task = await self.validate_base_model_task(task_id)
        if not task.lab_k8s_uuid:
            raise HTTPException(
                status_code=400,
                detail="任务没有关联的K8S UUID"
            )
        # 从Loki获取指定天数的日志
        logs = log_service.get_logs_from_loki(task.lab_k8s_uuid, start_time=start_time, end_time=end_time)
        return TrainedModelLogResponse(archived=False, logs=logs)
        pass

    async def stop_base_model_download_task(self, task_id: int) -> None:
        """终止基础模型下载任务，并按 Job 名删除 K8s 资源"""
        task = await self.validate_base_model_task(task_id)

        if task.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有运行中、排队中的任务才能终止"
            )

        task.status = TaskStatus.TERMINATED.value

        execution = await self.mapper.query_one(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.BASE_MODEL.value,
                TaskExecution.business_id == task_id
            ).order_by(TaskExecution.created_at.desc())
        )
        if execution and execution.status in [TaskExecutionStatus.PENDING.value, TaskExecutionStatus.RUNNING.value]:
            execution.status = TaskExecutionStatus.FAILED.value
            execution.last_error = "任务已被用户终止"
            execution.locked_at = None
            execution.locked_by = None

        await self.mapper.commit()
        logger.info(f"基础模型下载任务状态已更新为终止: task_id={task_id}")

        if not task.k8s_id:
            logger.warning(f"基础模型下载任务缺少 k8s_id，跳过删除 Job: task_id={task_id}")
            return

        cluster = await self.mapper.query_one(select(KubernetesResource).where(KubernetesResource.id == task.k8s_id))
        if not cluster:
            logger.warning(f"K8s 资源不存在，跳过删除 Job: k8s_id={task.k8s_id}, task_id={task_id}")
            return

        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-model-download"
        job_name = f"model-download-{task_id}"
        try:
            launcher = K8sLauncher(config_str=cluster.config)
            success = await launcher.delete_job(namespace=namespace, job_name=job_name)
            if success:
                logger.info(f"成功删除基础模型下载任务 Job: {job_name}")
            else:
                logger.warning(f"基础模型下载任务 Job 不存在或删除失败: {job_name}")
        except Exception as e:
            logger.error(f"删除基础模型下载任务 Job 失败: {job_name}, err={e}")


    async def check_modelscope_model_exists(self, model_id: str):
        api = HubApi()
        try:
            api.get_model(model_id)
        except Exception as e:
            # 网络 / 鉴权异常，建议上抛或记录
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"模型：{model_id}不存在，请检查"
            )

    async def find_image(self,k8s_id: int):
        # 获取训练镜像地址（根据项目ID和资源配置查找）
        from app.core.depend_manager import AutoContainer
        from app.schemas.repository_image import ImageType
        repository_image_service = AutoContainer.repository_image_service()

        # 根据 card_type 和 card_model 查找匹配的镜像
        # 先尝试查找指定 card_model 的镜像
        image_list = await repository_image_service.find_image_list_by_k8s_id(
            k8s_id=k8s_id,
            type=ImageType.MODEL_DOWNLOAD
        )

        if not image_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"模型下载镜像不存在，请检查"
            )

        return image_list[0].image_address

    async def register_ml_model(
            self,
            namespace,
            project_id,
            notebook_id,
            notebook_path,
            tokenizer_notebook_path: Optional[str] = None,
            need_tokenizer: bool = False,
    ):
        # 校验文件是否存在
        jfs_client = await self.storage.JUICEFS_CLIENT()
        # 处理复制notebook模型

        # 构建源路径（notebook任务输出）
        unregistered_base = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=namespace,
            instance_name=f"notebook-{notebook_id}"
        )
        source_path = f"{unregistered_base}{notebook_path}"
        logger.info(f"notebook校验文件地址：{source_path}")
        sync_path = os.path.basename(source_path)
        tokenizer_source_path = None
        tokenizer_sync_path = None
        if not jfs_client.exists(source_path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"notebook中文件不存在")
        else:
            stat_info = jfs_client.stat(source_path)
            if stat.S_ISDIR(stat_info.st_mode):
                sync_path = f"{sync_path}/"

            t_nb = (tokenizer_notebook_path or "").strip()
            if not need_tokenizer:
                if t_nb:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="非文本模型无需 tokenizer_source_ref",
                    )
            elif need_tokenizer:
                if not t_nb:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="文本类型机器学习模型的 Notebook 来源必须提供 tokenizer_source_ref",
                    )
                tokenizer_source_path = f"{unregistered_base}{t_nb}"
                if not jfs_client.exists(tokenizer_source_path):
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Notebook 来源中的 tokenizer_source_ref 对应文件不存在",
                    )
                tokenizer_stat = jfs_client.stat(tokenizer_source_path)
                if stat.S_ISDIR(tokenizer_stat.st_mode):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Notebook 来源中的 tokenizer_source_ref 不能指向目录",
                    )
                tokenizer_sync_path = "tokenizer.json"

        return source_path, sync_path, tokenizer_source_path, tokenizer_sync_path
import json
import os
import re
import shutil
import subprocess
import tempfile
import textwrap
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Tuple, List, Dict, Set
from urllib.parse import urlparse

import yaml
from fastapi import HTTPException, Request, UploadFile, BackgroundTasks
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page, Params
from kubernetes import client
from sqlalchemy import select, delete, and_, or_, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.functions import current_user
from starlette import status
from starlette.responses import Response, StreamingResponse, HTMLResponse, FileResponse
from starlette.websockets import WebSocket

from app.common.status import TaskStatus
from app.core import settings
from app.core.logging import logger
from app.core import settings
from app.database.base import get_db_session
from app.models import OpenAPIApplicationModel
from app.models.model_manager import MLModel
from app.models.models import Notebook, NotebookPort, KubernetesResource, ProjectKubernetesRelation, Project, \
    JwtUserInfo, \
    ImageBuildLog, ExampleNotebook, InferenceService, SshAuthorizedKeys
from app.repository.example_notebook_mapper import ExampleNotebookMapper
from app.repository.notebook_mapper import NotebookMapper
from app.schemas import TrainingTypeCategory
from app.schemas.inference_task import MlDeployDevNotebookCreate, MlDeployDevNotebookResponse, BackendEnum
from app.schemas.machine_learning_dataset import ExportFormat, MachineLearningDatasetTemplateType, MachineLearningDatasetAnnotationType
from app.schemas.model import MlTaskType
from app.schemas.notebook import NotebookResponse, NotebookCreate, NotebookUpdate, \
    NotebookDetailResponse, NotebookBizType, NotebookExtKey, NotebookExtDatasetType, NotebookExtModelType, \
    PublishNotebookAsExampleRequest, PublishNotebookAsExampleResponse, ExampleNotebookResponse, ExampleNotebookUpdate, \
    ExampleNotebookPermissionResponse, NotebookFilesResponse, UploadExampleImageResponse, LabJupyterEnv, \
    NOTEBOOK_WORK_PATH, \
    NotebookPortItem, NotebookPortUsage, NotebookPortProtocol, NotebookPortItemCreate, NotebookPortUpdate, \
    NOTEBOOK_BUILT_IN_PORTS, NOTEBOOK_PROBE_API, NotebookVisibilityPermissionResponse, NotebookViewMode, \
    NotebookSSHConfigResponse, NotebookSSHConfigUpdate
from app.schemas.repository_image import ImageType, CardType, RepositoryImageDetailResponse
from app.services.machine_learning_dataset.machine_learning_dataset import get_export_format_or_raise
from app.services.model.interface import ModelService
from app.services.notebook.interface import NotebookService
from app.services.permission.permission import is_platform_admin, is_project_admin
from app.services.repository_image.interface import RepositoryImageService
from app.services.storage.interface import StorageService
from app.utils import app_runtime_context
from app.utils.generate_password_util import generate_password
from app.utils.auth import get_password_hash
from app.utils.k8s_call import get_k8s_api, k8s_call
# 导入统一错误消息工具模块
from app.utils.k8s_launcher import K8sLauncher
from app.utils.k8s_utils import build_url_with_protocol
from app.utils.notebook_proxy_cache import invalidate_notebook_address_cache
from app.utils.openapi_secret_crypto import decrypt_openapi_secret
from app.utils.ssh_aes_util import encrypt_password
from app.utils.ssh_validata_util import simple_encrypt
from app.utils.dependencies import is_tenant_admin
from app.utils.storage_enum import PathConfig, StoragePath, PvcName, ml_artifact_basename_is_model_pt
from app.utils.timezone_utils import get_current_shanghai_time
from app.utils.storage_utils import StorageUtils


def build_notebook_ml_backend_proxy_access_url(
    project_id: int, notebook_id: int, notebook_port_id: int
) -> Optional[str]:
    """与部署 Jupyter 时生成对外 base_url 一致，拼出 Notebook 端口 ML 后端的代理入口 URL。"""
    lab_export_protocol = os.getenv("LAB_EXPORT_PROTOCOL")
    lab_export_address = os.getenv("LAB_EXPORT_ADDRESS")
    if not lab_export_protocol or not lab_export_address:
        return None
    rel = f"api/v1/notebooks/ml_backend_proxy/{project_id}/{notebook_id}/{notebook_port_id}/"
    lab_export_path = os.getenv("LAB_EXPORT_PATH")
    if not lab_export_path or lab_export_path == "":
        full_path = rel
    else:
        full_path = f"{lab_export_path.lstrip('/')}/{rel}"
    return f"{lab_export_protocol}://{lab_export_address}/{full_path}"


def notebook_port_item_with_proxy(project_id: int, row: NotebookPort) -> NotebookPortItem:
    item = NotebookPortItem.model_validate(row)
    proxy_url = build_notebook_ml_backend_proxy_access_url(project_id, row.notebook_id, row.id)
    return item.model_copy(update={"proxy_access_url": proxy_url})


class DefaultNotebookService(NotebookService):

    async def _is_notebook_admin(self, project_id: int, current_user: JwtUserInfo) -> bool:
        db = await self.mapper.get_session()
        if await is_platform_admin(db, current_user.userId):
            return True
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        if is_tenant_admin(current_user, is_san_yuan):
            return True
        return await is_project_admin(db, project_id, current_user.userId)

    async def _can_operate_notebook(self, project_id: int, notebook: Notebook, current_user: JwtUserInfo) -> bool:
        if notebook.is_public or notebook.created_id == current_user.userId:
            return True
        return await self._is_notebook_admin(project_id, current_user)

    async def _notebook_operation_denied_reason(self, project_id: int, notebook: Notebook, current_user: JwtUserInfo) -> Optional[str]:
        if await self._can_operate_notebook(project_id, notebook, current_user):
            return None
        return "当前 Notebook 为私有，仅创建人、租户管理员、平台管理员、项目管理员可进入和操作"

    async def _ensure_notebook_operable(self, project_id: int, notebook: Notebook, current_user: JwtUserInfo) -> None:
        reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
        if reason:
            raise HTTPException(status_code=403, detail=reason)

    def __init__(
        self,
        mapper: NotebookMapper,
        storage: StorageService,
        repository_image_service: RepositoryImageService,
        model_service: ModelService,
    ) -> None:
        self.mapper = mapper
        self.storage = storage
        self.repository_image_service = repository_image_service
        super().__init__(mapper, storage, repository_image_service, model_service)

    async def list_notebooks(self, project_id: int, instance_name: Optional[str] = None,
                             status: Optional[List[TaskStatus]] = None,
                             biz_type: NotebookBizType = None,
                             usage: Optional[MlTaskType] = None,
                             is_ml_debug: Optional[bool] = None,
                             view_mode: NotebookViewMode = NotebookViewMode.USE,
                             page: Optional[int] = None,
                             size: Optional[int] = None,
                             current_user: Optional[JwtUserInfo] = None,
                             is_public: Optional[List[bool]] = None,
                             created_id: Optional[List[int]] = None,) -> Page[NotebookResponse]:
        query = select(Notebook).filter(
            Notebook.project_id == project_id
        )
        if current_user is not None and view_mode == NotebookViewMode.USE and not await self._is_notebook_admin(project_id, current_user):
            query = query.filter(
                or_(
                    Notebook.is_public.is_(True),
                    Notebook.created_id == current_user.userId,
                )
            )
        query = query.order_by(Notebook.created_at.desc())

        if instance_name:
            query = query.filter(Notebook.instance_name.ilike(f"%{instance_name}%"))

        if status:
            query = query.filter(Notebook.status.in_(status))
        if biz_type is not None:
            query = query.filter(Notebook.biz_type == biz_type)
        if usage is not None:
            query = query.filter(Notebook.usage == usage.value)
        elif is_ml_debug is not None:
            if is_ml_debug:
                query = query.filter(Notebook.usage.is_not(None))
            else:
                query = query.filter(Notebook.usage.is_(None))

        if is_public is not None:
            query = query.filter(Notebook.is_public.in_(is_public))

        if created_id is not None:
            query = query.filter(Notebook.created_id.in_(created_id))
        
        # 使用 fastapi-pagination 进行分页
        page = await self.mapper.query_page(query, page, size)

        # 处理运行时间，拆成小时、分钟、秒
        now = datetime.now(timezone(timedelta(hours=8)))
        for item in page.items:
            item.is_ssh = bool(item.ssh_username)
            if current_user is not None:
                item.can_operate = await self._can_operate_notebook(project_id, item, current_user)
                item.operation_denied_reason = await self._notebook_operation_denied_reason(project_id, item, current_user)

            if item.status == TaskStatus.RUNNING and item.max_runtime_minutes:
                running_seconds = int((now - item.updated_at).total_seconds())
                hours, remainder = divmod(running_seconds, 3600)
                minutes, seconds = divmod(remainder, 60)
                item.running_hours = hours
                item.running_minutes = minutes
                item.running_seconds = seconds
            else:
                item.running_hours = 0
                item.running_minutes = 0
                item.running_seconds = 0

        notebook_ids = [item.id for item in page.items]
        ports_by_notebook: Dict[int, List[NotebookPortItem]] = {}
        if notebook_ids:
            ports_rows = await self.mapper.query(
                select(NotebookPort)
                .where(NotebookPort.notebook_id.in_(notebook_ids))
                .order_by(NotebookPort.notebook_id, NotebookPort.id)
            )
            for row in ports_rows or []:
                ports_by_notebook.setdefault(row.notebook_id, []).append(
                    notebook_port_item_with_proxy(project_id, row)
                )
        for item in page.items:
            item.ports = ports_by_notebook.get(item.id, [])

        return page

    async def batch_stop_release_by_project_id(self, project_id: int):
        notebook_ids = await self.mapper.query(select(Notebook.id).filter(Notebook.project_id == project_id))
        if not notebook_ids:
            return

        # 查询集群配置
        config = await self.mapper.query(select(KubernetesResource.config)
                                         .join(ProjectKubernetesRelation,
                                               ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                                         .where(ProjectKubernetesRelation.project_id == project_id))

        launcher = K8sLauncher(config_str=config[0])

        try:
            for notebook_id in notebook_ids:
                instance_name = f"notebook-{notebook_id}"
                await launcher.delete_app(f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
                                          , f"jupyter-{instance_name}", [f"jupyter-config-{instance_name}"])
            # 内部方法不执行commit，由外层执行
            await self.mapper.delete_condition(delete(NotebookPort).where(NotebookPort.notebook_id.in_(notebook_ids)))
            await self.mapper.delete_condition(delete(Notebook).where(Notebook.id.in_(notebook_ids)))
            # 批量失效代理缓存（即便外层最终回滚事务，被清缓存最多触发一次 DB 回源，无副作用）
            for notebook_id in notebook_ids:
                await invalidate_notebook_address_cache(project_id, notebook_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"删除失败: {e}")
        pass

    async def get_notebook_detail(self, notebook_id: int) -> NotebookDetailResponse:
        return await self.mapper.query_one(select(Notebook).filter(Notebook.id == notebook_id))

    async def get_notebook_visibility_permission(
        self, project_id: int, notebook_id: int, current_user: JwtUserInfo
    ) -> NotebookVisibilityPermissionResponse:
        notebook = await self.mapper.query_one(
            select(Notebook).where(Notebook.project_id == project_id, Notebook.id == notebook_id)
        )
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
        return NotebookVisibilityPermissionResponse(
            can_operate=reason is None,
            reason=reason,
        )

    async def get_notebook_ssh_config(
        self, project_id: int, notebook_id: int, current_user: JwtUserInfo
    ) -> NotebookSSHConfigResponse:
        notebook = await self.mapper.query_one(
            select(Notebook).where(Notebook.project_id == project_id, Notebook.id == notebook_id)
        )
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        await self._ensure_notebook_operable(project_id, notebook, current_user)
        return NotebookSSHConfigResponse(
            notebook_id=notebook.id,
            project_id=project_id,
            is_ssh=bool(notebook.ssh_username),
            ssh_username=notebook.ssh_username,
            ssh_password=notebook.ssh_password,
            ssh_key=notebook.ssh_key,
        )

    async def update_notebook_ssh_config(
        self, project_id: int, notebook_id: int, ssh_config: NotebookSSHConfigUpdate,
        current_user: JwtUserInfo
    ) -> NotebookSSHConfigResponse:
        notebook = await self.mapper.query_one(
            select(Notebook).where(Notebook.project_id == project_id, Notebook.id == notebook_id)
        )
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        await self._ensure_notebook_operable(project_id, notebook, current_user)

        if ssh_config.is_ssh:
            if ssh_config.ssh_username is not None:
                notebook.ssh_username = ssh_config.ssh_username
            if ssh_config.ssh_password is not None:
                notebook.ssh_password = get_password_hash(ssh_config.ssh_password)
        else:
            notebook.ssh_username = None
            notebook.ssh_password = None
            notebook.ssh_key = None

        notebook.updated_at = get_current_shanghai_time()
        await self.mapper.commit()
        await self.mapper.refresh(notebook)

        return NotebookSSHConfigResponse(
            notebook_id=notebook.id,
            project_id=project_id,
            is_ssh=bool(notebook.ssh_username),
            ssh_username=notebook.ssh_username,
            ssh_password=notebook.ssh_password,
            ssh_key=notebook.ssh_key,
        )

    async def gen_notebook_ssh_key(
        self, current_user: JwtUserInfo, project_id: int, notebook_id: int, background_tasks: BackgroundTasks
    ):
        notebook = await self.mapper.query_one(
            select(Notebook).where(Notebook.project_id == project_id, Notebook.id == notebook_id)
        )
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        await self._ensure_notebook_operable(project_id, notebook, current_user)

        ssh_authorized_key = await self.mapper.query_one(
            select(SshAuthorizedKeys).filter(SshAuthorizedKeys.notebook_id == notebook_id)
        )

        key_dir = tempfile.mkdtemp(prefix=f"notebook_{notebook.id}_")
        priv_key = os.path.join(key_dir, "id_ed25519")
        pub_key = priv_key + ".pub"

        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-N", "", "-f", priv_key, "-C", f"notebook_{notebook.id}@jump"],
            check=True
        )

        with open(pub_key) as f:
            pubkey = f.read().strip()

        result = subprocess.run(
            ["ssh-keygen", "-lf", pub_key],
            check=True,
            capture_output=True,
            text=True
        )
        fingerprint = result.stdout.split()[1]

        if ssh_authorized_key:
            ssh_authorized_key.project_id = project_id
            ssh_authorized_key.authorized_key = pubkey
            ssh_authorized_key.updated_at = get_current_shanghai_time()
        else:
            ssh_authorized_keys = {
                'project_id': project_id,
                'notebook_id': notebook_id,
                'authorized_key': pubkey,
                'created_id': current_user.userId,
                'created_by': current_user.username,
                'created_at': get_current_shanghai_time(),
                'updated_at': get_current_shanghai_time()
            }
            await self.mapper.execute(insert(SshAuthorizedKeys).values(ssh_authorized_keys))

        background_tasks.add_task(shutil.rmtree, key_dir, True)

        notebook.ssh_key = fingerprint
        notebook.updated_at = get_current_shanghai_time()
        await self.mapper.commit()
        await self.mapper.refresh(notebook)

        return FileResponse(
            priv_key,
            filename=f"notebook_{notebook.id}_id_ed25519",
            media_type="application/x-pem-file",
            headers={"X-Key-Fingerprint": fingerprint}
        )

    async def create_notebook(self, current_user: JwtUserInfo, project_id: int,
                              notebook_create: NotebookCreate) -> NotebookResponse:
        # 校验notebook名称重复,包括project id和notebook名
        is_exists = await self.exists(notebook_create.instance_name, project_id=project_id, biz_type=notebook_create.biz_type)
        if is_exists:
            raise HTTPException(status_code=400, detail=f"项目中已存在同名notebook：{notebook_create.instance_name}")
        
        # 校验 ext 中的数据集和模型格式
        if notebook_create.ext:
            await self._validate_notebook_ext(notebook_create.ext, project_id)

        notebook_status = TaskStatus.CREATED.value
        built_in_address = None
        # 来源案例
        if notebook_create.source_example_id:
            # 查询案例 0 表示全局内置租户
            tenant_ids = [app_runtime_context.get_tenant_id(), '0']
            example_query = await self.mapper.execute(select(ExampleNotebook).filter(ExampleNotebook.id == notebook_create.source_example_id
                                                                                     ,ExampleNotebook.tenant_id.in_(tenant_ids)))
            example = example_query.scalar_one_or_none()
            if not example:
                raise HTTPException(status_code=404, detail="Notebook Example not found")
            else:
                notebook_status = TaskStatus.CREATING.value
                # 如果是内置的话使用built_in_address作为源路径
                if example.built_in_address:
                    built_in_address = example.built_in_address

        # 如果ext中包含机器学习数据集，则将notebook状态设置为CREATING
        ml_dataset_items = []
        has_machine_learning_dataset = bool(
            notebook_create.ext
            and notebook_create.ext.get(NotebookExtKey.DATASET.value, {}).get(
                NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value
            )
        )
        if has_machine_learning_dataset:
            notebook_status = TaskStatus.CREATING.value
            ml_dataset_items = notebook_create.ext.get(NotebookExtKey.DATASET.value, {}).get(
                NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value,
                []
            )
        k8s_uuid = str(uuid.uuid4())
        db_data = notebook_create.dict(exclude={"max_run_hours", "max_run_minutes", "status", "ports", "is_ssh"})
        notebook = Notebook(
            **db_data,
            project_id=project_id,
            created_at=get_current_shanghai_time(),
            updated_at=get_current_shanghai_time(),
            created_id=current_user.userId,
            created_by=current_user.username,
            namespace=f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}",
            lab_k8s_uuid=k8s_uuid,
            status=notebook_status
        )
        if notebook_create.is_ssh:
            notebook.ssh_username = notebook_create.ssh_username
            notebook.ssh_password = get_password_hash(notebook_create.ssh_password)
        else:
            notebook.ssh_username = None
            notebook.ssh_password = None
            notebook.ssh_key = None
        notebook.max_runtime_minutes = notebook_create.total_max_minutes
        await self.mapper.insert(notebook)
        await self.mapper.flush()
        # await self.mapper.commit()
        # await self.mapper.refresh(notebook)

        if notebook_create.ports:
            seen_container_ports = set()
            for port_create in notebook_create.ports:
                if port_create.container_port in seen_container_ports:
                    raise HTTPException(status_code=400, detail=f"端口已存在: {port_create.container_port}")
                seen_container_ports.add(port_create.container_port)
                row = NotebookPort(
                    notebook_id=notebook.id,
                    protocol=port_create.protocol.value if hasattr(port_create.protocol, "value") else port_create.protocol,
                    port_usage=port_create.port_usage.value if hasattr(port_create.port_usage, "value") else port_create.port_usage,
                    port=port_create.container_port,
                    container_port=port_create.container_port,
                    description=port_create.description,
                    access_url=None,
                    created_at=get_current_shanghai_time(),
                    updated_at=get_current_shanghai_time(),
                    created_id=current_user.userId,
                    created_by=current_user.username
                )
                await self.mapper.insert(row)
        await self.mapper.commit()

        # 如果是根据案例创建，需要数据处理
        built_in = False
        if notebook_create.source_example_id:
            try:
                from app.tasks.example_notebook_tasks import apply_example_to_notebook_async
                # 构建源路径和目标路径
                # 源路径,如果是内置案例，那么直接使用内置案例地址为源地址
                if built_in_address:
                    built_in = True
                    src_path = built_in_address
                else:
                    src_path = StoragePath.NOTEBOOK_EXAMPLE.format_storage_path(
                        example_id=notebook_create.source_example_id
                    )

                # 目标路径：notebook 的工作目录
                dst_path = StoragePath.NOTEBOOK_WORK.format_storage_path(
                    project_name=f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}",
                    instance_name=f"notebook-{notebook.id}"
                )

                # 提交任务，传递 example_notebook_id,过滤掉.snapshot快照文件夹
                celery_result = apply_example_to_notebook_async.apply_async(
                    args=[
                        notebook.id,  # 传递notebook_id，用于后续更新状态
                        notebook_create.source_example_id,  # 传递example_id
                        src_path,
                        dst_path,
                        [],
                        notebook.tenant_id,
                        built_in
                    ],
                    countdown=1  # 延迟1秒执行，确保数据库事务完成
                )

                if not celery_result.id:
                    raise ValueError("Celery任务ID为空，任务可能未成功提交")

            except Exception as e:
                logger.error(
                    f"根据案例创建notebook失败: notebook_id={notebook.id}, "
                    f"错误: {str(e)}, 错误类型: {type(e).__name__}",
                    exc_info=True
                )
                # 如果提交任务失败，删除已创建的案例记录
                try:
                    await self.mapper.delete(notebook)
                    await self.mapper.commit()
                except Exception as delete_e:
                    logger.warning(f"删除案例记录失败: {str(delete_e)}")

                raise HTTPException(
                    status_code=500,
                    detail=f"提交案例发布任务失败: {str(e)}。请检查Celery broker连接和worker状态。"
                )
        if ml_dataset_items:
            try:
                from app.tasks.machine_learning_dataset_export_tasks import build_ml_dataset_export_cache_batch_for_notebook

                celery_result = build_ml_dataset_export_cache_batch_for_notebook.apply_async(
                    args=[
                        notebook.tenant_id,
                        notebook.id,
                        project_id,
                        ml_dataset_items,
                    ],
                    countdown=1
                )

                if not celery_result.id:
                    raise ValueError(f"机器学习数据集批量导出任务提交失败: notebook_id={notebook.id}")
            except Exception as e:
                logger.error(
                    f"提交机器学习数据集批量导出任务失败: notebook_id={notebook.id}, "
                    f"错误: {str(e)}, 错误类型: {type(e).__name__}",
                    exc_info=True
                )
                try:
                    await self.mapper.delete(notebook)
                    await self.mapper.commit()
                except Exception as delete_e:
                    logger.warning(f"删除notebook记录失败: {str(delete_e)}")

                raise HTTPException(
                    status_code=500,
                    detail=f"提交机器学习数据集批量导出任务失败: {str(e)}。请检查Celery broker连接和worker状态。"
                )
        return NotebookResponse.model_validate(notebook)
        pass

    async def create_ml_deploy_dev_notebook(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task: MlDeployDevNotebookCreate,
    ) -> MlDeployDevNotebookResponse:
        ml_model_id = task.ml_model_config.ml_model_id
        ml_row = await self.mapper.execute(select(MLModel).where(MLModel.id == ml_model_id))
        ml_model: MLModel = ml_row.scalar_one_or_none()
        if not ml_model or ml_model.project_id != project_id:
            raise HTTPException(status_code=404, detail="机器学习模型不存在或不属于当前项目")
        self.model_service.ensure_ml_task_scripts_present_http(ml_model.task_type)
        ml_task_type = ((ml_model.task_type or "").strip() or "default")
        handle_st = (task.ml_model_config.ml_handle_source_type or "upload").strip().lower()
        upload_id = (task.ml_model_config.ml_handle_upload_id or "").strip()
        nb_id = task.ml_model_config.notebook_id
        href = (task.ml_model_config.handle_source_ref or "").strip()
        mount_handle = False
        from app.core.depend_manager import AutoContainer
        inference_task_service = AutoContainer.inference_task_service()
        if handle_st == "notebook" and nb_id is not None and href:
            await inference_task_service.copy_ml_model_handle_from_notebook_for_dev(
                project_id,
                ml_model_id,
                nb_id,
                href,
            )
            mount_handle = True
        elif upload_id:
            await inference_task_service.copy_ml_model_handle_script_for_notebook(
                project_id,
                ml_model_id,
                upload_id,
            )
            mount_handle = True

        suffix = "-ml-dev"
        max_base = max(1, 50 - len(suffix))
        instance_name = f"{task.server_name[:max_base]}{suffix}"

        notebook_create = NotebookCreate(
            instance_name=instance_name,
            image=task.image_config.image_url,
            gpu_type=task.graphics_card_resource.k8s_resource_type,
            gpu_count=task.graphics_card_resource.count,
            resource_cpu_request=task.resource_cpu_config.resource_cpu_request,
            resource_cpu_limit=task.resource_cpu_config.resource_cpu_limit,
            resource_memory_request=task.resource_cpu_config.resource_memory_request,
            resource_memory_limit=task.resource_cpu_config.resource_memory_limit,
            describe=(task.description or "")[:300] or f"ML 部署在线开发：{task.server_name}",
            usage=ml_model.task_type,
            biz_type=NotebookBizType.MACHINE_LEARNING,
            ext={
                "ml_debug": {
                    "ml_model_id": ml_model_id,
                    "ml_task_type": ml_task_type,
                    "mount_ml_model_handle": mount_handle,
                    "model": task.graphics_card_resource.card_model,
                    "memory": task.graphics_card_resource.card_memory,
                    "category": task.graphics_card_resource.card_type
                }
            },
        )
        created = await self.create_notebook(current_user, project_id, notebook_create)

        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        # 目标路径：notebook 的工作目录
        dst_path = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=namespace,
            instance_name=f"notebook-{created.id}"
        )

        src_path = StoragePath.ML_MODEL_DEMO.format_storage_path(
            namespace=namespace,
            ml_task_type=ml_model.task_type
        )

        src_model_py_path = StoragePath.ML_MODEL_HANDLE_IMP_PY_FILE.format_storage_path(
            namespace=namespace,
            model_id=ml_model.id
        )

        from app.tasks.ml_deploy_dev_notebook_tasks import setup_ml_deploy_dev_notebook_workspace_async
        setup_ml_deploy_dev_notebook_workspace_async.apply_async(
            args=[
                project_id,
                created.id,
                src_path,
                src_model_py_path,
                dst_path,
                mount_handle,
            ],
            countdown=1,  # 延迟1秒执行，确保数据库事务完成
        )

        auto_started = False
        if task.auto_start:
            await self.start_or_deploy_notebook(project_id, created.id, current_user)
            auto_started = True
        return MlDeployDevNotebookResponse(
            notebook_id=created.id,
            auto_started=auto_started,
            message=(
                "已创建 Notebook，启动后可挂载 ML 权重、scripts 与 model.py。"
                if not auto_started
                else "已创建并已发起 Notebook 启动/部署。"
            ),
        )

    async def update_notebook(self, project_id: int, notebook_id: int,
                              notebook_update: NotebookUpdate, current_user: Optional[JwtUserInfo] = None) -> NotebookResponse:
        query = await self.mapper.execute(
            select(Notebook)
            .filter(Notebook.project_id == project_id)
            .filter(Notebook.id == notebook_id)
        )
        notebook = query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
        if reason:
            raise HTTPException(status_code=403, detail=reason)

        # 仅允许在「已创建」或「已终止」状态下编辑：
        # - CREATED：Deployment / Service 还未创建，全部改动只需落库，下一次 deploy 生效；
        # - TERMINATED：Deployment / Service 已存在但 replicas=0，必须在编辑时把改动
        #   patch 到 K8s 上；后续的 start_or_deploy_notebook 在该状态下只是把 replicas
        #   置为 1，不会重新构建 Deployment / Service，因此不在编辑阶段同步就会丢失变更。
        if notebook.status not in (TaskStatus.CREATED.value, TaskStatus.TERMINATED.value, TaskStatus.FAILED.value):
            raise HTTPException(
                status_code=400,
                detail="仅在「已创建」、「已终止」、「失败」状态下可编辑 Notebook，请先停止实例后再修改",
            )

        update_fields = notebook_update.model_dump(exclude_unset=True)
        ssh_flag_provided = "is_ssh" in update_fields
        ssh_username_provided = "ssh_username" in update_fields
        ssh_password_provided = "ssh_password" in update_fields
        ssh_config_provided = ssh_flag_provided or ssh_username_provided or ssh_password_provided
        # ports 是端口列表，不是 Notebook 表字段；先剔除避免 setattr 时误写到 ORM 上。
        # 实际值用强类型对象 ``notebook_update.ports`` 处理。
        ports_provided = "ports" in update_fields
        update_fields.pop("ports", None)
        ports_input: Optional[List[NotebookPortUpdate]] = notebook_update.ports if ports_provided else None
        update_fields.pop("is_ssh", None)
        update_fields.pop("ssh_username", None)
        update_fields.pop("ssh_password", None)

        # 重名检测：仅当传了新的 instance_name 且与当前不同时才校验
        new_instance_name = update_fields.get("instance_name")
        if new_instance_name and new_instance_name != notebook.instance_name:
            biz_type = update_fields.get("biz_type") or notebook.biz_type or NotebookBizType.LLM.value
            if await self.exists(new_instance_name, project_id, notebook_id, biz_type=biz_type):
                raise HTTPException(
                    status_code=400,
                    detail=f"项目中已存在同名notebook：{new_instance_name}",
                )

        # 校验 ext 中的数据集和模型格式
        if "ext" in update_fields and update_fields["ext"]:
            await self._validate_notebook_ext(update_fields["ext"], project_id)

        # 端口入参兜底校验：NotebookPortUpdate validator 已拒绝 9000/22/9090，
        # 这里兼容上游绕过 validator 的极端情况，再加一道。
        if ports_input is not None:
            for port in ports_input:
                if port.container_port in NOTEBOOK_BUILT_IN_PORTS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"端口为内置保留端口，禁止占用: {port.container_port}",
                    )

        # ML notebook 编辑时如果改了 ext.dataset.machine_learning_dataset，需要参考
        # 创建流程：把 status 切到 CREATING、提交 celery 任务异步重建导出缓存，
        # 任务完成后会把 status 还原到这里捕获的 ``target_status_for_ml_task``。
        # 注：``biz_type`` 一旦确定基本不再变化，但万一同时传了 biz_type，仍以入参为准。
        ml_dataset_items_for_rebuild: List[Dict[str, Any]] = []
        target_status_for_ml_task: Optional[str] = None
        if (
            notebook.biz_type == NotebookBizType.MACHINE_LEARNING.value
            and "ext" in update_fields
            and update_fields["ext"]
        ):
            new_ml_items = self._extract_ml_dataset_items(update_fields["ext"])
            old_ml_items = self._extract_ml_dataset_items(notebook.ext)
            if new_ml_items and self._normalize_ml_dataset_items(new_ml_items) != self._normalize_ml_dataset_items(old_ml_items):
                ml_dataset_items_for_rebuild = new_ml_items
                # 编辑前的状态（CREATED / TERMINATED / FAILED），任务完成后还原
                target_status_for_ml_task = notebook.status

        # 检测哪些字段会影响 K8s Deployment（决定后续是否需要 patch）。
        # 注意：``biz_type`` / ``usage`` 仅决定首次 deploy 时是否暴露 ml-backend-port，
        # 而 ml-backend-port 一旦由 deploy 创建就视为内置端口、不允许编辑动它，因此这两个
        # 字段只落库。
        k8s_relevant_fields = {
            "image",
            "gpu_type",
            "gpu_count",
            "resource_cpu_request",
            "resource_cpu_limit",
            "resource_memory_request",
            "resource_memory_limit",
            "max_run_hours",
            "max_run_minutes",
            "ext",
            "biz_type",
            "model_service_id",
        }
        need_k8s_deployment_sync = any(field in update_fields for field in k8s_relevant_fields) or ssh_config_provided

        # 写库：把传入字段全部应用到 ORM
        for field, value in update_fields.items():
            # max_run_hours / max_run_minutes 不直接写库，会汇总到 max_runtime_minutes
            if field in ("max_run_hours", "max_run_minutes"):
                continue
            setattr(notebook, field, value)

        # 重新计算 max_runtime_minutes（仅当传了 max_run_hours/max_run_minutes）
        new_max_runtime_minutes = notebook_update.total_max_minutes
        if new_max_runtime_minutes is not None:
            notebook.max_runtime_minutes = new_max_runtime_minutes

        if ssh_config_provided:
            if notebook_update.is_ssh is False:
                notebook.ssh_username = None
                notebook.ssh_password = None
                notebook.ssh_key = None
            else:
                if ssh_username_provided and notebook_update.ssh_username is not None:
                    notebook.ssh_username = notebook_update.ssh_username
                if ssh_password_provided and notebook_update.ssh_password is not None:
                    notebook.ssh_password = get_password_hash(notebook_update.ssh_password)

        notebook.updated_at = get_current_shanghai_time()

        # ---------- 单事务：主体字段 + ports + Deployment + celery 任务一并落定 ----------
        # 任一步失败都 rollback 整个事务，保持「事物一致」语义。
        # K8s 侧不做严格补偿（K8s 操作非事务），但所有 K8s 调用串行完成后再 commit DB，
        # K8s 失败必然不会让 DB 改动落地。
        # ml_dataset 异步重建：celery apply_async 在 commit 之前完成入队，入队失败也走
        # rollback；commit 成功后即使任务真正执行失败，celery 任务自己会把状态置为
        # CREATION_FAILED，不会卡在 CREATING。
        try:
            await self.mapper.flush()

            # 端口同步（DB 写入 + Service patch）：按入参 ``id`` 区分新增 / 修改，
            # 现有非内置端口若未被 ``id`` 引用则视为删除；ml-backend / jupyter / ssh
            # 等内置端口由系统持有，不在同步范围内。
            if ports_provided:
                await self._sync_notebook_ports(project_id, notebook, ports_input or [])

            # Deployment 同步：仅 TERMINATED 才需要 patch；CREATED 由下次 deploy 直接读最新值
            if need_k8s_deployment_sync and notebook.status == TaskStatus.TERMINATED.value:
                await self._sync_notebook_deployment(project_id, notebook, update_fields)

            # ml_dataset 重建：状态切到 CREATING + 提交 celery 任务
            if ml_dataset_items_for_rebuild:
                notebook.status = TaskStatus.CREATING.value
                notebook.updated_at = get_current_shanghai_time()
                await self.mapper.flush()
                try:
                    from app.tasks.machine_learning_dataset_export_tasks import build_ml_dataset_export_cache_batch_for_notebook
                    celery_result = build_ml_dataset_export_cache_batch_for_notebook.apply_async(
                        args=[
                            notebook.tenant_id,
                            notebook.id,
                            project_id,
                            ml_dataset_items_for_rebuild,
                            target_status_for_ml_task,
                        ],
                        countdown=1,
                    )
                    if not celery_result.id:
                        raise ValueError("Celery任务ID为空")
                except HTTPException:
                    raise
                except Exception as celery_err:
                    logger.error(
                        f"提交机器学习数据集导出任务失败: notebook_id={notebook_id}, "
                        f"错误: {celery_err}, 错误类型: {type(celery_err).__name__}",
                        exc_info=True,
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=f"提交机器学习数据集导出任务失败: {celery_err}。"
                               f"请检查 Celery broker 连接和 worker 状态。",
                    )

            await self.mapper.commit()
            await self.mapper.refresh(notebook)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(
                f"更新 Notebook 失败已回滚: notebook_id={notebook_id}, error={e}",
                exc_info=True,
            )
            raise HTTPException(status_code=500, detail=f"更新 Notebook 失败: {e}")

        return NotebookResponse.model_validate(notebook)

    async def _sync_notebook_deployment(
        self,
        project_id: int,
        notebook: Notebook,
        update_fields: Dict[str, Any],
    ) -> None:
        """把已 TERMINATED 的 Notebook 的可编辑字段同步到 K8s Deployment 与 Service。

        编辑入口已经把状态收敛到 CREATED / TERMINATED，因此这里只需要处理 TERMINATED：
        Deployment 已经存在但 replicas=0，必须把新值 patch 进去，
        下次 ``start_or_deploy_notebook`` 直接 ``start_app`` 拉起时才能生效。

        本方法覆盖以下三类 K8s 资源：

        * Deployment：image / 资源 / GPU / pod_annotations / 亲和性 / 卷挂载 / 容器 env；
        * ConfigMap（``jupyter-config-{instance_name}``）：``model_service_id`` /
          ``biz_type`` 变化时整体重写，与首次 ``deploy`` 的 ``get_jupyter_config``
          产物保持一致；
        * Service：``ml-backend-port`` 等内置端口在编辑期不允许新增/修改/删除，
          只有用户自定义端口走 ``_sync_notebook_ports``。
        """
        launcher, parsed, manufacturer = await self._fetch_notebook_k8s_context(project_id)

        instance_name = f"notebook-{notebook.id}"
        app_name = f"jupyter-{instance_name}"

        patch_kwargs: Dict[str, Any] = {}

        if "image" in update_fields:
            patch_kwargs["image"] = notebook.image

        if "resource_cpu_request" in update_fields:
            patch_kwargs["cpu_request"] = f"{notebook.resource_cpu_request}"
        if "resource_cpu_limit" in update_fields:
            patch_kwargs["cpu_limit"] = f"{notebook.resource_cpu_limit}"
        if "resource_memory_request" in update_fields:
            patch_kwargs["memory_request"] = f"{notebook.resource_memory_request}Gi"
        if "resource_memory_limit" in update_fields:
            patch_kwargs["memory_limit"] = f"{notebook.resource_memory_limit}Gi"

        # GPU 变更：只要 gpu_type 或 gpu_count 任意一个被修改就重新下发
        if "gpu_type" in update_fields or "gpu_count" in update_fields:
            if notebook.gpu_type and notebook.gpu_count and int(notebook.gpu_count) > 0:
                patch_kwargs["gpu_type"] = notebook.gpu_type
                patch_kwargs["gpu_count"] = int(notebook.gpu_count)
            else:
                patch_kwargs["clear_gpu"] = True

        # 最大运行时长变更：保留其他业务注解，仅覆盖 max_runtime_minutes
        if "max_run_hours" in update_fields or "max_run_minutes" in update_fields:
            annotations: Dict[str, str] = {}
            if notebook.max_runtime_minutes:
                annotations["max_runtime_minutes"] = str(notebook.max_runtime_minutes)
            patch_kwargs["pod_annotations"] = annotations

        # ext 中 model/memory/category 影响节点亲和性；dataset/models/ml_debug 影响卷挂载，
        # 都需要重新计算
        if "ext" in update_fields:
            new_affinity = await handle_affinity(notebook.ext or {})
            if new_affinity is None:
                patch_kwargs["clear_affinity"] = True
            else:
                patch_kwargs["affinity"] = new_affinity

            volume_mounts, volumes = await self._build_notebook_volumes_and_mounts(
                launcher, notebook, project_id, instance_name
            )
            patch_kwargs["volume_mounts"] = volume_mounts
            patch_kwargs["volumes"] = volumes

        # env_vars / ConfigMap 同步：``model_service_id`` 影响两者，``ext.ml_debug``
        # 仅影响 env（LOG_LEVEL），``biz_type`` 仅影响 ConfigMap（欢迎 notebook 路径）。
        need_env_sync = any(f in update_fields for f in ("model_service_id", "ext"))
        need_configmap_sync = any(f in update_fields for f in ("model_service_id", "biz_type"))

        model_service_info: Optional[InferenceService] = None
        if (need_env_sync or need_configmap_sync) and notebook.model_service_id:
            ms_query = await self.mapper.execute(
                select(InferenceService).filter(InferenceService.id == notebook.model_service_id)
            )
            model_service_info = ms_query.scalar_one_or_none()

        if need_env_sync:
            env_vars = dict(await get_jupyter_env(model_service_info))
            if notebook.ext and notebook.ext.get("ml_debug"):
                env_vars["LOG_LEVEL"] = "DEBUG"
            patch_kwargs["env_vars"] = env_vars

        if patch_kwargs:
            await launcher.patch_app_config(
                namespace=notebook.namespace,
                app_name=app_name,
                **patch_kwargs,
            )

        if need_configmap_sync:
            # 与 ``deploy`` 里的 base_url 构造保持完全一致，否则旧 Pod 拉起后 jupyter
            # 的 base_url 会与代理路径对不上。
            lab_export_path = os.getenv('LAB_EXPORT_PATH')
            if not lab_export_path:
                base_url = f'api/v1/notebooks/proxy/{project_id}/{notebook.id}/'
            else:
                base_url = f"{lab_export_path.lstrip('/')}/api/v1/notebooks/proxy/{project_id}/{notebook.id}/"
            biz_type_value = notebook.biz_type or NotebookBizType.LLM.value
            new_config = await get_jupyter_config(base_url, biz_type_value, model_service_info)
            await launcher.replace_config_map(
                namespace=notebook.namespace,
                name=f"jupyter-config-{instance_name}",
                data=new_config,
            )

        # K8s 配置发生变化后让代理缓存失效，避免请求转发到旧地址
        await invalidate_notebook_address_cache(project_id, notebook.id)

    async def _fetch_notebook_k8s_context(
        self,
        project_id: int,
    ) -> Tuple[K8sLauncher, Any, Optional[str]]:
        """取出 notebook 所属项目的 K8s 上下文：(launcher, parsed_api_server, manufacturer)。

        端口接口的 add / update / delete / 全量同步都依赖这三件套，抽成 helper 复用。
        """
        config_result = await self.mapper.execute(
            select(
                KubernetesResource.config,
                KubernetesResource.ext,
                KubernetesResource.api_server,
            )
            .join(
                ProjectKubernetesRelation,
                ProjectKubernetesRelation.k8s_id == KubernetesResource.id,
            )
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        config_ext = config_result.one_or_none()
        if not config_ext:
            raise HTTPException(status_code=404, detail="Kubernetes config not found")
        config, k8s_ext, api_server = config_ext
        launcher = K8sLauncher(config_str=config)
        parsed = urlparse(api_server)
        manufacturer = (k8s_ext or {}).get("manufacturer") if k8s_ext else None
        return launcher, parsed, manufacturer

    @staticmethod
    def _need_service_patch(notebook: Notebook) -> bool:
        """是否需要把端口变更同步到 K8s Service。

        Service 由首次 deploy 创建，因此只有进入过运行/排队/已终止态的 notebook 才有。
        其他状态（如 CREATED）只更新 DB，等下次 deploy 直接读最新数据。
        """
        return notebook.status in [
            TaskStatus.RUNNING.value,
            TaskStatus.PENDING.value,
            TaskStatus.TERMINATED.value,
        ]

    @staticmethod
    def _service_port_name(notebook_port: NotebookPort) -> str:
        """返回 ``NotebookPort`` 对应到 K8s Service 上的端口名。

        deploy 时 ml-backend 走固定名 ``ml-backend-port``，其它端口由 ``{usage}-{id}``
        组成；这里复用相同规则，避免 patch 时找不到端口。
        """
        if notebook_port.port_usage == NotebookPortUsage.ML_BACKEND.value:
            return "ml-backend-port"
        return f"{notebook_port.port_usage}-{notebook_port.id}"

    async def _apply_notebook_port_insert(
        self,
        notebook: Notebook,
        port_create: NotebookPortItemCreate,
        launcher: Optional[K8sLauncher],
        parsed: Any,
        manufacturer: Optional[str],
    ) -> NotebookPort:
        """插入端口到 DB 并 patch Service（不 commit）。

        ``launcher`` 为 None 表示 notebook 还没有对应 Service（CREATED 状态），
        此时只写库不动 K8s；返回已 flush（id 已分配）的 ``NotebookPort``。
        """
        protocol = port_create.protocol.value if hasattr(port_create.protocol, "value") else port_create.protocol
        port_usage = port_create.port_usage.value if hasattr(port_create.port_usage, "value") else port_create.port_usage
        row = NotebookPort(
            notebook_id=notebook.id,
            protocol=protocol,
            port_usage=port_usage,
            port=port_create.container_port,
            container_port=port_create.container_port,
            description=port_create.description,
            access_url=None,
            created_at=get_current_shanghai_time(),
            updated_at=get_current_shanghai_time(),
            created_id=notebook.created_id,
            created_by=notebook.created_by,
            tenant_id=notebook.tenant_id,
        )
        await self.mapper.insert(row)
        await self.mapper.flush()

        if launcher is None:
            return row

        service_name = f"jupyter-notebook-{notebook.id}-service"
        port_name = self._service_port_name(row)
        patch_result = await launcher.patch_service_port(
            name=service_name,
            namespace=notebook.namespace,
            op="add",
            port_name=port_name,
            protocol=row.protocol,
            port=row.container_port,
        )
        ports = []
        if isinstance(patch_result, tuple) and patch_result and isinstance(patch_result[0], dict):
            ports = ((patch_result[0].get("spec") or {}).get("ports") or [])
        elif isinstance(patch_result, dict):
            ports = (patch_result.get("spec") or {}).get("ports") or []
        patched_port = next((item for item in ports if item.get("name") == port_name), None)
        if patched_port and patched_port.get("nodePort") is not None:
            row.port = int(patched_port["nodePort"])
            if manufacturer and "火山云" in manufacturer:
                pass
            else:
                np = patched_port.get("nodePort", None)
                if np:
                    base = await build_url_with_protocol(parsed.hostname)
                    row.access_url = f"{base}:{np}"
            row.updated_at = get_current_shanghai_time()
        return row

    async def _apply_notebook_port_replace(
        self,
        notebook: Notebook,
        notebook_port: NotebookPort,
        new_protocol: str,
        new_container_port: int,
        new_description: Optional[str],
        launcher: Optional[K8sLauncher],
    ) -> None:
        """协议 / 容器端口 / 描述变更：先 K8s replace 再写库（不 commit）。"""
        if launcher is not None:
            service_name = f"jupyter-notebook-{notebook.id}-service"
            await launcher.patch_service_port(
                name=service_name,
                namespace=notebook.namespace,
                op="replace",
                port_name=self._service_port_name(notebook_port),
                protocol=new_protocol,
                port=new_container_port,
            )
        notebook_port.protocol = new_protocol
        notebook_port.container_port = new_container_port
        notebook_port.description = new_description
        notebook_port.updated_at = get_current_shanghai_time()

    async def _apply_notebook_port_remove(
        self,
        notebook: Notebook,
        notebook_port: NotebookPort,
        launcher: Optional[K8sLauncher],
    ) -> None:
        """从 K8s Service 移除端口并删除 DB 行（不 commit）。"""
        if launcher is not None:
            service_name = f"jupyter-notebook-{notebook.id}-service"
            await launcher.patch_service_port(
                name=service_name,
                namespace=notebook.namespace,
                op="remove",
                port_name=self._service_port_name(notebook_port),
            )
        await self.mapper.delete(notebook_port)

    async def _sync_notebook_ports(
        self,
        project_id: int,
        notebook: Notebook,
        new_ports: List[NotebookPortUpdate],
    ) -> None:
        """全量同步用户自定义端口（不含 ml-backend / jupyter / ssh 等内置端口）。

        与 ``update_notebook`` 主体合并到同一个 DB 事务里，调用方负责最后 commit。
        以入参的 ``id`` 字段决定单条端口的处理方式：

        * ``id`` 为空：视为新增（DB insert + Service add）；
        * ``id`` 非空：必须是当前 notebook 的非内置端口，按 id 修改对应行；
          ``protocol`` / ``container_port`` 任一变化触发 Service replace，仅描述变化只写库；
        * 现有非内置端口若未被入参的任何 ``id`` 引用：视为删除（Service remove + DB delete）。
        """
        # 上限校验
        notebook_max_open_ports = int(settings.NOTEBOOK_MAX_OPEN_PORTS)
        if len(new_ports) > notebook_max_open_ports:
            raise HTTPException(
                status_code=400,
                detail=f"一个Notebook最多只能配置{notebook_max_open_ports}个开放端口",
            )

        # 拉所有端口，过滤出「用户管控」的部分：
        # 内置端口（jupyter/ssh）按 container_port 排除；ml-backend 按 port_usage 兜底排除（防止历史脏数据 cp 不是 9090）
        existing_rows = await self.mapper.query(
            select(NotebookPort).where(NotebookPort.notebook_id == notebook.id)
        )
        existing_user_rows = [
            row for row in (existing_rows or [])
            if row.container_port not in NOTEBOOK_BUILT_IN_PORTS
            and row.port_usage != NotebookPortUsage.ML_BACKEND.value
        ]
        existing_by_id: Dict[int, NotebookPort] = {row.id: row for row in existing_user_rows}

        # 入参 id 校验：不能重复，必须命中现有非内置端口
        referenced_ids: Set[int] = set()
        for new in new_ports:
            if new.id is None:
                continue
            if new.id in referenced_ids:
                raise HTTPException(status_code=400, detail=f"端口列表中存在重复的 id: {new.id}")
            referenced_ids.add(new.id)
            if new.id not in existing_by_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"端口 id 不存在或为内置端口，无法修改: {new.id}",
                )

        # 按 id 计算 diff
        to_remove: List[NotebookPort] = [
            row for row in existing_user_rows if row.id not in referenced_ids
        ]
        to_update: List[Tuple[NotebookPort, NotebookPortUpdate]] = []
        to_add: List[NotebookPortUpdate] = []
        for new in new_ports:
            if new.id is None:
                to_add.append(new)
            else:
                to_update.append((existing_by_id[new.id], new))

        # 是否需要 patch K8s Service
        launcher: Optional[K8sLauncher] = None
        parsed: Any = None
        manufacturer: Optional[str] = None
        if self._need_service_patch(notebook) and (to_remove or to_add or to_update):
            launcher, parsed, manufacturer = await self._fetch_notebook_k8s_context(project_id)

        # 顺序：remove → update → add。先把不要的端口腾出来，再处理 cp 变化，
        # 最后新增；这样 cp 变更带来的临时占用不会与新增端口冲突。
        for ex in to_remove:
            await self._apply_notebook_port_remove(notebook, ex, launcher)
        # remove 之后 flush 一下，让 DB 删除立即落到事务可见状态，避免后续 update / insert 撞 unique 约束
        if to_remove:
            await self.mapper.flush()

        for ex, new in to_update:
            new_protocol = new.protocol.value if hasattr(new.protocol, "value") else new.protocol
            if ex.protocol != new_protocol or ex.container_port != new.container_port:
                await self._apply_notebook_port_replace(
                    notebook=notebook,
                    notebook_port=ex,
                    new_protocol=new_protocol,
                    new_container_port=new.container_port,
                    new_description=new.description,
                    launcher=launcher,
                )
            elif (ex.description or "") != (new.description or ""):
                # 仅描述变化，DB-only
                ex.description = new.description
                ex.updated_at = get_current_shanghai_time()
            # 完全无变化则跳过，不动 K8s 也不动 DB

        for new in to_add:
            # NotebookPortUpdate 没有 port_usage 字段，新增统一按用户自定义端口写库（OTHER）
            port_create = NotebookPortItemCreate(
                protocol=new.protocol,
                port_usage=NotebookPortUsage.OTHER,
                container_port=new.container_port,
                description=new.description,
            )
            await self._apply_notebook_port_insert(
                notebook, port_create, launcher, parsed, manufacturer,
            )

    async def _build_notebook_volumes_and_mounts(
        self,
        launcher: K8sLauncher,
        notebook: Notebook,
        project_id: int,
        instance_name: str,
    ) -> Tuple[List[client.V1VolumeMount], List[client.V1Volume]]:
        """根据当前 Notebook 状态组装容器的 ``volume_mounts`` 与 ``volumes``。

        覆盖：基础工作目录 + jupyter-config + 欢迎文件、``ext.dataset`` / ``ext.models``
        对应数据集与模型挂载、只读项目 PVC、基础模型公共 PVC、以及 ``ext.ml_debug``
        所需的 ML 调试挂载。供 ``start_or_deploy_notebook`` 与
        ``_sync_notebook_deployment`` 共同使用，确保两条路径的卷构成一致。
        """
        volume_mounts, volumes = await get_volume_mounts("name", launcher, instance_name)

        # 根据 ext 中的 dataset 信息挂载数据集
        if notebook.ext and notebook.ext.get(NotebookExtKey.DATASET.value):
            dataset_config = notebook.ext.get(NotebookExtKey.DATASET.value, {})
            dataset_mounts = await _prepare_dataset_volume_mounts(
                dataset_config, project_id
            )
            volume_mounts.extend(dataset_mounts)

        # 根据 ext 中的 models 信息挂载模型
        if notebook.ext and notebook.ext.get(NotebookExtKey.MODELS.value):
            models_config = notebook.ext.get(NotebookExtKey.MODELS.value, {})
            model_mounts = await _prepare_model_volume_mounts(
                models_config, project_id
            )
            volume_mounts.extend(model_mounts)

            # 基础模型 -> 公共 PVC
            if notebook.ext.get(NotebookExtKey.MODELS.value, {}).get(NotebookExtModelType.BASE_MODELS.value):
                volumes.append(client.V1Volume(
                    name=PvcName.PUBLIC_PVC.value,
                    persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=PvcName.PUBLIC_PVC.value
                    )
                ))

        # 只读项目 PVC
        if notebook.ext and (
            notebook.ext.get(NotebookExtKey.DATASET.value)
            or notebook.ext.get(NotebookExtKey.MODELS.value)
        ):
            volumes.append(client.V1Volume(
                name=PvcName.PROJECT_READ_ONLY_PVC.value,
                persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                    claim_name=PvcName.PROJECT_READ_ONLY_PVC.value
                )
            ))

        # ML 在线调试相关挂载
        if notebook.ext and notebook.ext.get("ml_debug"):
            dbg = notebook.ext.get("ml_debug") or {}
            ml_model_id = int(dbg.get("ml_model_id") or 0)
            ml_task_type = (dbg.get("ml_task_type") or "").strip() or "default"
            if ml_model_id <= 0:
                raise HTTPException(status_code=400, detail="Notebook ext.ml_debug.ml_model_id 无效")
            ml_items: List[Any] = [
                {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.ML_MODEL},
            ]
            ml_model_for_debug: MLModel = await self.mapper.query_one(
                select(MLModel).where(MLModel.id == ml_model_id)
            )
            logger.info(
                f"Notebook ml_debug：按 ml_model_id 查询 ml_models notebook_id={notebook.id} "
                f"ml_model_id={ml_model_id} has_row={ml_model_for_debug is not None}"
            )
            if ml_model_for_debug is not None:
                artifact_uri = (ml_model_for_debug.artifact_uri or "").strip()
                if artifact_uri and not ml_artifact_basename_is_model_pt(artifact_uri):
                    ml_items.append(
                        {
                            "name": PvcName.LLM_TRAINING_PVC.value,
                            "enum": PathConfig(
                                mount_path="/data/models/model.pt",
                                storage_path=artifact_uri
                                if artifact_uri.startswith("/")
                                else f"/{artifact_uri}",
                            ),
                        }
                    )
                    logger.info(
                        f"Notebook ml_debug：非标准 model.pt 文件名产物，已追加挂载到容器 /data/models/model.pt | "
                        f"notebook_id={notebook.id} ml_model_id={ml_model_id} artifact_uri={artifact_uri}"
                    )
            ml_mounts, ml_vols = await launcher.build_storage_volumes(
                ml_items,
                namespace=notebook.namespace,
                model_id=ml_model_id,
                ml_task_type=ml_task_type,
            )
            volume_mounts.extend(ml_mounts)
            existing_vol_names = {v.name for v in volumes}
            for v in ml_vols:
                if v.name not in existing_vol_names:
                    volumes.append(v)
                    existing_vol_names.add(v.name)

        return volume_mounts, volumes

    async def add_notebook_port(self, project_id: int, notebook_id: int, port_create: NotebookPortItemCreate, current_user: Optional[JwtUserInfo] = None) -> NotebookPortItem:
        notebook = await self.mapper.query_one(
            select(Notebook).where(Notebook.project_id == project_id, Notebook.id == notebook_id)
        )
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
            if reason:
                raise HTTPException(status_code=403, detail=reason)

        exists_query = await self.mapper.execute(
            select(NotebookPort).where(NotebookPort.notebook_id == notebook_id)
        )
        existing_ports = exists_query.scalars().all()
        notebook_max_open_ports = int(settings.NOTEBOOK_MAX_OPEN_PORTS)
        if len(existing_ports) >= notebook_max_open_ports:
            raise HTTPException(status_code=400, detail=f"一个Notebook最多只能配置{notebook_max_open_ports}个开放端口")

        duplicate_port = next(
            (item for item in existing_ports if item.container_port == port_create.container_port),
            None,
        )
        if duplicate_port:
            raise HTTPException(status_code=400, detail=f"端口已存在: {port_create.container_port}")

        launcher: Optional[K8sLauncher] = None
        parsed: Any = None
        manufacturer: Optional[str] = None
        if self._need_service_patch(notebook):
            launcher, parsed, manufacturer = await self._fetch_notebook_k8s_context(project_id)

        try:
            row = await self._apply_notebook_port_insert(
                notebook, port_create, launcher, parsed, manufacturer,
            )
            await self.mapper.commit()
            await self.mapper.refresh(row)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"新增 Notebook 端口失败: notebook_id={notebook_id}, error={e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"新增端口失败: {e}")
        return row

    async def update_notebook_port(self, project_id: int, notebook_id: int, port_id: int, port_update: NotebookPortUpdate, current_user: Optional[JwtUserInfo] = None) -> NotebookPortItem:
        notebook = await self.mapper.query_one(select(Notebook).where(Notebook.project_id == project_id,
                                                                      Notebook.id == notebook_id))
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
            if reason:
                raise HTTPException(status_code=403, detail=reason)

        port_query = await self.mapper.execute(
            select(NotebookPort).where(NotebookPort.notebook_id == notebook_id, NotebookPort.id == port_id)
        )
        notebook_port = port_query.scalar_one_or_none()
        if not notebook_port:
            raise HTTPException(status_code=404, detail=f"Notebook port not found: {port_id}")

        duplicate_query = await self.mapper.execute(
            select(NotebookPort).where(
                NotebookPort.notebook_id == notebook_id,
                NotebookPort.container_port == port_update.container_port,
                NotebookPort.id != port_id,
            )
        )
        if duplicate_query.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"端口已存在: {port_update.container_port}")

        launcher: Optional[K8sLauncher] = None
        if self._need_service_patch(notebook):
            launcher, _, _ = await self._fetch_notebook_k8s_context(project_id)

        new_protocol = port_update.protocol.value if hasattr(port_update.protocol, "value") else port_update.protocol
        try:
            await self._apply_notebook_port_replace(
                notebook=notebook,
                notebook_port=notebook_port,
                new_protocol=new_protocol,
                new_container_port=port_update.container_port,
                new_description=port_update.description,
                launcher=launcher,
            )
            await self.mapper.commit()
            await self.mapper.refresh(notebook_port)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"修改 Notebook 端口失败: notebook_id={notebook_id}, port_id={port_id}, error={e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"修改端口失败: {e}")
        return notebook_port

    async def delete_notebook_port(self, project_id: int, notebook_id: int, port_id: int, current_user: Optional[JwtUserInfo] = None):
        notebook = await self.mapper.query_one(select(Notebook).where(Notebook.project_id == project_id, Notebook.id == notebook_id))
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
            if reason:
                raise HTTPException(status_code=403, detail=reason)

        port_query = await self.mapper.execute(
            select(NotebookPort).where(NotebookPort.notebook_id == notebook_id, NotebookPort.id == port_id)
        )
        notebook_port = port_query.scalar_one_or_none()
        if not notebook_port:
            raise HTTPException(status_code=404, detail=f"Notebook port not found: {port_id}")

        if notebook_port.container_port in NOTEBOOK_BUILT_IN_PORTS:
            raise HTTPException(status_code=400, detail=f"端口为内置保留端口，禁止删除: {notebook_port.container_port}")

        launcher: Optional[K8sLauncher] = None
        if self._need_service_patch(notebook):
            launcher, _, _ = await self._fetch_notebook_k8s_context(project_id)

        try:
            await self._apply_notebook_port_remove(notebook, notebook_port, launcher)
            await self.mapper.commit()
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"删除 Notebook 端口失败: notebook_id={notebook_id}, port_id={port_id}, error={e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"删除端口失败: {e}")

    async def delete_notebook(self, project_id: int, notebook_id: int, current_user: Optional[JwtUserInfo] = None) -> None:
        query = await self.mapper.execute(select(Notebook).filter(Notebook.project_id == project_id, Notebook.id == notebook_id))
        notebook = query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
        if reason:
            raise HTTPException(status_code=403, detail=reason)

        # 查询集群配置
        config = await self.mapper.query(select(KubernetesResource.config)
                                         .join(ProjectKubernetesRelation,
                                               ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                                         .where(ProjectKubernetesRelation.project_id == project_id))

        launcher = K8sLauncher(config_str=config[0])

        instance_name = f"notebook-{notebook.id}"
        try:
            await launcher.delete_app(notebook.namespace, f"jupyter-{instance_name}",
                                      [f"jupyter-config-{instance_name}"])
            await self.mapper.execute(
                delete(NotebookPort).where(NotebookPort.notebook_id == notebook_id)
            )
            await self.mapper.delete(notebook)
            await self.mapper.commit()
            # notebook 已删除，主动失效代理缓存避免脏数据
            await invalidate_notebook_address_cache(project_id, notebook_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"删除失败: {e}")
        pass

    async def start_or_deploy_notebook(self, project_id: int, notebook_id: int, current_user: Optional[JwtUserInfo] = None) -> NotebookResponse:
        query = await self.mapper.execute(select(Notebook).filter(Notebook.project_id == project_id, Notebook.id == notebook_id))
        notebook: Notebook = query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
        if reason:
            raise HTTPException(status_code=403, detail=reason)
        original_status = notebook.status
        ml_debug = bool(notebook.ext and notebook.ext.get("ml_debug"))
        if not (
            original_status == TaskStatus.CREATED
            or original_status == TaskStatus.TERMINATED
            or original_status == TaskStatus.FAILED
            or (original_status == TaskStatus.PENDING and ml_debug)
        ):
            raise HTTPException(
                status_code=400,
                detail="只有已创建、已停止、失败状态可以启动；机器学习在线调试在「排队中」时可再次发起启动",
            )
        notebook.status = TaskStatus.PREPARING.value
        notebook.updated_at = get_current_shanghai_time()
        await self.mapper.commit()
        await self.mapper.refresh(notebook)
        # 查询集群配置
        config_result = await self.mapper.execute(select(KubernetesResource.config, KubernetesResource.ext, KubernetesResource.api_server)
                                         .join(ProjectKubernetesRelation,
                                               ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                                         .where(ProjectKubernetesRelation.project_id == project_id))

        config_ext = config_result.one_or_none()
        config, k8s_ext, api_server = config_ext
        launcher = K8sLauncher(config_str=config)

        # 去掉端口--改成取api_server，一般api_server是从config解析出来的
        parsed = urlparse(api_server)

        instance_name = f"notebook-{notebook.id}"
        volume_mounts, volumes = await self._build_notebook_volumes_and_mounts(
            launcher, notebook, project_id, instance_name
        )

        # ML 在线开发 Notebook 暴露 9090，与代理 /ml_backend 直连推理进程；须与镜像内监听端口一致
        extra_node_port: List[client.V1ServicePort] = []
        requested_ports = await self.mapper.query(
            select(NotebookPort)
            .where(NotebookPort.notebook_id == notebook.id,
                   NotebookPort.port_usage == NotebookPortUsage.OTHER.value)
            .order_by(NotebookPort.id)
        )
        for port_item in requested_ports or []:
            port_name = f"{port_item.port_usage}-{port_item.id}"
            extra_node_port.append(
                client.V1ServicePort(
                    name=port_name[:63],
                    protocol=port_item.protocol,
                    port=port_item.container_port,
                    target_port=port_item.container_port,
                )
            )
        if notebook.biz_type == NotebookBizType.MACHINE_LEARNING and notebook.usage and not any(
            (getattr(sp, "name", None) == "ml-backend-port") or int(getattr(sp, "port", 0) or 0) == 9090
            for sp in extra_node_port
        ):
            # Service 端口名须为 DNS 标签，不能含下划线（如 ml_port 会被拒绝）
            extra_node_port.append(
                client.V1ServicePort(
                    name="ml-backend-port",
                    protocol="TCP",
                    port=9090,
                    target_port=9090,
                )
            )
        # 获取厂商
        manufacturer = k8s_ext.get("manufacturer")

        # 获取在线推理服务信息
        model_service_info: InferenceService = None
        if notebook.model_service_id:
            query = await self.mapper.execute(
                select(InferenceService).filter(InferenceService.id == notebook.model_service_id))
            model_service_info = query.scalar_one_or_none()

        # 获取api访问密钥
        query = await self.mapper.execute(
            select(OpenAPIApplicationModel)
            .filter(OpenAPIApplicationModel.created_id == current_user.userId)
        )
        openapis = query.scalars().all()
        openapi = None
        if openapis:
            # 暂时只取第一条，openapi做权限后再调整
            openapi = openapis[0]

        deploy_result: Optional[Dict[str, Any]] = None
        try:
            deploy_extra_node_port = extra_node_port or None
            if original_status == TaskStatus.CREATED:  # 未运行
                notebook, deploy_result = await deploy(
                    launcher, notebook, instance_name, volume_mounts, volumes, parsed, project_id, manufacturer,
                    extra_node_port=deploy_extra_node_port, model_service_info = model_service_info, openapi=openapi
                )
            elif original_status == TaskStatus.TERMINATED or (
                original_status == TaskStatus.PENDING and ml_debug
            ):  # 停止后恢复，或 ML 在线调试「排队中」再次拉起副本
                # 添加注解，控制运行时长
                annotations = None
                if notebook.max_runtime_minutes:
                    annotations = {
                        "max_runtime_minutes": str(notebook.max_runtime_minutes)
                    }
                await launcher.start_app(notebook.namespace, f"jupyter-{instance_name}", replicas=1,
                                         pod_annotations=annotations)
                if ml_debug:
                    notebook.status = TaskStatus.PENDING.value
            elif original_status == TaskStatus.FAILED:  # 失败
                await launcher.delete_app(notebook.namespace, f"jupyter-{instance_name}",
                                          [f"jupyter-config-{instance_name}"])
                notebook, deploy_result = await deploy(
                    launcher, notebook, instance_name, volume_mounts, volumes, parsed, project_id, manufacturer,
                    extra_node_port=deploy_extra_node_port, model_service_info = model_service_info, openapi=openapi
                )

            notebook.updated_at = get_current_shanghai_time()
            await self.mapper.commit()
            await self.mapper.refresh(notebook)
            if deploy_result is not None:
                await self._persist_notebook_ports_after_deploy(notebook, deploy_result, parsed, manufacturer)
                await self.mapper.commit()
                # real_address 已在本次 deploy 中重写，主动失效代理缓存
                await invalidate_notebook_address_cache(project_id, notebook.id)
            return NotebookResponse.model_validate(notebook)

        except Exception as e:
            notebook.status = TaskStatus.FAILED
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"部署或启动失败: {e}")
        pass

    async def _persist_notebook_ports_after_deploy(
        self,
        notebook: Notebook,
        deploy_result: Dict[str, Any],
        parsed,
        manufacturer: Optional[str],
    ) -> None:
        """根据 create_app 返回值回写 notebook_ports 的实际暴露端口与访问地址。"""
        extras = deploy_result.get("extra_node_port") or []
        if not extras:
            return
        now = get_current_shanghai_time()
        ml_svc_name = f"ml-backend-port"
        existing_ports = await self.mapper.query(
            select(NotebookPort)
            .where(NotebookPort.notebook_id == notebook.id)
            .order_by(NotebookPort.id)
        )
        requested_ports = {
            item.container_port: item
            for item in (getattr(notebook, "ports", None) or [])
            if item and getattr(item, "container_port", None) is not None
        }
        existing_ports_by_source_port = {row.container_port: row for row in existing_ports or []}
        for sp in extras:
            if not getattr(sp, "name", None):
                continue
            protocol = getattr(sp, "protocol", None) or NotebookPortProtocol.TCP.value
            port_usage = (
                NotebookPortUsage.ML_BACKEND.value
                if sp.name == ml_svc_name
                else NotebookPortUsage.OTHER.value
            )
            source_port = int(sp.port)
            requested_port = requested_ports.get(source_port)
            notebook_port = existing_ports_by_source_port.get(source_port)
            if requested_port:
                protocol = requested_port.protocol.value if hasattr(requested_port.protocol, "value") else requested_port.protocol
                port_usage = requested_port.port_usage.value if hasattr(requested_port.port_usage, "value") else requested_port.port_usage
                description = requested_port.description
                container_port = requested_port.container_port
            else:
                description = notebook_port.description if notebook_port else ("ML 后端端口" if sp.name == ml_svc_name else None)
                container_port = notebook_port.container_port if notebook_port else source_port
            if manufacturer and "火山云" in manufacturer:
                svc_ports = deploy_result.get("service_ports") or {}
                raw = svc_ports.get(sp.name)
                ext_num = int(raw) if raw is not None else source_port
                access_url: Optional[str] = None
                if deploy_result.get("service_ip"):
                    base = await build_url_with_protocol(deploy_result["service_ip"])
                    access_url = f"{base}:{ext_num}"
            else:
                np = getattr(sp, "node_port", None)
                ext_num = int(np) if np is not None else source_port
                access_url = None
                if np:
                    base = await build_url_with_protocol(parsed.hostname)
                    access_url = f"{base}:{np}"
            if notebook_port:
                notebook_port.protocol = protocol
                notebook_port.port_usage = port_usage
                notebook_port.port = ext_num
                notebook_port.container_port = container_port
                notebook_port.description = description
                notebook_port.access_url = access_url
                notebook_port.updated_at = now
                continue
            row = NotebookPort(
                notebook_id=notebook.id,
                protocol=protocol,
                port_usage=port_usage,
                port=ext_num,
                container_port=container_port,
                description=description,
                access_url=access_url,
                created_at=now,
                updated_at=now,
                created_id=notebook.created_id,
                created_by=notebook.created_by,
                tenant_id=notebook.tenant_id,
            )
            await self.mapper.insert(row)

    async def stop_notebook(self, project_id: int, notebook_id: int, current_user: Optional[JwtUserInfo] = None) -> NotebookResponse:
        query = await self.mapper.execute(select(Notebook).filter(Notebook.project_id == project_id, Notebook.id == notebook_id))
        notebook = query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
            if reason:
                raise HTTPException(status_code=403, detail=reason)

        build_not_stop_status = [TaskStatus.COMPLETED,TaskStatus.FAILED]
        # 查询构建记录
        image_type = ImageType.LLM_NOTEBOOK.value if notebook.biz_type == NotebookBizType.LLM.value else ImageType.ML_NOTEBOOK.value
        build_log_query = await self.mapper.execute(
            select(ImageBuildLog).filter(ImageBuildLog.business_id == notebook_id,
                                         ImageBuildLog.image_type == image_type,
                                         ImageBuildLog.status.notin_(build_not_stop_status)))
        build_log = build_log_query.scalars().first()
        if build_log:
            raise HTTPException(status_code=500, detail=f"{notebook.instance_name}正在保存环境，无法停止")
        # 查询集群配置
        config = await self.mapper.query(select(KubernetesResource.config)
                                         .join(ProjectKubernetesRelation,
                                               ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                                         .where(ProjectKubernetesRelation.project_id == project_id))

        launcher = K8sLauncher(config_str=config[0])

        instance_name = f"notebook-{notebook.id}"
        try:
            replicas = await launcher.read_namespaced_deployment_replicas(notebook.namespace, f"jupyter-{instance_name}")
            if replicas == 0:
                notebook.status = TaskStatus.TERMINATED.value
                await self.mapper.commit()
                await self.mapper.refresh(notebook)
            else:
                await launcher.stop_app(notebook.namespace, f"jupyter-{instance_name}")
            # todo 改成统一的成功或失败即可
            return NotebookResponse.model_validate(notebook)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"{e}")
        pass

    async def find_notebook(self, project_id, notebook_id, current_user: Optional[JwtUserInfo] = None):
        query = await self.mapper.execute(select(Notebook).filter(
            Notebook.project_id == project_id, Notebook.id == notebook_id
        ).order_by(Notebook.created_at.desc()))

        notebook = query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
            if reason:
                raise HTTPException(status_code=403, detail=reason)

        project_query = await self.mapper.execute(select(Project).filter(Project.id == project_id))

        project = project_query.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="project not found")

        ssh_username = None
        ssh_key = None
        ssh_url = None

        # 获取配置中的信息
        lab_export_address = os.getenv('LAB_EXPORT_ADDRESS')
        if not lab_export_address:
            raise HTTPException(status_code=500, detail="LAB_EXPORT_ADDRESS not found")
        host = lab_export_address.rsplit(':', 1)[0] if ':' in lab_export_address else lab_export_address
        ssh_gateway_export = os.getenv('SSH_GATEWAY_EXPORT', '2222')
        if notebook.ssh_username:
            ssh_username = notebook.ssh_username
            ssh_key = notebook.ssh_key
            original_ids = simple_encrypt(f"{project_id}@{notebook_id}",
                                          os.getenv('SECRET_KEY_SSH', 'deepexilab_key_ssh'))

            ssh_url = f"ssh -p {ssh_gateway_export} {ssh_username}@ssh-{original_ids}@{host}"

        # 取 notebook 的ssh状态
        notebook.is_ssh = bool(notebook.ssh_username)

        # 处理运行时间，拆成小时、分钟、秒（由于baseModel中updated_at是utc，所以这里也需要是utc）
        now = datetime.now(timezone.utc)
        updated_at = notebook.updated_at.replace(tzinfo=timezone.utc)
        if notebook.status == TaskStatus.RUNNING and notebook.max_runtime_minutes:
            running_seconds = int((now - updated_at).total_seconds())
            hours, remainder = divmod(running_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            running_hours = hours
            running_minutes = minutes
            running_seconds = seconds
        else:
            running_hours = 0
            running_minutes = 0
            running_seconds = 0

        # 查询关联的数据集和模型名称
        dataset_names = None
        model_names = None
        
        if notebook.ext:
            dataset_names = await self._get_dataset_names(notebook.ext, project_id)
            model_names = await self._get_model_names(notebook.ext, project_id)

        ports_rows = await self.mapper.query(
            select(NotebookPort)
            .where(NotebookPort.notebook_id == notebook_id)
            .order_by(NotebookPort.id)
        )
        ports_list: List[NotebookPortItem] = []
        if ports_rows:
            ports_list = [notebook_port_item_with_proxy(project_id, p) for p in ports_rows]

        # 获取在线推理服务信息
        model_service_name = None
        if notebook.model_service_id:
            query = await self.mapper.execute(
                select(InferenceService).filter(InferenceService.id == notebook.model_service_id))
            model_service_info = query.scalar_one_or_none()
            if model_service_info:
                model_service_name = model_service_info.name

        nb_dict = {k: v for k, v in notebook.__dict__.items() if k != "_sa_instance_state"}
        can_operate = True
        operation_denied_reason = None
        if current_user is not None:
            can_operate = await self._can_operate_notebook(project_id, notebook, current_user)
            operation_denied_reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
        return NotebookDetailResponse.model_validate({
            **nb_dict,
            "can_operate": can_operate,
            "operation_denied_reason": operation_denied_reason,
            "running_hours": running_hours,
            "running_minutes": running_minutes,
            "running_seconds": running_seconds,
            "ssh_username": ssh_username,
            "ssh_key": ssh_key,
            "ssh_url": ssh_url,
            "dataset_names": dataset_names,
            "model_names": model_names,
            "ports": ports_list,
            "model_service_name": model_service_name
        })

    async def list_notebook_files(
            self,
            project_id: int,
            notebook_id: int,
            path: str = "/",
            recursive: bool = False,
            current_user: Optional[JwtUserInfo] = None
    ) -> NotebookFilesResponse:
        query = await self.mapper.execute(
            select(Notebook).filter(
                Notebook.project_id == project_id,
                Notebook.id == notebook_id
            )
        )
        notebook = query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")
        if current_user is not None:
            reason = await self._notebook_operation_denied_reason(project_id, notebook, current_user)
            if reason:
                raise HTTPException(status_code=403, detail=reason)

        project_name = notebook.namespace or f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        base_path = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=project_name,
            instance_name=f"notebook-{notebook.id}"
        )

        sub_path = (path or "/").strip()
        target_path = base_path if sub_path in ("", "/") else f"{base_path.rstrip('/')}/{sub_path.lstrip('/')}"

        jfs_client = await self.storage.JUICEFS_CLIENT()
        files = StorageUtils.list_files(jfs=jfs_client, remote_path=target_path, recursive=recursive)
        excluded_dirs = {".snapshot", ".ipynb_checkpoints"}
        filtered_files = []
        for item in files:
            # 兼容 list_files 返回的旧字符串格式与新字典格式
            if isinstance(item, str):
                file_path = item.strip("/")
                parts = [p for p in file_path.split("/") if p]
            elif isinstance(item, dict):
                file_path = str(item.get("path", "") or "").strip("/")
                parts = [p for p in file_path.split("/") if p]
            else:
                filtered_files.append(item)
                continue

            # 只过滤 .snapshot 和 .ipynb_checkpoints 目录（及其子路径）
            if any(part in excluded_dirs for part in parts):
                continue
            filtered_files.append(item)
        files = filtered_files

        return NotebookFilesResponse(
            project_id=project_id,
            notebook_id=notebook_id,
            path=sub_path if sub_path else "/",
            files=files
        )

    async def exists(
            self,
            name: str,
            project_id: int,
            notebook_id: int | None = None,
            biz_type: NotebookBizType = NotebookBizType.LLM
    ) -> bool:
        """True 表示已存在"""

        # 基础条件：同 project 内名称不能重复
        query = select(Notebook.id).where(
            Notebook.instance_name == name,
            Notebook.project_id == project_id,
            Notebook.tenant_id == app_runtime_context.get_tenant_id(),
            Notebook.biz_type == biz_type
        )

        # 修改场景排除自身
        if notebook_id is not None:
            query = query.where(Notebook.id != notebook_id)

        stmt = select(query.exists())
        is_exists = await self.mapper.execute(stmt)
        return is_exists.scalar()

    async def _get_dataset_names(self, ext: Dict[str, Any], project_id: int) -> Optional[Dict[str, List[str]]]:
        """
        获取关联的数据集名称
        
        Args:
            ext: ext 字段内容
            project_id: 项目ID
        
        Returns:
            Dict[str, List[str]]: 数据集名称字典，格式：{"training": ["数据集1", "数据集2"], ...}
        """
        from app.schemas.training_dataset import DatasetUsage
        from app.models.models import MachineLearningDataset
        from app.core.depend_manager import AutoContainer
        
        if NotebookExtKey.DATASET.value not in ext:
            return None
        
        dataset_config = ext.get(NotebookExtKey.DATASET.value, {})
        if not isinstance(dataset_config, dict) or not dataset_config:
            return None
        
        dataset_names = {}
        
        try:
            training_dataset_service = AutoContainer.training_dataset_service()
            inference_result_dataset_service = AutoContainer.inference_result_dataset_service()
            
            usage_mapping = {
                NotebookExtDatasetType.TRAINING.value: DatasetUsage.TRAINING,
                NotebookExtDatasetType.VALIDATION.value: DatasetUsage.VALIDATION,
                NotebookExtDatasetType.TEST.value: DatasetUsage.TEST
            }
            
            for dataset_type, dataset_ids in dataset_config.items():
                if not dataset_ids or not isinstance(dataset_ids, list):
                    continue
                
                names = []
                
                if dataset_type == NotebookExtDatasetType.INFERENCE_RESULT.value:
                    # 查询推理结果数据集
                    inference_datasets = await inference_result_dataset_service.get_inference_result_datasets_by_ids(
                        ids=dataset_ids,
                        project_id=project_id
                    )
                    names = [d.name for d in inference_datasets]
                elif dataset_type == NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
                    # 查询机器学习数据集
                    ml_dataset_items = [item for item in dataset_ids if isinstance(item, dict)]
                    ml_dataset_ids = [item["dataset_id"] for item in ml_dataset_items if isinstance(item.get("dataset_id"), int)]
                    if not ml_dataset_ids:
                        continue

                    ml_datasets = await self.mapper.query(
                        select(MachineLearningDataset).filter(
                            MachineLearningDataset.id.in_(ml_dataset_ids),
                            MachineLearningDataset.project_id == project_id
                        )
                    )
                    ml_dataset_map = {dataset.id: dataset for dataset in ml_datasets}
                    names = [
                        f"{MachineLearningDatasetAnnotationType(dataset.annotation_type).description}/{MachineLearningDatasetTemplateType(dataset.template_type).description}/{dataset.name}_{dataset.version}"
                        for item in ml_dataset_items
                        if (dataset := ml_dataset_map.get(item["dataset_id"])) is not None
                    ]
                elif dataset_type in usage_mapping:
                    # 查询训练数据集
                    usage = usage_mapping[dataset_type]
                    datasets = await training_dataset_service.get_datasets_by_ids_and_usage(
                        ids=dataset_ids,
                        usage=usage,
                        project_id=project_id
                    )
                    names = [f"{d.name}_{d.version}" for d in datasets]
                
                if names:
                    dataset_names[dataset_type] = names
        
        except Exception as e:
            logger.error(f"获取数据集名称失败: {str(e)}", exc_info=True)
            # 不抛出异常，返回已获取的名称
        
        return dataset_names if dataset_names else None

    async def _get_model_names(self, ext: Dict[str, Any], project_id: int) -> Optional[Dict[str, List[str]]]:
        """
        获取关联的模型名称

        数据来源：`ext.models` 中的各类型模型 ID，以及 `ext.ml_debug`（`ml_model_id` 解析版本名；
        `ml_task_type` 非空时附加在展示名称后；同段 ext 可含 `mount_ml_model_handle`，供其他流程判断 handle 挂载）。

        Args:
            ext: ext 字段内容
            project_id: 项目ID

        Returns:
            Dict[str, List[str]]: 模型名称字典，格式：{"base_models": ["模型1", "模型2"], "finetuned_models": ["模型3"], "machine_learning_models": ["模型4"]}
        """
        from app.models.model_manager import BaseModel, TrainedModel
        from app.core.depend_manager import AutoContainer
        from sqlalchemy import select

        raw_models = ext.get(NotebookExtKey.MODELS.value)
        if raw_models is None:
            models_config: Dict[str, Any] = {}
        elif isinstance(raw_models, dict):
            models_config = raw_models
        else:
            models_config = {}

        dbg = ext.get("ml_debug")
        ml_debug_id = 0
        ml_debug_task_type: Optional[str] = None
        if isinstance(dbg, dict):
            ml_debug_id = int(dbg.get("ml_model_id") or 0)
            ml_debug_task_type = (dbg.get("ml_task_type") or "").strip() or None

        if not models_config and ml_debug_id <= 0:
            return None

        model_names: Dict[str, List[str]] = {}

        try:
            model_service = AutoContainer.model_service()

            for model_type, model_ids in models_config.items():
                if not model_ids or not isinstance(model_ids, list):
                    continue
                
                names = []
                
                if model_type == NotebookExtModelType.BASE_MODELS.value:
                    # 查询基础模型
                    base_models = await model_service.mapper.query(
                        select(BaseModel).filter(BaseModel.id.in_(model_ids))
                    )
                    names = [m.name for m in base_models]
                elif model_type == NotebookExtModelType.FINETUNED_MODELS.value:
                    # 查询微调模型
                    trained_models = await model_service.mapper.query(
                        select(TrainedModel).filter(
                            TrainedModel.id.in_(model_ids),
                            TrainedModel.project_id == project_id
                        )
                    )
                    names = [f"{m.name}_{m.model_version}" for m in trained_models]
                elif model_type == NotebookExtModelType.MACHINE_LEARNING_MODELS.value:
                    # 查询机器学习模型
                    from app.models.model_manager import MLModel
                    ml_models = await model_service.mapper.query(
                        select(MLModel).filter(
                            MLModel.id.in_(model_ids),
                            MLModel.project_id == project_id
                        )
                    )
                    names = [f"{m.name}_{m.model_version}" for m in ml_models]
                if names:
                    model_names[model_type] = names

            # ml_debug 关联的机器学习版本：写入 machine_learning_models，供详情展示
            if ml_debug_id > 0:
                ml_key = NotebookExtModelType.MACHINE_LEARNING_MODELS.value
                existing_ml_ids: Set[int] = set()
                raw_ml = models_config.get(ml_key)
                if isinstance(raw_ml, list):
                    for x in raw_ml:
                        if isinstance(x, int):
                            existing_ml_ids.add(x)
                        elif isinstance(x, str) and x.isdigit():
                            existing_ml_ids.add(int(x))
                if ml_debug_id not in existing_ml_ids:
                    from app.models.model_manager import MLModel
                    ml_rows = await model_service.mapper.query(
                        select(MLModel).filter(
                            MLModel.id == ml_debug_id,
                            MLModel.project_id == project_id,
                        )
                    )
                    if ml_rows:
                        m = ml_rows[0]
                        label = f"{m.name}_{m.model_version}"
                        model_names.setdefault(ml_key, []).append(label)

        except Exception as e:
            logger.error(f"获取模型名称失败: {str(e)}", exc_info=True)
            # 不抛出异常，返回已获取的名称

        return model_names if model_names else None

    @staticmethod
    def _extract_ml_dataset_items(ext: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """从 notebook.ext 里取 ``dataset.machine_learning_dataset`` 列表。

        ext 可能为 None / 缺 dataset 节 / 缺 machine_learning_dataset 节，统一兜底为 []。
        """
        if not ext:
            return []
        dataset_block = ext.get(NotebookExtKey.DATASET.value) or {}
        items = dataset_block.get(NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value) or []
        return items if isinstance(items, list) else []

    @staticmethod
    def _normalize_ml_dataset_items(items: List[Dict[str, Any]]) -> List[Tuple[int, str]]:
        """把 ml_dataset 列表归一为 ``(dataset_id, format)`` 排序后的元组列表，方便 diff。

        非法项（缺字段 / 类型转换失败）直接跳过，让 diff 结果不至于因脏数据误判。
        """
        normalized: List[Tuple[int, str]] = []
        for item in items or []:
            try:
                dataset_id = int(item.get("dataset_id"))
                fmt = str(item.get("format", "")).strip().lower()
            except (TypeError, ValueError):
                continue
            normalized.append((dataset_id, fmt))
        normalized.sort()
        return normalized

    async def _validate_notebook_ext(self, ext: Dict[str, Any], project_id: int) -> None:
        """
        验证 notebook ext 字段中的数据集和模型格式

        Args:
            ext: ext 字段内容
            project_id: 项目ID

        Raises:
            HTTPException: 如果格式不正确或ID不存在
        """
        from app.schemas.training_dataset import DatasetUsage
        from app.models.models import MachineLearningDataset
        from app.models.model_manager import BaseModel, TrainedModel
        from app.core.depend_manager import AutoContainer
        from sqlalchemy import select

        # 验证 dataset 字段
        if NotebookExtKey.DATASET.value in ext:
            dataset_config = ext.get(NotebookExtKey.DATASET.value)
            if not isinstance(dataset_config, dict):
                raise HTTPException(status_code=400, detail="数据集类型错误")

            # 定义允许的数据集类型
            allowed_dataset_types = [item.value for item in NotebookExtDatasetType]
            
            # 收集所有数据集ID，用于总数验证
            all_dataset_ids = []

            for dataset_type, dataset_ids in dataset_config.items():
                if dataset_type not in allowed_dataset_types:
                    raise HTTPException(
                        status_code=400,
                        detail=f"不支持的数据集类型: {dataset_type}，支持的类型: {', '.join(allowed_dataset_types)}"
                    )

                if not isinstance(dataset_ids, list):
                    raise HTTPException(
                        status_code=400,
                        detail=f"数据集{dataset_type} 必须是列表"
                    )

                if dataset_type == NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
                    normalized_ml_dataset_items = []
                    for dataset_item in dataset_ids:
                        if not isinstance(dataset_item, dict):
                            raise HTTPException(
                                status_code=400,
                                detail="machine_learning_dataset 必须是对象列表"
                            )
                        dataset_id = dataset_item.get("dataset_id")
                        export_format = dataset_item.get("format")
                        if not isinstance(dataset_id, int) or dataset_id <= 0:
                            raise HTTPException(
                                status_code=400,
                                detail="machine_learning_dataset.dataset_id 必须是正整数"
                            )
                        if not isinstance(export_format, str) or not export_format.strip():
                            raise HTTPException(
                                status_code=400,
                                detail="machine_learning_dataset.format 不能为空"
                            )
                        normalized_ml_dataset_items.append(
                            {
                                "dataset_id": dataset_id,
                                "format": export_format.strip().lower(),
                            }
                        )

                    dataset_config[dataset_type] = normalized_ml_dataset_items
                    all_dataset_ids.extend([item["dataset_id"] for item in normalized_ml_dataset_items])
                    dataset_ids = normalized_ml_dataset_items

                # 验证每个ID都是整数
                if dataset_type != NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
                    for dataset_id in dataset_ids:
                        if not isinstance(dataset_id, int) or dataset_id <= 0:
                            raise HTTPException(
                                status_code=400,
                                detail=f"数据集{dataset_type} 中的ID必须是正整数"
                            )
                
                # 收集所有ID
                if dataset_type != NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
                    all_dataset_ids.extend(dataset_ids)

                # 验证数据集是否存在
                if dataset_type == NotebookExtDatasetType.INFERENCE_RESULT.value:
                    # 验证推理结果数据集
                    inference_result_service = AutoContainer.inference_result_dataset_service()
                    inference_datasets = await inference_result_service.get_inference_result_datasets_by_ids(
                        ids=dataset_ids, project_id=project_id
                    )
                    found_ids = {d.id for d in inference_datasets}
                    missing_ids = set(dataset_ids) - found_ids
                    if missing_ids:
                        raise HTTPException(
                            status_code=404,
                            detail=f"未找到推理结果数据集ID: {sorted(missing_ids)}"
                        )
                elif dataset_type == NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
                    # 验证机器学习数据集
                    ml_dataset_items = dataset_ids
                    ml_dataset_ids = [item["dataset_id"] for item in ml_dataset_items]
                    ml_datasets = await self.mapper.query(
                        select(MachineLearningDataset).filter(
                            MachineLearningDataset.id.in_(ml_dataset_ids),
                            MachineLearningDataset.project_id == project_id
                        )
                    )
                    found_ids = {d.id for d in ml_datasets}
                    missing_ids = set(ml_dataset_ids) - found_ids
                    if missing_ids:
                        raise HTTPException(
                            status_code=404,
                            detail=f"未找到机器学习数据集ID: {sorted(missing_ids)}"
                        )

                    ml_dataset_map = {dataset.id: dataset for dataset in ml_datasets}
                    for item in ml_dataset_items:
                        dataset = ml_dataset_map[item["dataset_id"]]
                        if not dataset.is_annotated:
                            raise HTTPException(
                                status_code=400,
                                detail=f"机器学习数据集必须为有标注数据: {dataset.id}"
                            )
                        if not dataset.template_type:
                            raise HTTPException(
                                status_code=400,
                                detail=f"机器学习数据集缺少 template_type: {dataset.id}"
                            )
                        try:
                            template_type = MachineLearningDatasetTemplateType(dataset.template_type)
                            export_format = ExportFormat(item["format"])
                            get_export_format_or_raise(template_type, export_format)
                        except ValueError as exc:
                            raise HTTPException(status_code=400, detail=str(exc)) from exc
                else:
                    # 验证训练数据集
                    training_dataset_service = AutoContainer.training_dataset_service()
                    usage_mapping = {
                        NotebookExtDatasetType.TRAINING.value: DatasetUsage.TRAINING,
                        NotebookExtDatasetType.VALIDATION.value: DatasetUsage.VALIDATION,
                        NotebookExtDatasetType.TEST.value: DatasetUsage.TEST
                    }
                    usage = usage_mapping[dataset_type]
                    datasets = await training_dataset_service.get_datasets_by_ids_and_usage(
                        ids=dataset_ids,
                        usage=usage,
                        project_id=project_id
                    )
                    found_ids = {d.id for d in datasets}
                    missing_ids = set(dataset_ids) - found_ids
                    if missing_ids:
                        raise HTTPException(
                            status_code=404,
                            detail=f"未找到{dataset_type}数据集ID: {sorted(missing_ids)}"
                        )
            
            # 验证所有数据集ID总数（最多3个）
            if len(all_dataset_ids) > 3:
                raise HTTPException(
                    status_code=400,
                    detail=f"数据集中所有类型的ID总数最多只能包含3个，当前有{len(all_dataset_ids)}个"
                )

        # 验证 models 字段
        if NotebookExtKey.MODELS.value in ext:
            models_config = ext.get(NotebookExtKey.MODELS.value)
            if not isinstance(models_config, dict):
                raise HTTPException(status_code=400, detail="ext.models 必须是字典类型")

            # 定义允许的模型类型
            allowed_model_types = [item.value for item in NotebookExtModelType]
            
            # 收集所有模型ID，用于总数验证
            all_model_ids = []

            for model_type, model_ids in models_config.items():
                if model_type not in allowed_model_types:
                    raise HTTPException(
                        status_code=400,
                        detail=f"不支持的模型类型: {model_type}，支持的类型: {', '.join(allowed_model_types)}"
                    )

                if not isinstance(model_ids, list):
                    raise HTTPException(
                        status_code=400,
                        detail=f"模型{model_type} 必须是整数列表"
                    )

                # 验证每个ID都是整数
                for model_id in model_ids:
                    if not isinstance(model_id, int) or model_id <= 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"模型{model_type} 中的ID必须是正整数"
                        )
                
                # 收集所有ID
                all_model_ids.extend(model_ids)

                # 验证模型是否存在
                model_service = AutoContainer.model_service()
                if model_type == NotebookExtModelType.BASE_MODELS.value:
                    # 验证基础模型
                    base_models = await model_service.mapper.query(
                        select(BaseModel).filter(BaseModel.id.in_(model_ids))
                    )
                    found_ids = {m.id for m in base_models}
                    missing_ids = set(model_ids) - found_ids
                    if missing_ids:
                        raise HTTPException(
                            status_code=404,
                            detail=f"未找到基础模型ID: {sorted(missing_ids)}"
                        )
                elif model_type == NotebookExtModelType.FINETUNED_MODELS.value:
                    # 验证微调模型
                    trained_models = await model_service.mapper.query(
                        select(TrainedModel).filter(
                            TrainedModel.id.in_(model_ids),
                            TrainedModel.project_id == project_id
                        )
                    )
                    found_ids = {m.id for m in trained_models}
                    missing_ids = set(model_ids) - found_ids
                    if missing_ids:
                        raise HTTPException(
                            status_code=404,
                            detail=f"未找到微调模型ID: {sorted(missing_ids)}"
                        )
                elif model_type == NotebookExtModelType.MACHINE_LEARNING_MODELS.value:
                    # 验证机器学习模型
                    from app.models.model_manager import MLModel
                    ml_models = await model_service.mapper.query(
                        select(MLModel).filter(
                            MLModel.id.in_(model_ids),
                            MLModel.project_id == project_id
                        )
                    )
                    found_ids = {m.id for m in ml_models}
                    missing_ids = set(model_ids) - found_ids
                    if missing_ids:
                        raise HTTPException(
                            status_code=404,
                            detail=f"未找到机器学习模型ID: {sorted(missing_ids)}"
                        )

            # 验证所有模型ID总数（最多3个）
            if len(all_model_ids) > 3:
                raise HTTPException(
                    status_code=400,
                    detail=f"模型中所有类型的ID总数最多只能包含3个，当前有{len(all_model_ids)}个"
                )

    async def publish_notebook_as_example(self,
                                          project_id: int,
                                          notebook_id: int,
                                          publish_request: PublishNotebookAsExampleRequest,
                                          current_user: JwtUserInfo
                                          ) -> PublishNotebookAsExampleResponse:
        # 1. 验证 Notebook 是否存在
        notebook_result = await self.mapper.execute(
            select(Notebook).filter(
                Notebook.project_id == project_id,
                Notebook.id == notebook_id
            )
        )
        notebook = notebook_result.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # 重名检测
        is_exists = await self.exists_example(publish_request.name, project_id, notebook.biz_type)
        if is_exists:
            raise HTTPException(status_code=400, detail=f"已存在同名案例：{publish_request.name}")

        notebook_tenant_id = notebook.tenant_id


        # 2. 获取项目信息（namespace, tenant_id, project_name）
        project_result = await self.mapper.execute(
            select(Project).filter(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # 3. 先创建案例记录（状态为不可用）
        # 使用 self.mapper._db 来创建新的 mapper 实例
        new_example_notebook = ExampleNotebook(
            name=publish_request.name,
            describe=publish_request.describe,
            is_available=False,  # 初始状态为不可用
            biz_type=notebook.biz_type,
            created_id=current_user.userId,
            created_by=current_user.username,
            created_at=get_current_shanghai_time(),
            updated_at=get_current_shanghai_time()
        )
        await self.mapper.insert(new_example_notebook)
        await self.mapper.flush()
        # await self.mapper.commit()
        # await self.mapper.refresh(new_example_notebook)
        example_notebook_id = new_example_notebook.id

        # 4. 构建源路径和目标路径
        # 源路径：notebook 的工作目录
        src_path = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}",
            instance_name=f"notebook-{notebook.id}"
        )
        # 校验notebook文件是否存在
        jfs_client = await self.storage.JUICEFS_CLIENT()
        if not jfs_client.exists(src_path):
            await self.mapper.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"notebook工作目录不存在，无法发布为案例")

        # 目标路径：
        dst_path = StoragePath.NOTEBOOK_EXAMPLE.format_storage_path(
            example_id=example_notebook_id
        )

        # 5. 提交 Celery 任务
        try:
            from app.tasks.example_notebook_tasks import install_example_notebook_async
            from app.utils import app_runtime_context

            # 提交任务，传递 example_notebook_id,过滤掉.snapshot快照文件夹
            exclude_dirs = ['.snapshot','.ipynb_checkpoints','.venv']
            celery_result = install_example_notebook_async.apply_async(
                args=[
                    example_notebook_id,  # 传递案例ID，用于后续更新状态
                    src_path,
                    dst_path,
                    exclude_dirs,
                    notebook_tenant_id
                ],
                countdown=1  # 延迟1秒执行，确保数据库事务完成
            )

            if not celery_result.id:
                raise ValueError("Celery任务ID为空，任务可能未成功提交")

            await self.mapper.commit()
            return PublishNotebookAsExampleResponse(
                celery_task_id=celery_result.id,
                message=f"案例发布任务已提交，任务ID: {celery_result.id}"
            )

        except Exception as e:
            logger.error(
                f"提交案例发布任务失败: notebook_id={notebook_id}, "
                f"错误: {str(e)}, 错误类型: {type(e).__name__}",
                exc_info=True
            )
            # 如果提交任务失败，回滚
            try:
                # await self.mapper.delete(new_example_notebook)
                await self.mapper.rollback()
            except Exception as delete_e:
                logger.warning(f"删除案例记录失败: {str(delete_e)}")
            
            raise HTTPException(
                status_code=500,
                detail=f"提交案例发布任务失败: {str(e)}。请检查Celery broker连接和worker状态。"
            )

    async def example_notebooks_list(
            self,
            example_id: Optional[int] = None,
            name: Optional[str] = None,
            biz_type: NotebookBizType = NotebookBizType.LLM,
            params: Params = None
    ) -> Page[ExampleNotebookResponse]:
        """获取案例广场列表（只查询可用的案例，支持按名称过滤）"""
        # 0 表示全局内置租户
        tenant_ids = [app_runtime_context.get_tenant_id(),'0']

        # 构建查询，只查询可用的案例
        query = select(ExampleNotebook).filter(
            ExampleNotebook.tenant_id.in_(tenant_ids)
        )
        if example_id:
            query = query.filter(ExampleNotebook.id == example_id)
        # 如果提供了名称，进行模糊搜索
        if name:
            query = query.filter(ExampleNotebook.name.like(f"%{name}%"))
        if biz_type is not None:
            query = query.filter(ExampleNotebook.biz_type == biz_type.value)
        
        # 按创建时间倒序排列
        query = query.order_by(ExampleNotebook.created_at.desc())
        
        # 使用 fastapi-pagination 进行分页
        if params is None:
            params = Params()

        # 不进行租户过滤
        app_runtime_context.set_tenant_id(None)
        page_result = await self.mapper.query_page(query, params.page, params.size)

        lab_export_path = os.getenv("LAB_EXPORT_PATH")
        replace_value = f"/{lab_export_path}" if lab_export_path else ""
        # 重新构造 items
        items = [
            item.copy(update={
                "describe": self.format_describe_path(
                    describe=item.describe,
                    lab_export_path=replace_value,
                )
            })
            for item in page_result.items
        ]
        return page_result.copy(update={"items": items})

    @staticmethod
    def format_describe_path(describe: str, **kwargs) -> str:
        """格式化描述中的占位符（如 {lab_export_path}）"""
        if not describe:
            return describe
        for key, value in kwargs.items():
            placeholder = f"{{{key}}}"
            if placeholder in describe:
                describe = describe.replace(placeholder, str(value))
        return describe

    async def example_delete(
            self,
            id: int,
            current_user: JwtUserInfo,
            db: AsyncSession
    ) -> None:
        """删除案例（异步任务）"""
        query = await self.mapper.execute(
            select(ExampleNotebook).filter(ExampleNotebook.id == id))
        example = query.scalar_one_or_none()
        if not example:
            raise HTTPException(status_code=404, detail="Notebook example not found")

        # 权限校验：仅租户管理员或案例创建人可删除
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        is_admin = await is_platform_admin(db, current_user.userId) or is_tenant_admin(current_user, is_san_yuan)
        is_creator = example.created_id == current_user.userId
        if not is_admin and not is_creator:
            raise HTTPException(status_code=403, detail="User Not Permission")

        # 清理jfs案例
        try:
            jfs = await self.storage.JUICEFS_CLIENT()
            dst_path = StoragePath.NOTEBOOK_EXAMPLE.format_storage_path(
                example_id=id
            )
            if jfs.exists(dst_path):
                jfs.rmr(dst_path)
            await self.mapper.delete(example)
            await self.mapper.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"删除失败: {e}")
        pass

    async def example_update(
            self,
            id: int,
            update_request: ExampleNotebookUpdate,
            current_user: JwtUserInfo,
            db: AsyncSession
    ) -> ExampleNotebookResponse:
        """编辑案例"""
        query = await self.mapper.execute(
            select(ExampleNotebook).filter(ExampleNotebook.id == id))
        example = query.scalar_one_or_none()
        if not example:
            raise HTTPException(status_code=404, detail="Notebook example not found")

        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        is_admin = await is_platform_admin(db, current_user.userId) or is_tenant_admin(current_user, is_san_yuan)
        is_creator = example.created_id == current_user.userId
        if not is_admin and not is_creator:
            raise HTTPException(status_code=403, detail="User Not Permission")

        update_data = update_request.model_dump(exclude_unset=True)
        if not update_data:
            return ExampleNotebookResponse.model_validate(example)

        if update_data.get("name"):
            example_name = update_data.get("name")
            if await self.exists_example(example_name, id, example.biz_type):
                raise HTTPException(status_code=400, detail=f"案例名称 '{example_name}' 已存在")

        for field, value in update_data.items():
            setattr(example, field, value)
        example.updated_at = get_current_shanghai_time()

        await self.mapper.flush()
        await self.mapper.commit()
        await self.mapper.refresh(example)
        return ExampleNotebookResponse.model_validate(example)

    async def has_example_permission(
            self,
            id: int,
            current_user: JwtUserInfo,
            db: AsyncSession
    ) -> ExampleNotebookPermissionResponse:
        """判断当前用户是否具备案例编辑/删除权限"""
        query = await self.mapper.execute(
            select(ExampleNotebook).filter(ExampleNotebook.id == id))
        example = query.scalar_one_or_none()
        if not example:
            raise HTTPException(status_code=404, detail="Notebook example not found")

        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        is_admin = await is_platform_admin(db, current_user.userId) or is_tenant_admin(current_user, is_san_yuan)
        is_creator = example.created_id == current_user.userId
        return ExampleNotebookPermissionResponse(has_permission=is_admin or is_creator)

    async def upload_example_image(
            self,
            file: UploadFile,
            current_user: JwtUserInfo
    ) -> UploadExampleImageResponse:
        """上传案例图片到JFS并返回访问地址"""
        if not file.filename:
            raise HTTPException(status_code=400, detail="文件名不能为空")

        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="仅支持图片文件上传")

        ext = os.path.splitext(file.filename)[1].lower()
        allowed_ext = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
        if ext not in allowed_ext:
            raise HTTPException(status_code=400, detail="不支持的图片格式")

        tenant_id = str(getattr(current_user, "tenantId", None) or app_runtime_context.get_tenant_id() or "0")

        file_name = f'{datetime.now().strftime("%Y%m%d")}/{uuid.uuid4().hex}{ext}'
        jfs_path = StoragePath.NOTEBOOK_EXAMPLE_IMAGE.format_storage_path(
            file_name=file_name
        )

        try:
            jfs = await self.storage.JUICEFS_CLIENT(tenant_id)
            parent_dir = os.path.dirname(jfs_path)
            if parent_dir and not jfs.exists(parent_dir):
                jfs.makedirs(parent_dir, exist_ok=True)

            # 分块写入，避免大文件一次性进入内存
            with jfs.open(jfs_path, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
        except Exception as e:
            logger.error(f"上传案例图片到JFS失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="上传图片失败")
        finally:
            await file.close()

        image_url = f"/api/v1/storage/download/{tenant_id}{jfs_path}"
        return UploadExampleImageResponse(image_url=image_url)

    async def exists_example(
            self,
            name: str,
            example_id: int | None = None,
            biz_type: NotebookBizType = NotebookBizType.LLM
    ) -> bool:
        """True 表示已存在"""

        # 基础条件：同 project 内名称不能重复
        query = select(ExampleNotebook.id).where(
            ExampleNotebook.name == name,
            ExampleNotebook.tenant_id == app_runtime_context.get_tenant_id(),
            ExampleNotebook.biz_type == biz_type
        )

        # 修改场景排除自身
        if example_id is not None:
            query = query.where(ExampleNotebook.id != example_id)

        stmt = select(query.exists())
        is_exists = await self.mapper.execute(stmt)
        return is_exists.scalar()


async def get_jupyter_config(base_url: str, biz_type:str, model_service_info: InferenceService = None):
    """获取Jupyter Notebook配置"""
    # 与其他模块保持一致：先定位项目根目录，再拼接脚本路径
    project_root = Path(__file__).parent.parent.parent.parent
    welcome_notebook_path = project_root / f"scripts/notebook/config/{biz_type}/Welcome.ipynb"

    ai_config = ""
    if model_service_info:
        model_id = f"os.environ.get('OPENCODE_MODEL')"
        ai_config = f"""
        import os
        c.JupyternautExtension.initial_language_model = {model_id}
        c.JupyternautExtension.model_parameters = {{
            {model_id}: {{
                'api_base': os.environ.get('OPENAI_BASE_URL')
            }}
        }}
               """

    config = {
        "jupyter_server_config.py": textwrap.dedent(f"""
        c.ServerApp.port = 9000
        c.IdentityProvider.token = ''
        c.ServerApp.kernel_websocket_protocol = 'v1.kernel.jupyter.org'
        c.ServerApp.password = ''
        c.ServerApp.disable_check_xsrf = True
        c.ServerApp.open_browser = False
        c.ServerApp.ip = '0.0.0.0'
        c.ServerApp.allow_remote_access = True
        c.ServerApp.allow_origin = "*"
        c.ServerApp.trust_xheaders = True
        c.ServerApp.base_url = '{base_url}'
        c.ServerApp.notebook_dir = '{NOTEBOOK_WORK_PATH}'
        c.MappingKernelManager.cull_idle_timeout = 1800
        c.MappingKernelManager.cull_interval = 60
        c.MappingKernelManager.cull_connected = False
        c.MappingKernelManager.cull_busy = False
        {ai_config}
        """)
    }

    if welcome_notebook_path.exists():
        config["Welcome.ipynb"] = welcome_notebook_path.read_text(encoding="utf-8")
    else:
        logger.warning(f"Welcome notebook not found: {welcome_notebook_path}")
    return config

async def get_jupyter_env(model_service_info: InferenceService = None):
    env = LabJupyterEnv()

    # 自动转成 env dict（全部转成字符串）
    env_dict = {k: str(v) for k, v in env.model_dump().items()}
    # 动态添加额外的环境变量
    if model_service_info:
        url = model_service_info.base_url
        if "/chat/completions" in model_service_info.base_url:
            url = f"{(u := urlparse(url)).scheme}://{u.netloc}/{u.path.lstrip('/').split('/')[0]}"
        env_dict.update({
            "OPENAI_API_KEY": model_service_info.api_key,
            "OPENAI_BASE_URL": url,
            "OPENCODE_MODEL": f"openai/{model_service_info.model_name}",
        })

    return env_dict


async def get_volume_mounts(namespace: str, launcher: K8sLauncher, instance_name):
    # 准备卷挂载
    storage_items = [
        {"name": "notebook-pvc", "enum": StoragePath.NOTEBOOK_WORK},
        # 先去除公共挂载，后续有需要的场景再挂载
        # {"name": "public-pvc", "enum": StoragePath.NOTEBOOK_BUILTIN_MODELS},
        # {"name": "public-pvc", "enum": StoragePath.NOTEBOOK_BUILTIN_DATASETS},
    ]

    volume_mounts, volumes = await launcher.build_storage_volumes(storage_items, instance_name=instance_name)

    # 特殊挂载依然 append
    volume_mounts.append(
        client.V1VolumeMount(
            name="jupyter-config",
            mount_path="/root/.jupyter/jupyter_server_config.py",
            sub_path="jupyter_server_config.py"
        )
    )
    volumes.append(
        client.V1Volume(
            name="jupyter-config",
            config_map=client.V1ConfigMapVolumeSource(name=f"jupyter-config-{instance_name}")
        )
    )
    # 欢迎文件
    volume_mounts.append(
        client.V1VolumeMount(
            name="jupyter-config",
            mount_path=f"{NOTEBOOK_WORK_PATH}/Welcome.ipynb",
            sub_path="Welcome.ipynb"
        )
    )
    return volume_mounts, volumes


def _create_dataset_volume_mount(
    file_path: str,
    dataset_id: int,
    dataset_name: str,
    dataset_type: str,
    datasets_index: int,
    dataset_mounts: List[client.V1VolumeMount],
    version: Optional[str] = None
) -> int:
    """
    创建数据集挂载点（辅助函数）
    
    Args:
        file_path: 文件路径
        dataset_id: 数据集ID
        dataset_name: 数据集名称
        dataset_type: 数据集类型（用于日志）
        datasets_index: 当前索引
        dataset_mounts: 挂载列表
        version: 数据集版本（可选，用于日志）
    
    Returns:
        int: 更新后的索引值
    """
    # 从 file_path 中提取相对于存储路径的子路径
    sub_path = file_path.split("/", 2)[-1]  # 去掉前两级
    # mount_path 格式: /{notebook工作目录}/data{index}/{文件.后缀}
    mount_path = f"/lab/data{datasets_index}/{os.path.basename(file_path)}"
    if dataset_type == NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
        mount_path = f"/lab/data{datasets_index}/{dataset_name}_{version}{os.path.splitext(file_path)[1]}"

    # 创建挂载点
    dataset_mounts.append(
        client.V1VolumeMount(
            name=PvcName.PROJECT_READ_ONLY_PVC.value,
            mount_path=mount_path,
            sub_path=sub_path
        )
    )
    
    # 记录日志
    version_info = f", version={version}" if version else ""
    logger.info(
        f"准备挂载数据集: type={dataset_type}, dataset_id={dataset_id}, "
        f"dataset_name={dataset_name}{version_info}, sub_path={sub_path}"
    )
    
    return datasets_index + 1


async def _prepare_dataset_volume_mounts(dataset_config: Dict[str, List[int]], project_id: int) -> List[
    client.V1VolumeMount]:
    """
    根据 dataset 配置准备数据集挂载

    Args:
        dataset_config: 数据集配置，格式为 {"training": [1, 2], "validation": [1, 2], "test": [1, 2], "inference_result": [1, 2], "machine_learning_dataset": [1, 2]}
        namespace: 命名空间

    Returns:
        List[client.V1VolumeMount]: 数据集挂载列表
    """
    from app.schemas.training_dataset import DatasetUsage
    from app.models.models import MachineLearningDataset
    from app.core.depend_manager import AutoContainer
    from sqlalchemy import select

    dataset_mounts = []

    # 如果没有数据集配置，直接返回
    if not dataset_config:
        return dataset_mounts

    try:
        # 获取训练数据集服务和推理结果数据集服务
        training_dataset_service = AutoContainer.training_dataset_service()
        inference_result_dataset_service = AutoContainer.inference_result_dataset_service()
        machine_learning_dataset_service = AutoContainer.machine_learning_dataset_service()

        # 定义 usage 映射（训练数据集）
        usage_mapping = {
            NotebookExtDatasetType.TRAINING.value: DatasetUsage.TRAINING,
            NotebookExtDatasetType.VALIDATION.value: DatasetUsage.VALIDATION,
            NotebookExtDatasetType.TEST.value: DatasetUsage.TEST
        }

        # 定义 StoragePath 映射（训练数据集）
        storage_path_mapping = {
            NotebookExtDatasetType.TRAINING.value: StoragePath.SOURCE_TRAINING_DATASETS,
            NotebookExtDatasetType.VALIDATION.value: StoragePath.SOURCE_VALIDATION_DATASETS,
            NotebookExtDatasetType.TEST.value: StoragePath.SOURCE_TEST_DATASETS
        }

        # 遍历每种数据集类型
        datasets_index = 1
        for dataset_type, dataset_ids in dataset_config.items():
            if not dataset_ids or not isinstance(dataset_ids, list):
                continue
            
            # 处理推理结果集
            if dataset_type == NotebookExtDatasetType.INFERENCE_RESULT.value:
                # 获取推理结果数据集信息
                inference_datasets = await inference_result_dataset_service.get_inference_result_datasets_by_ids(
                    ids=dataset_ids, project_id=project_id
                )

                if not inference_datasets:
                    logger.warning(f"未找到推理结果数据集: ids={dataset_ids}")
                    continue

                # 为每个推理结果数据集创建挂载
                for dataset in inference_datasets:
                    if not dataset.file_path:
                        logger.warning(f"推理结果数据集 {dataset.id} 没有文件路径")
                        continue

                    datasets_index = _create_dataset_volume_mount(
                        file_path=dataset.file_path,
                        dataset_id=dataset.id,
                        dataset_name=dataset.name,
                        dataset_type=NotebookExtDatasetType.INFERENCE_RESULT.value,
                        datasets_index=datasets_index,
                        dataset_mounts=dataset_mounts
                    )

            # 处理机器学习数据集
            elif dataset_type == NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value:
                ml_dataset_items = dataset_ids
                ml_dataset_ids = [item["dataset_id"] for item in ml_dataset_items]
                ml_datasets = await machine_learning_dataset_service.machine_learning_dataset_mapper.query(
                    select(MachineLearningDataset).filter(
                        MachineLearningDataset.id.in_(ml_dataset_ids),
                        MachineLearningDataset.project_id == project_id
                    )
                )
                if not ml_datasets:
                    logger.warning(f"未找到机器学习数据集: ids={ml_dataset_ids}")
                    continue

                ml_dataset_map = {dataset.id: dataset for dataset in ml_datasets}
                for item in ml_dataset_items:
                    dataset = ml_dataset_map.get(item["dataset_id"])
                    if not dataset:
                        logger.warning(f"未找到机器学习数据集: id={item['dataset_id']}")
                        continue

                    export_format = str(item.get("format", "")).strip().lower()
                    dataset_path = f"{dataset.storage_path.rstrip('/')}/exports/{export_format}/export.zip"
                    if not export_format:
                        logger.warning(f"机器学习数据集 {dataset.id} 缺少导出格式")
                        continue
                    if not dataset_path:
                        logger.warning(f"机器学习数据集 {dataset.id} 没有可用路径")
                        continue
                    datasets_index = _create_dataset_volume_mount(
                        file_path=dataset_path,
                        dataset_id=dataset.id,
                        dataset_name=dataset.name,
                        dataset_type=NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value,
                        datasets_index=datasets_index,
                        dataset_mounts=dataset_mounts,
                        version=dataset.version
                    )
            # 处理训练数据集（training, validation, test）
            else:
                usage = usage_mapping.get(dataset_type)
                if not usage:
                    logger.warning(f"未知的数据集类型: {dataset_type}")
                    continue

                # 获取数据集信息
                datasets = await training_dataset_service.get_datasets_by_ids_and_usage(
                    ids=dataset_ids,
                    usage=usage,
                    project_id=project_id
                )

                if not datasets:
                    logger.warning(f"未找到数据集: type={dataset_type}, ids={dataset_ids}")
                    continue

                # 获取对应的 StoragePath
                storage_path_enum = storage_path_mapping.get(dataset_type)
                if not storage_path_enum:
                    logger.warning(f"未找到对应的存储路径枚举: {dataset_type}")
                    continue

                # 为每个数据集创建挂载
                for dataset in datasets:
                    dataset_path = dataset.dataset_path
                    # 图像理解，需要整个文件夹
                    if dataset.dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING:
                        dataset_path = os.path.dirname(dataset.dataset_path)
                    datasets_index = _create_dataset_volume_mount(
                        file_path=dataset_path,
                        dataset_id=dataset.id,
                        dataset_name=dataset.name,
                        dataset_type=dataset_type,
                        datasets_index=datasets_index,
                        dataset_mounts=dataset_mounts,
                        version=dataset.version
                    )

    except Exception as e:
        logger.error(f"准备数据集挂载失败: {str(e)}", exc_info=True)
        # 不抛出异常，允许 notebook 继续启动，只是没有数据集挂载

    return dataset_mounts




def _create_model_volume_mount(
        model_path: str,
        model_id: int,
        model_name: str,
        model_type: str,
        models_index: int,
        model_mounts: List[client.V1VolumeMount],
        version: Optional[str] = None
) -> int:
    """
    创建模型挂载点（辅助函数）

    Args:
        model_path: 模型路径
        model_id: 模型ID
        model_name: 模型名称
        model_type: 模型类型（用于日志）
        models_index: 当前索引
        model_mounts: 挂载列表
        version: 模型版本（可选，用于日志）

    Returns:
        int: 更新后的索引值
    """
    # 从 model_path 中提取相对于存储路径的子路径
    sub_path = model_path.split("/", 2)[-1]  # 去掉前两级
    # mount_path 格式: /{notebook工作目录}/models{index}/{模型名}
    mount_path = f"/lab/model{models_index}/{os.path.basename(model_path)}"

    # 创建挂载点
    if model_type == NotebookExtModelType.BASE_MODELS.value:
        name = PvcName.PUBLIC_PVC.value
    elif model_type == NotebookExtModelType.FINETUNED_MODELS.value:
        name = PvcName.PROJECT_READ_ONLY_PVC.value
    else:
        name = PvcName.PROJECT_READ_ONLY_PVC.value

    model_mounts.append(
        client.V1VolumeMount(
            name=name,
            mount_path=mount_path,
            sub_path=sub_path
        )
    )

    # 记录日志
    version_info = f", version={version}" if version else ""
    logger.info(
        f"准备挂载模型: type={model_type}, model_id={model_id}, "
        f"model_name={model_name}{version_info}, sub_path={sub_path}"
    )

    return models_index + 1


async def _prepare_model_volume_mounts(models_config: Dict[str, List[int]], project_id: int) -> List[
    client.V1VolumeMount]:
    """
    根据 models 配置准备模型挂载

    Args:
        models_config: 模型配置，格式为 {"base_models": [1, 2], "finetuned_models": [1, 2], "machine_learning_models": [1, 2]}
        project_id: 项目id

    Returns:
        List[client.V1VolumeMount]: 模型挂载列表
    """
    from app.models.model_manager import BaseModel, TrainedModel
    from app.core.depend_manager import AutoContainer
    from sqlalchemy import select

    model_mounts = []

    # 如果没有模型配置，直接返回
    if not models_config:
        return model_mounts

    try:
        # 获取模型服务（用于查询）
        model_service = AutoContainer.model_service()

        # 遍历每种模型类型
        models_index = 1
        for model_type, model_ids in models_config.items():
            if not model_ids or not isinstance(model_ids, list):
                continue

            # 处理基础模型
            if model_type == NotebookExtModelType.BASE_MODELS.value:
                # 查询基础模型
                base_models = await model_service.mapper.query(
                    select(BaseModel).filter(BaseModel.id.in_(model_ids))
                )

                if not base_models:
                    logger.warning(f"未找到基础模型: ids={model_ids}")
                    continue

                # 为每个基础模型创建挂载
                for model in base_models:
                    if not model.model_path:
                        logger.warning(f"基础模型 {model.id} 没有模型路径")
                        continue

                    models_index = _create_model_volume_mount(
                        model_path=model.model_path,
                        model_id=model.id,
                        model_name=model.name,
                        model_type=NotebookExtModelType.BASE_MODELS.value,
                        models_index=models_index,
                        model_mounts=model_mounts
                    )

            # 处理微调模型
            elif model_type == NotebookExtModelType.FINETUNED_MODELS.value:
                # 查询微调模型
                trained_models = await model_service.mapper.query(
                    select(TrainedModel).filter(TrainedModel.id.in_(model_ids),TrainedModel.project_id == project_id)
                )

                if not trained_models:
                    logger.warning(f"未找到微调模型: ids={model_ids}")
                    continue

                # 为每个微调模型创建挂载
                for model in trained_models:
                    if not model.model_path:
                        logger.warning(f"微调模型 {model.id} 没有模型路径")
                        continue

                    models_index = _create_model_volume_mount(
                        model_path=model.model_path,
                        model_id=model.id,
                        model_name=model.name,
                        model_type=NotebookExtModelType.FINETUNED_MODELS.value,
                        models_index=models_index,
                        model_mounts=model_mounts,
                        version=model.model_version
                    )
            # 处理机器学习模型
            elif model_type == NotebookExtModelType.MACHINE_LEARNING_MODELS.value:
                from app.models.model_manager import MLModel
                # 查询机器学习模型（仅当前项目）
                ml_models = await model_service.mapper.query(
                    select(MLModel).filter(
                        MLModel.id.in_(model_ids),
                        MLModel.project_id == project_id
                    )
                )

                if not ml_models:
                    logger.warning(f"未找到机器学习模型: ids={model_ids}")
                    continue

                # 为每个机器学习模型创建挂载
                for model in ml_models:
                    if not model.artifact_uri:
                        logger.warning(f"机器学习模型 {model.id} 没有模型路径(artifact_uri)")
                        continue

                    models_index = _create_model_volume_mount(
                        model_path=model.artifact_uri,
                        model_id=model.id,
                        model_name=model.name,
                        model_type=NotebookExtModelType.MACHINE_LEARNING_MODELS.value,
                        models_index=models_index,
                        model_mounts=model_mounts,
                        version=model.model_version
                    )
            else:
                logger.warning(f"未知的模型类型: {model_type}")

    except Exception as e:
        logger.error(f"准备模型挂载失败: {str(e)}", exc_info=True)
        # 不抛出异常，允许 notebook 继续启动，只是没有模型挂载

    return model_mounts


async def handle_affinity(ext: dict):
    node_selector_terms = []
    model = ext.get(NotebookExtKey.MODEL.value)
    memory = ext.get(NotebookExtKey.MEMORY.value)
    category = ext.get(NotebookExtKey.CATEGORY.value)

    if model:
        node_selector_terms.append(client.V1NodeSelectorTerm(
            match_expressions=[client.V1NodeSelectorRequirement(
                key="dp_graphics_card_model",  #型号
                operator="In",
                values=[model]
            )]
        ))

    if memory:
        node_selector_terms.append(client.V1NodeSelectorTerm(
            match_expressions=[client.V1NodeSelectorRequirement(
                key="dp_graphics_card_memory",  #显存
                operator="In",
                values=[memory]
            )]
        ))

    if category:
        node_selector_terms.append(client.V1NodeSelectorTerm(
            match_expressions=[client.V1NodeSelectorRequirement(
                key="dp_graphics_card_category",  #卡类型
                operator="In",
                values=[category]
            )]
        ))

    # 如果没有任何亲和规则，直接返回None
    if not node_selector_terms:
        return None

    affinity = client.V1Affinity(
        node_affinity=client.V1NodeAffinity(
            required_during_scheduling_ignored_during_execution=client.V1NodeSelector(
                node_selector_terms=node_selector_terms
            )
        )
    )
    return affinity


async def deploy(
    launcher,
    notebook: Notebook,
    instance_name,
    volume_mounts,
    volumes,
    parsed,
    project_id,
    manufacturer,
    extra_node_port: Optional[List[client.V1ServicePort]] = None,
    model_service_info: InferenceService = None,
    openapi: OpenAPIApplicationModel = None,
):
    lab_export_protocol = os.getenv('LAB_EXPORT_PROTOCOL')
    if not lab_export_protocol:
        raise HTTPException(status_code=500, detail="LAB_EXPORT_PROTOCOL not found")

    lab_export_address = os.getenv('LAB_EXPORT_ADDRESS')
    if not lab_export_address:
        raise HTTPException(status_code=500, detail="LAB_EXPORT_ADDRESS not found")

    cli_config = None
    if openapi:
        cli_config = {
            "key_id": f"{openapi.key_id}",
            "secret_key": f"{decrypt_openapi_secret(openapi.secret_key)}",
            "host": f"{lab_export_protocol}://{lab_export_address}",
            "project_id": f"{project_id}"
        }

    # 控制ssh启动参数
    # 动态生成密码
    secret = generate_password(16)
    command = ["/usr/bin/tini", "--", "/bin/sh", "-c"]
    args = [
        f"""
                # 1. 设置 root 密码
                echo 'root:{secret}' | chpasswd
                
                # 2. 创建 labutil 配置目录
                mkdir -p /root/.config/labutil

                # 3. 写入 labutil config
                echo '{json.dumps(cli_config or {}, ensure_ascii=False)}' > /root/.config/labutil/config.json
                # 4. 设置权限
                chmod 600 /root/.config/labutil/config.json

                # 2. 启动 sshd
                /usr/sbin/sshd

                # 3. 启动 JupyterLab
                exec start-notebook.sh --allow-root
                """
    ]
    lab_export_path = os.getenv('LAB_EXPORT_PATH')
    if not lab_export_path or lab_export_path == '':
        base_url = f'api/v1/notebooks/proxy/{project_id}/{notebook.id}/'
    else:
        lab_export_path = lab_export_path.lstrip("/")
        base_url = f'{lab_export_path}/api/v1/notebooks/proxy/{project_id}/{notebook.id}/'

    # 添加注解，控制运行时长
    annotations = {}
    if notebook.max_runtime_minutes:
        annotations = {
            "max_runtime_minutes": str(notebook.max_runtime_minutes)
        }

    # 处理显卡型号
    affinity = None

    if notebook.ext and notebook.ext.get(NotebookExtKey.MODEL.value):
        # Manufacturer
        if manufacturer and "火山云" in manufacturer:
            annotations["vke.volcengine.com/burst-to-vci"] = "enforce"
            annotations["vci.vke.volcengine.com/preferred-instance-types"] = notebook.ext.get(NotebookExtKey.MODEL.value)
            annotations["vci.vke.volcengine.com/gpu-driver-version"] = "tesla-535.161.07"
            annotations["vci.vke.volcengine.com/image-cache-id"] = "imc-3womvg1gw23x35cj7gnt"
        else:
            affinity = await handle_affinity(notebook.ext)

    env_vars = dict(await get_jupyter_env(model_service_info))
    if notebook.ext and notebook.ext.get("ml_debug"):
        env_vars["LOG_LEVEL"] = "DEBUG"

    result = await launcher.create_app(
        namespace=notebook.namespace,
        app_name=f"jupyter-{instance_name}",
        image=notebook.image,
        service_type="notebook",
        container_port=9000,
        cpu_limit=f"{notebook.resource_cpu_limit}",
        memory_limit=f"{notebook.resource_memory_limit}Gi",
        cpu_request=f"{notebook.resource_cpu_request}",
        memory_request=f"{notebook.resource_memory_request}Gi",
        gpu_type=notebook.gpu_type,
        gpu_count=notebook.gpu_count,
        env_vars=env_vars,
        config_maps={f"jupyter-config-{instance_name}": await get_jupyter_config(base_url, notebook.biz_type, model_service_info)},
        volume_mounts=volume_mounts,
        volumes=volumes,
        working_dir=StoragePath.NOTEBOOK_WORK.format_mount_path(),
        security_context=client.V1PodSecurityContext(run_as_user=0),
        automount_service_account_token=True,
        k8s_uuid=notebook.lab_k8s_uuid,
        command=command,
        args=args,
        is_ssh=True,
        pod_annotations=annotations,
        affinity=affinity,
        manufacturer=manufacturer,
        extra_node_port=extra_node_port,
        probe_url=f"/{base_url}{NOTEBOOK_PROBE_API}"
    )

    if secret:
        # 保存密码时，需要用aes加密
        notebook.secret = encrypt_password(secret)


    real_export_address = f"{lab_export_protocol}://{lab_export_address}"
    notebook.access_url = f"{real_export_address}/{base_url}"

    # 云厂商地址
    if manufacturer and "火山云" in manufacturer:
        address = await build_url_with_protocol(result["service_ip"])
        node_port = result['service_ports']['http']
        notebook.real_address = f"{address}:{node_port}/{base_url}"
        notebook.ssh_address = result["service_ip"]
        notebook.ssh_port = result['service_ports']['ssh']
    else:
        address = await build_url_with_protocol(parsed.hostname)
        notebook.real_address = f"{address}:{result['node_port']}/{base_url}"
        notebook.ssh_address = parsed.hostname
        notebook.ssh_port = result['ssh_port']

    if notebook.ext and notebook.ext.get("ml_debug"):
        notebook.status = TaskStatus.PENDING.value

    return notebook, result


async def stop_overdue_notebooks():
    """定时检查 notebook Pod/Deployment，超过最大运行时间就停掉 Deployment"""
    # 获取
    async with get_db_session() as db:  # 获取 AsyncSession
        result = await db.execute(select(KubernetesResource.config))
        configs = result.scalars().all()

    for config in configs:
        try:
            kube_config_dict = yaml.safe_load(config)
            apps_v1 = get_k8s_api(kube_config_dict, client.AppsV1Api)
            core_v1 = get_k8s_api(kube_config_dict, client.CoreV1Api)

            # 查询所有 namespace 中 app=notebook 的 Pod
            pods = await k8s_call(core_v1.list_pod_for_all_namespaces, label_selector=f"service=notebook")
            for pod in pods.items:
                pod_name = None
                try:
                    ns = pod.metadata.namespace
                    pod_name = pod.metadata.name
                    # 通过pod取deployment_name
                    owner = pod.metadata.owner_references[0]  # Pod -> ReplicaSet
                    rs_name = owner.name
                    rs = await k8s_call(apps_v1.read_namespaced_replica_set,name=rs_name, namespace=ns)
                    deployment_owner = rs.metadata.owner_references[0]  # ReplicaSet -> Deployment
                    deployment_name = deployment_owner.name

                    annotations = pod.metadata.annotations or {}  # 可能为 None
                    max_runtime_str = annotations.get("max_runtime_minutes")

                    logger.info(
                        f"检查命名空间：{ns}，deployment_name：{deployment_name}，max_runtime_str：{max_runtime_str}")
                    if not max_runtime_str:
                        continue

                    start_time = pod.status.start_time.replace(tzinfo=timezone.utc)
                    max_runtime = int(max_runtime_str)

                    now = datetime.now(timezone.utc)
                    running_minutes = (now - start_time).total_seconds() / 60
                    logger.info(
                        f"检查命名空间：{ns}，deployment_name：{deployment_name}，max_runtime_str：{max_runtime_str}，start_time："
                        f"{start_time}，now：{now}，running_minutes：{running_minutes}")
                    if running_minutes > max_runtime:
                        logger.info(f"[超时] 停止 Deployment {deployment_name} 在 namespace {ns}")
                        # 获取 Deployment
                        deployment = await k8s_call(apps_v1.read_namespaced_deployment, name=deployment_name,
                                                    namespace=ns)
                        # 查询构建记录
                        redis_client = settings.REDIS_CLIENT_SYNC
                        try:
                            # 写入构建记录
                            redis_key = f"build-image:{deployment_name}"
                            is_exists = redis_client.get(redis_key)
                            if is_exists:
                                logger.info(f"存在build-image:{deployment_name}，跳过")
                                continue
                        except Exception as e:
                            logger.error(f"Error Get build-image:{deployment_name}: {e}")
                        deployment.spec.replicas = 0
                        await k8s_call(apps_v1.replace_namespaced_deployment, name=deployment_name, namespace=ns,
                                       body=deployment)
                except Exception as pod_e:
                    logger.error(f"[错误] 定时任务pod:{pod_name}异常: {pod_e}")
        except Exception as e:
            logger.error(f"[错误] 定时任务异常: {e}")

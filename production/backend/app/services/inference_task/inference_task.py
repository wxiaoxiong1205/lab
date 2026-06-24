import asyncio
import shutil
from pathlib import Path
from kubernetes import client
import os
from urllib.parse import urlparse
import uuid
import shlex
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from fastapi_pagination import Page
from fastapi_pagination.default import Params
from sqlalchemy import select, and_, exists
import yaml

from app.common.status import TaskStatus
from app.core.logging import logger
from app.models.model_manager import TrainedModel, MLModel
from app.models.models import JwtUserInfo, KubernetesResource, ProjectKubernetesRelation, ChunkUploadSession, Notebook
from app.models.inference_task_manager import InferenceTask, InferenceTaskMlHandle
from app.schemas.inference_task import (
    BackendEnum, InferenceTaskCreate, InferenceTaskCreatedResponse, InferenceTaskRedeploy, InferenceTaskResponse,
    InferenceTaskScale, InferenceTaskSummaryResponse, InferenceTaskUpdate, InferenceTaskUpdateResponse, MlHandleInfo,
    ModelSourceEnum,
    ResourceCpuConfig, UpdateEnum, ProbeUrlEnum,
)
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.utils import k8s_call, app_runtime_context
from app.utils.k8s_launcher import K8sLauncher
from app.utils.error_messages import data_not_found_error
from app.utils.storage_enum import PvcName, StoragePath, PathConfig, ml_artifact_basename_is_model_pt
from app.utils.timezone_utils import get_current_shanghai_time
from app.utils.validators import validate_notebook_exists
from .interface import InferenceTaskService
from ...repository.inference_task_mapper import InferenceTaskMapper
from ...schemas.model import MlTaskType
from ...services.model.interface import ModelService
from ...services.storage.interface import StorageService


def build_ml_inference_task_proxy_access_url(project_id: int, inference_task_id: int) -> Optional[str]:
    """与 ml_backend_proxy 路由一致，拼出对推理任务后端的平台代理入口 URL 前缀。"""
    lab_export_protocol = os.getenv("LAB_EXPORT_PROTOCOL")
    lab_export_address = os.getenv("LAB_EXPORT_ADDRESS")
    if not lab_export_protocol or not lab_export_address:
        return None
    rel = f"api/v1/ml_backend/proxy/{project_id}/{inference_task_id}/"
    lab_export_path = os.getenv("LAB_EXPORT_PATH")
    if not lab_export_path or lab_export_path == "":
        full_path = rel
    else:
        full_path = f"{lab_export_path.lstrip('/')}/{rel}"
    return f"{lab_export_protocol}://{lab_export_address}/{full_path}"


# ML 部署与 Notebook 工作区一致：启动命令前统一使能 /workspace 下虚拟环境（含前端传入的 run_command）
# ML_INFERENCE_VENV_ENABLE_PREFIX = "source /workspace/.venv/bin/activate && "
ML_INFERENCE_VENV_ENABLE_PREFIX = ""
ML_INFERENCE_VENV_ACTIVATE_MARKER = "source /workspace/.venv/bin/activate"


@dataclass
class InferenceK8sRuntime:
    """创建 K8s 工作负载所需的引擎侧参数（与入参 task 一致，便于创建接口与异步部署共用）"""

    command: List[str]
    run_command: str
    container_port: int
    probe_url: Optional[str]
    args: Optional[Any]
    working_dir: Optional[str]


class DefaultInferenceTaskService(InferenceTaskService):
    """推理任务服务实现类"""

    def __init__(
        self,
        mapper: InferenceTaskMapper,
        storage: StorageService,
        model_service: ModelService,
    ) -> None:
        super().__init__(mapper, storage, model_service)

    async def _get_k8s_launcher(self, project_id: int) -> K8sLauncher:
        """获取 K8s Launcher 实例"""
        config = await self.mapper.query(
            select(KubernetesResource.config)
            .join(ProjectKubernetesRelation,
                  ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        if not config:
            raise HTTPException(status_code=404, detail="Kubernetes configuration not found")
        return K8sLauncher(config_str=config[0])
    
    async def _get_run_command(self, command: List[str], backend_parameters: Optional[List[str]] = None) -> str:
        if not command:
            raise ValueError("Command cannot be empty")
        
        cmd_parts = [part.strip() for part in command if part.strip()]
        
        if backend_parameters:
            cmd_parts.extend(part.strip() for part in backend_parameters if part.strip())

        return " ".join(cmd_parts)

    @staticmethod
    def _infer_ml_handle_py_from_model_source_ref(source_ref: str) -> Optional[str]:
        """由 ML 模型在 Notebook 下的 source_ref 推断 model.py 相对路径（与产物同目录或目录内 model.py）。"""
        s = (source_ref or "").strip().lstrip("/")
        if not s:
            return None
        s_posix = s.replace("\\", "/")
        sl = s_posix.lower()
        if sl.endswith(".py"):
            return s_posix
        p = Path(s_posix)
        if sl.endswith(".pt"):
            parent = p.parent
            rel = "model.py" if str(parent) in (".", "") else str(parent / "model.py").replace("\\", "/")
            return rel
        base = str(p).rstrip("/")
        if not base:
            return None
        return f"{base}/model.py"

    @staticmethod
    def _build_ml_handle_download_url(ml_handle_jfs_path: Optional[str]) -> Optional[str]:
        """根据存储路径拼出 /api/v1/storage/download/{tenant_id}/{path} 形式的下载链接。"""
        if not ml_handle_jfs_path:
            return None
        tenant_id = app_runtime_context.get_tenant_id()
        if not tenant_id:
            return None
        normalized_path = ml_handle_jfs_path.strip().lstrip("/")
        if not normalized_path:
            return None
        return f"/api/v1/storage/download/{tenant_id}/{normalized_path}"

    async def _prepare_ml_model_handle_py(
            self,
            project_id: int,
            ml_model_id: int,
            upload_id: str,
    ) -> Tuple[str, str]:
        """按 uploadId 将 .py 拷贝至 ML_MODEL_HANDLE_IMP_PY_FILE；JFS 首段与 ML 模型、PVC sub_path 一致。"""
        jfs_ns = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        dest = StoragePath.ML_MODEL_HANDLE_IMP_PY_FILE.format_storage_path(
            namespace=jfs_ns, model_id=ml_model_id
        )
        jfs = await self.storage.JUICEFS_CLIENT()
        parent = os.path.dirname(dest.rstrip("/"))
        if parent and not jfs.exists(parent):
            jfs.makedirs(parent, exist_ok=True)

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
                detail="分片上传源路径为目录，应为单个 .py 文件",
            )
        fname = (session.file_name or "").lower()
        if not fname.endswith(".py"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="推理处理脚本须为 .py 文件",
            )
        with jfs.open(src, "rb") as f_in, jfs.open(dest, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        logger.info("ML 部署推理脚本已写入 %s (uploadId=%s)", dest, uid)
        return dest, uid

    async def _prepare_ml_model_handle_from_notebook(
        self,
        project_id: int,
        ml_model_id: int,
        notebook_id: int,
        handle_source_ref: str,
    ) -> str:
        """从 Notebook 工作区拷贝 .py 至 ML_MODEL_HANDLE_IMP_PY_FILE（与 register_ml_model 路径规则一致）。"""
        jfs_ns = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        unregistered_base = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=jfs_ns,
            instance_name=f"notebook-{notebook_id}",
        )
        sub = (handle_source_ref or "").strip().lstrip("/")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="handle_source_ref 不能为空，请填写 Notebook 工作区内 .py 相对路径",
            )
        base = unregistered_base.rstrip("/")
        source_path = f"{base}/{sub}"

        jfs = await self.storage.JUICEFS_CLIENT()
        if not jfs.exists(source_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Notebook 中不存在该推理脚本路径：{source_path}",
            )
        try:
            src_stat = jfs.stat(source_path)
        except OSError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法读取 Notebook 侧脚本路径",
            )
        if (src_stat.st_mode & 0o40000) != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="推理处理脚本须为单个 .py 文件，不能是目录",
            )
        if not sub.lower().endswith(".py"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="推理处理脚本须为 .py 文件",
            )

        dest = StoragePath.ML_MODEL_HANDLE_IMP_PY_FILE.format_storage_path(
            namespace=jfs_ns, model_id=ml_model_id
        )
        parent = os.path.dirname(dest.rstrip("/"))
        if parent and not jfs.exists(parent):
            jfs.makedirs(parent, exist_ok=True)

        with jfs.open(source_path, "rb") as f_in, jfs.open(dest, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        logger.info(
            "ML 部署推理脚本已从 Notebook 拷贝至 %s (notebook_id=%s ref=%s)",
            dest,
            notebook_id,
            sub,
        )
        return dest

    async def copy_ml_model_handle_script_for_notebook(
        self, project_id: int, ml_model_id: int, upload_id: str
    ) -> Tuple[str, str]:
        """供 Notebook ML 在线开发：与部署共用同一 JFS 路径与校验逻辑。"""
        return await self._prepare_ml_model_handle_py(project_id, ml_model_id, upload_id)

    async def copy_ml_model_handle_from_notebook_for_dev(
        self,
        project_id: int,
        ml_model_id: int,
        notebook_id: int,
        handle_source_ref: str,
    ) -> str:
        """在线开发：从 Notebook 工作区拷贝 model.py 至统一 handle 路径。"""
        return await self._prepare_ml_model_handle_from_notebook(
            project_id, ml_model_id, notebook_id, handle_source_ref
        )

    async def _resolve_inference_engine_for_k8s(self, task: InferenceTaskCreate) -> InferenceK8sRuntime:
        """根据推理引擎类型解析 command / run_command / 探针与端口等，供写入 DB 与 K8s create_app 共用。"""
        if task.env_vars is None:
            task.env_vars = {}
        probe_url: Optional[str] = None
        args: Optional[Any] = None
        working_dir: Optional[str] = "/data"

        if task.inference_engine_type == BackendEnum.VLLM:
            command = ["vllm", "serve"]
            run_command = await self._get_run_command(command, task.backend_parameters)
            container_port = 8000
            probe_url = ProbeUrlEnum.VLLM.value
        elif task.inference_engine_type == BackendEnum.SGLANG:
            command = ["python", "-m", "sglang.launch_server"]
            run_command = await self._get_run_command(command, task.backend_parameters)
            container_port = 30000
        elif task.inference_engine_type == BackendEnum.DGI_SERVER:
            command = ["/bin/bash", "-c"]
            backend_parameters = ["source /root/venvs/dgi/bin/activate && dgi serve", *task.backend_parameters]
            args_ = "source /root/venvs/dgi/bin/activate && dgi serve"
            run_command = await self._get_run_command(command, backend_parameters)
            args = [args_ + " " + " ".join(shlex.quote(arg) for arg in task.backend_parameters)]
            container_port = 8080
            probe_url = ProbeUrlEnum.DGI_SERVER.value
            if not task.env_vars.get("ASCEND_RT_VISIBLE_DEVICES"):
                card_count = task.graphics_card_resource.count
                task.env_vars["ASCEND_RT_VISIBLE_DEVICES"] = ",".join(str(i) for i in range(card_count))
        elif task.inference_engine_type == BackendEnum.ML:
            raw = str(task.run_command).strip() if task.run_command and str(task.run_command).strip() else ""
            default_core = "gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app"
            if not raw:
                inner_sh = f"{ML_INFERENCE_VENV_ENABLE_PREFIX}{default_core}"
            elif raw.lstrip().startswith(ML_INFERENCE_VENV_ACTIVATE_MARKER) or raw.lstrip().startswith(
                "/bin/bash"
            ):
                # 已含 venv 使能，或详情回显的整段 /bin/bash -c …（再部署时勿重复拼接）
                inner_sh = raw
            else:
                inner_sh = f"{ML_INFERENCE_VENV_ENABLE_PREFIX}{raw}"
            command = ["/bin/bash", "-c", inner_sh]
            run_command = await self._get_run_command(command, task.backend_parameters)
            container_port = 9090
            working_dir = "/workspace/ml_backend"
            task.env_vars["LOG_LEVEL"] = "DEBUG"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported inference engine type",
            )

        return InferenceK8sRuntime(
            command=command,
            run_command=run_command,
            container_port=container_port,
            probe_url=probe_url,
            args=args,
            working_dir=working_dir
        )

    async def deploy_inference_task_k8s_async(
        self,
        inference_task_id: int,
        project_id: int,
        task: InferenceTaskCreate,
        pin_node_port: Optional[int] = None,
    ) -> None:
        """由 Celery 执行：查询集群、挂载存储并创建 K8s 资源；失败时将任务标记为创建失败。"""
        try:
            res = await self.mapper.execute(
                select(InferenceTask).where(
                    and_(
                        InferenceTask.id == inference_task_id,
                        InferenceTask.project_id == project_id,
                    )
                )
            )
            inference_task = res.scalar_one_or_none()
            if not inference_task:
                logger.error(
                    "deploy_inference_task_k8s_async: 推理任务不存在 id=%s project_id=%s",
                    inference_task_id,
                    project_id,
                )
                return

            runtime = await self._resolve_inference_engine_for_k8s(task)
            command = runtime.command
            container_port = runtime.container_port
            probe_url = runtime.probe_url
            args = runtime.args
            working_dir = runtime.working_dir

            config_result = await self.mapper.execute(
                select(KubernetesResource.config, KubernetesResource.ext, KubernetesResource.api_server)
                .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                .where(ProjectKubernetesRelation.project_id == project_id)
            )
            config_ext = config_result.one_or_none()
            if not config_ext:
                raise ValueError("未找到项目 Kubernetes 集群配置")

            config, k8s_ext, api_server = config_ext
            manufacturer = (k8s_ext or {}).get("manufacturer")

            # 去掉端口--改成取api_server，一般api_server是从config解析出来的
            parsed = urlparse(api_server)

            launcher = K8sLauncher(config_str=config)
            namespace = inference_task.namespace
            model_id = inference_task.model_id

            # 将仓库 scripts/ 同步到 JuiceFS（与离线推理等任务共用 BaseK8sTask 逻辑）
            try:
                jfs = await self.storage.JUICEFS_CLIENT()
                from app.services.inference_task.inference_deploy_scripts_uploader import (
                    InferenceDeployScriptsUploader,
                )

                script_uploader = InferenceDeployScriptsUploader(
                    project_id=project_id,
                    namespace=namespace,
                    k8s_uuid=inference_task.lab_k8s_uuid,
                    launcher=launcher,
                    db=self.mapper,
                    jfs=jfs,
                )
                await script_uploader.build_script_configs()
            except Exception as script_ex:
                logger.warning(
                    "推理部署 scripts 同步到 JuiceFS 失败，将继续部署（容器内 /app/scripts 可能为空或旧版本）: %s",
                    script_ex,
                    exc_info=True,
                )

            ml_model_for_deploy: Optional[MLModel] = None
            if task.model_source == ModelSourceEnum.ML_MODEL:
                ml_row_pre = await self.mapper.execute(select(MLModel).where(MLModel.id == model_id))
                ml_model_for_deploy = ml_row_pre.scalar_one_or_none()
                if ml_model_for_deploy and task.ml_model_config:
                    cfg = task.ml_model_config
                    st_h = (cfg.ml_handle_source_type or "upload").strip().lower()
                    uid_h = (cfg.ml_handle_upload_id or "").strip()
                    nid_h: Optional[int] = None
                    href_h = ""
                    if st_h == "notebook":
                        nid_h = cfg.notebook_id
                        href_h = (cfg.handle_source_ref or "").strip()
                        if nid_h is not None and not href_h and ml_model_for_deploy.notebook_id == nid_h:
                            href_h = self._infer_ml_handle_py_from_model_source_ref(
                                ml_model_for_deploy.source_ref or ""
                            ) or ""
                    elif st_h == "upload" and not uid_h:
                        if (
                            ml_model_for_deploy.notebook_id is not None
                            and (ml_model_for_deploy.source_type or "").strip().lower() == "notebook"
                        ):
                            nid_h = ml_model_for_deploy.notebook_id
                            href_h = self._infer_ml_handle_py_from_model_source_ref(
                                ml_model_for_deploy.source_ref or ""
                            ) or ""
                    if nid_h is not None and href_h:
                        await self._prepare_ml_model_handle_from_notebook(
                            project_id, model_id, nid_h, href_h
                        )

            storage_items: List[dict] = []
            if task.model_source == ModelSourceEnum.BASE_MODEL:
                storage_items.append({"name": "public-pvc", "enum": StoragePath.INFEERENCE_BASE_MODELS})
            elif task.model_source == ModelSourceEnum.TRAINED_MODEL:
                storage_items.append({"name": "llm-training-pvc", "enum": StoragePath.INFEERENCE_TRAINED_MODELS})
            else:
                storage_items.append({"name": "llm-training-pvc", "enum": StoragePath.ML_MODEL})
                # 非「文件名为 model.pt」的产物：额外挂到容器内 /data/models/model.pt（见 ml_artifact_basename_is_model_pt）
                if ml_model_for_deploy is not None:
                    artifact_uri = (ml_model_for_deploy.artifact_uri or "").strip()
                    if artifact_uri and not ml_artifact_basename_is_model_pt(artifact_uri):
                        storage_items.append(
                            {
                                "name": "llm-training-pvc",
                                "enum": PathConfig(
                                    mount_path="/data/models/model.pt",
                                    storage_path=artifact_uri
                                    if artifact_uri.startswith("/")
                                    else f"/{artifact_uri}",
                                ),
                            }
                        )
                        logger.info(
                            f"ML 推理部署：非标准 model.pt 文件名产物，已追加挂载到容器 /data/models/model.pt | "
                            f"inference_task_id={inference_task_id} model_id={model_id} artifact_uri={artifact_uri}"
                        )

                storage_items.append({"name": "llm-training-pvc", "enum": StoragePath.ML_MODEL_DEMO})
                mh_res = await self.mapper.execute(
                    select(InferenceTaskMlHandle.ml_handle_jfs_path).where(
                        InferenceTaskMlHandle.inference_task_id == inference_task_id
                    )
                )
                ml_handle_jfs_path = mh_res.scalar_one_or_none()
                if ml_handle_jfs_path:
                    storage_items.append(
                        {"name": "llm-training-pvc", "enum": StoragePath.ML_MODEL_HANDLE_IMP_PY_FILE}
                    )

            ml_task_type = ""
            if ml_model_for_deploy:
                ml_task_type = ml_model_for_deploy.task_type or ""

            volume_mounts, volumes = await launcher.build_storage_volumes(
                storage_items,
                namespace=namespace,
                model_id=model_id,
                ml_task_type=ml_task_type,
            )

            volume_mounts.append(
                client.V1VolumeMount(
                    name="shm",
                    mount_path="/dev/shm",
                )
            )
            volumes.append(
                client.V1Volume(
                    name="shm",
                    empty_dir=client.V1EmptyDirVolumeSource(medium="Memory", size_limit="4Gi"),
                )
            )

            if task.inference_engine_type != BackendEnum.DGI_SERVER:
                args = task.backend_parameters

            env_vars = task.env_vars or {}
            app_name = f"model-deploy-{inference_task.id}"

            result = await launcher.create_app(
                namespace=inference_task.namespace,
                app_name=app_name,
                image=task.image_config.image_url,
                service_type="inference",
                container_port=container_port,
                k8s_uuid=inference_task.lab_k8s_uuid,
                node_port=pin_node_port,
                cpu_limit=f"{task.resource_cpu_config.resource_cpu_limit}",
                memory_limit=f"{task.resource_cpu_config.resource_memory_limit}Gi",
                cpu_request=f"{task.resource_cpu_config.resource_cpu_request}",
                memory_request=f"{task.resource_cpu_config.resource_memory_request}Gi",
                gpu_type=task.graphics_card_resource.k8s_resource_type,
                gpu_count=task.graphics_card_resource.count,
                volume_mounts=volume_mounts,
                volumes=volumes,
                working_dir=working_dir,
                automount_service_account_token=True,
                command=command,
                args=args,
                env_vars=env_vars,
                manufacturer=manufacturer,
                replicas=task.desired_replicas,
                probe_url=probe_url,
            )

            node_port = result.get("node_port")
            if node_port:
                inference_task.k8s_service_nodeport = str(node_port)
                inference_task.access_url = f"http://{parsed.hostname}:{node_port}"

            inference_task.updated_at = get_current_shanghai_time()
            await self.mapper.commit()
            await self.mapper.refresh(inference_task)
        except Exception as e:
            logger.exception(
                "推理任务 K8s 异步部署失败 inference_task_id=%s: %s",
                inference_task_id,
                e,
            )
            try:
                res_failed = await self.mapper.execute(
                    select(InferenceTask).where(InferenceTask.id == inference_task_id)
                )
                row = res_failed.scalar_one_or_none()
                if row:
                    row.status = TaskStatus.CREATION_FAILED.value
                    row.updated_at = get_current_shanghai_time()
                    await self.mapper.commit()
            except Exception as e2:
                logger.exception("更新推理任务失败状态时出错: %s", e2)

    # ------------------------------ 核心业务方法实现 ------------------------------
    async def create_inference_task(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            task: InferenceTaskCreate,
            pin_node_port: Optional[int] = None,
    ) -> InferenceTaskCreatedResponse:
        k8s_uuid = str(uuid.uuid4())
        # 校验inference_task名称重复,包括project id
        is_exists = await self.exists(
            name=task.server_name,
            project_id=project_id,
            model_source=task.model_source,
        )
        if is_exists:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"该项目下、同一模型来源（{task.model_source.value}）已存在同名服务：{task.server_name}"
                ),
            )

        task.project_id = project_id

        runtime = await self._resolve_inference_engine_for_k8s(task)
        run_command = runtime.run_command

        namespace=f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

        ml_handle_jfs_path: Optional[str] = None
        ml_handle_upload_id: Optional[str] = None
        ml_handle_source_type_for_db: Optional[str] = None
        notebook_id_for_db: Optional[int] = None
        handle_source_ref_for_db: Optional[str] = None

        # 解析模型 ID、路径、名称（含 ml_model 分支，ML 模型由后端根据 id 查表带出 path/name）
        if task.model_source == ModelSourceEnum.BASE_MODEL:
            model_id = task.base_model_config.base_model_id
            model_path = task.base_model_config.base_model_path
            model_name = task.base_model_config.base_model_name
        elif task.model_source == ModelSourceEnum.TRAINED_MODEL:
            model_id = task.trained_model_config.trained_model_id
            model_path = task.trained_model_config.trained_model_path
            model_name = task.trained_model_config.trained_model_name
        elif task.model_source == ModelSourceEnum.ML_MODEL:
            model_id = task.ml_model_config.ml_model_id
            ml_row = await self.mapper.execute(select(MLModel).where(MLModel.id == model_id))
            ml_model:MLModel = ml_row.scalar_one_or_none()
            if not ml_model or ml_model.project_id != project_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="机器学习模型不存在或不属于当前项目")
            model_path = ml_model.artifact_uri or ""
            model_name = task.ml_model_config.ml_model_name or f"{ml_model.name}_{ml_model.model_version}"
            if not model_path:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该机器学习模型尚未有有效的模型路径(artifact_uri)")
            if ml_model.status == TaskStatus.FAILED.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="该机器学习模型产物复制失败，请在模型管理中修正来源或重新上传后重试，待状态为「已完成」后再部署",
                )
            if ml_model.status == TaskStatus.CREATING.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="该机器学习模型产物仍在复制中，请待状态变为「已完成」后再发起部署",
                )
            self.model_service.ensure_ml_task_scripts_present_http(ml_model.task_type)
            handle_src = (task.ml_model_config.ml_handle_source_type or "upload").strip().lower()
            if handle_src == "notebook":
                nid = task.ml_model_config.notebook_id
                href = (task.ml_model_config.handle_source_ref or "").strip()
                if nid is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="model.py 来源为 notebook 时须在 ml_model_config 中提供 notebook_id",
                    )
                if not href:
                    if ml_model.notebook_id != nid:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="未填写 handle_source_ref 时，notebook_id 须与机器学习模型注册时的 Notebook 一致，以便推断 model.py 路径",
                        )
                    href = self._infer_ml_handle_py_from_model_source_ref(ml_model.source_ref or "") or ""
                if not href:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="请填写 handle_source_ref，或确保模型自 Notebook 注册且可推断 model.py 路径",
                    )
                await validate_notebook_exists(await self.mapper.get_session(), nid)
                nb_res = await self.mapper.execute(select(Notebook).where(Notebook.id == nid))
                nb = nb_res.scalar_one_or_none()
                if not nb or nb.project_id != project_id:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Notebook 不存在或不属于当前项目",
                    )
                ml_handle_jfs_path = await self._prepare_ml_model_handle_from_notebook(
                    project_id, model_id, nid, href
                )
                ml_handle_upload_id = None
                ml_handle_source_type_for_db = "notebook"
                notebook_id_for_db = nid
                handle_source_ref_for_db = href
            elif handle_src == "upload":
                upload_id = (task.ml_model_config.ml_handle_upload_id or "").strip()
                if not upload_id:
                    if (
                        ml_model.notebook_id is not None
                        and (ml_model.source_type or "").strip().lower() == "notebook"
                    ):
                        href_fb = self._infer_ml_handle_py_from_model_source_ref(
                            ml_model.source_ref or ""
                        ) or ""
                        if href_fb:
                            await validate_notebook_exists(
                                await self.mapper.get_session(), ml_model.notebook_id
                            )
                            nb_res = await self.mapper.execute(
                                select(Notebook).where(Notebook.id == ml_model.notebook_id)
                            )
                            nb = nb_res.scalar_one_or_none()
                            if not nb or nb.project_id != project_id:
                                raise HTTPException(
                                    status_code=status.HTTP_404_NOT_FOUND,
                                    detail="Notebook 不存在或不属于当前项目",
                                )
                            ml_handle_jfs_path = await self._prepare_ml_model_handle_from_notebook(
                                project_id, model_id, ml_model.notebook_id, href_fb
                            )
                            ml_handle_upload_id = None
                            ml_handle_source_type_for_db = "notebook"
                            notebook_id_for_db = ml_model.notebook_id
                            handle_source_ref_for_db = href_fb
                        else:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=(
                                    "请先完成分片上传并 merge，或指定 ml_handle_source_type=notebook 与 notebook 路径，"
                                    "或注册模型时提供可推断 model.py 的 Notebook source_ref"
                                ),
                            )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                "请先完成分片上传并 merge，或在 ml_model_config 中设置 ml_handle_source_type=notebook "
                                "并填写 notebook_id、handle_source_ref"
                            ),
                        )
                else:
                    ml_handle_jfs_path, ml_handle_upload_id = await self._prepare_ml_model_handle_py(
                        project_id, model_id, upload_id
                    )
                    ml_handle_source_type_for_db = "upload"
                    notebook_id_for_db = None
                    handle_source_ref_for_db = None
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="ml_handle_source_type 须为 upload 或 notebook",
                )
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的 model_source")

        # 创建推理任务记录（状态为CREATED）
        inference_task = InferenceTask(
            server_name=task.server_name,
            description=task.description,
            model_id=model_id,
            model_source=task.model_source.value,
            model_path=model_path,
            model_name=model_name,
            project_id=project_id,
            desired_replicas=task.desired_replicas,
            status=TaskStatus.CREATED,
            inference_engine_type=task.inference_engine_type,
            image_id=task.image_config.image_id,
            image_name=task.image_config.image_name,
            ready_replicas=0,
            gpu_type=task.graphics_card_resource.k8s_resource_type,
            gpu_count=task.graphics_card_resource.count,
            graphics_card_resource=task.graphics_card_resource.model_dump(),
            resource_cpu_config=task.resource_cpu_config.model_dump(),
            run_command=run_command,
            backend_parameters=task.backend_parameters,
            env_vars=task.env_vars,
            namespace=namespace,
            lab_k8s_uuid=k8s_uuid,
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        await self.mapper.insert(inference_task)
        await self.mapper.commit()
        await self.mapper.refresh(inference_task)
        if ml_handle_jfs_path:
            ml_handle = InferenceTaskMlHandle(
                inference_task_id=inference_task.id,
                ml_handle_upload_id=ml_handle_upload_id,
                ml_handle_jfs_path=ml_handle_jfs_path,
                ml_handle_source_type=ml_handle_source_type_for_db,
                notebook_id=notebook_id_for_db,
                handle_source_ref=handle_source_ref_for_db,
            )
            session = await self.mapper.get_session()
            session.add(ml_handle)
            await self.mapper.commit()

        # K8s 创建与存储挂载改为 Celery 异步执行，避免接口长时间阻塞
        from app.tasks.inference_deploy_tasks import deploy_inference_task_k8s_task

        deploy_inference_task_k8s_task.apply_async(
            kwargs={
                "inference_task_id": inference_task.id,
                "project_id": project_id,
                "task_payload": task.model_dump(mode="json"),
                "pin_node_port": pin_node_port,
                "tenant_id": current_user.tenantId,
            }
        )

        return InferenceTaskCreatedResponse(
            id=inference_task.id,
            server_name=inference_task.server_name,
            description=inference_task.description,
            project_id=inference_task.project_id,
            message="推理任务已创建，K8s 部署已在后台执行，请稍后查看任务详情中的访问地址",
            model_source=inference_task.model_source,
            model_name=inference_task.model_name,
        )
        
    async def list_inference_tasks(
        self, 
        project_id: int, 
        server_name: Optional[str] = None, 
        model_name: Optional[str] = None,
        model_source: Optional[List[ModelSourceEnum]] = None,
        status: Optional[TaskStatus] = None,
        inference_engine_type: Optional[List[BackendEnum]] = None,
        usage: Optional[MlTaskType] = None,
        page: Optional[int] = None, size: Optional[int] = None
    ) -> Page[InferenceTaskSummaryResponse]:
        query = (
            select(InferenceTask)
            .filter(InferenceTask.project_id == project_id)
            .order_by(InferenceTask.updated_at.desc())
        )
        
        if server_name:
            query = query.filter(InferenceTask.server_name.ilike(f"%{server_name}%"))
            
        if model_name:
            query = query.filter(InferenceTask.model_name.ilike(f"%{model_name}%"))
        
        if model_source:
            query = query.filter(
                InferenceTask.model_source.in_([ms.value for ms in model_source])
            )
        else:
            # 非机器学习模型部署 默认列表
            query = query.filter(InferenceTask.model_source != ModelSourceEnum.ML_MODEL.value)
            
        if status:
            query = query.filter(InferenceTask.status == status.value)

        if inference_engine_type:
            query = query.filter(
                InferenceTask.inference_engine_type.in_(
                    [engine_type.value for engine_type in inference_engine_type]
                )
            )

        if usage is not None:
            usage_val = usage.value
            ml_model_matches_task_type = exists(
                select(1)
                .select_from(MLModel)
                .where(
                    MLModel.id == InferenceTask.model_id,
                    InferenceTask.model_source == ModelSourceEnum.ML_MODEL.value,
                    MLModel.task_type == usage_val,
                )
            )
            query = query.where(ml_model_matches_task_type)
            
        page = await self.mapper.query_page(query, page, size)

        def _model_source_value(src: Any) -> str:
            return src.value if isinstance(src, ModelSourceEnum) else str(src)

        # query_page 的 items 可能为 ORM 或已转换的摘要对象，不一定含 model_id；按当前页 id 回表取 model_id / model_source
        page_ids = [it.id for it in page.items]
        task_by_id: Dict[int, Tuple[int, str]] = {}
        if page_ids:
            meta_res = await self.mapper.execute(
                select(InferenceTask.id, InferenceTask.model_id, InferenceTask.model_source).where(
                    InferenceTask.id.in_(page_ids)
                )
            )
            for tid, mid, src in meta_res.all():
                task_by_id[int(tid)] = (int(mid), str(src))

        ml_model_ids = list(
            dict.fromkeys(
                task_by_id[iid][0]
                for iid in page_ids
                if iid in task_by_id
                and _model_source_value(task_by_id[iid][1]) == ModelSourceEnum.ML_MODEL.value
            )
        )
        network_by_ml_id: Dict[int, Optional[str]] = {}
        if ml_model_ids:
            ml_res = await self.mapper.execute(
                select(MLModel.id, MLModel.network_structure).where(
                    MLModel.id.in_(ml_model_ids)
                )
            )
            for mid, ns in ml_res.all():
                network_by_ml_id[int(mid)] = ns

        new_items: List[InferenceTaskSummaryResponse] = []
        for item in page.items:
            if isinstance(item.model_source, str):
                item.model_source = ModelSourceEnum(item.model_source)

            if isinstance(item.status, str):
                item.status = TaskStatus(item.status)

            created_by = item.created_by or ""
            ms = item.model_source
            proxy_url = (
                build_ml_inference_task_proxy_access_url(project_id, item.id)
                if ms == ModelSourceEnum.ML_MODEL
                else None
            )
            arch = "-"
            if ms == ModelSourceEnum.ML_MODEL:
                row = task_by_id.get(item.id)
                ml_row_id = row[0] if row else None
                if ml_row_id is not None:
                    raw = network_by_ml_id.get(ml_row_id)
                    if raw is not None and str(raw).strip():
                        arch = str(raw).strip()
            new_items.append(
                InferenceTaskSummaryResponse(
                    id=item.id,
                    server_name=item.server_name,
                    description=item.description,
                    project_id=item.project_id,
                    status=item.status,
                    model_source=ms,
                    model_name=item.model_name,
                    desired_replicas=item.desired_replicas,
                    ready_replicas=item.ready_replicas,
                    created_by=created_by,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                    access_url=item.access_url,
                    proxy_access_url=proxy_url,
                    network_architecture=arch,
                )
            )

        return Page(
            items=new_items,
            total=page.total,
            page=page.page,
            size=page.size,
            pages=page.pages,
        )


    async def get_inference_task(
            self, project_id: int, inference_task_id: int
    ) -> InferenceTaskResponse:
        # 查询指定 inference_task_id 的信息
        result = await self.mapper.execute(
            select(InferenceTask).where(
                and_(
                    InferenceTask.project_id == project_id,
                    InferenceTask.id == inference_task_id
                )
            )
        )
        inference_task = result.scalar_one_or_none()
        if not inference_task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=data_not_found_error("推理任务", "inference_task_id", inference_task_id)
            )
            
        app_name=f"model-deploy-{inference_task.id}"
        trained_model = None
        if inference_task.model_source == ModelSourceEnum.TRAINED_MODEL.value:
            trained_model = await self.mapper.execute(
                select(TrainedModel)
                .where(
                    and_(TrainedModel.project_id == project_id,
                         TrainedModel.id == inference_task.model_id,
                    )
                )
            )
            trained_model = trained_model.scalar_one_or_none()
        # ml_model 时也可带出版本号用于展示
        ml_model = None
        if inference_task.model_source == ModelSourceEnum.ML_MODEL.value:
            ml_res = await self.mapper.execute(select(MLModel).where(MLModel.id == inference_task.model_id))
            ml_model = ml_res.scalar_one_or_none()

        trained_or_ml_version = None
        if inference_task.model_source == ModelSourceEnum.TRAINED_MODEL.value and trained_model:
            trained_or_ml_version = trained_model.model_version
        elif inference_task.model_source == ModelSourceEnum.ML_MODEL.value and ml_model:
            trained_or_ml_version = ml_model.model_version

        # 关联表按 inference_task_id 取 ML 脚本信息（InferenceTask 不存该字段）
        ml_handle_res = await self.mapper.execute(
            select(InferenceTaskMlHandle).where(
                InferenceTaskMlHandle.inference_task_id == inference_task.id
            )
        )
        ml_handle_row = ml_handle_res.scalar_one_or_none()
        ml_handle_download_url = self._build_ml_handle_download_url(
            ml_handle_row.ml_handle_jfs_path if ml_handle_row else None
        )
        ml_handle: Optional[MlHandleInfo] = None
        if ml_handle_row:
            ml_handle = MlHandleInfo(
                ml_handle_upload_id=ml_handle_row.ml_handle_upload_id,
                ml_handle_jfs_path=ml_handle_row.ml_handle_jfs_path,
                ml_handle_source_type=ml_handle_row.ml_handle_source_type,
                notebook_id=ml_handle_row.notebook_id,
                handle_source_ref=ml_handle_row.handle_source_ref,
                ml_handle_download_url=ml_handle_download_url,
            )

        return InferenceTaskResponse(
            id=inference_task.id,
            server_name=inference_task.server_name,
            model_name=inference_task.model_name,
            model_id=inference_task.model_id,
            model_source=ModelSourceEnum(inference_task.model_source) if isinstance(inference_task.model_source, str) else inference_task.model_source,
            trained_model_version=trained_or_ml_version,
            project_id=inference_task.project_id,
            status=TaskStatus(inference_task.status) if isinstance(inference_task.status, str) else inference_task.status,
            desired_replicas=inference_task.desired_replicas,
            created_at=inference_task.created_at,
            image_id=inference_task.image_id,
            run_command=inference_task.run_command or "",
            backend_parameters=inference_task.backend_parameters or [],
            env_vars=inference_task.env_vars or {},
            inference_engine_type=BackendEnum(inference_task.inference_engine_type) if isinstance(inference_task.inference_engine_type, str) else inference_task.inference_engine_type,
            graphics_card_resource=GraphicsCardResourceConfig.model_validate(inference_task.graphics_card_resource),
            app_name=app_name,
            resource_cpu_config=ResourceCpuConfig.model_validate(inference_task.resource_cpu_config),
            ml_handle=ml_handle,
        )
        
    async def redeploy_inference_task(
            self, 
            current_user: JwtUserInfo,
            project_id: int, 
            inference_task_id: int, 
            inference_task_redeploy: InferenceTaskRedeploy,
    ) -> InferenceTaskUpdateResponse:
        # 1. 查询现有任务
        query = await self.mapper.execute(
            select(InferenceTask)
            .filter(InferenceTask.project_id == project_id)
            .filter(InferenceTask.id == inference_task_id)
        )
        inference_task = query.scalar_one_or_none()
        
        if not inference_task:
            raise HTTPException(status_code=404, detail="Inference task not found")

        try:
            if inference_task_redeploy.redeploy:
                return await self._redeploy_inference_task(
                    current_user, project_id, inference_task, inference_task_redeploy
                )
                  
        except HTTPException:
            raise
        except Exception as e:
            inference_task.status = TaskStatus.FAILED
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"K8s operation failed: {str(e)}")
        
        await self.mapper.commit()
        await self.mapper.refresh(inference_task)
        
        return InferenceTaskUpdateResponse(
            id=inference_task.id,
            server_name=inference_task.server_name,
            description=inference_task.description,
            project_id=inference_task.project_id,
            message="正在处理中",
            model_source=inference_task.model_source,
            model_name=inference_task.model_name
        )    

    async def update_inference_task(
            self,
            project_id: int,
            inference_task_id: int,
            inference_task_update: InferenceTaskUpdate
    ) -> InferenceTaskUpdateResponse:
        # 目前该方法未实现任何更新逻辑，直接返回现有任务信息
        query = await self.mapper.execute(
            select(InferenceTask)
            .filter(InferenceTask.project_id == project_id)
            .filter(InferenceTask.id == inference_task_id)
        )
        inference_task = query.scalar_one_or_none()
        
        if not inference_task:
            raise HTTPException(status_code=404, detail="Inference task not found")
        
        launcher = await self._get_k8s_launcher(project_id)
        app_name=f"model-deploy-{inference_task.id}"
        
        try:       
            if inference_task_update.update_type == UpdateEnum.STOP:
                # 停止服务
                await self._stop_inference_service(
                    launcher, inference_task, app_name
                )
            
            if inference_task_update.update_type == UpdateEnum.START:
                # 启动服务
                await self._start_inference_service(
                    launcher, inference_task, app_name
                )
                    
        except HTTPException:
            raise
        except Exception as e:
            inference_task.status = TaskStatus.FAILED
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"K8s operation failed: {str(e)}")
        
        await self.mapper.commit()
        await self.mapper.refresh(inference_task)
        
        return InferenceTaskUpdateResponse(
            id=inference_task.id,
            server_name=inference_task.server_name,
            description=inference_task.description,
            project_id=inference_task.project_id,
            message="正在处理中",
            model_source=inference_task.model_source,
            model_name=inference_task.model_name
        )

    async def delete_inference_task(
            self,
            project_id: int,
            inference_task_id: int
    ) -> None:
        # 查询现有任务
        query = await self.mapper.execute(
            select(InferenceTask)
            .filter(InferenceTask.project_id == project_id)
            .filter(InferenceTask.id == inference_task_id)
        )
        inference_task = query.scalar_one_or_none()
        
        if not inference_task:
            raise HTTPException(status_code=404, detail="Inference task not found")
        
        launcher = await self._get_k8s_launcher(project_id)
        
        app_name=f"model-deploy-{inference_task.id}"
        
        try:
            # 删除现有应用
            await launcher.delete_app(
                namespace=inference_task.namespace,
                app_name=app_name,
                config_maps=None
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"删除失败: {e}")

        # 由业务方删除关联表记录（未建外键）
        ml_handle_res = await self.mapper.execute(
            select(InferenceTaskMlHandle).where(
                InferenceTaskMlHandle.inference_task_id == inference_task.id
            )
        )
        ml_handle_row = ml_handle_res.scalar_one_or_none()
        if ml_handle_row:
            await self.mapper.delete(ml_handle_row)

        # 删除主表记录
        await self.mapper.delete(inference_task)
        await self.mapper.commit()
    
    async def scale_inference_task(
            self,
            project_id: int,
            inference_task_id: int,
            inference_task_scale: InferenceTaskScale
    ) -> None:
        # 查询现有任务
        query = await self.mapper.execute(
            select(InferenceTask)
            .filter(InferenceTask.project_id == project_id)
            .filter(InferenceTask.id == inference_task_id)
        )
        inference_task = query.scalar_one_or_none()
        
        if not inference_task:
            raise HTTPException(status_code=404, detail="Inference task not found")
        
        launcher = await self._get_k8s_launcher(project_id)
        
        app_name=f"model-deploy-{inference_task.id}"
        
        try:
            if inference_task_scale.desired_replicas == inference_task.desired_replicas:
                return  # 无需扩缩容
            
            if inference_task_scale.desired_replicas != inference_task.desired_replicas:
                await launcher.start_app(
                namespace=inference_task.namespace,
                app_name=app_name,
                replicas=inference_task_scale.desired_replicas
                )
            
            # 更新期望副本数
            inference_task.desired_replicas = inference_task_scale.desired_replicas
            await self.mapper.commit()
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"扩缩容失败: {e}")
    
    async def _redeploy_inference_task(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            inference_task: InferenceTask,
            inference_task_update: InferenceTaskUpdate,
    ) -> InferenceTaskUpdateResponse:
        """
        重新部署推理任务
        1. 删除旧的 K8s 资源
        2. 使用新配置创建 K8s 资源
        3. 更新数据库记录（保留原 ID）
        """
        app_name=f"model-deploy-{inference_task.id}"
        pin_node_port = (
            int(inference_task.k8s_service_nodeport)
            if inference_task.k8s_service_nodeport
            else None
        )

        try:
            # 1. 删除现有 K8s 资源（忽略不存在的情况）
            try:
                await self.delete_inference_task(project_id, inference_task.id)
                logger.info(f"已删除旧的 K8s 资源: {app_name}")
            except Exception as e:
                logger.warning(f"删除旧资源时出错（可能不存在）: {e}")
            
            await asyncio.sleep(3)  # 等待资源彻底删除
            
            await self.create_inference_task(
                current_user,
                project_id,
                inference_task_update,
                pin_node_port=pin_node_port,
            )
            
            return InferenceTaskUpdateResponse(
            id=inference_task.id,
            server_name=inference_task.server_name,
            description=inference_task.description,
            project_id=inference_task.project_id,
            message="正在处理中",
            model_source=inference_task.model_source,
            model_name=inference_task.model_name
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"重新部署失败: {e}")
            inference_task.status = TaskStatus.FAILED
            inference_task.error_message = str(e)
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"重新部署失败: {e}")
    
    async def _stop_inference_service(
            self,
            launcher: K8sLauncher,
            inference_task: InferenceTask,
            app_name: str
    ) -> None:
        """停止推理服务"""
        try:
            await launcher.stop_app(
                namespace=inference_task.namespace,
                app_name=app_name
            )
            inference_task.status = TaskStatus.TERMINATED.value
            inference_task.ready_replicas = 0
        except Exception as e:
            inference_task.status = TaskStatus.FAILED
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"停止失败: {e}")
        
    async def _start_inference_service(
            self,
            launcher: K8sLauncher,
            inference_task: InferenceTask,
            app_name: str
    ) -> None:
        """启动推理服务"""
        try:
            await launcher.start_app(
                namespace=inference_task.namespace,
                app_name=app_name,
                replicas=inference_task.desired_replicas
            )
            inference_task.status = TaskStatus.PENDING.value
            inference_task.ready_replicas = 0
        except Exception as e:
            inference_task.status = TaskStatus.FAILED
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"启动失败: {e}")


    async def exists(
            self,
            name: str,
            project_id: int,
            model_source: ModelSourceEnum | str,
            id: int | None = None,
    ) -> bool:
        """True 表示已存在（同租户、同项目、同 model_source 下服务名唯一）"""
        ms_value = model_source.value if isinstance(model_source, ModelSourceEnum) else model_source
        query = select(InferenceTask.id).where(
            InferenceTask.server_name == name,
            InferenceTask.project_id == project_id,
            InferenceTask.model_source == ms_value,
            InferenceTask.tenant_id == app_runtime_context.get_tenant_id(),
        )

        # 修改场景排除自身
        if id is not None:
            query = query.where(InferenceTask.id != id)

        stmt = select(query.exists())
        is_exists = await self.mapper.execute(stmt)
        return is_exists.scalar()

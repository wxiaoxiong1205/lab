"""
推理服务部署：将仓库 `scripts/` 同步到 JuiceFS（复用 BaseK8sTask.build_script_configs 的 MD5/锁逻辑）。
"""
from typing import Optional, Dict, Any, List, Tuple

import juicefs
from kubernetes.client import V1Affinity, V1VolumeMount, V1Volume

from app.repository.base_mapper import BaseMapper
from app.tasks.service.base.base_k8s_task import BaseK8sTask
from app.utils.k8s_launcher import K8sLauncher


class InferenceDeployScriptsUploader(BaseK8sTask):
    """供 DefaultInferenceTaskService.deploy_inference_task_k8s_async 使用；无独立 task_id。"""

    def __init__(
        self,
        project_id: int,
        namespace: str,
        k8s_uuid: str,
        launcher: K8sLauncher,
        db: BaseMapper,
        jfs: juicefs.Client,
    ) -> None:
        super().__init__(project_id, namespace, k8s_uuid, launcher, db)
        self._jfs = jfs

    def _get_jfs_client(self) -> Optional[juicefs.Client]:
        return self._jfs

    def _get_task_id(self) -> Optional[int]:
        return None

    async def submit(self) -> str:
        pass

    async def build_volume_and_mount(self) -> Tuple[List[V1VolumeMount], List[V1Volume]]:
        pass

    async def build_env(self) -> Dict[str, str]:
        pass

    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        pass

    async def build_image(self) -> str:
        pass

    async def build_run_resource(self) -> Dict[str, Any]:
        pass

    async def build_node_affinity(self) -> Optional[V1Affinity]:
        pass

    async def build_service_type(self) -> str:
        pass

    async def build_job_name(self) -> str:
        pass



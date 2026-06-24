from typing import Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.executors.base import BaseExecutor
from app.models.models import ImageBuildLog, KubernetesResource
from app.utils.k8s_launcher import K8sLauncher
from app.utils.redis_lock_utils import build_notebook_lock_del
from app.utils.timezone_utils import get_current_shanghai_time
from app.core.logging import logger


class NotebookImageExecutor(BaseExecutor):
    """Notebook 镜像构建执行器"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer
        service = AutoContainer.repository_image_service()
        if service.build_log_mapper is None:
            service.build_log_mapper = AutoContainer.image_build_log_mapper()

        # 1. 查询构建记录
        image_build_log_query = await service.build_log_mapper.execute(
            select(ImageBuildLog).filter(ImageBuildLog.id == business_id)
        )
        image_build_log = image_build_log_query.scalar_one_or_none()
        if not image_build_log:
            raise ValueError(f"构建记录不存在: {business_id}")

        # 幂等：只处理创建态
        if image_build_log.status != TaskStatus.CREATED.value:
            logger.info(
                f"构建记录状态不为创建态，跳过执行: id={business_id}, status={image_build_log.status}"
            )
            return

        # 2. 标记为启动中
        image_build_log.status = TaskStatus.PREPARING.value
        image_build_log.updated_at = get_current_shanghai_time()
        await service.build_log_mapper.commit()

        # 3. 获取 k8s 配置
        k8s_id = kwargs.get("k8s_id")
        if not k8s_id:
            raise ValueError("缺少 k8s_id")
        config_result = await service.mapper.execute(
            select(KubernetesResource.config).where(KubernetesResource.id == k8s_id)
        )
        kubeconfig_str = config_result.scalar_one_or_none()
        if not kubeconfig_str:
            raise ValueError("K8s 配置不存在")

        # 4. 依赖创建阶段传入的参数
        k8s_namespace = kwargs.get("k8s_namespace")
        pod_name = kwargs.get("pod_name")
        instance_name = kwargs.get("instance_name")
        app_name = kwargs.get("app_name")
        snapshot_id = kwargs.get("snapshot_id")
        image_name = kwargs.get("image_name")
        cache_image = kwargs.get("cache_image")
        k8s_uuid = kwargs.get("k8s_uuid")
        include_lab_work = kwargs.get("include_lab_work")
        if not all([k8s_namespace, pod_name, instance_name, app_name, snapshot_id, image_name, cache_image, k8s_uuid]):
            raise ValueError("执行器参数不完整")

        launcher = K8sLauncher(config_str=kubeconfig_str)

        # 5. 创建构建 Job
        job_name = f"build-notebook-image-{image_build_log.id}"
        try:
            await service._create_build_image_job(
                launcher=launcher,
                namespace=k8s_namespace,
                job_name=job_name,
                pod_name=pod_name,
                container_name=app_name,
                snapshot_id=snapshot_id,
                instance_name=instance_name,
                image_name=image_name,
                cache_image=cache_image,
                k8s_uuid=k8s_uuid,
                k8s_id=k8s_id,
                tenant_id=image_build_log.tenant_id,
                include_lab_work=include_lab_work
            )
            image_build_log.status = TaskStatus.RUNNING.value
            image_build_log.updated_at = get_current_shanghai_time()
            await service.build_log_mapper.commit()
            logger.info(f"构建 Job 创建成功: {job_name}")
        except Exception as e:
            image_build_log.status = TaskStatus.FAILED.value
            image_build_log.updated_at = get_current_shanghai_time()
            await service.build_log_mapper.rollback()
            await build_notebook_lock_del(app_name)
            logger.error(f"构建 Job 创建失败: {job_name}, err={e}", exc_info=True)
            raise

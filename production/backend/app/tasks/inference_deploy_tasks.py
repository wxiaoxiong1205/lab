"""
推理服务 K8s 部署异步任务（创建推理任务后半段：集群连接、存储卷、create_app）
"""

from typing import Any, Dict, Optional

from app.database.database_depends import run_async_in_celery
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.utils import app_runtime_context
from app.schemas.inference_task import InferenceTaskCreate


@celery_app.task(
    base=TaskBase,
    bind=True,
    name="app.tasks.inference_deploy_tasks.deploy_inference_task_k8s_task",
)
def deploy_inference_task_k8s_task(
    self: TaskBase,
    inference_task_id: int,
    project_id: int,
    task_payload: Dict[str, Any],
    pin_node_port: Optional[int] = None,
    tenant_id: Optional[str] = None,
) -> None:
    """Celery 入口必须为同步函数，内部用 run_async_in_celery 执行异步逻辑。"""
    run_async_in_celery(
        _deploy_inference_task_k8s_impl(
            inference_task_id=inference_task_id,
            project_id=project_id,
            task_payload=task_payload,
            pin_node_port=pin_node_port,
            tenant_id=tenant_id,
        )
    )


async def _deploy_inference_task_k8s_impl(
    *,
    inference_task_id: int,
    project_id: int,
    task_payload: Dict[str, Any],
    pin_node_port: Optional[int],
    tenant_id: Optional[str],
) -> None:
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    task = InferenceTaskCreate.model_validate(task_payload)
    from app.core.depend_manager import AutoContainer

    container = AutoContainer()
    svc = container.inference_task_service()
    await svc.deploy_inference_task_k8s_async(
        inference_task_id=inference_task_id,
        project_id=project_id,
        task=task,
        pin_node_port=pin_node_port,
    )

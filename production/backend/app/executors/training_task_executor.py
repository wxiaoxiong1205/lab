from typing import Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.executors.base import BaseExecutor
from app.models.training_task_manager import TrainingTask
from app.utils.timezone_utils import get_current_shanghai_time


class TrainingTaskExecutor(BaseExecutor):
    """训练任务执行器：负责触发 Celery 任务提交"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer

        training_task_service = AutoContainer.training_task_service()
        task_query = await training_task_service.mapper.execute(
            select(TrainingTask).where(TrainingTask.id == business_id)
        )
        training_task = task_query.scalar_one_or_none()
        if not training_task:
            raise ValueError(f"训练任务不存在: {business_id}")

        try:
            celery_task_id = await training_task_service.run_create_training_task_post_process(
                training_task_id=business_id,
                namespace=kwargs["namespace"],
                task_payload=kwargs["task_payload"],
                tenant_id=kwargs["tenant_id"]
            )
            training_task.celery_task_id = celery_task_id
            training_task.status = TaskStatus.PREPARING.value
            training_task.updated_at = get_current_shanghai_time()
            await training_task_service.mapper.commit()
        except Exception as e:
            training_task.status = TaskStatus.FAILED
            training_task.updated_at = get_current_shanghai_time()
            await training_task_service.mapper.commit()
            logger.error(f"训练任务执行失败: {business_id}, err={e}", exc_info=True)
            raise

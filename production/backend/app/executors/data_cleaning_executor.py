from typing import Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.executors.base import BaseExecutor
from app.models.data_cleaning_manager import DataCleaningTask


class DataCleaningTaskExecutor(BaseExecutor):
    """数据清洗任务执行器"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer

        cleaning_service = AutoContainer.cleaning_service()
        task_query = await cleaning_service.task_mapper.execute(
            select(DataCleaningTask).where(DataCleaningTask.id == business_id)
        )
        task = task_query.scalar_one_or_none()
        if not task:
            raise ValueError(f"清洗任务不存在: {business_id}")

        try:
            # 从准备到运行中速度太快了，只能先设置为启动中再去进去创建任务
            task.status = TaskStatus.PREPARING.value
            await cleaning_service.task_mapper.commit()

            await cleaning_service.run_create_data_cleaning_task_post_process(
                task_id=business_id,
                namespace=kwargs["namespace"],
                tenant_id=kwargs["tenant_id"]
            )
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            await cleaning_service.task_mapper.commit()
            logger.error(f"清洗任务提交失败: {business_id}, err={e}", exc_info=True)
            raise

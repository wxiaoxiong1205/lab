from typing import Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.executors.base import BaseExecutor
from app.models.benchmark_task_manager import BenchmarkTask
from app.utils.timezone_utils import get_current_shanghai_time


class BenchmarkTaskExecutor(BaseExecutor):
    """基准评估任务执行器：负责触发 Celery 任务提交"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer

        benchmark_task_service = AutoContainer.benchmark_task_service()
        benchmark_task = await benchmark_task_service.task_mapper.query_one(
            select(BenchmarkTask).where(BenchmarkTask.id == business_id)
        )
        if not benchmark_task:
            raise ValueError(f"基准评估任务不存在: {business_id}")

        try:
            # 从准备到运行中速度太快了，只能先设置为启动中再去进去创建任务
            benchmark_task.status = TaskStatus.PREPARING.value
            benchmark_task.started_at = None
            benchmark_task.finished_at = None
            benchmark_task.updated_at = get_current_shanghai_time()
            await benchmark_task_service.task_mapper.commit()

            await benchmark_task_service.run_create_benchmark_task_post_process(task_id=business_id)
        except Exception as e:
            benchmark_task.status = TaskStatus.FAILED.value
            benchmark_task.error_message = str(e)
            benchmark_task.updated_at = get_current_shanghai_time()
            await benchmark_task_service.task_mapper.commit()
            logger.error(f"基准评估任务执行失败: {business_id}, err={e}", exc_info=True)
            raise

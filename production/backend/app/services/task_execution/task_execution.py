from datetime import timedelta
from typing import List

from fastapi import HTTPException
from sqlalchemy import and_, desc, select

from app.common.task_execution import TaskExecutionBusinessType, TaskExecutionStatus
from app.executors.registry import create_executor
from app.models.models import JwtUserInfo, TaskExecution
from app.repository.task_execution_mapper import TaskExecutionMapper
from app.schemas.task_execution import (
    TaskExecutionBusinessResp,
    TaskExecutionManualStartRequest,
    TaskExecutionManualStartResponse,
)
from app.utils.timezone_utils import get_current_shanghai_time
from .interface import TaskExecutionService


class DefaultTaskExecutionService(TaskExecutionService):
    def __init__(self, mapper: TaskExecutionMapper) -> None:
        super().__init__(mapper)

    async def manual_start_task_execution(
        self,
        req: TaskExecutionManualStartRequest,
        current_user: JwtUserInfo
    ) -> TaskExecutionManualStartResponse:
        now = get_current_shanghai_time()
        lock_timeout = now - timedelta(minutes=10)

        if req.execution_id is not None:
            stmt = select(TaskExecution).where(TaskExecution.id == req.execution_id).with_for_update()
        else:
            stmt = (
                select(TaskExecution)
                .where(
                    and_(
                        TaskExecution.business_type == req.business_type,
                        TaskExecution.business_id == req.business_id,
                    )
                )
                .order_by(desc(TaskExecution.created_at))
                .limit(1)
                .with_for_update()
            )

        result = await self.mapper.execute(stmt)
        execution = result.scalar_one_or_none()
        if not execution:
            raise HTTPException(status_code=404, detail="未找到可启动的 task_execution 记录")

        # 仅允许非定时任务手动启动
        if execution.schedule_at is not None:
            raise HTTPException(status_code=400, detail="定时待启动的任务不允许手动启动")

        if execution.status == TaskExecutionStatus.DONE.value:
            return TaskExecutionManualStartResponse(
                execution_id=execution.id,
                status=execution.status,
                message="任务已完成，无需重复启动"
            )

        if (
            execution.status == TaskExecutionStatus.RUNNING.value
            and execution.locked_at
            and execution.locked_at >= lock_timeout
        ):
            return TaskExecutionManualStartResponse(
                execution_id=execution.id,
                status=execution.status,
                message="任务正在执行中"
            )

        execution.status = TaskExecutionStatus.RUNNING.value
        execution.locked_at = now
        execution.locked_by = f"manual:{current_user.username}"
        execution.updated_at = now
        await self.mapper.commit()

        try:
            executor = create_executor(execution.executor)
            if not executor:
                raise ValueError(f"执行器未注册: {execution.executor}")
            method = getattr(executor, execution.method, None)
            if not method:
                raise ValueError(f"执行器方法不存在: {execution.executor}.{execution.method}")

            await method(execution.business_id, **(execution.kwargs or {}))

            execution.status = TaskExecutionStatus.DONE.value
            execution.updated_at = get_current_shanghai_time()
            execution.locked_at = None
            execution.locked_by = None
            await self.mapper.commit()
            return TaskExecutionManualStartResponse(
                execution_id=execution.id,
                status=execution.status,
                message="任务已手动启动并执行完成"
            )
        except Exception as e:
            execution.retry_count = (execution.retry_count or 0) + 1
            execution.last_error = str(e)
            execution.status = (
                TaskExecutionStatus.PENDING.value
                if execution.retry_count <= execution.max_retry
                else TaskExecutionStatus.FAILED.value
            )
            execution.updated_at = get_current_shanghai_time()
            execution.locked_at = None
            execution.locked_by = None
            await self.mapper.commit()
            raise HTTPException(status_code=500, detail=f"手动启动执行失败: {str(e)}")

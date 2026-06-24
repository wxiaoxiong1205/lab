from typing import Tuple, List

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.task_execution import TaskExecutionBusinessType
from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.task_execution import (
    TaskExecutionManualStartRequest,
    TaskExecutionManualStartResponse, TaskExecutionBusinessResp,
)
from app.services.task_execution.interface import TaskExecutionService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/task-executions", tags=["task-executions"])


@router.post("/manual-start", response_model=TaskExecutionManualStartResponse, status_code=status.HTTP_200_OK)
@inject
async def manual_start_task_execution(
    req: TaskExecutionManualStartRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    task_execution_service: TaskExecutionService = Depends(Provide[AutoContainer.task_execution_service]),
) -> TaskExecutionManualStartResponse:
    """手动启动执行器任务（受 schedule_at 限制）"""
    _, current_user = deps
    return await task_execution_service.manual_start_task_execution(req, current_user)

@router.get("/enums/task-execution-business", response_model=List[TaskExecutionBusinessResp])
async def get_task_execution_business_enums() -> List[TaskExecutionBusinessResp]:
    """返回执行器业务类型枚举（值+中文描述）"""
    return [
        TaskExecutionBusinessResp(label=item.desc, value=item.value)
        for item in TaskExecutionBusinessType
    ]
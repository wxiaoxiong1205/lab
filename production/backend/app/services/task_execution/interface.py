from abc import ABC, abstractmethod
from typing import List

from app.models.models import JwtUserInfo
from app.repository.task_execution_mapper import TaskExecutionMapper
from app.schemas.task_execution import (
    TaskExecutionBusinessResp,
    TaskExecutionManualStartRequest,
    TaskExecutionManualStartResponse,
)


class TaskExecutionService(ABC):
    """task_execution 服务抽象接口"""

    def __init__(self, mapper: TaskExecutionMapper) -> None:
        self.mapper = mapper

    @abstractmethod
    async def manual_start_task_execution(
        self,
        req: TaskExecutionManualStartRequest,
        current_user: JwtUserInfo
    ) -> TaskExecutionManualStartResponse:
        pass
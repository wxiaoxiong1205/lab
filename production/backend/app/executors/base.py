from abc import ABC, abstractmethod
from typing import Any


class BaseExecutor(ABC):
    """执行器基类：只做业务触发，不包含调度逻辑"""

    @abstractmethod
    async def start(self, business_id: int, **kwargs: Any) -> None:
        """执行入口"""
        raise NotImplementedError

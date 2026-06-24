from abc import ABC, abstractmethod
from typing import Optional

from fastapi_pagination import Page

from app.repository.common_config_mapper import CommonConfigMapper
from app.schemas.common_config import CommonConfigResponse


class CommonConfigService(ABC):
    """通用配置服务抽象接口类"""
    
    def __init__(self, mapper: CommonConfigMapper) -> None:
        self.mapper = mapper
    
    @abstractmethod
    async def list_configs(
        self,
        key: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[CommonConfigResponse]:
        """获取配置列表（分页）"""
        pass
    
    @abstractmethod
    async def get_config(
        self,
        config_id: int
    ) -> CommonConfigResponse:
        """获取配置详情"""
        pass
    
    @abstractmethod
    async def get_config_by_key(
        self,
        key: str
    ) -> Optional[CommonConfigResponse]:
        """根据键获取配置"""
        pass


from abc import ABC, abstractmethod
from typing import List, Optional

from fastapi_pagination import Page
from app.models.models import JwtUserInfo
from app.schemas.business_attr import (
    BusinessAttrCreateRequest,
    BusinessAttrUpdateRequest,
    BusinessAttrResponse,
    BusinessAttrQueryParams,
    GroupedBusinessAttrItem,
)
from app.schemas.menu import MenuItem


class BusinessAttrService(ABC):

    @abstractmethod
    async def get_app_menu(self) -> List[MenuItem]:
        """获取应用菜单，调用外部菜单 API"""
        pass

    @abstractmethod
    async def create(self,
                     current_user: JwtUserInfo,
                     request: BusinessAttrCreateRequest) -> bool:
        pass

    @abstractmethod
    async def update(
        self,
        attr_id: int,
        current_user: JwtUserInfo,
        request: BusinessAttrUpdateRequest,
    ) -> bool:
        pass

    @abstractmethod
    async def list_attrs(self,
                            page_num: int,
                            page_size: int,
                            query_params: Optional[BusinessAttrQueryParams] = None) -> Page[BusinessAttrResponse]:
        pass

    @abstractmethod
    async def list_attrs_grouped(
        self,
        query_params: Optional[BusinessAttrQueryParams] = None,
    ) -> List[GroupedBusinessAttrItem]:
        """按 group 字段分组返回属性列表，查询参数与 list 接口一致"""
        pass

    @abstractmethod
    async def delete(self, ids: List[int]) -> None:
        pass

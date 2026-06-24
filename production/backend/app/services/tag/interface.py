"""标签管理服务接口"""
from abc import ABC, abstractmethod
from typing import Optional, List

from fastapi_pagination import Page

from app.models.models import JwtUserInfo, TagClass, TagElement
from app.repository.business_tag_rel_mapper import BusinessTagRelMapper
from app.repository.tag_class_mapper import TagClassMapper
from app.repository.tag_element_mapper import TagElementMapper
from app.schemas.tag import (
    TagClassCreate, TagClassUpdate, TagClassResponse,
    TagElementCreate, TagElementUpdate, TagElementResponse,
    TagTypeListResponse, SaveBusinessTagsRequest, SaveBusinessTagsResponse,
    BusinessTagsResponse, BusinessTagInfo
)


class TagService(ABC):
    """标签管理服务抽象接口"""

    def __init__(
            self,
            mapper: TagClassMapper,
            tag_element_mapper: TagElementMapper,
            business_tag_rel_mapper: BusinessTagRelMapper
    ) -> None:
        self.mapper = mapper
        self.tag_element_mapper = tag_element_mapper
        self.business_tag_rel_mapper = business_tag_rel_mapper
    # =============== 标签分类管理 ===============
    @abstractmethod
    async def list_tag_classes(
            self,
            business_type: Optional[str] = None,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None
    ) -> Page[TagClassResponse]:
        """获取标签分类列表"""
        pass

    @abstractmethod
    async def create_tag_class(
            self,
            tag_class_create: TagClassCreate,
            current_user: JwtUserInfo
    ) -> TagClassResponse:
        """创建标签分类"""
        pass

    @abstractmethod
    async def get_tag_class(self, tag_class_id: int) -> TagClassResponse:
        """获取标签分类详情"""
        pass

    @abstractmethod
    async def update_tag_class(
            self,
            tag_class_id: int,
            tag_class_update: TagClassUpdate
    ) -> TagClassResponse:
        """更新标签分类"""
        pass

    @abstractmethod
    async def delete_tag_class(self, tag_class_id: int) -> None:
        """删除标签分类"""
        pass

    # =============== 标签元素管理 ===============
    @abstractmethod
    async def list_tag_elements(
            self,
            class_id: Optional[int] = None,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None
    ) -> Page[TagElementResponse]:
        """获取标签元素列表"""
        pass

    @abstractmethod
    async def create_tag_element(
            self,
            tag_element_create: TagElementCreate,
            current_user: JwtUserInfo
    ) -> TagElementResponse:
        """创建标签元素"""
        pass

    @abstractmethod
    async def get_tag_element(self, tag_element_id: int) -> TagElementResponse:
        """获取标签元素详情"""
        pass

    @abstractmethod
    async def update_tag_element(
            self,
            tag_element_id: int,
            tag_element_update: TagElementUpdate
    ) -> TagElementResponse:
        """更新标签元素"""
        pass

    @abstractmethod
    async def delete_tag_element(self, tag_element_id: int) -> None:
        """删除标签元素"""
        pass

    # =============== 标签类型返回接口 ===============
    @abstractmethod
    async def get_tag_types(self, business_type: str) -> TagTypeListResponse:
        """获取标签类型列表（按分类分组返回）"""
        pass

    # =============== 业务对象标签管理 ===============
    @abstractmethod
    async def save_business_tags(
            self,
            business_type: str,
            business_id: str,
            request: SaveBusinessTagsRequest,
            current_user: JwtUserInfo
    ) -> SaveBusinessTagsResponse:
        """保存业务对象标签（覆盖式修改）"""
        pass

    @abstractmethod
    async def get_business_tags(
            self,
            business_type: str,
            business_id: str
    ) -> BusinessTagsResponse:
        """获取业务对象的标签列表"""
        pass

    @abstractmethod
    async def get_business_tags_batch(
            self,
            business_type: str,
            business_ids: List[str]
    ) -> dict:
        """批量获取业务对象的标签（用于列表展示）"""
        pass

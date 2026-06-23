"""标签管理相关 Schema"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field

from app.schemas.common import BaseModelWithTimezone


# =============== 业务类型枚举 ===============
class TagBusinessType(str, Enum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj
    """标签业务类型常量"""
    IMAGE = ("镜像", "IMAGE")

class TagElementBrief(BaseModel):
    """标签元素简要信息（用于列表展示）"""
    tag_element_id: int = Field(..., description="标签元素ID")
    tag_element_name: str = Field(..., description="标签元素名称")


# =============== 标签分类 Schema ===============
class TagClassBase(BaseModel):
    """标签分类基础模型"""
    name: str = Field(..., max_length=64, description="标签分类名称")
    business_type: str = Field(..., max_length=32, description="业务类型（IMAGE等）")
    sort_order: int = Field(default=0, description="排序值，越小越靠前")


class TagClassCreate(TagClassBase):
    """创建标签分类请求"""
    pass


class TagClassUpdate(BaseModel):
    """更新标签分类请求"""
    name: Optional[str] = Field(None, max_length=64, description="标签分类名称")
    sort_order: Optional[int] = Field(None, description="排序值")


class TagClassResponse(TagClassBase, BaseModelWithTimezone):
    """标签分类响应"""
    id: int
    elements: List[TagElementBrief] = Field(default_factory=list, description="该分类下的标签元素列表")
    created_at: datetime
    updated_at: datetime


# =============== 标签元素 Schema ===============
class TagElementBase(BaseModel):
    """标签元素基础模型"""
    class_id: int = Field(..., description="所属标签分类ID")
    name: str = Field(..., max_length=64, description="标签元素名称")
    code: Optional[str] = Field(None, max_length=32, description="标签编码")
    sort_order: int = Field(default=0, description="排序值")


class TagElementCreate(TagElementBase):
    """创建标签元素请求"""
    pass


class TagElementUpdate(BaseModel):
    """更新标签元素请求"""
    name: Optional[str] = Field(None, max_length=64, description="标签元素名称")
    code: Optional[str] = Field(None, max_length=32, description="标签编码")
    sort_order: Optional[int] = Field(None, description="排序值")


class TagElementResponse(TagElementBase, BaseModelWithTimezone):
    """标签元素响应"""
    id: int
    created_at: datetime
    updated_at: datetime




# =============== 标签分类及元素组合 Schema ===============
class TagClassWithElements(BaseModel):
    """标签分类及其包含的元素"""
    tag_class_id: int = Field(..., description="标签分类ID")
    tag_class_name: str = Field(..., description="标签分类名称")
    elements: List[TagElementBrief] = Field(default_factory=list, description="该分类下的标签元素列表")


class TagTypeListResponse(BaseModel):
    """标签类型返回接口响应（按分类分组）"""
    data: List[TagClassWithElements] = Field(default_factory=list, description="标签分类及元素列表")


# =============== 业务标签关联 Schema ===============
class BusinessTagRelBase(BaseModel):
    """业务标签关联基础模型"""
    business_type: str = Field(..., max_length=32, description="业务类型")
    business_id: str = Field(..., max_length=64, description="业务对象ID")
    tag_class_id: int = Field(..., description="标签分类ID")
    tag_element_id: int = Field(..., description="标签元素ID")


class BusinessTagRelResponse(BusinessTagRelBase, BaseModelWithTimezone):
    """业务标签关联响应"""
    id: int
    created_at: datetime
    updated_at: datetime


class SaveBusinessTagsRequest(BaseModel):
    """保存业务对象标签请求"""
    tag_element_ids: List[int] = Field(..., description="标签元素ID列表")


class SaveBusinessTagsResponse(BaseModel):
    """保存业务对象标签响应"""
    success: bool = Field(..., description="是否保存成功")
    message: str = Field(default="标签保存成功", description="提示信息")


# =============== 业务对象标签展示 Schema ===============
class BusinessTagInfo(BaseModel):
    """业务对象的标签信息"""
    tag_class_id: int = Field(..., description="标签分类ID")
    tag_class_name: str = Field(..., description="标签分类名称")
    tag_element_id: int = Field(..., description="标签元素ID")
    tag_element_name: str = Field(..., description="标签元素名称")


class BusinessTagsResponse(BaseModel):
    """业务对象标签列表响应"""
    business_type: str = Field(..., description="业务类型")
    business_id: str = Field(..., description="业务对象ID")
    tags: List[BusinessTagInfo] = Field(default_factory=list, description="标签列表")

class RepositoryBusinessTypeResp(BaseModel):
    label: str
    value: str
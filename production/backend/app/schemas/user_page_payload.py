from typing import List, Optional

from pydantic import BaseModel, Field, AliasChoices

from app.schemas.common import ResModel
from app.schemas.user import UserItem, IamUserItem
from app.schemas.user_extraI import UserExtraItem


# ------------------------------
# 4. 分页数据模型（承载用户列表+分页参数）
# ------------------------------
class UserPagePayload(BaseModel):
    """用户分页查询的 payload 模型"""
    total: int = Field(description="总记录数")
    rows: List[UserExtraItem] = Field(description="当前页的用户列表")
    number: int = Field(description="当前页码（从 1 开始）")
    size: int = Field(description="每页显示条数")
    totalPages: int = Field(description="总页数")


# ------------------------------
# 4. 分页数据模型（承载用户列表+分页参数）
# ------------------------------
class UserBasePagePayload(BaseModel):
    """用户分页查询的 payload 模型"""
    total: Optional[int] = Field(description="总记录数", validation_alias=AliasChoices('total', 'totalElements'), )
    rows: Optional[List[IamUserItem]] = Field(description="当前页的用户列表",
                                              validation_alias=AliasChoices('rows', 'content'), )
    number: Optional[int] = Field(description="当前页码（从 1 开始）")
    size: Optional[int] = Field(description="每页显示条数")
    totalPages: Optional[int] = Field(description="总页数")


# ------------------------------
# 5. 最终响应模型（用户分页查询完整响应）
# ------------------------------
class UserPageResponse(ResModel[UserPagePayload]):
    """用户分页列表查询的完整响应模型"""
    pass


class UserBasePageResponse(ResModel[UserBasePagePayload]):
    """用户分页列表查询的完整响应模型"""
    pass

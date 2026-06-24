"""
权限管理相关的Schema定义
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class PermissionMenuVisibleResponse(BaseModel):
    """菜单可见性检查响应"""
    visible: bool = Field(..., description="是否可见")
    reason: str = Field(..., description="原因说明")


class GrantPlatformAdminRequest(BaseModel):
    """授权平台管理员请求"""
    user_id: int = Field(..., description="被授权的用户ID")


class GrantPlatformAdminResponse(BaseModel):
    """授权平台管理员响应"""
    id: int = Field(..., description="记录ID")
    user_id: int = Field(..., description="被授权的用户ID")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    created_at: datetime = Field(..., description="创建时间")


class RevokePlatformAdminRequest(BaseModel):
    """撤销平台管理员请求"""
    user_id: int = Field(..., description="被撤销的用户ID")


class BatchGrantPlatformAdminRequest(BaseModel):
    """批量授权平台管理员请求"""
    user_ids: List[int] = Field(..., description="被授权的用户ID列表", min_items=1)


class BatchGrantPlatformAdminResponse(BaseModel):
    """批量授权平台管理员响应"""
    success_count: int = Field(..., description="成功授权的数量")
    failed_count: int = Field(..., description="失败的数量")
    success_items: List[GrantPlatformAdminResponse] = Field(..., description="成功授权的用户列表")
    failed_items: List[dict] = Field(..., description="失败的用户列表，包含user_id和reason")


class PlatformAdminListItem(BaseModel):
    """平台管理员列表项"""
    id: int = Field(..., description="记录ID")
    user_id: int = Field(..., description="用户ID")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    created_at: datetime = Field(..., description="创建时间")


class GrantProjectAdminRequest(BaseModel):
    """授权项目管理员请求"""
    user_id: int = Field(..., description="被授权的用户ID")


class GrantProjectAdminResponse(BaseModel):
    """授权项目管理员响应"""
    id: int = Field(..., description="记录ID")
    project_id: int = Field(..., description="项目ID")
    user_id: int = Field(..., description="被授权的用户ID")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    created_at: datetime = Field(..., description="创建时间")


class RevokeProjectAdminRequest(BaseModel):
    """撤销项目管理员请求"""
    user_id: int = Field(..., description="被撤销的用户ID")


class BatchGrantProjectAdminRequest(BaseModel):
    """批量授权项目管理员请求"""
    user_ids: List[int] = Field(..., description="被授权的用户ID列表", min_items=1)


class BatchGrantProjectAdminResponse(BaseModel):
    """批量授权项目管理员响应"""
    success_count: int = Field(..., description="成功授权的数量")
    failed_count: int = Field(..., description="失败的数量")
    success_items: List[GrantProjectAdminResponse] = Field(..., description="成功授权的用户列表")
    failed_items: List[dict] = Field(..., description="失败的用户列表，包含user_id和reason")


class ProjectAdminListItem(BaseModel):
    """项目管理员列表项"""
    id: int = Field(..., description="记录ID")
    project_id: int = Field(..., description="项目ID")
    user_id: int = Field(..., description="用户ID")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    created_at: datetime = Field(..., description="创建时间")

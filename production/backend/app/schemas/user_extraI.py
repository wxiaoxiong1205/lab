from datetime import datetime
from typing import Optional, List

from pydantic import Field

from app.schemas.org import OrgItem
from app.schemas.role import RoleItem
from app.schemas.user import UserItem


# PageUserVO
class UserExtraItem(UserItem):
    """分页列表中的单个用户详情模型"""
    roles: Optional[List[RoleItem]] = Field(default=None, description="用户关联的角色列表")
    orgs: Optional[List[OrgItem]] = Field(default=None, description="用户关联的组织列表")
    joinTime: Optional[datetime] = Field(default=None, description="用户加入项目空间的时间，属于lab业务数据")
    is_project_admin: Optional[bool] = Field(default=False, description="是否是项目管理员")

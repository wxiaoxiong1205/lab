import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.schemas.common import BaseModelWithTimezone

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=1000)
class ProjectCreate(ProjectBase):
    kubernetes_id: Optional[int] = Field(None, description="集群id")
    admin_user_ids: Optional[List[int]] = Field(None, description="项目管理员用户ID列表，至少需要指定一个项目管理员")

class ProjectResponse(ProjectBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    kubernetes_name: Optional[str] = None

# 中间模型，只包含 Project 模型支持的字段
class ProjectInDB(ProjectBase):
    pass

class ProjectDetailResponse(ProjectResponse):
    kubernetes_id: Optional[int] = Field(None, description="集群id")
    kubernetes_name: Optional[str] = Field(None, description="集群名称")
    admin_user_ids: Optional[List[int]] = Field(None, description="项目管理员用户ID列表")
    is_tenant_admin: Optional[bool] = Field(None, description="当前用户是否是租户管理员")
    is_platform_admin: Optional[bool] = Field(None, description="当前用户是否是平台管理员")
    is_project_admin: Optional[bool] = Field(None, description="当前用户是否是项目管理员")


class ProjectImageBuildNamespace(BaseModel):
    image_build_namespace: str = Field(..., max_length=50, description="镜像构建镜像命名空间/项目")
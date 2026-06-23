from typing import Optional, List
from pydantic import Field, BaseModel


class RoleItem(BaseModel):
    """用户角色列表中的单个角色模型"""
    id: int = Field(description="角色ID")
    code: str = Field(description="角色编码")
    name: str = Field(description="角色名称")
    description: Optional[str] = Field(default=None, max_length=1000, description="角色描述")
    status: int = Field(description="角色状态（0=正常，1=禁用等）")
    type: int = Field(description="角色类型")
    securityName: Optional[str] = Field(default=None, description="安全名称")
    securityId: Optional[int] = Field(default=None, description="安全ID")




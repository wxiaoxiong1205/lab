from typing import Optional, List, Any

from pydantic import Field, BaseModel


class OrgItem(BaseModel):
    """用户组织列表中的单个组织模型"""
    id: int = Field(description="组织ID")
    name: str = Field(description="组织名称")
    parentId: Optional[int] = Field(default=None, description="父组织ID")
    idPath: str = Field(description="组织ID路径（如：1386851762161152）")
    children: Optional[List[Any]] = Field(default=None, description="子组织列表，可后续扩展具体模型")
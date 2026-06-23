from datetime import datetime
from typing import List, Optional, Dict, Any, Union, Literal
from pydantic import BaseModel, Field, root_validator, validator
from app.schemas.common import BaseModelWithTimezone

# 提示词目录相关Schema
class PromptDirectoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="目录名称")
    description: Optional[str] = Field(None, max_length=500, description="目录描述")
   
class PromptDirectoryCreate(PromptDirectoryBase):
    pass

class PromptDirectoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="目录名称")
    description: Optional[str] = Field(None, max_length=500, description="目录描述")

class PromptDirectoryResponse(BaseModelWithTimezone):
    id: int
    name: str
    description: Optional[str] = None
    project_id: int
    prompt_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = {
        "from_attributes": True
    }

# 现有的提示词Schema
class PromptCreate(BaseModel):
    title: str
    description: Optional[str] = None
    messages: List[Dict] = []
    template_format: Optional[str] = "jinja2"

class PromptUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    messages: Optional[List[Dict]] = None
    template_format: Optional[str] = None

class PromptResponse(BaseModel):
    id: int
    title: str
    project_id: int
    description: Optional[str] = None
    messages: Optional[List[Dict]] = None
    input_variables: Optional[List[str]] = None
    template_format: Optional[str] = None
    directory_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    model_config = {
        "from_attributes": True
    }

class PromptSearch(BaseModel):
    title: Optional[str] = None
    # 标签功能已废弃，移除tag_match_type字段
    sort_by: Literal["created_at", "updated_at", "title"] = Field(
        default="created_at",
        description="排序字段"
    )
    sort_order: Literal["asc", "desc"] = Field(
        default="desc",
        description="排序方向"
    )
    created_after: Optional[datetime] = Field(
        default=None,
        description="创建时间晚于"
    )
    created_before: Optional[datetime] = Field(
        default=None,
        description="创建时间早于"
    )

class PromptBatchDelete(BaseModel):
    prompt_ids: List[int] = Field(..., min_items=1, description="要删除的提示词ID列表") 
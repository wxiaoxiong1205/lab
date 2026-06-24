from datetime import datetime
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, ConfigDict, Field


class OpenAPIApplicationCreateRequest(BaseModel):
    name: str = Field("", max_length=100, description="应用名称")
    group_id: Optional[str] = Field(None, max_length=100, description="分组ID")
    description: Optional[str] = Field(None, max_length=1000, description="应用描述")
    labels: Dict[str, Any] = Field(default_factory=dict, description="标签数据")


class OpenAPIApplicationUpdateRequest(BaseModel):
    name: str = Field("", max_length=100, description="应用名称")
    group_id: Optional[str] = Field(None, min_length=1, max_length=100, description="分组ID")
    description: Optional[str] = Field(None, max_length=1000, description="应用描述")
    labels: Optional[Dict[str, Any]] = Field(None, description="标签数据")


class OpenAPIApplicationDeleteRequest(BaseModel):
    ids: List[int] = Field(..., min_length=1, description="应用主键ID列表")


class OpenAPIApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = Field(None, description="主键ID")
    name: Optional[str] = Field(None, description="应用名称")
    group_id: Optional[str] = Field(None, description="分组ID")
    key_id: Optional[str] = Field(None, description="Key ID")
    secret_key: Optional[str] = Field(None, description="应用密钥")
    description: Optional[str] = Field(None, description="应用描述")
    labels: Dict[str, Any] = Field(default_factory=dict, description="标签数据")
    plugins: Dict[str, Any] = Field(default_factory=dict, description="插件数据")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")

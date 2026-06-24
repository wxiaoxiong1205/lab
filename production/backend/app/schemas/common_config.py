from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class CommonConfigResponse(BaseModel):
    """通用配置响应模型"""
    id: int = Field(..., description="主键ID")
    config_key: str = Field(..., description="配置键")
    config_value: str = Field(..., description="配置值")
    description: Optional[str] = Field(None, max_length=1000, description="配置描述")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    
    class Config:
        from_attributes = True


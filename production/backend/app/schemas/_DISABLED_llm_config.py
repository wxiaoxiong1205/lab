from datetime import datetime
from typing import Optional, Dict, Any, Literal, Union
from pydantic import BaseModel, Field
from app.schemas.common import BaseModelWithTimezone

class LLMConfigBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    
    # LLM基本配置
    model: str = Field(..., min_length=1, max_length=100)
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, gt=0)
    timeout: Optional[int] = Field(None, gt=0)
    max_retries: Optional[int] = Field(None, ge=0)
    
    # 模型生成参数
    frequency_penalty: Optional[float] = Field(None, ge=0.0, le=2.0, description="控制重复度，值越大越不倾向重复内容")
    presence_penalty: Optional[float] = Field(None, ge=0.0, le=2.0, description="控制主题新颖度，值越大越倾向引入新主题")
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="控制输出多样性，值越小则模型输出越确定性")
    
    # 可选配置
    api_key: Optional[str] = Field(None, max_length=200)
    base_url: Optional[str] = Field(None, max_length=200)
    organization: Optional[str] = Field(None, max_length=100)
    
    # 其他配置参数
    additional_params: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    # 是否为当前项目的默认配置
    is_default: bool = Field(default=False)

class LLMConfigCreate(LLMConfigBase):
    pass

class LLMConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    
    # LLM基本配置
    model: Optional[str] = Field(None, min_length=1, max_length=100)
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[Union[int, None]] = Field(None)  # 允许设置为None或正整数
    timeout: Optional[Union[int, None]] = Field(None)  # 允许设置为None或正整数
    max_retries: Optional[int] = Field(None, ge=0)
    
    # 模型生成参数
    frequency_penalty: Optional[float] = Field(None, ge=0.0, le=2.0, description="控制重复度，值越大越不倾向重复内容")
    presence_penalty: Optional[float] = Field(None, ge=0.0, le=2.0, description="控制主题新颖度，值越大越倾向引入新主题")
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="控制输出多样性，值越小则模型输出越确定性")
    
    # 可选配置
    api_key: Optional[str] = Field(None, max_length=200)
    base_url: Optional[str] = Field(None, max_length=200)
    organization: Optional[str] = Field(None, max_length=100)
    
    # 其他配置参数
    additional_params: Optional[Dict[str, Any]] = None
    
    # 是否为当前项目的默认配置
    is_default: Optional[bool] = None

class LLMConfigResponse(LLMConfigBase, BaseModelWithTimezone):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime

class LLMConfigSearch(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    is_default: Optional[bool] = None
    sort_by: Literal["created_at", "updated_at", "name"] = Field(
        default="created_at",
        description="排序字段"
    )
    sort_order: Literal["asc", "desc"] = Field(
        default="desc",
        description="排序方向"
    ) 
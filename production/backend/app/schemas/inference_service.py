from datetime import datetime
from enum import Enum
from typing import Optional, List

from pydantic import BaseModel, Field, field_validator, ConfigDict

from app.schemas.base import BaseSchema
from app.schemas.business_attr_value import BusinessAttrValueInput, BusinessAttrValueResponse, BusinessAttrValueUpdateInput

# ==================== 推理服务相关枚举 ====================
# 在线推理服务模型类型
class InferenceServiceModelType(str, Enum):
    """在线推理服务模型类型"""
    # LLM = "大语言模型"
    # VLM = "视觉模型"
    TEXT_GENERATION = "文本生成"
    IMAGE_UNDERSTANDING = "图像理解"


class InferenceServiceCreateRequest(BaseModel):
    name: str = Field(description="服务名称")
    description: Optional[str] = Field(None, max_length=1000, description="服务描述")
    api_key: str = Field(description="服务API Key")
    base_url: str = Field(description="服务API URL")
    model_name: str = Field(description="服务模型名称")
    model_type: List[str] = Field(..., description="服务模型类型")
    attr_values: Optional[List[BusinessAttrValueInput]] = Field(None, description="服务属性值列表")

    # 创建时验证枚举值是否合法
    @field_validator('model_type')
    @classmethod
    def validate_model_type_values(cls, v):
        valid_values = {e.value for e in InferenceServiceModelType}
        for item in v:
            if item not in valid_values:
                raise ValueError(f"无效的模型类型: {item}，可选值: {list(valid_values)}")
        return v

class InferenceServiceDeleteRequest(BaseModel):
    ids: list[int] = Field(description="需要删除的模型ID列表")

class InferenceServiceUpdateRequest(BaseModel):
    id: int = Field(description="服务ID")
    name: Optional[str] = Field(None, description="服务名称")
    description: Optional[str] = Field(None, max_length=1000, description="服务描述")
    api_key: Optional[str] = Field(None, description="服务API Key")
    base_url: Optional[str] = Field(None, description="服务API URL")
    model_name: Optional[str] = Field(None, description="服务模型名称")
    model_type: Optional[List[str]] = Field(None, description="服务模型类型")
    attr_values: Optional[List[BusinessAttrValueUpdateInput]] = Field(None, description="服务属性值列表")

    # 创建时验证枚举值是否合法
    @field_validator('model_type')
    @classmethod
    def validate_model_type_values(cls, v):
        valid_values = {e.value for e in InferenceServiceModelType}
        for item in v:
            if item not in valid_values:
                raise ValueError(f"无效的模型类型: {item}，可选值: {list(valid_values)}")
        return v

class InferenceServiceTestRequest(BaseModel):
    id: int = Field(description="服务ID")

class InferenceServiceResponse(BaseSchema):
    name: str = Field(description="服务名称")
    description: Optional[str] = Field(None, max_length=1000, description="服务描述")
    api_key: str = Field(description="服务API Key")
    base_url: str = Field(description="服务API URL")
    model_name: str = Field(description="服务模型名称")
    status: Optional[str] = Field(None, description="服务连接状态")

class InferenceServiceListItemResponse(BaseSchema):
    name: str = Field(description="服务名称")
    description: Optional[str] = Field(None, max_length=1000, description="服务描述")
    status: Optional[str] = Field(None, description="服务连接状态")
    model_name: Optional[str] = Field(None, description="服务模型名称")
    model_type:List[str] = Field(..., description="服务模型类型")

class InferenceServiceDetailResponse(BaseModel):
    name: str = Field(description="服务名称")
    description: Optional[str] = Field(None, max_length=1000, description="服务描述")
    base_url: str = Field(description="服务API URL")
    model_name: str = Field(description="服务模型名称")
    model_type: List[str] = Field(..., description="服务模型类型")

    model_config = ConfigDict(from_attributes=True)
    attr_values: List[BusinessAttrValueResponse] = Field(None, description="属性值列表")
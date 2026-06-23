from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from app.schemas.base import BaseSchema


class TrainingTemplateMethod(str, Enum):
    RFT_GRPO = "rft-grpo"


class TrainingTemplateFineTuneType(str, Enum):
    FULL = "full"
    LORA = "lora"


class TrainingParameterTemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=1000, description="模板描述")
    training_method: TrainingTemplateMethod = Field(default=TrainingTemplateMethod.RFT_GRPO, description="训练方法")
    template_content: str = Field(..., min_length=1, description="YAML模板内容")
    enabled: bool = Field(default=True, description="是否启用")


class TrainingParameterTemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=1000, description="模板描述")
    template_content: Optional[str] = Field(None, min_length=1, description="YAML模板内容")
    enabled: Optional[bool] = Field(None, description="是否启用")


class TrainingParameterTemplateCopyRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="新模板名称")


class TrainingParameterTemplateResponse(BaseSchema):
    name: str = Field(..., description="模板名称")
    description: Optional[str] = Field(None, description="模板描述")
    training_method: TrainingTemplateMethod = Field(..., description="训练方法")
    fine_tune_type: TrainingTemplateFineTuneType = Field(..., description="参数类型")
    template_content: str = Field(..., description="YAML模板内容")
    params: Dict[str, Any] = Field(default_factory=dict, description="解析后的训练参数")
    enabled: bool = Field(..., description="是否启用")

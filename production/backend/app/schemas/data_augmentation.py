from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import BaseModelWithTimezone
from app.schemas.data_insight import DataInsightDatasetRef


class PromptAugmentationDirection(BaseModel):
    direction: str = Field(..., description="增强方向")
    sample_count: int = Field(..., ge=1, le=1000, description="生成样本数")
    enabled: bool = Field(True, description="是否启用")
    description: Optional[str] = Field(None, description="方向说明")


class ResponseGenerationConfig(BaseModel):
    enabled: bool = Field(False, description="是否启用 Response 生成")
    target_scope: str = Field("missing-only", description="仅无标注样本/全部样本")
    output_format: str = Field("text", description="text/json-object/json-schema")
    json_schema: Optional[Dict[str, Any]] = Field(None, description="JSON Schema 配置")
    service_type: Optional[str] = Field(None, description="服务来源类型：deployment/online_inference")
    service_id: Optional[int] = Field(None, description="在线服务ID")
    service_name: Optional[str] = Field(None, description="在线服务名称")

    @model_validator(mode="after")
    def validate_json_schema(self):
        if self.enabled and self.output_format == "json-schema" and not self.json_schema:
            raise ValueError("Response 输出格式为 JSON Schema 时必须填写 Schema")
        return self


class PromptGenerationConfig(BaseModel):
    enabled: bool = Field(False, description="是否启用 Prompt 生成")
    service_type: Optional[str] = Field(None, description="服务来源类型：deployment/online_inference")
    service_id: Optional[int] = Field(None, description="在线服务ID")
    service_name: Optional[str] = Field(None, description="在线服务名称")
    scene_description: Optional[str] = Field(None, max_length=2000, description="场景介绍")
    directions: List[PromptAugmentationDirection] = Field(default_factory=list, description="增强方向")


class DataAugmentationTaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="任务描述")
    source_dataset: DataInsightDatasetRef = Field(..., description="增强前数据集")
    output_dataset_name: str = Field(..., min_length=1, max_length=100, description="增强后数据集名称")
    output_dataset_version: str = Field("V1", min_length=1, max_length=50, description="增强后数据集版本")
    prompt_generation: PromptGenerationConfig = Field(default_factory=PromptGenerationConfig)
    response_generation: ResponseGenerationConfig = Field(default_factory=ResponseGenerationConfig)

    @model_validator(mode="after")
    def validate_generation_enabled(self):
        if not self.prompt_generation.enabled and not self.response_generation.enabled:
            raise ValueError("Prompt 生成和 Response 生成至少开启一个")
        return self


class DataAugmentationTaskResponse(BaseModelWithTimezone):
    id: int
    name: str
    description: Optional[str] = None
    project_id: int
    source_dataset_id: Optional[int] = None
    source_dataset_name: str
    source_dataset_version: str
    source_dataset_usage: str
    output_dataset_name: str
    output_dataset_version: Optional[str] = None
    dataset_type: str
    training_method_type: str
    dataset_format: str
    status: str
    config: Dict[str, Any] = Field(default_factory=dict)
    result_summary: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    finished_at: Optional[datetime] = None


class DataAugmentationTaskPage(BaseModel):
    items: List[DataAugmentationTaskResponse]
    total: int
    page: int
    size: int

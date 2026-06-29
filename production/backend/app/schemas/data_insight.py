from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import BaseModelWithTimezone


SUPPORTED_INSIGHT_DATASET_TYPE = "text-generation"
SUPPORTED_INSIGHT_TRAINING_METHOD = "sft"
SUPPORTED_INSIGHT_FORMATS = {"prompt-response", "role-based"}


class DataInsightDatasetRef(BaseModel):
    dataset_id: Optional[int] = Field(None, description="数据集版本ID")
    dataset_name: str = Field(..., description="数据集名称")
    version: str = Field(..., description="数据集版本")
    usage: str = Field("training", description="数据集用途")
    dataset_type: str = Field(..., description="数据集类型")
    training_method_type: str = Field(..., description="训练方法类型")
    dataset_format: str = Field(..., description="数据格式")

    @model_validator(mode="after")
    def validate_supported_sft(self):
        if self.dataset_type != SUPPORTED_INSIGHT_DATASET_TYPE:
            raise ValueError("V1.15 数据洞察/增强暂仅支持文本生成数据集")
        if self.training_method_type != SUPPORTED_INSIGHT_TRAINING_METHOD:
            raise ValueError("V1.15 数据洞察/增强暂仅支持 SFT 数据集")
        if self.dataset_format not in SUPPORTED_INSIGHT_FORMATS:
            raise ValueError("V1.15 数据洞察/增强暂仅支持 prompt-response 和 role-based 格式")
        return self


class DataInsightFilterCondition(BaseModel):
    condition_type: str = Field(..., description="条件类型")
    operator: str = Field(..., description="操作符")
    value: Optional[Any] = Field(None, description="条件值")
    min_value: Optional[float] = Field(None, description="最小值")
    max_value: Optional[float] = Field(None, description="最大值")


class DataInsightTaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="任务描述")
    source_dataset: DataInsightDatasetRef = Field(..., description="源数据集")
    filters: List[DataInsightFilterCondition] = Field(default_factory=list, description="初始筛选条件")


class DataInsightTaskResponse(BaseModelWithTimezone):
    id: int
    name: str
    description: Optional[str] = None
    project_id: int
    source_dataset_id: Optional[int] = None
    source_dataset_name: str
    source_dataset_version: str
    source_dataset_usage: str
    dataset_type: str
    training_method_type: str
    dataset_format: str
    status: str
    config: Dict[str, Any] = Field(default_factory=dict)
    result_summary: Dict[str, Any] = Field(default_factory=dict)
    result_samples: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    finished_at: Optional[datetime] = None


class DataInsightTaskPage(BaseModel):
    items: List[DataInsightTaskResponse]
    total: int
    page: int
    size: int


class DataInsightSaveAsDatasetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="新数据集名称")
    version: str = Field("V1", min_length=1, max_length=50, description="新数据集版本")
    description: Optional[str] = Field(None, max_length=1000, description="数据集描述")
    filters: List[DataInsightFilterCondition] = Field(default_factory=list, description="保存时应用的筛选条件")


class DataInsightSaveAsDatasetResponse(BaseModel):
    dataset_name: str
    version: str
    status: str
    message: str

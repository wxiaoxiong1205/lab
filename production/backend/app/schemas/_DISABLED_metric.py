from datetime import datetime
from typing import List, Optional, Dict, Any, Union, Literal
from pydantic import BaseModel, Field
from app.schemas.common import BaseModelWithTimezone
from enum import Enum

# 指标类型枚举
class MetricType(str, Enum):
    """指标类型枚举，用于区分不同类型的指标"""
    BUILTIN = "builtin"  # 内置指标
    GEVAL = "geval"      # geval指标

# 指标目录相关Schema
class MetricDirectoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="目录名称")
    description: Optional[str] = Field(None, max_length=500, description="目录描述")

class MetricDirectoryCreate(MetricDirectoryBase):
    pass

class MetricDirectoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="目录名称")
    description: Optional[str] = Field(None, max_length=500, description="目录描述")

class MetricDirectoryResponse(BaseModelWithTimezone):
    id: int
    name: str
    description: Optional[str] = None
    project_id: int
    metric_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }

# 指标相关Schema
class MetricBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="指标名称")
    description: Optional[str] = Field(None, max_length=500, description="指标描述")
    type: str = Field(..., min_length=1, max_length=50, description="指标类型")
    is_builtin: bool = Field(False, description="是否为内置指标")
    metric_type: MetricType = Field(default=MetricType.BUILTIN, description="指标分类类型")
    required_params: List[str] = Field(default=[], description="必填参数列表")
    params_content: Dict = Field(default={}, description="参数详细内容和说明")

class MetricCreate(MetricBase):
    pass

class MetricUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="指标名称")
    description: Optional[str] = Field(None, max_length=500, description="指标描述")
    type: Optional[str] = Field(None, min_length=1, max_length=50, description="指标类型")
    is_builtin: Optional[bool] = Field(None, description="是否为内置指标")
    metric_type: Optional[MetricType] = Field(None, description="指标分类类型")
    required_params: Optional[List[str]] = Field(None, description="必填参数列表")
    params_content: Optional[Dict] = Field(None, description="参数详细内容和说明")

class MetricResponse(BaseModelWithTimezone):
    id: int
    name: str
    description: Optional[str] = None
    type: str
    is_builtin: bool
    metric_type: MetricType = MetricType.BUILTIN
    required_params: List[str] = []
    params_content: Dict = {}
    project_id: int
    directory_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }

class MetricSearch(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    is_builtin: Optional[bool] = None
    metric_type: Optional[MetricType] = None
    sort_by: Literal["created_at", "updated_at", "name"] = Field(
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

class MetricBatchDelete(BaseModel):
    metric_ids: List[int] = Field(..., min_items=1, description="要删除的指标ID列表")

# 评估步骤生成相关Schema
class GenerateEvaluationStepsRequest(BaseModel):
    llm_config_id: int = Field(..., description="大模型ID")
    parameters: List[str] = Field(..., min_items=1, description="参数列表")
    criteria: str = Field(..., min_length=1, description="评估标准")

class GenerateEvaluationStepsResponse(BaseModel):
    steps: List[str] = Field(..., description="生成的评估步骤") 
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import BaseModelWithTimezone


class DatasetKind(str, Enum):
    LLM_DATASET = "llm_dataset"
    MACHINE_LEARNING_DATASET = "machine_learning_dataset"


class DatasetOperationType(str, Enum):
    DELETE_ROWS = "delete_rows"


class DatasetOperationStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class DatasetVersionOperationResponse(BaseModelWithTimezone):
    operation_id: str = Field(..., description="操作ID")
    dataset_kind: DatasetKind = Field(..., description="数据集类型")
    dataset_id: int = Field(..., description="数据集版本ID")
    version: str = Field(..., description="版本号")
    operation_type: DatasetOperationType = Field(..., description="操作类型")
    status: DatasetOperationStatus = Field(..., description="操作状态")
    row_numbers: List[int] = Field(default_factory=list, description="操作影响的全局行号")
    requested_count: int = Field(0, description="请求删除数量")
    removed_count: int = Field(0, description="实际删除数量")
    error_message: Optional[str] = Field(None, description="失败原因")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    created_by: Optional[str] = Field(None, description="创建人")

    class Config:
        from_attributes = True


class DatasetVersionOperationEnvelope(BaseModel):
    active_operation: Optional[DatasetVersionOperationResponse] = Field(None, description="当前未完成的版本操作")

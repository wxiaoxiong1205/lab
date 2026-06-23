from typing import Optional

from pydantic import BaseModel, Field, model_validator


class TaskExecutionManualStartRequest(BaseModel):
    """手动启动 task_execution 请求"""

    execution_id: Optional[int] = Field(None, description="task_execution 主键ID")
    business_type: Optional[str] = Field(None, description="业务类型（当 execution_id 为空时必填）")
    business_id: Optional[int] = Field(None, description="业务ID（当 execution_id 为空时必填）")

    @model_validator(mode="after")
    def validate_target(self):
        if self.execution_id is None and (not self.business_type or self.business_id is None):
            raise ValueError("execution_id 与 (business_type,business_id) 至少提供一组")
        return self


class TaskExecutionManualStartResponse(BaseModel):
    execution_id: int = Field(..., description="触发的 task_execution ID")
    status: str = Field(..., description="触发后的状态")
    message: str = Field(..., description="结果说明")

class TaskExecutionBusinessResp(BaseModel):
    label: str
    value: str
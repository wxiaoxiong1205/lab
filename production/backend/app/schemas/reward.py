from typing import Any, Optional

from pydantic import BaseModel, Field


class RewardRequest(BaseModel):
    data_source: Optional[str] = Field(None, description="数据来源")
    solution_str: str = Field("", description="模型生成内容")
    prediction: Optional[Any] = Field(None, description="已解析的预测答案")
    ground_truth: Optional[Any] = Field(None, description="标准答案")
    extra_info: Optional[dict[str, Any]] = Field(None, description="样本扩展信息")


class RewardResponse(BaseModel):
    score: float = Field(..., description="奖励分数")
    prediction: Optional[str] = Field(None, description="预测答案")
    ground_truth: Optional[str] = Field(None, description="标准答案")
    data_source: Optional[str] = Field(None, description="数据来源")
    reward_model: str = Field(..., description="奖励模型名称")

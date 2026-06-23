from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, Json
from datetime import datetime

class BusinessInferenceResultDatasetCreate(BaseModel):
    id :  Optional[int] = Field(None,description="主键id")
    name : Optional[str] = Field(description="结果集名称",min_length=1)
    description : Optional[str] = Field(None,description="结果集描述" )
    inference_type : Optional[str] = Field(description="推理方式" )
    api_name : Optional[str] = Field(description="api名称" )
    api_id  : Optional[int] = Field(description="api主键" )
    dataset_name  : Optional[str] = Field(description="数据集名称" )
    dataset_id: Optional[int] = Field(description="数据集id")
    param :  Dict[str, Any] = Field(None,description="参数")
    schedule_at:Optional[datetime] = Field(None,description="计划执行时间")





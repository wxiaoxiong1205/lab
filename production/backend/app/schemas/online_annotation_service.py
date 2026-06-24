from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from app.schemas.machine_learning_dataset import (
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetDataType,
    MachineLearningDatasetTemplateType,
)


class OnlineAnnotationServiceStatus(str, Enum):
    UNTESTED = "未测试"
    SUCCESS = "测试通过"
    FAILED = "测试失败"


class OnlineAnnotationServiceCreateRequest(BaseModel):
    name: str = Field(..., description="服务名称", max_length=100)
    description: Optional[str] = Field(None, description="服务描述", max_length=1000)
    base_url: str = Field(..., description="服务基础地址", max_length=500)
    category: str = Field("machine_learning", description="服务分类", max_length=50)
    data_type: Optional[MachineLearningDatasetDataType] = Field(None, description="数据类型：text/image")
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Field(None, description="标注类型")
    template_type: Optional[MachineLearningDatasetTemplateType] = Field(None, description="标注模板")
    status: OnlineAnnotationServiceStatus = Field(OnlineAnnotationServiceStatus.UNTESTED, description="服务状态")


class OnlineAnnotationServiceTestRequest(BaseModel):
    id: int = Field(..., description="在线标注服务ID")


class OnlineAnnotationServiceUpdateRequest(BaseModel):
    id: int = Field(..., description="服务ID")
    name: Optional[str] = Field(None, description="服务名称", max_length=100)
    description: Optional[str] = Field(None, description="服务描述", max_length=1000)
    base_url: Optional[str] = Field(None, description="服务基础地址", max_length=500)
    category: Optional[str] = Field(None, description="服务分类", max_length=50)
    data_type: Optional[MachineLearningDatasetDataType] = Field(None, description="数据类型：text/image")
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Field(None, description="标注类型")
    template_type: Optional[MachineLearningDatasetTemplateType] = Field(None, description="标注模板")


class OnlineAnnotationServiceResponse(BaseModel):
    id: int = Field(..., description="服务ID")
    name: str = Field(..., description="服务名称")
    description: Optional[str] = Field(None, description="服务描述")
    base_url: str = Field(..., description="服务基础地址")
    category: str = Field(..., description="服务分类")
    service_type: Optional[str] = Field(None, description="服务类型（数据类型-标注类型-模板，中文展示）")
    data_type: Optional[str] = Field(None, description="数据类型：text/image")
    annotation_type: Optional[str] = Field(None, description="标注类型")
    template_type: Optional[str] = Field(None, description="标注模板")
    status: Optional[str] = Field(None, description="服务状态")
    created_by: Optional[str] = Field(None, description="创建者")
    created_at: Optional[datetime] = Field(None, description="创建时间")


class OnlineAnnotationAiProxyRequest(BaseModel):
    predict_base_url: str = Field(..., description="预标注服务地址前缀；服务端会对其去尾斜杠后拼接 /predict 再 POST", max_length=500)
    tasks: List[Dict[str, Any]] = Field(..., description='任务列表，如 [{"id": 601, "data": {"image": "https://..."}}]',)
    project: int = Field(..., description="项目ID", gt=0)
    label_config: str = Field(..., description="标注配置（如 Label Studio 的 <View>...</View> XML）")


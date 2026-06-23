from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, model_validator
from app.schemas.common import BaseModelWithTimezone
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
from app.schemas.business_attr_value import BusinessAttrValueResponse
from enum import Enum

# 数据集格式枚举 - 根据数据库定义：prompt-response, role-based, prefix-suffix-middle
class DatasetFormat(str, Enum):
    """数据集格式枚举"""
    PROMPT_RESPONSE = "prompt-response"  # 提示词+回复格式
    ALPACA = "alpaca"  # DPO Alpaca 偏好格式
    ROLE_BASED = "role-based"  # 基于角色的对话格式
    COMPLETION_REWARD = "completion-reward"  # RFT-GRPO Completion + Reward 格式
    PREFIX_SUFFIX_MIDDLE = "prefix-suffix-middle"  # 前缀+后缀+中间格式
    # 添加了业务数据集的特殊格式business
    BUSINESS = "business"

# 上传数据集文件类型枚举
# 文件类型枚举与 FILE_TYPE_CONFIG 配置需保持同步，见file_parser/FILE_TYPE_CONFIG
# 新增文件类型时，请同步新增FILE_TYPE_CONFIG对应的文件配置
class TrainingDatasetUploadTypeCategory(str, Enum):
    """上传数据集文件类型枚举"""
    JSONL_TYPE = "jsonl"
    XLSX_TYPE = "xlsx"
    JSON_TYPE = "json"
    ZIP_TYPE = "zip"
    CSV_TYPE = "csv"

# 下载数据集文件类型枚举
# 此处配置的是数据集文件可以导出的所有格式
class TrainingDatasetExportTypeCategory(str, Enum):
    """上传数据集文件类型枚举"""
    JSONL_TYPE = "jsonl"
    XLSX_TYPE = "xlsx"
    JSON_TYPE = "json"
    ZIP_TYPE = "zip"

# 数据集用途枚举
class DatasetUsage(str, Enum):
    # (值, 描述)
    TRAINING = "training", "训练数据集"
    VALIDATION = "validation", "验证数据集"
    TEST = "test", "测试数据集"
    BUSINESS_TRAINING = "business_training", "业务训练数据集"
    BUSINESS_TEST = "business_test", "业务测试数据集"

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        return self._description


# 数据集处理状态枚举
class DatasetProcessingStatus(str, Enum):
    """数据集处理状态"""
    PENDING = "pending", "处理中"
    COMPLETED = "completed", "处理完成"
    FAILED = "failed", "处理失败"

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        """返回中文描述"""
        return self._description


class TrainingDatasetResponse(BaseModelWithTimezone):
    """训练数据集响应模型"""
    id: int = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    description: Optional[str] = Field(None, max_length=1000, description="数据集描述")
    project_id: int = Field(..., description="关联项目ID")
    version: str = Field(..., description="数据集版本号")
    dataset_type: TrainingTypeCategory = Field(..., description="数据集类型")
    training_method_type: TrainingMethodType = Field(..., description="训练方法类型")
    dataset_format: DatasetFormat = Field(..., description="数据格式")
    usage: DatasetUsage = Field(..., description="数据集用途：training训练数据集, validation验证数据集, test测试数据集")
    dataset_config: Optional[Dict[str, Any]] = Field(None, description="数据集配置信息")
    metadata_fields: Optional[List[str]] = Field(None, description="数据集字段元数据，上传解析完成后生成")
    total_samples: Optional[int] = Field(None, description="总样本数")
    total_characters: Optional[int] = Field(None, description="n总字符数")
    file_size: Optional[float] = Field(None, description="文件大小(MB)")
    file_size_display: Optional[str] = Field(None, description="格式化的文件大小显示")
    dataset_path: str = Field(..., description="数据集文件路径（系统自动生成）")
    processing_status: DatasetProcessingStatus = Field(..., description="处理状态：pending处理中, completed处理完成, failed处理失败")
    processing_status_display: Optional[str] = Field(None, description="处理状态中文显示")
    processing_error: Optional[str] = Field(None, description="处理失败时的错误信息")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_by: Optional[str] = Field(None, description="创建人")
    attr_values: Optional[List[BusinessAttrValueResponse]] = Field(default_factory=list, description="关联属性值及选项列表")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "中文对话数据集",
                "description": "用于训练中文对话模型的数据集",
                "project_id": 1,
                "dataset_type": "text-generation",
                "training_method_type": "sft",
                "dataset_format": "role-based",
                "usage": "training",
                "dataset_config": {
                    "max_length": 2048,
                    "separator": "\n"
                },
                "metadata_fields": ["prompt", "response"],
                "total_samples": 10000,
                "total_characters": 5000000,
                "file_size": 25.5,
                "dataset_path": "/data/datasets/project_1/chinese_dialogue_001.json",
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z"
            }
        }


class TrainingDatasetBasicInfoUpdate(BaseModel):
    """训练数据集基础信息编辑请求模型"""
    dataset_id: Optional[int] = Field(None, description="需要修改描述的数据集ID；传 description 时必填")
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="新的数据集名称；会同步修改同名数据集的所有版本")
    description: Optional[str] = Field(None, max_length=1000, description="新的数据集描述；仅修改 dataset_id 对应版本")

    @model_validator(mode="after")
    def validate_update_fields(self):
        if "name" not in self.model_fields_set and "description" not in self.model_fields_set:
            raise ValueError("name 和 description 至少需要传一个")
        if "description" in self.model_fields_set and self.dataset_id is None:
            raise ValueError("修改 description 时必须传 dataset_id")
        return self


class DatasetVersionMergeRequest(BaseModel):
    """数据集版本合并请求模型"""
    new_version: str = Field(..., min_length=1, max_length=50, description="合并后生成的新版本号")
    source_version_ids: List[int] = Field(..., min_length=2, description="参与合并的数据集版本ID列表，至少选择两个")
    description: Optional[str] = Field(None, max_length=1000, description="合并版本描述")


class TrainingDatasetSummaryResponse(BaseModel):
    """训练数据集汇总响应模型"""
    id: int = Field(..., description="数据集id")
    dataset_name: str = Field(..., description="数据集名称")
    version_count: int = Field(..., description="版本数量")
    dataset_type: TrainingTypeCategory = Field(..., description="数据集类型")
    training_method_type: TrainingMethodType = Field(..., description="训练方法类型")
    dataset_format: DatasetFormat = Field(..., description="数据格式")
    usage: DatasetUsage = Field(..., description="数据集用途：training训练数据集, validation验证数据集, test测试数据集")
    project_id: int = Field(..., description="项目ID")
    latest_version: str = Field(..., description="最新版本号")
    earliest_version: str = Field(..., description="最早版本号")
    processing_status: Optional[DatasetProcessingStatus] = Field(None, description="最新版本的处理状态")
    processing_status_display: Optional[str] = Field(None, description="最新版本的处理状态中文显示")
    processing_error: Optional[str] = Field(None, description="最新版本的处理错误信息")
    metadata_fields: Optional[List[str]] = Field(None, description="最新版本的数据集字段元数据")
    created_at: datetime = Field(..., description="首次创建时间")
    updated_at: datetime = Field(..., description="最后更新时间")
    created_by: Optional[str] = Field(None, description="创建人")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "dataset_name": "chinese_dialogue",
                "version_count": 3,
                "dataset_type": "text_generation",
                "training_method_type": "sft",
                "dataset_format": "role-based",
                "usage": "training",
                "project_id": 1,
                "latest_version": "v3",
                "earliest_version": "v1",
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-03T00:00:00Z"
            }
        }


class DatasetSampleResponse(BaseModel):
    """数据集样本响应模型"""
    row_number: int = Field(..., description="行号（从1开始）")
    sample_data: Any = Field(..., description="样本数据（可以是字典、列表或其他JSON格式）")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "examples": [
                {
                    "row_number": 1,
                    "sample_data": {
                        "system": "你是一个专业的助手",
                        "prompt": "请介绍一下人工智能",
                        "response": "人工智能（AI）是计算机科学的一个分支..."
                    }
                },
                {
                    "row_number": 2,
                    "sample_data": [
                        {
                            "system": "你是一个专业的法律助手",
                            "user": "请解释立法法的作用",
                            "assistant": "立法法是规范立法活动的重要法律..."
                        }
                    ]
                }
            ]
        }


class DatasetSamplePageResponse(BaseModel):
    """数据集样本分页响应模型（包含 base_url）"""
    items: List[DatasetSampleResponse] = Field(..., description="当前页的样本列表")
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码（从1开始）")
    size: int = Field(..., description="每页显示条数")
    pages: int = Field(..., description="总页数")
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")

    class Config:
        from_attributes = True


class DatasetInUseResponse(BaseModel):
    """数据集使用状态响应模型"""
    in_use: bool = Field(..., description="是否正在被使用")
    task_type: Optional[str] = Field(None, description="任务类型: label(标注任务) / cleaning(清洗任务)")
    task_id: Optional[int] = Field(None, description="使用中的任务ID")
    task_name: Optional[str] = Field(None, description="使用中的任务名称")
    version: str = Field(..., description="数据集版本")

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "in_use": False,
                    "task_type": None,
                    "task_id": None,
                    "task_name": None,
                    "version": None
                },
                {
                    "in_use": True,
                    "task_type": "label",
                    "task_id": 123,
                    "task_name": "对话数据标注任务",
                    "version": "V1"
                },
                {
                    "in_use": True,
                    "task_type": "cleaning",
                    "task_id": 456,
                    "task_name": "数据清洗任务",
                    "version": "V2"
                }
            ]
        }


class CountByValueItem(BaseModel):
    """按某维度聚合的单项：维度值 + 数据量"""
    value: str = Field(..., description="维度值（如 usage、dataset_format、dataset_type、option_value）")
    count: int = Field(..., description="该维度下的数据量（数据集条数）")


class AttrOptionGroupItem(BaseModel):
    """按属性 name 分组：该属性下各 option 对应的数据量"""
    name: str = Field(..., description="属性名称（business_attr_value.name）")
    options: List[CountByValueItem] = Field(default_factory=list, description="该属性下各 option 值及对应数据量")


class TrainingDatasetAggregationResponse(BaseModel):
    """训练数据集聚合统计响应：按 usage、dataset_format、dataset_type、attr option 分别统计数据量；传了筛选参数的维度不返回"""
    usage: Optional[List[CountByValueItem]] = Field(None, description="按 usage 统计的数据量（未传 usage 筛选时返回）")
    dataset_format: Optional[List[CountByValueItem]] = Field(None, description="按 dataset_format 统计的数据量（未传 dataset_format 筛选时返回）")
    dataset_type: Optional[List[CountByValueItem]] = Field(None, description="按 dataset_type 统计的数据量（未传 dataset_type 筛选时返回）")
    attr_option: Optional[List[AttrOptionGroupItem]] = Field(None, description="按属性 name 分组统计（未传 attr_name+option_value 筛选时返回）")

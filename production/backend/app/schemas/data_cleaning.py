from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List

from pydantic import BaseModel, Field

from app.schemas.base import BaseSchema


class DatasetFieldsResponse(BaseModel):
    """数据清洗可选字段列表响应"""
    dataset_id: int = Field(..., description="数据集ID")
    dataset_name: str = Field(..., description="数据集名称")
    fields: List[str] = Field(..., description="可用于数据清洗的字段列表")


# 枚举定义
class CleaningDataSource(str, Enum):
    """清洗数据来源枚举"""
    EXISTED_DATASET = "existed_dataset"  # 已有数据集
    UPLOAD = "upload"  # 本地上传


class CleaningOperatorCategory(str, Enum):
    """清洗算子分类枚举"""
    FORMAT_CLEANING = "format_cleaning"  # 数据格式清洗
    LLM_DATA_CLEANING = "llm_data_cleaning"  # LLM生成数据清洗
    DEDUPLICATION = "deduplication"  # 数据去重
    SENSITIVE_DATA_CLEANING = "sensitive_data_cleaning"  # 敏感数据清洗


# 算子分类配置（统一维护分类信息）
OPERATOR_CATEGORY_CONFIG: List[Dict[str, Any]] = [
    {
        "category": CleaningOperatorCategory.FORMAT_CLEANING.value,
        "name": "数据格式清洗",
        "icon": "format",
        "order": 1,
        "description": "清洗文本格式问题，如空白字符、乱码、HTML标签等"
    },
    {
        "category": CleaningOperatorCategory.LLM_DATA_CLEANING.value,
        "name": "LLM生成数据清洗",
        "icon": "llm",
        "order": 2,
        "description": "清洗LLM生成数据的常见问题，如长度异常、重复生成、截断等"
    },
    {
        "category": CleaningOperatorCategory.DEDUPLICATION.value,
        "name": "数据去重",
        "icon": "dedup",
        "order": 3,
        "description": "基于不同算法的数据去重，支持精确去重和近似去重"
    },
    {
        "category": CleaningOperatorCategory.SENSITIVE_DATA_CLEANING.value,
        "name": "敏感数据清洗",
        "icon": "sensitive",
        "order": 4,
        "description": "识别并脱敏处理各类敏感信息"
    },
]


def get_category_name(category: str) -> str:
    """根据分类标识获取分类名称"""
    for config in OPERATOR_CATEGORY_CONFIG:
        if config["category"] == category:
            return config["name"]
    return category


def get_category_order() -> List[str]:
    """获取分类顺序列表"""
    sorted_configs = sorted(OPERATOR_CATEGORY_CONFIG, key=lambda x: x["order"])
    return [config["category"] for config in sorted_configs]


# 清洗算子配置
class CleaningOperatorConfig(BaseModel):
    """清洗算子配置"""
    operator_type: str = Field(..., description="算子类型")
    operator_name: Optional[str] = Field(None, description="算子名称（用于显示）")
    params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="算子参数")
    order: int = Field(0, description="执行顺序")


# ==================== 清洗任务相关Schema ====================
class CleaningTaskCreate(BaseModel):
    """创建清洗任务请求"""
    name: str = Field(..., description="清洗任务名称", min_length=1, max_length=128)
    project_id: Optional[int] = Field(None, description="项目ID（从路径参数获取，无需在请求体中传递）", gt=0)
    source: CleaningDataSource = Field(CleaningDataSource.EXISTED_DATASET, description="数据来源：existed_dataset/upload")
    input_dataset_id: Optional[int] = Field(None, description="输入数据集ID（当source=existed_dataset时必需）")
    override: bool = Field(False, description="是否覆盖原版本")
    selected_fields: Optional[List[str]] = Field(None, description="选择的字段列表（单选或多选），用于指定需要清洗的字段")
    steps: List[CleaningOperatorConfig] = Field(default_factory=list, description="算子流程配置")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")


class CleaningTaskUpdate(BaseModel):
    """更新清洗任务请求"""
    name: Optional[str] = Field(None, description="清洗任务名称", max_length=128)
    override: Optional[bool] = Field(None, description="是否覆盖原版本")
    selected_fields: Optional[List[str]] = Field(None, description="选择的字段列表（单选或多选）")
    steps: Optional[List[CleaningOperatorConfig]] = Field(None, description="算子流程配置")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")


class CleaningTaskResponse(BaseSchema):
    """清洗任务响应"""
    name: str = Field(..., description="清洗任务名称")
    project_id: int = Field(..., description="项目ID")
    source: str = Field(..., description="数据来源：existed_dataset/upload")
    input_dataset_id: Optional[int] = Field(None, description="输入数据集ID")
    output_dataset_id: Optional[int] = Field(None, description="输出数据集ID")
    override: bool = Field(..., description="是否覆盖原版本")
    status: str = Field(..., description="任务状态")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    steps_snapshot: Optional[List[Dict[str, Any]]] = Field(None, description="步骤快照（数组格式）")
    selected_fields: Optional[List[str]] = Field(None, description="选择的字段列表（用于指定需要清洗的字段）")
    total_samples: Optional[int] = Field(None, description="总样本数")
    total_characters: Optional[int] = Field(None, description="总字符数")
    file_size: Optional[float] = Field(None, description="文件大小（MB）")
    dataset_path: Optional[str] = Field(None, description="数据集文件路径")
    completed_at: Optional[datetime] = Field(None, description="完成时间")
    
    class Config:
        from_attributes = True


class CleaningTaskListResponse(BaseSchema):
    """清洗任务列表响应（简化版）"""
    name: str = Field(..., description="清洗任务名称")
    project_id: int = Field(..., description="项目ID")
    source: str = Field(..., description="数据来源：existed_dataset/upload")
    input_dataset_id: Optional[int] = Field(None, description="输入数据集ID")
    output_dataset_id: Optional[int] = Field(None, description="输出数据集ID")
    input_dataset_name: Optional[str] = Field(None, description="清洗前数据集名称（格式：数据集用途/数据集名称-版本号）")
    output_dataset_name: Optional[str] = Field(None, description="清洗后数据集名称（格式：数据集用途/数据集名称-版本号）")
    status: str = Field(..., description="任务状态")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    total_samples: Optional[int] = Field(None, description="总样本数")
    completed_at: Optional[datetime] = Field(None, description="完成时间")
    
    class Config:
        from_attributes = True


class CleaningTaskDetailResponse(CleaningTaskResponse):
    """清洗任务详情响应（包含预览数据）"""
    input_dataset_name: Optional[str] = Field(None, description="输入数据集名称")
    output_dataset_name: Optional[str] = Field(None, description="输出数据集名称")
    preview_samples: Optional[List[Dict[str, Any]]] = Field(None, description="预览数据（随机50条）")


# ==================== 清洗模板相关Schema ====================
class CleaningTemplateCreate(BaseModel):
    """创建清洗模板请求"""
    project_id: Optional[int] = Field(None, description="项目ID（从路径参数获取，无需在请求体中传递）", gt=0)
    steps_json: List[CleaningOperatorConfig] = Field(..., description="算子流程配置")


class CleaningTemplateUpdate(BaseModel):
    """更新清洗模板请求"""
    steps_json: Optional[List[CleaningOperatorConfig]] = Field(None, description="算子流程配置")


class CleaningTemplateResponse(BaseSchema):
    """清洗模板响应"""
    project_id: int = Field(..., description="项目ID（0表示全局内置模板）")
    is_builtin: bool = Field(False, description="是否系统内置模板")
    steps_json: Optional[List[Dict[str, Any]]] = Field(None, description="算子流程配置")
    
    class Config:
        from_attributes = True


# ==================== 清洗预览相关Schema ====================
class CleaningPreviewRequest(BaseModel):
    """清洗结果预览请求"""
    task_id: int = Field(..., description="任务ID", gt=0)
    sample_count: int = Field(50, description="预览数量", ge=1, le=100)


class CleaningPreviewResponse(BaseModel):
    """清洗结果预览响应"""
    task_id: int = Field(..., description="任务ID")
    samples: List[Dict[str, Any]] = Field(..., description="预览样本数据")
    total_count: int = Field(..., description="总数据量")


# ==================== 清洗日志相关Schema ====================
class CleaningLogResponse(BaseModel):
    """清洗日志响应"""
    archived: bool = Field(..., description="是否为归档日志（True=MinIO归档，False=Loki实时）")
    logs: List[str] = Field(..., description="日志内容列表")


# ==================== 清洗执行相关Schema ====================
class CleaningRunRequest(BaseModel):
    """执行清洗任务请求"""
    task_id: int = Field(..., description="任务ID", gt=0)


class CleaningRunResponse(BaseModel):
    """执行清洗任务响应"""
    task_id: int = Field(..., description="任务ID")
    status: str = Field(..., description="任务状态")
    message: str = Field(..., description="执行消息")


# ==================== 算子列表相关Schema ====================
class OperatorInfo(BaseModel):
    """算子信息"""
    type: str = Field(..., description="算子类型")
    name: str = Field(..., description="算子名称")
    category: str = Field(..., description="算子分类：format_cleaning/llm_data_cleaning/deduplication/sensitive_data_cleaning")
    description: str = Field(..., description="算子描述")
    params_schema: Optional[Dict[str, Any]] = Field(None, description="参数Schema")


class OperatorCategoryInfo(BaseModel):
    """算子分类信息"""
    category: str = Field(..., description="分类标识")
    category_name: str = Field(..., description="分类名称")
    operators: List[OperatorInfo] = Field(..., description="该分类下的算子列表")


class OperatorListResponse(BaseModel):
    """算子列表响应"""
    operators: List[OperatorInfo] = Field(..., description="算子列表（平铺）")


class OperatorCategoryListResponse(BaseModel):
    """算子分类列表响应（按分类组织）"""
    categories: List[OperatorCategoryInfo] = Field(..., description="按分类组织的算子列表")


# ==================== 下载相关Schema ====================
class CleaningDownloadType(str, Enum):
    """清洗下载类型枚举"""
    RESULT = "result"  # 清洗结果
    LOG = "log"  # 清洗日志


# ==================== 数据对比相关Schema ====================
class DataComparisonItem(BaseModel):
    """单条数据对比项"""
    # 映射标识（行号、哈希或唯一ID）
    mapping_key: Any = Field(..., description="映射键（行号、哈希或唯一ID）")
    
    # 清洗前数据
    before_data: Optional[Dict[str, Any]] = Field(None, description="清洗前的原始数据")
    before_index: Optional[int] = Field(None, description="清洗前数据在原始数据集中的索引位置")
    
    # 清洗后数据
    after_data: Optional[Dict[str, Any]] = Field(None, description="清洗后的数据")
    after_index: Optional[int] = Field(None, description="清洗后数据在结果集中的索引位置")
    
    # 状态标识
    status: str = Field(..., description="数据状态：kept(保留)、filtered(被过滤)、modified(被修改)、deduplicated(被去重)")
    
    # 变化详情
    changes: Optional[Dict[str, Any]] = Field(None, description="字段级别的变化详情")
    # changes 结构示例：
    # {
    #     "text": {
    #         "before": "原始文本  ",
    #         "after": "原始文本",
    #         "change_type": "modified"  # modified, deleted, added
    #     },
    #     "new_field": {
    #         "before": None,
    #         "after": "新字段值",
    #         "change_type": "added"
    #     }
    # }
    
    # 过滤原因（如果被过滤）
    filter_reason: Optional[str] = Field(None, description="被过滤的原因（如：文本长度不符合要求）")


class CleaningComparisonResponse(BaseModel):
    """清洗前后对比响应"""
    task_id: int = Field(..., description="任务ID")
    comparisons: List[DataComparisonItem] = Field(..., description="数据对比列表")

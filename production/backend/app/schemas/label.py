from datetime import datetime
from typing import Optional, Dict, Any, List, Union
from enum import Enum
from pydantic import BaseModel, Field, model_validator

from app.models import LabelDataset
from app.models.label_manager import LabelMachineLearningDataset
from app.schemas.base import BaseSchema
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType


# 枚举定义
class LabelDatasetSource(str, Enum):
    """数据来源枚举"""
    EXISTED_DATASET = "existed_dataset"  # 已有数据集
    UPLOAD = "upload"  # 本地上传


class LabelDatasetType(str, Enum):
    """标注类型枚举"""
    TEXT_GENERATION = "text-generation"
    IMAGE_GENERATION = "image-generation"
    IMAGE_UNDERSTANDING = "image-understanding"


class LabelDatasetFormat(str, Enum):
    """数据格式枚举"""
    PROMPT_RESPONSE = "prompt-response"
    ALPACA = "alpaca"
    ROLE_BASED = "role-based"
    PREFIX_SUFFIX_MIDDLE = "prefix-suffix-middle"
    GRPO = "grpo"


class LabelTaskType(str, Enum):
    """任务类型枚举"""
    ONLINE = "online"  # 在线标注
    MULTI = "multi"  # 多人标注


class LabelTaskStatus(str, Enum):
    """任务状态枚举"""
    CREATING = "creating"  # 创建中（异步拷贝数据）
    CREATED = "created"  # 已创建
    IN_PROGRESS = "in_progress"  # 进行中
    COMPLETED = "completed"  # 已完成
    PUBLISHED = "published"  # 已发布


class LabelTaskBizType(str, Enum):
    """任务业务类型枚举"""
    LLM = "llm"
    MACHINE_LEARNING = "machine_learning"

class AIAnnotationTarget(str, Enum):
    """AI 标注目标字段枚举"""
    CHOSEN = "chosen"
    REJECTED = "rejected"

dataset_model_map = {
    LabelTaskBizType.LLM: LabelDataset,
    LabelTaskBizType.MACHINE_LEARNING: LabelMachineLearningDataset,
}

# 标注数据集相关Schema
class LabelDatasetCreate(BaseModel):
    """创建标注数据集请求"""
    name: str = Field(..., description="标注数据集名称", min_length=1, max_length=100)
    description: Optional[str] = Field(None, description="标注数据集描述", max_length=1000)
    project_id: int = Field(..., description="关联项目ID", gt=0)
    source: LabelDatasetSource = Field(..., description="数据来源")
    source_dataset_id: Optional[int] = Field(None, description="来源数据集ID（当source=existed_dataset时必需）")
    dataset_type: LabelDatasetType = Field(..., description="标注类型")
    dataset_format: LabelDatasetFormat = Field(..., description="数据格式")
    task_type: LabelTaskType = Field(..., description="任务类型：online（在线）/ multi（多人）")
    override: bool = Field(False, description="是否覆盖原版本")


class LabelDatasetResponse(BaseSchema):
    """标注数据集响应"""
    name: str = Field(..., description="标注数据集名称")
    description: Optional[str] = Field(None, description="标注数据集描述")
    project_id: int = Field(..., description="关联项目ID")
    source: str = Field(..., description="数据来源")
    source_dataset_id: Optional[int] = Field(None, description="来源数据集ID")
    submit_dataset_id: Optional[int] = Field(None, description="提交数据集ID")
    override: bool = Field(..., description="是否覆盖原版本")
    dataset_type: str = Field(..., description="标注类型")
    dataset_format: str = Field(..., description="数据格式")
    task_type: str = Field(..., description="任务类型")
    total_samples: Optional[int] = Field(None, description="总样本数")
    total_characters: Optional[int] = Field(None, description="总字符数")
    file_size: Optional[float] = Field(None, description="文件大小（MB）")
    dataset_path: str = Field(..., description="数据集文件路径")
    
    class Config:
        from_attributes = True


class LabelMachineLearningDatasetResponse(BaseSchema):
    """机器学习标注任务数据集响应"""
    name: str = Field(..., description="标注任务名称")
    description: Optional[str] = Field(None, description="标注任务描述")
    project_id: int = Field(..., description="关联项目ID")
    source_dataset_id: int = Field(..., description="来源机器学习数据集ID")
    task_type: str = Field(..., description="任务类型")
    data_type: Optional[str] = Field(None, description="数据类型")
    annotation_type: Optional[str] = Field(None, description="标注类型")
    template_type: Optional[str] = Field(None, description="标注模板")
    class_count: int = Field(..., description="类别数量")
    label_schema_json: Optional[Dict[str, Any]] = Field(None, description="类别映射快照")
    total_samples: int = Field(..., description="总样本数")
    dataset_path: str = Field(..., description="数据集文件路径")

    class Config:
        from_attributes = True


# 标注任务相关Schema
class LabelTaskCreate(BaseModel):
    """创建标注任务请求（在创建任务时自动创建数据集）"""
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    task_type: LabelTaskType = Field(..., description="任务类型：online/multi")
    # 数据集信息（在创建任务时自动创建）
    task_name: str = Field(..., description="标注任务名称", min_length=1, max_length=100)
    dataset_description: Optional[str] = Field(None, description="标注数据集描述", max_length=1000)
    project_id: Optional[int] = Field(None, description="关联项目ID（从路径参数获取，无需在请求体中传递）", gt=0)
    source: LabelDatasetSource = Field(..., description="数据来源：existed_dataset（已有数据集）/ upload（本地上传）")
    source_dataset_id: Optional[int] = Field(None, description="来源数据集ID（当source=existed_dataset时必需，LLM/机器学习共用）")
    override: bool = Field(False, description="是否覆盖原版本")


class LabelTaskResponse(BaseSchema):
    """标注任务响应（列表展示）"""
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    task_type: str = Field(..., description="任务类型")
    label_dataset_id: int = Field(..., description="关联的标注数据集ID")
    status: str = Field(..., description="任务状态")
    task_name: Optional[str] = Field(None, description="任务名称")
    total_samples: Optional[int] = Field(None, description="数据量（总样本数）")
    assigned_count: int = Field(0, description="分配样本数")
    saved_count: int = Field(0, description="暂存样本数")
    source_dataset_name: Optional[str] = Field(None, description="来源数据集名称（格式：数据集用途/数据集名称-版本号）")
    submit_dataset_name: Optional[str] = Field(None, description="提交数据集名称（格式：数据集用途/数据集名称-版本号）")
    dataset_type: Optional[TrainingTypeCategory] = Field(None, description="数据集类型（从来源训练数据集获取）")
    
    class Config:
        from_attributes = True


class LabelTaskDetailResponse(LabelTaskResponse):
    """标注任务详情响应（包含数据集信息和进度）"""
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset: Optional[Union[LabelDatasetResponse, LabelMachineLearningDatasetResponse]] = Field(
        None, description="关联的数据集信息（LLM/机器学习）"
    )
    progress: Optional['LabelProgressResponse'] = Field(None, description="标注进度")


# 标注进度相关Schema
class LabelProgressResponse(BaseSchema):
    """标注进度响应"""
    task_id: int = Field(..., description="任务ID")
    user_id: int = Field(..., description="成员用户ID")
    assigned_count: int = Field(..., description="分配样本数")
    saved_count: int = Field(..., description="暂存样本数")
    
    class Config:
        from_attributes = True


# 标注保存相关Schema
class AnnotationSaveRequest(BaseModel):
    """保存单条标注请求"""
    task_id: int = Field(..., description="任务ID", gt=0)
    row_number: Optional[int] = Field(None, description="行号（从1开始，对应页码）。is_final=True时可为空", ge=1)
    # annotation: Optional[Dict[str, Any]] = Field(None, description="标注内容（JSON格式）。is_final=True时可为空")
    annotation: Optional[Union[Dict[str, Any], List[Any],None]] = Field(None, description="标注内容（JSON格式）。is_final=True时可为空")
    is_final: bool = Field(False, description="是否最终提交（false=暂存，true=最终提交）")
    
    @model_validator(mode='after')
    def validate_fields(self):
        """暂存时 row_number 和 annotation 必填，最终提交时可选"""
        if not self.is_final:
            if self.row_number is None:
                raise ValueError("暂存时 row_number 必填")
            if self.annotation is None:
                raise ValueError("暂存时 annotation 必填")
        return self


class AnnotationSaveResponse(BaseModel):
    """保存标注响应"""
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="提示信息")


class AnnotationCompletionStatusResponse(BaseModel):
    """标注完成状态响应"""
    task_id: int = Field(..., description="任务ID")
    is_completed: bool = Field(..., description="是否完成标注（暂存数=总条数）")
    is_submitted: bool = Field(..., description="是否已提交（任务状态为已完成或已生成提交数据集）")
    saved_count: int = Field(..., description="暂存数")
    total_samples: int = Field(..., description="总条数")


# ------------------------------ 标注标签管理相关Schema ------------------------------
class LabelTagCreateRequest(BaseModel):
    """新增标注标签请求"""
    tag_name: str = Field(..., description="标签名称（多个按英文逗号分隔,）", min_length=1, max_length=500)


class LabelTagCreateItemResponse(BaseModel):
    """新增标注标签项"""
    class_id: int = Field(..., description="新分配的类别ID")
    tag_name: str = Field(..., description="标签名称")


class LabelTagCreateResponse(BaseModel):
    """新增标注标签响应"""
    items: List[LabelTagCreateItemResponse] = Field(default_factory=list, description="新增标签列表")
    total: int = Field(..., description="新增标签总数")


class LabelTagItemResponse(BaseModel):
    """标注标签项"""
    class_id: int = Field(..., description="类别ID")
    tag_name: str = Field(..., description="标签名称")


class LabelTagListResponse(BaseModel):
    """标注标签列表响应"""
    items: List[LabelTagItemResponse] = Field(default_factory=list, description="标签列表")
    total: int = Field(..., description="标签总数")


class LabelTagUpdateRequest(BaseModel):
    """编辑标注标签请求"""
    tag_name: str = Field(..., description="标签名称", min_length=1, max_length=100)


class LabelTagUpdateResponse(BaseModel):
    """编辑标注标签响应"""
    class_id: int = Field(..., description="类别ID")
    tag_name: str = Field(..., description="标签名称")


# 标注数据预览相关Schema
class AnnotationPreviewRequest(BaseModel):
    """标注数据预览请求"""
    task_id: int = Field(..., description="任务ID", gt=0)
    page: int = Field(1, description="页码", ge=1)
    size: int = Field(20, description="每页数量", ge=1, le=100)


class AnnotationDataItem(BaseModel):
    """标注数据项"""
    item_id: str = Field(..., description="数据项ID")
    row_number: int = Field(..., description="行号")
    raw_data: Dict[str, Any] = Field(..., description="原始数据")
    # annotation: Optional[Dict[str, Any]] = Field(None, description="标注内容（如果有）")
    annotation: Optional[Union[Dict[str, Any], List[Any],None]] = Field(None, description="标注内容（如果有）")
    is_annotated: bool = Field(..., description="是否已标注")


class AnnotationDataResponse(BaseModel):
    """单条标注数据响应（包含总条数和分页信息）"""
    items: AnnotationDataItem = Field(..., description="数据项")
    total: int = Field(..., description="总条数（如果指定了is_annotated过滤，则为符合条件的数据总数）")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    total_pages: int = Field(..., description="总页数")
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset_format: Optional[str] = Field(None, description="数据集格式（如 prompt-response/role-based/alpaca）")
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")
    ml_task_template_type: Optional[str] = Field(None, description="机器学习标注任务模版")
    ml_task_annotation_type: Optional[str] = Field(None,
                                                   description="数据集对应的MachineLearningDatasetAnnotationType值")


class AnnotationPreviewResponse(BaseModel):
    """标注数据预览响应"""
    items: List[AnnotationDataItem] = Field(..., description="数据项列表")
    total: int = Field(..., description="总数量")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    total_pages: int = Field(..., description="总页数")


# 自动标注配置相关Schema
class LabelAutoModelCreate(BaseModel):
    """创建/更新自动标注配置请求"""
    task_id: int = Field(..., description="任务ID", gt=0)
    model_id: int = Field(..., description="关联模型ID", gt=0)
    param_config_json: Optional[Dict[str, Any]] = Field(None, description="参数配置JSON")


class LabelAutoModelResponse(BaseSchema):
    """自动标注配置响应"""
    task_id: int = Field(..., description="任务ID")
    model_id: int = Field(..., description="关联模型ID")
    param_config_json: Optional[Dict[str, Any]] = Field(None, description="参数配置JSON")
    
    class Config:
        from_attributes = True


# AI自动标注相关Schema
class AIAnnotationInput(BaseModel):
    """AI标注输入数据（根据dataset_format传入对应字段）"""
    annotation_target: Optional[AIAnnotationTarget] = Field(
        None,
        description="DPO场景下要生成的目标字段：chosen 或 rejected；不传时按数据集默认值处理",
    )

    # prompt-response格式
    prompt: Optional[str] = Field(None, description="提示词（prompt-response格式必填）")
    system_prompt: Optional[str] = Field(None, description="系统提示词（可选）")

    # alpaca格式
    instruction: Optional[str] = Field(None, description="指令（alpaca格式）")
    input: Optional[str] = Field(None, description="输入（alpaca格式，可选）")
    
    # role-based格式
    messages: Optional[List[Dict[str, Any]]] = Field(None, description="对话消息列表（role-based格式）")

    # grpo格式
    reward_model: Optional[Dict[str, Any]] = Field(None, description="奖励模型信息（grpo格式）")
    ground_truth: Optional[Any] = Field(None, description="标准答案（grpo格式）")
    ability: Optional[str] = Field(None, description="能力分类（grpo格式）")
    extra_info: Optional[Dict[str, Any]] = Field(None, description="额外信息（grpo格式）")
    data_source: Optional[str] = Field(None, description="数据来源（grpo格式）")
    
    # prefix-suffix-middle格式
    prefix: Optional[str] = Field(None, description="前缀（prefix-suffix-middle格式）")
    suffix: Optional[str] = Field(None, description="后缀（prefix-suffix-middle格式）")
    
    # 图像理解格式（image-understanding）
    images: Optional[List[str]] = Field(None, description="图片路径列表（图像理解数据集时使用）")


class AIAnnotationRequest(BaseModel):
    """AI自动标注请求"""
    task_id: int = Field(..., description="任务ID（用于获取模型配置）", gt=0)
    input_data: AIAnnotationInput = Field(..., description="需要标注的输入数据")


class AIAnnotationResponse(BaseModel):
    """AI自动标注响应"""
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="提示信息")
    annotation: Optional[Dict[str, Any]] = Field(None, description="AI标注结果")
    error: Optional[str] = Field(None, description="错误信息（如果失败）")

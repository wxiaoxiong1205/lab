from datetime import datetime
from typing import Optional, List, Dict, Any, TYPE_CHECKING, Union
from pydantic import BaseModel, Field, model_validator, ConfigDict
from enum import Enum

from app.common.status import TaskStatus, AnnotationStatus
from app.schemas.common import BaseModelWithTimezone
from app.schemas.inference_param import InferenceParamType, InferenceModelParams
from app.schemas.inference_result import InferenceDatasetUsage
from app.schemas.repository_image import CardType, CardModel
from app.schemas.training_dataset import DatasetFormat
from app.core.logging import logger

if TYPE_CHECKING:
    from app.schemas.resource_config import GraphicsCardResourceConfig
    from app.models.basic_metric_manager import EvaluationMetrics
else:
    from app.schemas.resource_config import GraphicsCardResourceConfig


# ==================== 枚举类型 ====================

class EvaluationType(str, Enum):
    """评估类型枚举"""
    SINGLE = "single"  # 单个评估
    COMPARISON = "comparison"  # 对比评估

# 评估结果导出格式枚举
class EvaluationResultDatasetExportType(str, Enum):
    """评估结果导出下载格式枚举"""
    JSONL_TYPE = "jsonl"
    JSON_TYPE = "json"
    XLSX_TYPE = "xlsx"
    CSV_TYPE = "csv"


class EvaluationDataSource(str, Enum):
    """评估数据来源枚举"""
    EXISTING = "existing"  # 已有推理结果集
    NEW = "new"  # 新建推理结果集


class EvaluationMethod(str, Enum):
    """评估方法枚举"""
    REFEREE = "referee"  # 裁判员评估
    BASIC_METRIC = "basic_metric"  # 基础指标评估
    ALL = "all"  # 同时进行裁判员评估和基础指标评估
    MANUAL = "manual"  # 人工评估


class CalculationMethod(str, Enum):
    """计算方式枚举"""
    AVERAGE = "average"  # 平均值
    MAX = "max"  # 最大值
    MIN = "min"  # 最小值


class MetricsParam(str, Enum):
    """指标参数枚举"""

    def __new__(cls, value: str, name_cn: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.name_cn = name_cn
        return obj

    INPUT = ("input_content", "输入")
    ACTUAL_OUTPUT = ("actual_output", "实际输出")
    EXPECTED_OUTPUT = ("expected_output", "期望输出")
    RETRIEVAL_CONTEXT = ("retrieval_context", "检索上下文")


# ==================== 请求模型 ====================

class MetricScoreScope(BaseModel):
    score_min: Optional[int] = Field(None, description="指标分值最小值")
    score_max: Optional[int] = Field(None, description="指标分值最大值")
    score_definitions: Optional[Any] = Field(None, description="指标分值定义（普通字符串，描述分值的含义和说明）")


class EvaluationPromptMetricConfig(BaseModel):
    """评估Prompt指标配置
    
    用于配置裁判员评估中的评估指标，每个指标可以关联系统指标（system_metric_id），
    并定义指标参数与数据集元数据字段的映射关系（metrics_mapping）。
    """
    name: str = Field(..., description="指标名称（如：语义连贯性、内容丰富度等）")
    description: Optional[str] = Field(None, description="指标说明（对该评估指标的详细描述）")
    system_metric_id: Optional[int] = Field(None,
                                            description="系统指标ID（可选，关联evaluation_metrics表中的系统指标ID，用于前端回显和指标管理。如果提供，系统会使用该指标的分值范围、分值定义等信息）")
    metrics_mapping: Optional[Dict[str, str]] = Field(None,
                                                      description="指标参数与数据集元数据字段的映射关系（字典格式）。键为指标参数（如：input、actual_output、expected_output、retrieval_context），值为数据集中的元数据字段名（如：Prompt、Model Response、Standard Response等）。示例：{\"input\": \"Prompt\", \"actual_output\": \"Model Response\", \"expected_output\": \"Standard Response\"}")
    score_min: Optional[int] = Field(None, description="指标分值最小值")
    score_max: Optional[int] = Field(None, description="指标分值最大值")
    score_definitions: Optional[Any] = Field(None, description="指标分值定义（普通字符串，描述分值的含义和说明）")


class EvaluationPromptConfig(BaseModel):
    """评估Prompt配置
    
    用于配置裁判员评估的Prompt模板和相关参数。包含评估指标列表和完整的Prompt模板。
    
    注意：
    - prompt_template 是完整的Prompt模板，通常通过模板渲染接口生成。如果不提供，则使用系统默认模板。
    - metrics 中的每个指标可以关联系统指标（system_metric_id），并定义参数映射（metrics_mapping）
    - 模板中可以使用指标参数，如：{{ input_content }}、{{ actual_output }}、{{ expected_output }}、{{ retrieval_context }} 等
    """
    metrics: List[EvaluationPromptMetricConfig] = Field(..., min_length=1,
                                                        description="评估指标列表（至少需要配置一个评估指标，每个指标包含名称、说明、可选的系统指标ID和参数映射）")
    prompt_template: Optional[str] = Field(None,
                                           description="完整的Prompt模板（Jinja2格式的模板字符串，通过模板渲染接口生成。如果不提供，则使用系统默认模板。模板中可以使用指标参数，如：{{ input_content }}、{{ actual_output }}、{{ expected_output }}、{{ retrieval_context }} 等）")


class BasicMetricConfig(BaseModel):
    """基础指标配置
    
    支持的基础指标包括：
    - 准确率 (Accuracy)
    - F1
    - ROUGE-1
    - Rouge-2
    - Rouge-L
    - BLEU-4
    - 格式遵从性 (Format Compliance)
    - 语义相似度 (Semantic Similarity)
    """
    metrics: List[str] = Field(..., min_length=1,
                               description="指标列表（如：准确率、F1、ROUGE-1、Rouge-2、Rouge-L、BLEU-4、格式遵从性、语义相似度等）")
    stop_words: Optional[str] = Field(None,
                                      description="停用词文件在 JuiceFS 中的地址（jfs:// 格式），用于某些指标计算时过滤停用词。由于停用词列表可能很大，因此使用 JuiceFS 存储，文件格式为每行一个停用词")


class InferenceParamInfo(BaseModel):
    """推理参数信息模型"""
    name: str = Field(..., description="参数名称（英文）")
    name_cn: str = Field(..., description="参数中文名称")
    value_scope: str = Field(..., description="参数取值范围")
    default_value: Any = Field(..., description="参数默认值")
    description: str = Field(..., description="参数描述")

    @classmethod
    def from_enum(cls, param_type: InferenceParamType) -> "InferenceParamInfo":
        """从枚举类型创建参数信息"""
        return cls(
            name=param_type.value,
            name_cn=param_type.name_cn,
            value_scope=param_type.value_scope,
            default_value=param_type.default_value,
            description=param_type.description
        )


class MetricsParamInfo(BaseModel):
    """指标参数信息模型"""
    name: str = Field(..., description="参数名称（英文）")
    name_cn: str = Field(..., description="参数中文名称")

    @classmethod
    def from_enum(cls, param_type: MetricsParam) -> "MetricsParamInfo":
        """从枚举类型创建参数信息"""
        return cls(
            name=param_type.value,
            name_cn=param_type.name_cn
        )


class EvaluationTaskDatasetModelRelation(BaseModel):
    """评估任务-推理结果集-待评估模型关联项
    
    用于明确表示评估任务中推理结果集与待评估模型的对应关系。
    在对比评估场景中，每个元素表示一个"推理结果集-待评估模型"的对应关系。
    
    当data_source=existing时，只需要提供inference_result_dataset_id和evaluated_model_id。
    当data_source=new时，需要提供创建推理结果集所需的所有参数（推理方式、模型信息、推理参数、数据集名称、待推理数据、显卡配置等）。
    """
    model_config = ConfigDict(from_attributes=True)

    # 已有推理结果集时使用（data_source=existing）
    inference_result_dataset_id: Optional[int] = Field(None, description="推理结果集ID（已有推理结果集时使用）")
    inference_result_dataset_name: Optional[str] = Field(None, description="推理结果集名称")

    evaluated_model_id: Optional[int] = Field(None, description="待评估模型/服务ID")
    evaluated_model_name: Optional[str] = Field(None, description="待评估模型/服务名称")
    evaluated_model_source: Optional[str] = Field("base_model", description="待评估模型来源：base_model基础模型, trained_model训练模型")

    # 排序顺序
    sort_order: int = Field(0, description="排序顺序（用于对比评估时确定显示顺序，0表示第一个，1表示第二个，以此类推）")

    # 新建推理结果集时使用（data_source=new）
    # 推理方式
    inference_method: Optional[str] = Field(None,
                                            description="推理方式：offline离线推理, online在线推理（新建推理结果集时使用）")

    # 模型信息（新建推理结果集时使用，离线推理）
    model_source: Optional[str] = Field("base_model",
                                        description="模型来源：base_model基础模型, trained_model训练模型（新建推理结果集，离线推理时使用，默认base_model）")
    model_id: Optional[int] = Field(None, description="待推理模型ID（base_models.id 或 trained_models.id，新建推理结果集，离线推理时使用）")
    model_name: Optional[str] = Field(None, description="待推理模型名称及版本（新建推理结果集，离线推理时使用）")

    # 服务信息（新建推理结果集时使用，在线推理）
    online_service_id: Optional[int] = Field(None, description="待推理服务ID（新建推理结果集，在线推理时使用）")
    online_service_name: Optional[str] = Field(None, description="待推理服务名称及版本（新建推理结果集，在线推理时使用）")

    # 推理参数（新建推理结果集时使用）
    inference_params: Optional[dict[InferenceParamType, Any]] = Field(None,
                                                                      description="推理模型参数配置（新建推理结果集时使用，字典格式，键为推理参数类型枚举，值为参数值）")

    # 数据集信息（新建推理结果集时使用）
    dataset_name: Optional[str] = Field(None, max_length=50,
                                        description="数据集名称（新建推理结果集时使用，如果不提供则自动生成）")
    dataset_description: Optional[str] = Field(None, max_length=1000, description="数据集描述（新建推理结果集时使用）")

    # 待推理数据（新建推理结果集时使用）
    source_dataset_id: Optional[int] = Field(None, description="待推理数据ID（训练数据集ID，新建推理结果集时使用）")
    source_dataset_name: Optional[str] = Field(None, description="待推理数据名称（新建推理结果集时使用）")
    api_params: Dict[str, Any] = Field(None, description="待推理三方api参数映射")
    # 显卡资源配置（新建推理结果集时使用，离线推理）
    # 推理资源配置
    graphics_card_resource: GraphicsCardResourceConfig = Field(
        default_factory=lambda: GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu"
        ),
        description="GPU/NPU 资源配置"
    )

    # 数据集用途
    usage: Optional[InferenceDatasetUsage] = Field(None,
                                                  description="数据集用途：default-inference默认用途，business-inference业务用途")


class EvaluationTaskCreate(BaseModel):
    """创建评估任务请求模型
    
    评估方法说明：
    - referee（裁判员评估）：使用裁判模型进行主观评估，需要配置Prompt和指标
    - basic_metric（基础指标评估）：使用系统指标进行客观评估，需要配置指标列表和停用词
    
    注意：referee 和 basic_metric 是互斥的，只能选择其中一种。
    
    更新说明：
    - 如果提供了 `id` 字段且该任务存在，则执行更新操作
    - 如果提供了 `id` 字段但任务不存在，将返回404错误
    - 如果不提供 `id` 字段，则创建新任务
    """
    id: Optional[int] = Field(None, description="任务ID（可选，如果提供且任务存在则更新，否则创建新任务）")
    name: str = Field(..., max_length=100, description="任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="任务描述")
    evaluation_type: EvaluationType = Field(..., description="评估类型：single单个评估, comparison对比评估")
    data_source: EvaluationDataSource = Field(..., description="评估数据来源：existing已有推理结果集, new新建推理结果集")
    dataset_format: Optional[DatasetFormat] = Field(None,
                                                 description="数据格式：prompt-response/role-based/prefix-suffix-middle等")
    evaluation_method: EvaluationMethod = Field(...,
                                                description="评估方法：referee裁判员评估, basic_metric基础指标评估, all同时进行两种评估, manual人工评估")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")

    # 人工评估配置（人工评估时使用）
    dataset_type: Optional[str] = Field(None,
                                               description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（人工评估时必填）")
    sampling_rate: Optional[float] = Field(None, ge=0.0, le=100.0,
                                           description="数据采样率（0-100，NULL表示不采样，人工评估时使用）")

    # 推理结果集与待评估模型的对应关系（支持多个，对比评估时使用）
    dataset_model_relations: List[EvaluationTaskDatasetModelRelation] = Field(
        ...,
        min_length=1,
        description="推理结果集与待评估模型的对应关系列表，明确表示哪个推理结果集对应哪个待评估模型。单个评估至少需要1个，对比评估至少需要2个。对比评估时，推理结果集和模型不能重复。"
    )

    # 裁判员评估配置
    referee_type: Optional[str] = Field(None,
                                        description="裁判资源类型：model离线模型, service在线服务（裁判员评估时必填）")
    referee_model_source: Optional[str] = Field("base_model",
                                               description="裁判模型来源：base_model基础模型, trained_model训练模型（仅referee_type=model时有效，默认base_model）")
    referee_model_id: Optional[int] = Field(None, description="裁判模型/服务ID（base_models.id、trained_models.id 或 InferenceService.id，裁判员评估时必填）")
    graphics_card_resource: Optional["GraphicsCardResourceConfig"] = Field(None,
                                                                           description="GPU/NPU 资源配置（裁判员评估离线推理时使用，referee_type=model时必填）")
    referee_inference_params: Optional[dict[InferenceParamType, Any]] = Field(None,
                                                                              description="裁判模型推理参数配置（字典格式，键为推理参数类型枚举，值为参数值）")
    evaluation_prompt_config: Optional[EvaluationPromptConfig] = Field(None,
                                                                       description="评估Prompt配置（裁判员评估时必填）。包含裁判模型角色、评估指标列表、内容字段列表和完整的Prompt模板。指标可以关联系统指标并定义参数映射关系。")

    # 基础指标评估配置（与referee_model_id和evaluation_prompt_config互斥）
    basic_metric_config: Optional[BasicMetricConfig] = Field(None, description="基础指标配置（基础指标评估时必填）")

    @model_validator(mode='after')
    def validate_evaluation_method(self):
        """验证评估方法的配置是否完整"""
        if self.evaluation_method == EvaluationMethod.REFEREE:
            # 裁判员评估：必须提供referee_model_id、referee_type和evaluation_prompt_config，不能提供basic_metric_config
            if not self.referee_model_id:
                raise ValueError("裁判员评估需要提供referee_model_id")
            if not self.referee_type:
                raise ValueError("裁判员评估需要提供referee_type（model或service）")
            if self.referee_type not in ["model", "service"]:
                raise ValueError("referee_type必须是model（离线模型）或service（在线服务）")
            if self.referee_type == "model" and not self.graphics_card_resource:
                raise ValueError("裁判员评估使用离线模型（referee_type=model）时，需要提供graphics_card_resource")
            if not self.evaluation_prompt_config:
                raise ValueError("裁判员评估需要提供evaluation_prompt_config")
            if self.basic_metric_config:
                raise ValueError(
                    "单独使用裁判员评估时，不能同时提供basic_metric_config。如需同时使用，请选择evaluation_method=all")
        elif self.evaluation_method == EvaluationMethod.BASIC_METRIC:
            # 基础指标评估：必须提供basic_metric_config，不能提供referee_model_id和evaluation_prompt_config
            if not self.basic_metric_config:
                raise ValueError("基础指标评估需要提供basic_metric_config")
            if not self.basic_metric_config.metrics or len(self.basic_metric_config.metrics) == 0:
                raise ValueError("基础指标评估需要至少选择一个指标")
            if self.referee_model_id or self.evaluation_prompt_config:
                raise ValueError(
                    "单独使用基础指标评估时，不能同时提供referee_model_id或evaluation_prompt_config。如需同时使用，请选择evaluation_method=all")
        elif self.evaluation_method == EvaluationMethod.ALL:
            # 同时进行两种评估：必须同时提供裁判员评估和基础指标评估的配置
            if not self.referee_model_id:
                raise ValueError("同时评估需要提供referee_model_id")
            if not self.referee_type:
                raise ValueError("同时评估需要提供referee_type（model或service）")
            if self.referee_type not in ["model", "service"]:
                raise ValueError("referee_type必须是model（离线模型）或service（在线服务）")
            if self.referee_type == "model" and not self.graphics_card_resource:
                raise ValueError("同时评估使用离线模型（referee_type=model）时，需要提供graphics_card_resource")
            if not self.evaluation_prompt_config:
                raise ValueError("同时评估需要提供evaluation_prompt_config")
            if not self.basic_metric_config:
                raise ValueError("同时评估需要提供basic_metric_config")
            if not self.basic_metric_config.metrics or len(self.basic_metric_config.metrics) == 0:
                raise ValueError("同时评估需要至少选择一个基础指标")
        elif self.evaluation_method == EvaluationMethod.MANUAL:
            # 人工评估：必须提供dataset_type和evaluation_prompt_config（只包含metrics，不需要prompt_template），不能提供referee_model_id和basic_metric_config
            if not self.dataset_type:
                raise ValueError("人工评估需要提供dataset_type（text-generation或image-understanding）")
            if self.dataset_type not in ["text-generation", "image-understanding"]:
                raise ValueError("dataset_type必须是text-generation（文本生成）或image-understanding（图像理解）")
            if not self.evaluation_prompt_config:
                raise ValueError("人工评估需要提供evaluation_prompt_config（包含评估指标配置）")
            if not self.evaluation_prompt_config.metrics or len(self.evaluation_prompt_config.metrics) == 0:
                raise ValueError("人工评估需要至少配置一个评估指标")
            if self.referee_model_id:
                raise ValueError("人工评估不需要提供referee_model_id")
            if self.basic_metric_config:
                raise ValueError("人工评估不需要提供basic_metric_config")
            if self.sampling_rate is not None and (self.sampling_rate < 0 or self.sampling_rate > 100):
                raise ValueError("sampling_rate必须在0-100之间")
        return self


# ==================== 工具函数 ====================

def parse_status(status_value: Optional[str]) -> Optional[Union[TaskStatus, AnnotationStatus]]:
    """
    将字符串状态值转换为 TaskStatus 或 AnnotationStatus 枚举
    
    优先尝试 AnnotationStatus（因为它的值更少，更具体），如果不匹配则尝试 TaskStatus
    如果都不匹配，返回 None
    
    Args:
        status_value: 状态字符串值
        
    Returns:
        TaskStatus 或 AnnotationStatus 枚举值，如果无法匹配则返回 None
    """
    if status_value is None:
        return None

    # 首先尝试 AnnotationStatus（因为它的值更少，更具体）
    # 通过枚举值匹配
    for status in AnnotationStatus:
        if status.value == status_value:
            return status

    # 如果 AnnotationStatus 不匹配，尝试 TaskStatus
    for status in TaskStatus:
        if status.value == status_value:
            return status

    # 如果都不匹配，记录警告并返回 None
    logger.warning(f"无法将状态值 '{status_value}' 转换为 TaskStatus 或 AnnotationStatus")
    return None


def is_annotation_status(status: Optional[Union[TaskStatus, AnnotationStatus]]) -> bool:
    """
    判断状态是否为 AnnotationStatus 类型
    
    Args:
        status: TaskStatus 或 AnnotationStatus 枚举值
        
    Returns:
        如果是 AnnotationStatus 返回 True，否则返回 False
    """
    if status is None:
        return False
    return isinstance(status, AnnotationStatus)


def is_task_status(status: Optional[Union[TaskStatus, AnnotationStatus]]) -> bool:
    """
    判断状态是否为 TaskStatus 类型
    
    Args:
        status: TaskStatus 或 AnnotationStatus 枚举值
        
    Returns:
        如果是 TaskStatus 返回 True，否则返回 False
    """
    if status is None:
        return False
    return isinstance(status, TaskStatus)


# ==================== 响应模型 ====================

class EvaluationTaskSummaryResponse(BaseModelWithTimezone):
    """评估任务摘要响应模型"""
    id: int
    name: str
    version: str = Field(..., description="任务版本号（如：v1、v2、v3）")
    status: Optional[Union[TaskStatus, AnnotationStatus]]
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    progress: int = Field(..., description="进度(0-100)")
    evaluation_type: EvaluationType
    dataset_format: Optional[DatasetFormat] = Field(None, description="数据格式")
    dataset_type: Optional[str] = Field(None, description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态")
    evaluation_method: EvaluationMethod
    # 为了便于列表展示，可以保留这些字段，从关联表中聚合获取
    inference_result_dataset_names: Optional[List[str]] = Field(None, description="推理结果集名称列表（从关联表聚合）")
    evaluated_model_names: Optional[List[str]] = Field(None, description="待评估模型/服务名称列表（从关联表聚合）")
    created_by: Optional[str]
    created_at: datetime
    # 新增开始时间、结束时间、用于计算任务耗时
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    data_source: Optional[str] = Field(None, description="评估数据来源：existing已有推理结果集, new新建推理结果集")


class EvaluationTaskDetailResponse(BaseModelWithTimezone):
    """评估任务详情响应模型"""
    id: int
    name: str
    description: Optional[str]
    project_id: int
    version: str = Field(..., description="任务版本号（如：v1、v2、v3）")
    parent_task_id: Optional[int] = Field(None, description="父任务ID（重新评估时关联原始任务ID）")
    evaluation_type: EvaluationType
    data_source: EvaluationDataSource
    dataset_format: Optional[DatasetFormat] = Field(None, description="数据格式")
    evaluation_method: EvaluationMethod
    dataset_model_relations: List[EvaluationTaskDatasetModelRelation] = Field(
        ...,
        description="推理结果集与待评估模型的对应关系列表"
    )
    referee_model_id: Optional[int]
    referee_model_name: Optional[str]
    referee_model_source: Optional[str] = Field(None, description="裁判模型来源：base_model基础模型, trained_model训练模型（仅referee_type=model时有效）")
    referee_type: Optional[str] = Field(None, description="裁判资源类型：model离线模型, service在线服务")
    referee_inference_params: Optional[dict[InferenceParamType, Any]] = Field(None, description="裁判模型推理参数配置")
    graphics_card_resource: Optional[GraphicsCardResourceConfig] = Field(None, description="资源参数")
    evaluation_prompt_config: Optional[EvaluationPromptConfig]
    basic_metric_config: Optional[BasicMetricConfig]
    # 人工评估相关字段
    dataset_type: Optional[str] = Field(None,
                                               description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（人工评估时使用）")
    sampling_rate: Optional[float] = Field(None, description="数据采样率（0-100，人工评估时使用）")
    total_items: Optional[int] = Field(None, description="总评估项数（人工评估时使用）")
    completed_items: Optional[int] = Field(None, description="已完成评估项数（人工评估时使用）")
    status: Optional[Union[TaskStatus, AnnotationStatus]] = Field(None,
                                                                  description="任务状态（模型评估使用TaskStatus，人工评估使用AnnotationStatus）")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    progress: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_by: Optional[str]
    created_at: datetime


class ModelMetricSummary(BaseModel):
    """模型指标汇总"""
    metric_name: str = Field(..., description="指标名称（如：语义连贯性、内容丰富度）")
    score: float = Field(..., description="指标分数")
    score_min: Optional[int] = Field(None, description="指标分数最小值")
    score_max: Optional[int] = Field(None, description="指标分数最大值")
    percentage_score: Optional[float] = Field(None, description="百分比分数")
    reason: Optional[str] = Field(None, description="打分原因")


class ModelMetricCreate(BaseModel):
    """指标创建"""
    metric_name: str = Field(..., description="指标名称（如：语义连贯性、内容丰富度）")
    score: float = Field(..., description="指标分数")
    score_min: Optional[int] = Field(None, description="指标分数最小值")
    score_max: Optional[int] = Field(None, description="指标分数最大值")
    reason: Optional[str] = Field(None, description="打分原因")


class ComparisonData(BaseModel):
    """对比报告数据（对比评估时使用）

    这个目前是不做的，后期有可能做，先保留逻辑结构

    在对比评估场景中，每个模型都会有一个ComparisonData对象，表示该模型与其他所有模型的对比结果。
    例如：模型A vs 模型B、模型A vs 模型C 的汇总结果。
    """
    win_count: int = Field(..., description="胜次数（该模型在所有对比中获胜的次数）")
    loss_count: int = Field(..., description="负次数（该模型在所有对比中失败的次数）")
    tie_count: int = Field(..., description="和次数（该模型在所有对比中平局的次数）")
    win_rate: float = Field(..., description="胜率（0-1之间的小数，win_count / total_rounds）")
    loss_rate: float = Field(..., description="负率（0-1之间的小数，loss_count / total_rounds）")
    tie_rate: float = Field(..., description="和率（0-1之间的小数，tie_count / total_rounds）")
    total_rounds: int = Field(..., description="轮次（总对比次数，该模型参与的所有对比轮次总和）")


class AggregativeMetric(BaseModel):
    """聚合指标数据模型"""
    calculation_method: CalculationMethod = Field(..., description="计算方式：average平均值, max最大值, min最小值")
    metric_summary: Dict[str, ModelMetricSummary] = Field(...,
                                                          description="各指标的汇总分数，格式：{\"指标名称\": ModelMetricSummary对象}")


class ModelReportData(BaseModel):
    """单个模型的报告数据"""
    model_id: int = Field(..., description="待评估模型/服务ID")
    model_name: str = Field(..., description="待评估模型/服务名称")
    evaluated_model_source: Optional[str] = Field(None, description="待评估模型来源：base_model基础模型, trained_model训练模型, service在线服务")
    evaluation_method: EvaluationMethod = Field(...,
                                                description="评估方法，这里task和report是一对多的，此时不会出现all的情况")

    aggregative_metrics: List[AggregativeMetric] = Field(..., min_length=1,
                                                         description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")


class EvaluationReportCreate(BaseModel):
    """创建评估报告请求模型（跨服务调用）"""
    evaluation_task_id: int = Field(..., description="关联评估任务ID")
    evaluated_model_id: Optional[int] = Field(None, description="待评估模型/服务ID")
    evaluated_model_name: Optional[str] = Field(None, description="待评估模型/服务名称")
    evaluated_model_source: Optional[str] = Field(None, description="待评估模型来源：base_model基础模型, trained_model训练模型, service在线服务")
    evaluation_method: EvaluationMethod = Field(...,
                                                description="评估方法，这里task和report是一对多的，此时不会出现all的情况")
    aggregative_metrics: List[AggregativeMetric] = Field(..., min_length=1,
                                                         description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")


class EvaluationReportUpdate(BaseModel):
    """更新评估报告请求模型（跨服务调用）"""
    aggregative_metrics: Optional[List[AggregativeMetric]] = Field(None, min_length=1,
                                                                   description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")


class EvaluationReportResponse(BaseModel):
    """评估报告响应模型"""
    evaluation_task_id: int = Field(..., description="关联评估任务ID")
    evaluation_type: EvaluationType = Field(..., description="评估类型")
    model_reports: List[ModelReportData] = Field(..., description="每个模型的报告数据列表")

class PageItemResponse(BaseModel):
    items: List[Dict]
    base_url: Optional[str] = Field(None, description="推理结果集对应的base_url")
    total: int
    page: int
    size: int
    pages: int


class TaskLogResponse(BaseModel):
    """任务日志响应模型"""
    archived: bool = Field(..., description="是否为归档日志（从MinIO获取）")
    logs: List[str] = Field(..., description="日志内容列表")


class MetricMetadataFieldBinding(BaseModel):
    """指标元数据字段绑定"""
    metadata_field: str = Field(...,
                                description="元数据字段名称（如：model_response、standard_response、metadata.prompt_length等）")
    metrics_param_field: Optional[str] = Field(None, description="模板中定义的指标参数字段名"
                                                                 "（input "
                                                                 "actual_output "
                                                                 "expected_output "
                                                                 "retrieval_context）")


class EvaluationMetricCreate(BaseModel):
    """创建裁判员评估系统指标请求模型"""
    name: str = Field(..., max_length=50, description="指标名称")
    description: Optional[str] = Field(None, max_length=1000, description="指标说明")
    score_scope: Optional[List[MetricScoreScope]] = Field(None, description="指标分值范围列表（可定义多个分值范围）")
    evaluation_task_id: Optional[int] = Field(None, description="评估任务ID（可选，如果提供则绑定元数据字段）")
    metrics_param: Optional[List[MetricsParam]] = Field(None, description="指标参数列表")
    metrics_mapping: Optional[Dict[str, str]] = Field(None,
                                                      description="参数指标和数据列的映射（如：{\"input\": \"Prompt\", \"actual_output\": \"Model Response\"}）")
    sample_data: Optional[Dict[str, Any]] = Field(None,
                                                  description="示例数据（用于模板预览，键为元数据字段名，值为示例值）")


class EvaluationMetricUpdate(BaseModel):
    """更新裁判员评估系统指标请求模型"""
    name: Optional[str] = Field(None, max_length=50, description="指标名称")
    description: Optional[str] = Field(None, max_length=1000, description="指标说明")
    score_scope: Optional[List[MetricScoreScope]] = Field(None, description="指标分值范围列表（可定义多个分值范围）")
    metrics_param: Optional[List[MetricsParam]] = Field(None, description="指标参数列表")


class EvaluationMetricResponse(BaseModel):
    """裁判员评估系统指标响应模型"""
    id: int = Field(..., description="指标ID")
    name: str = Field(..., description="指标名称")
    description: Optional[str] = Field(None, description="指标说明")
    is_builtin: bool = Field(False, description="是否为系统内置指标（True表示系统默认指标，不可编辑/删除）")
    score_scope: Optional[List[MetricScoreScope]] = Field(None, description="指标分值范围列表")
    metrics_param: Optional[List[MetricsParam]] = Field(None, description="指标参数列表")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_by: Optional[str] = Field(None, description="创建者用户名称")

    @classmethod
    def from_model(cls, metric: "EvaluationMetrics") -> "EvaluationMetricResponse":
        """从模型对象创建响应对象"""
        # 将存储的字符串列表转换为 MetricsParam 枚举列表
        metrics_param_list = None
        if metric.metrics_param:
            try:
                metrics_param_list = [MetricsParam(param) for param in metric.metrics_param if param]
            except (ValueError, KeyError):
                # 如果转换失败，返回 None
                metrics_param_list = None

        # 将存储的 score_scope 转换为 MetricScoreScope 对象列表
        score_scope_list = None
        if metric.score_scope:
            try:
                score_scope_list = []
                for scope in metric.score_scope:
                    # 确保 scope 是字典类型
                    if isinstance(scope, dict):
                        score_definitions = scope.get("score_definitions")
                        # 兼容旧数据：如果 score_definitions 是字典，转换为字符串
                        if isinstance(score_definitions, dict):
                            # 将字典转换为字符串格式："0分表示很差，3分表示一般，5分表示良好"
                            definitions_list = []
                            for score, definition in sorted(score_definitions.items(),
                                                            key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0):
                                definitions_list.append(f"{score}分表示{definition}")
                            score_definitions = "，".join(definitions_list)
                        elif not isinstance(score_definitions, str):
                            score_definitions = None

                        score_scope_list.append(
                            MetricScoreScope(
                                score_min=scope.get("score_min"),
                                score_max=scope.get("score_max"),
                                score_definitions=score_definitions
                            )
                        )
                    elif isinstance(scope, MetricScoreScope):
                        score_scope_list.append(scope)
            except (KeyError, TypeError, ValueError) as e:
                # 如果转换失败，返回 None
                score_scope_list = None

        return cls(
            id=metric.id,
            name=metric.name,
            description=metric.description,
            is_builtin=metric.is_builtin if hasattr(metric, 'is_builtin') else False,
            score_scope=score_scope_list,
            metrics_param=metrics_param_list,
            created_at=metric.created_at,
            updated_at=metric.updated_at,
            created_by=metric.created_by
        )


class BasicMetricResponse(BaseModel):
    """基础指标响应模型"""
    id: int = Field(..., description="指标ID")
    name: str = Field(..., description="指标名称（如：准确率、F1、ROUGE-1等）")
    description: Optional[str] = Field(None, description="指标说明")
    metric_code: str = Field(..., description="指标代码（用于程序识别，如：accuracy、f1、rouge-1等）")
    sort_order: int = Field(..., description="排序顺序（用于前端显示顺序）")

    @classmethod
    def from_model(cls, metric: "EvaluationMetrics") -> "BasicMetricResponse":
        """从模型对象创建响应对象"""
        # 基础评估指标必须有 metric_code
        if not metric.metric_code:
            raise ValueError(f"基础评估指标必须包含 metric_code: metric_id={metric.id}, name={metric.name}")

        return cls(
            id=metric.id,
            name=metric.name,
            description=metric.description,
            metric_code=metric.metric_code,
            sort_order=metric.sort_order
        )


# ==================== 人工评估相关Schema ====================


class AnnotationInfo(BaseModel):
    """标注信息"""
    status: str = Field(..., description="状态：pending待评估, completed已完成")
    metrics: Optional[List[ModelMetricSummary]] = Field(
        None,
        description="模型指标得分和理由列表（支持多个指标，防止丢失多指标信息）"
    )
    annotated_at: Optional[datetime] = Field(None, description="标注时间")
    annotated_by: Optional[str] = Field(None, description="标注人")


class Message(BaseModel):
    """消息对象"""
    role: str = Field(..., description="消息角色（user/assistant等）")
    content: str = Field(..., description="消息内容")


class ManualEvaluationItem(BaseModel):
    """单个模型的评估项内容"""
    messages: Optional[List[Message]] = Field(None, description="消息列表（多轮对话时使用）")
    images: Optional[List[str]] = Field(None, description="图片路径列表（图像理解时使用）")
    system: Optional[Any] = Field(None, description="System指令（文本评估时使用）")
    prompt: str = Field(..., description="Prompt内容")
    response: Optional[str] = Field(None, description="标准回答")
    model_response: Optional[str] = Field(None, description="模型回答/预测")
    annotation: AnnotationInfo = Field(..., description="标注信息")
    model_name: Optional[str] = Field(None, description="待评估的模型name")
    base_url: Optional[str] = Field(None, description="该推理结果集图片基础 URL（图像理解时用于前端拼接图片地址）")


class ManualEvaluationItemResponse(BaseModel):
    """人工评估项响应（从JSONL文件读取）"""
    item_index: int = Field(..., description="评估项序号（从1开始）")
    content: List[ManualEvaluationItem] = Field(..., description="具体的内容，按照创建task时关联的推理结果集的顺序")


class ManualEvaluationItemPageResponse(BaseModel):
    """人工评估项分页响应（包含自定义字段）"""
    items: List[ManualEvaluationItemResponse] = Field(..., description="评估项列表")
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    pages: int = Field(..., description="总页数")
    evalution_num: int = Field(..., description="评估数量")


class MetricInfos(BaseModel):
    metrics: List[ModelMetricCreate] = Field(..., description="指标信息，为数据，可能会有多个指标")


class ManualEvaluationItemUpdate(BaseModel):
    """单个评估项更新请求
    
    使用列表格式，统一单个评估和对比评估的数据结构：
    - `model_metrics` 是一个列表，每个元素对应一个模型（按照创建task时关联的推理结果集的顺序）
    - 单个评估：列表只有一个元素（一个模型）
    - 对比评估：列表有多个元素（多个模型）
    - 每个 `MetricInfos` 包含该模型的多个指标（`metrics: List[ModelMetricCreate]`）
    
    ## 数据结构说明
    - `MetricInfos`：模型指标信息
      - `metrics`：指标列表，包含该模型的多个指标
    - `ModelMetricCreate`：指标创建对象
      - `metric_name`：指标名称（如：准确性、丰富度）
      - `score`：指标分数
      - `score_min`：指标分数最小值（可选）
      - `score_max`：指标分数最大值（可选）
      - `reason`：打分原因（可选）
    
    ## JSON 格式示例
    
    ### 单个评估示例（单个指标）：
    ```json
    {
      "item_index": 1,
      "model_metrics": [
        {
          "metrics": [
            {
              "metric_name": "准确性",
              "score": 8.5,
              "reason": "回答准确，能够正确理解问题并给出合理的答案"
            }
          ]
        }
      ]
    }
    ```
    
    ### 单个评估示例（多个指标）：
    ```json
    {
      "item_index": 1,
      "model_metrics": [
        {
          "metrics": [
            {
              "metric_name": "准确性",
              "score": 8.5,
              "reason": "回答准确，能够正确理解问题并给出合理的答案"
            },
            {
              "metric_name": "丰富度",
              "score": 7.0,
              "reason": "内容较为丰富，但还可以更详细"
            }
          ]
        }
      ]
    }
    ```
    
    ### 对比评估示例（两个模型，每个模型一个指标）：
    ```json
    {
      "item_index": 1,
      "model_metrics": [
        {
          "metrics": [
            {
              "metric_name": "准确性",
              "score": 8.5,
              "reason": "回答准确"
            }
          ]
        },
        {
          "metrics": [
            {
              "metric_name": "准确性",
              "score": 9.0,
              "reason": "回答非常准确"
            }
          ]
        }
      ]
    }
    ```
    
    ### 对比评估示例（两个模型，每个模型多个指标）：
    ```json
    {
      "item_index": 1,
      "model_metrics": [
        {
          "metrics": [
            {
              "metric_name": "准确性",
              "score": 8.5,
              "reason": "回答准确"
            },
            {
              "metric_name": "丰富度",
              "score": 7.0,
              "reason": "内容较为丰富"
            }
          ]
        },
        {
          "metrics": [
            {
              "metric_name": "准确性",
              "score": 9.0,
              "reason": "回答非常准确"
            },
            {
              "metric_name": "丰富度",
              "score": 8.5,
              "reason": "内容非常丰富"
            }
          ]
        }
      ]
    }
    ```
    """
    item_index: int = Field(..., description="评估项序号（从1开始）")
    model_metrics: List[MetricInfos] = Field(..., min_length=1, description="模型指标列表，按照创建task时关联的推理结果集的顺序，单个评估有1个元素，对比评估有多个元素")


class ManualEvaluationItemBatchUpdate(BaseModel):
    """批量更新人工评估项评分请求"""
    items: List[ManualEvaluationItemUpdate] = Field(..., min_length=1, description="评估项更新列表")


class ManualEvaluationAnnotationStatsResponse(BaseModel):
    """人工评估标注统计信息响应"""
    total_tasks: int = Field(..., description="总任务数")
    completed_count: int = Field(..., description="标注完成数")
    annotating_count: int = Field(..., description="标注中数")
    unannotated_count: int = Field(..., description="未标注数")

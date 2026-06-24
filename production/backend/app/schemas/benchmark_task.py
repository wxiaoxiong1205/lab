from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.base import BaseSchema
from app.common.status import TaskStatus


# ==================== 枚举类型 ====================

class BenchmarkModelType(str, Enum):
    """基准评估模型类型枚举"""
    MODEL = "model"  # 离线模型
    SERVICE = "service"  # 在线服务


class BenchmarkModelProvider(str, Enum):
    """基准评估在线服务模型提供商（仅 model_type=service 时使用）"""
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    QWEN = "qwen"
    ZHIPU = "zhipu"
    KIMI = "kimi"
    MINIMAX = "minimax"
    GEMINI = "gemini"

    @classmethod
    def get_label(cls, value: str) -> str:
        """获取展示名称"""
        labels = {
            cls.OPENAI.value: "OpenAI",
            cls.DEEPSEEK.value: "DeepSeek",
            cls.QWEN.value: "Qwen",
            cls.ZHIPU.value: "Zhipu",
            cls.KIMI.value: "Kimi",
            cls.MINIMAX.value: "MiniMax",
            cls.GEMINI.value: "Gemini",
        }
        return labels.get(value, value)


class BenchmarkDatasetCategory(str, Enum):
    """基准评估数据集分类枚举"""
    LANGUAGE_UNDERSTANDING = "language_understanding"  # 语言理解
    KNOWLEDGE = "knowledge"  # 知识问答
    INSTRUCTION_FOLLOWING = "instruction_following"  # 指令遵循
    REASONING = "reasoning"  # 逻辑推理
    CODE = "code"  # 代码
    SAFETY = "safety"  # 安全可信


# ==================== 请求模型 ====================

class OfflineModelSource(str, Enum):
    """离线模型来源（仅当 model_type=model 时有效）"""
    TRAINED = "trained"  # 训练模型
    BASE = "base"  # 基础模型


class BenchmarkTaskCreate(BaseModel):
    """创建基准评估任务请求"""
    name: str = Field(..., description="任务名称", max_length=100)
    description: Optional[str] = Field(None, description="任务描述", max_length=1000)
    model_type: BenchmarkModelType = Field(..., description="模型类型：model离线模型/service在线服务")
    model_id: int = Field(..., description="待评估模型/服务ID")
    model_provider: Optional[str] = Field(None, description="在线服务模型提供商，model_type=service 时必填")
    offline_model_source: OfflineModelSource = Field(
        OfflineModelSource.TRAINED,
        description="离线模型来源：trained训练模型/base基础模型，仅当 model_type=model 时有效"
    )
    dataset_ids: List[int] = Field(..., description="基准评估数据集ID列表", min_length=1)
    inference_params: Optional[Dict[str, Any]] = Field(
        None,
        description="推理参数配置（字典格式，键为推理参数类型枚举值如 temperature、max_tokens，值为参数值。可通过 /api/v1/enums/inference-params 查询支持的参数）"
    )
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    graphics_card_resource: Optional[Dict[str, Any]] = Field(None, description="GPU/NPU资源配置（离线模型时使用）")

    @field_validator("schedule_at", mode="before")
    @classmethod
    def _empty_str_to_none(cls, v):
        return None if v == "" else v

    @model_validator(mode="after")
    def validate_model_provider_required_for_service(self):
        """在线服务类型时，模型提供商为必填且须为合法枚举值"""
        if self.model_type != BenchmarkModelType.SERVICE:
            return self
        if not self.model_provider or not str(self.model_provider).strip():
            raise ValueError("模型类型为在线服务时，模型提供商为必填项")
        valid_values = {e.value for e in BenchmarkModelProvider}
        if self.model_provider.strip() not in valid_values:
            raise ValueError(f"无效的模型提供商: {self.model_provider}，可选值: {list(valid_values)}")
        return self


class BenchmarkTaskUpdate(BaseModel):
    """更新基准评估任务请求"""
    name: Optional[str] = Field(None, description="任务名称", max_length=100)
    description: Optional[str] = Field(None, description="任务描述", max_length=1000)
    model_type: Optional[BenchmarkModelType] = Field(
        None,
        description="模型类型：model 离线模型 / service 在线服务；切换类型时需与 model_id、model_provider 一并提交",
    )
    model_id: Optional[int] = Field(None, description="待评估模型/服务ID")
    model_provider: Optional[str] = Field(None, description="在线服务模型提供商，仅 model_type=service 时有效")
    offline_model_source: Optional[OfflineModelSource] = Field(
        None,
        description="离线模型来源：trained训练模型/base基础模型，仅当 model_type=model 且更新 model_id 时有效"
    )
    dataset_ids: Optional[List[int]] = Field(None, description="基准评估数据集ID列表", min_length=1)
    inference_params: Optional[Dict[str, Any]] = Field(
        None,
        description="推理参数配置（字典格式，键为推理参数类型枚举值，值为参数值）"
    )
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    graphics_card_resource: Optional[Dict[str, Any]] = Field(None, description="GPU/NPU资源配置（离线模型时使用）")

    @field_validator("schedule_at", mode="before")
    @classmethod
    def _empty_str_to_none(cls, v):
        return None if v == "" else v

    @field_validator("model_provider")
    @classmethod
    def validate_model_provider_enum(cls, v):
        """若传入模型提供商，须为合法枚举值"""
        if v is None or (isinstance(v, str) and not v.strip()):
            return v
        valid_values = {e.value for e in BenchmarkModelProvider}
        if v.strip() not in valid_values:
            raise ValueError(f"无效的模型提供商: {v}，可选值: {list(valid_values)}")
        return v.strip()

    @model_validator(mode="after")
    def validate_model_type_switch(self):
        """切换为在线服务时模型提供商必填；切换为离线模型时忽略 model_provider"""
        if self.model_type == BenchmarkModelType.SERVICE:
            if not self.model_provider or not str(self.model_provider).strip():
                raise ValueError("模型类型为在线服务时，模型提供商为必填项")
            valid_values = {e.value for e in BenchmarkModelProvider}
            if self.model_provider.strip() not in valid_values:
                raise ValueError(f"无效的模型提供商: {self.model_provider}，可选值: {list(valid_values)}")
        return self


class BenchmarkTaskCompareRequest(BaseModel):
    """对比评估请求"""
    task_ids: List[int] = Field(..., description="任务ID列表", min_length=2, max_length=5)


class BenchmarkLeaderboardRadarChartRequest(BaseModel):
    """雷达图数据请求"""
    model_ids: List[int] = Field(..., description="模型ID列表", min_length=1, max_length=10)


# ==================== 响应模型 ====================

class BenchmarkDatasetResponse(BaseSchema):
    """基准评估数据集响应"""
    name: str = Field(..., description="数据集名称")
    code: str = Field(..., description="数据集代码（OpenCompass标识符）")
    invoke_name: Optional[str] = Field(None, description="调用时使用的模块名，如 gsm8k_gen；为空则用 code+_gen")
    language: Optional[str] = Field(None, description="语言")
    original_sample_count: Optional[int] = Field(None, description="原始样本数")
    description: Optional[str] = Field(None, description="说明")
    category: BenchmarkDatasetCategory = Field(..., description="分类")
    model_types: Optional[List[str]] = Field(None, description="适用模型类型：text-generation/image-generation/image-understanding/multimodal，为空表示兼容全部")
    is_builtin: bool = Field(..., description="是否为系统内置数据集")
    sort_order: int = Field(..., description="排序顺序")


class BenchmarkTaskModelRelationResponse(BaseModel):
    """任务-模型关联响应"""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="主键ID")
    model_id: int = Field(..., description="模型/服务ID")
    model_name: str = Field(..., description="模型/服务名称")
    model_version: Optional[str] = Field(None, description="模型版本")
    model_type: str = Field(..., description="模型类型")
    sort_order: int = Field(..., description="排序顺序")


class BenchmarkTaskDatasetRelationResponse(BaseModel):
    """任务-数据集关联响应"""
    id: int = Field(..., description="主键ID")
    dataset_id: int = Field(..., description="数据集ID")
    dataset_name: str = Field(..., description="数据集名称")
    dataset_code: str = Field(..., description="数据集代码")


class BenchmarkTaskSummaryResponse(BaseSchema):
    """基准评估任务摘要响应"""
    name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    project_id: int = Field(..., description="关联项目ID")
    model_type: str = Field(..., description="模型类型")
    model_provider: Optional[str] = Field(None, description="在线服务模型提供商")
    inference_params: Optional[Dict[str, Any]] = Field(None, description="推理参数配置")
    status: str = Field(..., description="状态")
    progress: int = Field(..., description="进度(0-100)")
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    error_message: Optional[str] = Field(None, description="错误信息")
    models: List[BenchmarkTaskModelRelationResponse] = Field(default_factory=list, description="评估模型列表")
    datasets: List[BenchmarkTaskDatasetRelationResponse] = Field(default_factory=list, description="评估数据集列表")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")


class BenchmarkTaskDetailResponse(BaseSchema):
    """基准评估任务详情响应"""
    name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    project_id: int = Field(..., description="关联项目ID")
    model_type: str = Field(..., description="模型类型")
    model_provider: Optional[str] = Field(None, description="在线服务模型提供商")
    inference_params: Optional[Dict[str, Any]] = Field(None, description="推理参数配置")
    schedule_enabled: bool = Field(..., description="是否启用定时任务")
    schedule_config: Optional[Dict[str, Any]] = Field(None, description="定时配置")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    status: str = Field(..., description="状态")
    progress: int = Field(..., description="进度(0-100)")
    lab_k8s_uuid: Optional[str] = Field(None, description="K8s Job UUID")
    celery_task_id: Optional[str] = Field(None, description="Celery任务ID")
    graphics_card_resource: Optional[Dict[str, Any]] = Field(None, description="GPU/NPU资源配置")
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    error_message: Optional[str] = Field(None, description="错误信息")
    result_path: Optional[str] = Field(None, description="评估结果文件路径")
    log_path: Optional[str] = Field(None, description="日志文件路径")
    models: List[BenchmarkTaskModelRelationResponse] = Field(default_factory=list, description="关联的模型列表")
    datasets: List[BenchmarkTaskDatasetRelationResponse] = Field(default_factory=list, description="关联的数据集列表")


class BenchmarkResultResponse(BaseSchema):
    """评估结果响应"""
    benchmark_task_id: int = Field(..., description="关联基准评估任务ID")
    model_id: int = Field(..., description="模型/服务ID")
    model_name: str = Field(..., description="模型/服务名称")
    model_version: Optional[str] = Field(None, description="模型版本")
    dataset_code: str = Field(..., description="数据集代码")
    score: float = Field(..., description="评估分数")


class BenchmarkLeaderboardItemResponse(BaseSchema):
    """榜单项响应"""
    project_id: int = Field(..., description="关联项目ID")
    model_id: int = Field(..., description="模型/服务ID")
    model_name: str = Field(..., description="模型/服务名称")
    model_version: Optional[str] = Field(None, description="模型版本")
    average_score: float = Field(..., description="平均得分")
    dataset_scores: Optional[Dict[str, float]] = Field(None, description="各数据集得分")
    last_task_id: Optional[int] = Field(None, description="最近一次评估任务ID")
    last_evaluated_at: Optional[datetime] = Field(None, description="最近一次评估时间")


class BenchmarkRadarChartDataItem(BaseModel):
    """雷达图数据项"""
    dataset_code: str = Field(..., description="数据集代码")
    dataset_name: str = Field(..., description="数据集名称")
    score: Optional[float] = Field(None, description="得分（如果该模型没有该数据集得分则为None）")


class BenchmarkRadarChartModelData(BaseModel):
    """雷达图模型数据"""
    model_id: int = Field(..., description="模型ID")
    model_name: str = Field(..., description="模型名称")
    model_version: Optional[str] = Field(None, description="模型版本")
    data: List[BenchmarkRadarChartDataItem] = Field(..., description="数据集得分列表")


class BenchmarkRadarChartResponse(BaseModel):
    """雷达图响应"""
    models: List[BenchmarkRadarChartModelData] = Field(..., description="模型数据列表")
    datasets: List[str] = Field(..., description="数据集代码列表（用于确定雷达图维度）")


class BenchmarkModelReportData(BaseModel):
    """单个模型的报告数据（用于对比评估）"""
    model_id: int = Field(..., description="模型/服务ID")
    model_name: str = Field(..., description="模型/服务名称")
    model_version: Optional[str] = Field(None, description="模型版本")
    radar_chart_data: BenchmarkRadarChartModelData = Field(..., description="雷达图数据")


class BenchmarkTaskCompareResponse(BaseModel):
    """对比评估响应"""
    benchmark_task_ids: List[int] = Field(..., description="基准评估任务ID列表")
    evaluation_type: str = Field(default="comparison", description="评估类型（对比评估）")
    model_reports: List[BenchmarkModelReportData] = Field(..., description="每个模型的报告数据列表")


class BenchmarkTaskLogResponse(BaseModel):
    """任务日志响应（结构与TaskLogResponse一致，便于前端复用）"""
    archived: bool = Field(..., description="是否为归档日志（从MinIO获取）")
    logs: List[str] = Field(..., description="日志内容列表")


class BenchmarkReportModelData(BaseModel):
    """单个模型的报告数据（用于评估报告）"""
    model_id: int = Field(..., description="模型/服务ID")
    model_name: str = Field(..., description="模型/服务名称")
    model_version: Optional[str] = Field(None, description="模型版本")
    dataset_scores: Dict[str, float] = Field(..., description="各数据集得分（数据集代码 -> 得分）")
    average_score: Optional[float] = Field(None, description="平均得分（各数据集平均值）")


class BenchmarkTaskReportResponse(BaseModel):
    """评估报告响应"""
    benchmark_task_id: int = Field(..., description="基准评估任务ID")
    evaluation_type: str = Field(default="single", description="评估类型（基准评估固定为single）")
    model_reports: List[BenchmarkReportModelData] = Field(..., description="每个模型的报告数据列表")

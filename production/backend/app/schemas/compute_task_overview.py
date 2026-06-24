from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ComputeTaskScope(str, Enum):
    TOTAL = "total"
    LLM = "llm"
    MACHINE_LEARNING = "machine_learning"


class ComputeTaskType(str, Enum):
    def __new__(cls, value: str, display_name: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.display_name = display_name
        return obj

    LLM_TRAINING = ("llm_training", "大模型训练")
    LLM_DEPLOYMENT = ("llm_deployment", "大模型部署")
    LLM_INFERENCE_RESULT = ("llm_inference_result", "大模型推理结果任务")
    LLM_EVALUATION = ("llm_evaluation", "大模型评估")
    LLM_BENCHMARK = ("llm_benchmark", "大模型基准评估")
    LLM_NOTEBOOK = ("llm_notebook", "大模型 Notebook")
    LLM_IMAGE_BUILD = ("llm_image_build", "大模型镜像构建")
    MACHINE_LEARNING_MODEL_DEPLOYMENT = ("machine_learning_model_deployment", "机器学习模型部署")
    MACHINE_LEARNING_MODEL = ("machine_learning_model", "机器学习模型")
    MACHINE_LEARNING_NOTEBOOK = ("machine_learning_notebook", "机器学习 Notebook")
    MACHINE_LEARNING_IMAGE_BUILD = ("machine_learning_image_build", "机器学习镜像构建")
    DATA_CLEANING = ("data_cleaning", "数据清洗任务")


class TaskTypeCount(BaseModel):
    task_scope: str = Field(..., description="任务范围编码")
    task_scope_name: str = Field(..., description="任务范围展示名")
    count: int = Field(..., description="任务数量")


class TaskTypeStatsResponse(BaseModel):
    project_id: int = Field(..., description="项目ID")
    items: List[TaskTypeCount] = Field(default_factory=list, description="任务类型统计")


class StatusCount(BaseModel):
    status_code: str = Field(..., description="状态编码")
    status_name: str = Field(..., description="状态展示名")
    count: int = Field(..., description="状态数量")


class StatusStatsResponse(BaseModel):
    project_id: int = Field(..., description="项目ID")
    task_scope: str = Field(..., description="任务范围")
    total: int = Field(..., description="当前范围任务总数")
    statuses: List[StatusCount] = Field(default_factory=list, description="状态统计")


class TaskSourceRef(BaseModel):
    source_type: str = Field(..., description="来源类型")
    source_id: int = Field(..., description="来源表主键ID")
    source_table: Optional[str] = Field(None, description="来源表名")


class TaskResourceAmount(BaseModel):
    value: Optional[float] = Field(None, description="资源数值")
    unit: str = Field(..., description="资源单位")


class LatestTaskResourceInfo(BaseModel):
    resource_type: Optional[str] = Field(None, description="资源类型，例如 GPU、NPU、CPU")
    resource_card_model: Optional[str] = Field(None, description="资源型号")
    resource_card_memory: Optional[str] = Field(None, description="单卡显存规格")
    k8s_resource_type: Optional[str] = Field(None, description="K8s 资源类型，例如 nvidia.com/gpu")
    replicas: Optional[int] = Field(None, description="副本数；部署类任务资源按副本数汇总")
    card_count: Optional[TaskResourceAmount] = Field(None, description="GPU/NPU 卡数")
    gpu_memory: Optional[TaskResourceAmount] = Field(None, description="GPU/NPU 总显存")
    cpu_request: Optional[TaskResourceAmount] = Field(None, description="CPU 请求量")
    cpu_limit: Optional[TaskResourceAmount] = Field(None, description="CPU 限制量")
    memory_request: Optional[TaskResourceAmount] = Field(None, description="内存请求量")
    memory_limit: Optional[TaskResourceAmount] = Field(None, description="内存限制量")
    summary: List[str] = Field(default_factory=list, description="资源展示摘要")
    raw: Dict[str, Any] = Field(default_factory=dict, description="原始资源配置")


class LatestTaskItem(BaseModel):
    task_id: int = Field(..., description="任务ID；无统一任务表时等于来源表主键")
    task_name: str = Field(..., description="任务名称")
    task_scope: str = Field(..., description="任务范围")
    task_scope_name: str = Field(..., description="任务范围展示名")
    task_type: str = Field(..., description="业务任务类型")
    task_type_name: str = Field(..., description="业务任务类型展示名")
    status: str = Field(..., description="状态编码")
    status_name: str = Field(..., description="状态展示名")
    creator_id: Optional[int] = Field(None, description="创建人ID")
    created_by: Optional[str] = Field(None, description="创建人")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    status_updated_at: Optional[datetime] = Field(None, description="状态更新时间")
    resources: LatestTaskResourceInfo = Field(default_factory=LatestTaskResourceInfo, description="任务资源信息")
    source: TaskSourceRef = Field(..., description="来源信息")
    detail_ref: TaskSourceRef = Field(..., description="详情定位信息")
    list_filter: Dict[str, Any] = Field(default_factory=dict, description="任务列表筛选参数")


class LatestTaskGroup(BaseModel):
    status: str = Field(..., description="状态编码")
    status_name: str = Field(..., description="状态展示名")
    resource_usage_tip: str = Field(..., description="资源占用提示文案")
    total_count: int = Field(..., description="当前状态总数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页条数")
    total_pages: int = Field(..., description="总页数")
    has_more: bool = Field(..., description="是否还有更多")
    items: List[LatestTaskItem] = Field(default_factory=list, description="任务列表")


class LatestTasksResponse(BaseModel):
    project_id: int = Field(..., description="项目ID")
    task_scope: str = Field(..., description="任务范围")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页条数")
    groups: List[LatestTaskGroup] = Field(default_factory=list, description="分状态任务列表")


class ResourceMetric(BaseModel):
    used: Optional[float] = Field(None, description="已使用")
    total: Optional[float] = Field(None, description="总量")
    unit: str = Field(..., description="单位")


class ResourceCardModelInfo(BaseModel):
    resource_card_model: Optional[str] = Field(None, description="资源型号")
    resource_card_memories: List[str] = Field(default_factory=list, description="该型号包含的显存规格")
    k8s_resource_type: str = Field(..., description="K8s 资源类型，例如 nvidia.com/gpu")
    description: str = Field(..., description="展示描述")
    total_cards: float = Field(..., description="该型号总卡数")
    total_memory: float = Field(..., description="该型号总显存 GB")
    node_count: int = Field(..., description="该型号覆盖节点数")


class ResourceTypeInfo(BaseModel):
    resource_type: str = Field(..., description="资源类型，例如 GPU、NPU、CPU、MEMORY")
    resource_type_name: str = Field(..., description="资源类型展示名")
    total: Optional[float] = Field(None, description="资源总量")
    unit: Optional[str] = Field(None, description="资源单位")
    card_models: List[ResourceCardModelInfo] = Field(default_factory=list, description="资源型号列表")


class ResourceUsageResponse(BaseModel):
    project_id: int = Field(..., description="项目ID")
    cluster_id: Optional[int] = Field(None, description="集群ID")
    cluster_name: Optional[str] = Field(None, description="集群名称")
    available_resources: List[ResourceTypeInfo] = Field(default_factory=list, description="环境已有资源类型和型号")
    scope: str = Field(..., description="资源统计范围：project/cluster")
    gpu_cards: Optional[ResourceMetric] = Field(None, description="GPU/NPU 卡数")
    gpu_memory: Optional[ResourceMetric] = Field(None, description="GPU/NPU 显存")
    cpu: ResourceMetric = Field(..., description="CPU")
    memory: ResourceMetric = Field(..., description="内存")


class ProjectResourceUsageResponse(ResourceUsageResponse):
    task_scope: str = Field(..., description="任务范围")

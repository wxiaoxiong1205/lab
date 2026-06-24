from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field, field_validator, model_validator
from app.common.status import TaskStatus
from app.schemas.common import BaseModelWithTimezone
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.utils.name_validator import validate_llm_inference_server_name, validate_name_format
from enum import Enum

# ==================== 推理服务后端枚举 ====================
class BackendEnum(str, Enum):
    VLLM = "vLLM"
    MINDIE = "MindIE"
    SGLANG = "SGLang"
    DGI_SERVER = "DGI-Server"
    ML = "ML"

class UpdateEnum(str, Enum):
    START = "start"
    STOP = "stop"   
    
# =================== 模型来源后端枚举 ====================
class ModelSourceEnum(str, Enum):
    BASE_MODEL = "base_model"
    TRAINED_MODEL = "trained_model"
    ML_MODEL = "ml_model"

# =================== 推理镜像健康检查探针地址枚举 ====================
class ProbeUrlEnum(str, Enum):
    VLLM = "/health"
    MINDIE = ""
    SGLANG = ""
    DGI_SERVER = "/v1/metrics"

# ==================== 基础模型配置 ====================
class BaseModelConfig(BaseModel):
    """基础模型配置"""
    base_model_id: int = Field(..., gt=0, description="基础模型ID")
    base_model_name: str = Field(..., max_length=200, description="基础模型名称")
    base_model_path: str = Field(..., description="基础模型路径") 

# =================== 训练生成模型配置 ====================
class TrainedModelConfig(BaseModel):
    """训练生成模型配置"""
    trained_model_id: int = Field(..., gt=0, description="训练生成模型ID")
    trained_model_name: str = Field(..., max_length=200, description="训练生成模型名称")
    trained_model_path: str = Field(..., description="训练生成模型路径")
    model_version: str = Field("v1", max_length=50, description="模型版本，默认为v1")


# =================== 机器学习模型配置（部署用）===================
class MlModelConfig(BaseModel):
    """机器学习模型配置。model.py（推理句柄）来源二选一：分片上传（upload）或与创建 ML 模型一致的 Notebook 路径（notebook）；互斥。服务层对 ML 部署强制必填其一。"""

    ml_model_id: int = Field(..., gt=0, description="机器学习模型版本 ID（ml_models.id）")
    ml_model_name: Optional[str] = Field(None, max_length=255, description="可选，后端会从 ml_models 带出")
    ml_model_path: Optional[str] = Field(None, description="可选，后端会从 ml_models.artifact_uri 带出")
    ml_handle_source_type: str = Field(
        "upload",
        description="model.py 来源：upload（分片上传 merge 的 uploadId）或 notebook（Notebook 工作区相对路径，与创建 ML 模型 source_ref 语义一致）",
    )
    ml_handle_upload_id: Optional[str] = Field(
        None,
        max_length=100,
        description="ml_handle_source_type=upload 时：分片上传 merge 后的 uploadId（.py）",
    )
    notebook_id: Optional[int] = Field(None, gt=0, description="ml_handle_source_type=notebook 时：Notebook 主键")
    handle_source_ref: Optional[str] = Field(
        None,
        max_length=500,
        description=(
            "ml_handle_source_type=notebook 时：Notebook 工作区内 .py 相对路径；"
            "若与 ml_model_id 对应模型注册的 notebook_id 一致且省略本字段，服务端可按 source_ref 推断同目录 model.py。"
        ),
    )

    @field_validator("ml_handle_upload_id", mode="before")
    @classmethod
    def _normalize_ml_handle_upload_id(cls, v: Any) -> Optional[str]:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return str(v)

    @field_validator("handle_source_ref", mode="before")
    @classmethod
    def _normalize_handle_source_ref(cls, v: Any) -> Optional[str]:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return str(v)

    @model_validator(mode="after")
    def _validate_ml_handle_source_mutual_exclusive(self):
        st = (self.ml_handle_source_type or "upload").strip().lower()
        u = (self.ml_handle_upload_id or "").strip() if self.ml_handle_upload_id else ""
        ref = (self.handle_source_ref or "").strip() if self.handle_source_ref else ""
        nid = self.notebook_id
        if st == "upload" and not u and nid is not None and ref:
            st = "notebook"
            object.__setattr__(self, "ml_handle_source_type", "notebook")
        if st not in ("upload", "notebook"):
            raise ValueError("ml_handle_source_type 须为 upload 或 notebook")
        object.__setattr__(self, "ml_handle_source_type", st)
        if st == "upload":
            if nid is not None or ref:
                raise ValueError("model.py 来源为 upload 时请勿填写 notebook_id、handle_source_ref")
        else:
            if u:
                raise ValueError("model.py 来源为 notebook 时请勿填写 ml_handle_upload_id")
        return self

    class Config:
        json_schema_extra = {
            "example": {
                "ml_model_id": 100,
                "ml_handle_source_type": "upload",
                "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000",
            }
        }

# ==================== 镜像配置 ====================
class InferenceImageConfig(BaseModel):
    """推理服务镜像配置"""
    image_id: int = Field(..., gt=0, description="镜像ID")
    image_name: str = Field(..., max_length=255, description="镜像名称")
    image_url: str = Field(..., max_length=255, description="镜像地址")
    
class ResourceCpuConfig(BaseModel):
    """CPU资源配置"""
    resource_cpu_request: Optional[float] = Field(4, gt=0, description="CPU核心数")
    resource_cpu_limit: Optional[float] = Field(8, gt=0, description="CPU核心数上限")
    resource_memory_request: Optional[float] = Field(16, gt=0, description="内存大小，单位GB")
    resource_memory_limit: Optional[float] = Field(32, gt=0, description="内存大小上限，单位GB")
    

# ==================== 推理任务模型 ====================
    
class InferenceTaskCreate(BaseModel):
    """创建推理任务的请求模型""" 
    server_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description=(
            "推理服务名称：base_model/trained_model 时仅英文、数字、_.-，不支持中文；"
            "ml_model 时支持中英文（与数据集命名规则一致）；均不可 -/_ 开头、不可含空格"
        ),
    )
    description: Optional[str] = Field(default=None, max_length=1000, description="推理服务描述")
    project_id: int = Field(
        ...,
        gt=0,
        description="须与 URL 路径 /project/{project_id} 一致；服务端以路径中的项目ID 为准写入，请勿与项目空间等其他 ID 混用",
    )
    model_source: ModelSourceEnum = Field(..., description="模型来源（base_model/trained_model/ml_model）")
    base_model_config: Optional[BaseModelConfig] = Field(None, description="基础模型配置，当 model_source 为 base_model 时必填")
    trained_model_config: Optional[TrainedModelConfig] = Field(None, description="训练生成模型配置，当 model_source 为 trained_model 时必填")
    ml_model_config: Optional[MlModelConfig] = Field(None, description="机器学习模型配置，当 model_source 为 ml_model 时必填")
    desired_replicas: int = Field(default=1, description="部署实例数")
    inference_engine_type: BackendEnum = Field(..., description="推理引擎类型")
    backend_parameters:Optional[List[str]] = Field(default=[], description="推理引擎参数列表")
    env_vars: Optional[Dict[str, str]] = Field(default={}, description="环境变量字典")
    run_command: Optional[str] = Field(None, max_length=1024, description="容器启动命令")
    image_config: InferenceImageConfig = Field(..., description="推理服务镜像配置")
    graphics_card_resource: GraphicsCardResourceConfig = Field(..., description="图形卡资源配置")
    resource_cpu_config: ResourceCpuConfig = Field(..., description="CPU资源配置")

    @field_validator("server_name", mode="before")
    @classmethod
    def _strip_server_name(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @model_validator(mode="after")
    def _validate_server_name_by_model_source(self) -> "InferenceTaskCreate":
        if self.model_source == ModelSourceEnum.ML_MODEL:
            validate_name_format(self.server_name, "推理服务名称")
        else:
            validate_llm_inference_server_name(self.server_name, "推理服务名称")
        return self
   
    @model_validator(mode='before')
    @classmethod
    def validate_model_configs(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """验证模型配置的完整性"""
        model_source = values.get("model_source")
        base_model_config = values.get("base_model_config")
        trained_model_config = values.get("trained_model_config")
        ml_model_config = values.get("ml_model_config")
        
        if model_source == ModelSourceEnum.BASE_MODEL:
            if not base_model_config:
                raise ValueError("当 model_source 为 base_model 时，base_model_config 不能为空")
        elif model_source == ModelSourceEnum.TRAINED_MODEL:
            if not trained_model_config:
                raise ValueError("当 model_source 为 trained_model 时，trained_model_config 不能为空")
        elif model_source == ModelSourceEnum.ML_MODEL:
            if not ml_model_config:
                raise ValueError("当 model_source 为 ml_model 时，ml_model_config 不能为空")
        else:
            raise ValueError("无效的 model_source 值")

        return values

    class Config:
        json_schema_extra = {
            "example": {
                "server_name": "ml-text-clf-infer",
                "description": "机器学习模型（Notebook 产物）在线推理",
                "project_id": 1,
                "model_source": "ml_model",
                "ml_model_config": {
                    "ml_model_id": 100,
                    "ml_handle_source_type": "upload",
                    "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000",
                },
                "desired_replicas": 1,
                "inference_engine_type": "ML",
                "backend_parameters": [],
                "env_vars": {"CUDA_VISIBLE_DEVICES": "0"},
                "run_command": None,
                "image_config": {
                    "image_id": 1,
                    "image_name": "jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04",
                    "image_url": "registry.example.com/proj/jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04",
                },
                "graphics_card_resource": {
                    "card_type": "GPU",
                    "card_model": "A800",
                    "count": 1,
                    "card_memory": "80GB",
                    "k8s_resource_type": "nvidia.com/gpu",
                },
                "resource_cpu_config": {
                    "resource_cpu_request": 4,
                    "resource_cpu_limit": 8,
                    "resource_memory_request": 16,
                    "resource_memory_limit": 32,
                },
            }
        }


# ==================== ML 部署 · 在线开发 Notebook ====================
class MlDeployDevNotebookCreate(BaseModel):
    """机器学习部署「在线开发」：仅校验模型与资源配置；Notebook 镜像由服务端按项目解析。"""

    server_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Notebook 实例命名基准（服务端会加后缀）；支持中英文、数字、_.-，不可含空格（不可 -/_ 开头）",
    )
    description: Optional[str] = Field(default=None, max_length=1000, description="说明")
    ml_model_config: MlModelConfig = Field(..., description="机器学习模型与 model.py 来源（upload 或 notebook，均可选）")
    graphics_card_resource: GraphicsCardResourceConfig = Field(..., description="GPU/NPU 资源配置")
    resource_cpu_config: ResourceCpuConfig = Field(..., description="CPU 与内存资源配置")
    image_config: InferenceImageConfig = Field(..., description="推理服务镜像配置")
    auto_start: bool = Field(
        default=False,
        description="为 True 时创建后立即发起启动/部署；False 仅入库，由前端再调启动",
    )

    @field_validator("server_name", mode="before")
    @classmethod
    def _strip_ml_dev_server_name(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @model_validator(mode="after")
    def _validate_ml_dev_server_name(self) -> "MlDeployDevNotebookCreate":
        validate_name_format(self.server_name, "推理服务名称")
        return self

    class Config:
        json_schema_extra = {
            "example": {
                "server_name": "ml-text-clf-dev",
                "description": "在线开发 Notebook",
                "ml_model_config": {
                    "ml_model_id": 100,
                    "ml_handle_source_type": "notebook",
                    "notebook_id": 1001,
                    "handle_source_ref": "outputs/model.py",
                },
                "graphics_card_resource": {
                    "card_type": "GPU",
                    "card_model": "A800",
                    "count": 1,
                    "card_memory": "80GB",
                    "k8s_resource_type": "nvidia.com/gpu",
                },
                "resource_cpu_config": {
                    "resource_cpu_request": 4,
                    "resource_cpu_limit": 8,
                    "resource_memory_request": 16,
                    "resource_memory_limit": 32,
                },
                "auto_start": False,
            }
        }


class MlDeployDevNotebookResponse(BaseModel):
    """创建 ML 部署在线开发 Notebook 的响应"""

    notebook_id: int = Field(..., description="Notebook 主键 ID，供前端跳转详情或代理页")
    auto_started: bool = Field(..., description="是否已在本次请求中发起启动/部署")
    message: Optional[str] = Field(None, description="提示信息")


class InferenceTaskRedeploy(InferenceTaskCreate):
    """更新推理任务的请求模型"""

    redeploy: bool = Field(default=True, description="是否重新部署推理服务，默认为 False")

    class Config:
        json_schema_extra = {
            "example": {
                "server_name": "ml-text-clf-infer",
                "description": "机器学习模型（Notebook 产物）在线推理",
                "project_id": 1,
                "model_source": "ml_model",
                "ml_model_config": {
                    "ml_model_id": 100,
                    "ml_handle_source_type": "upload",
                    "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000",
                },
                "desired_replicas": 1,
                "inference_engine_type": "ML",
                "backend_parameters": [],
                "env_vars": {},
                "run_command": None,
                "image_config": {
                    "image_id": 1,
                    "image_name": "jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04",
                    "image_url": "registry.example.com/proj/jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04",
                },
                "graphics_card_resource": {
                    "card_type": "GPU",
                    "card_model": "A800",
                    "count": 1,
                    "card_memory": "80GB",
                    "k8s_resource_type": "nvidia.com/gpu",
                },
                "resource_cpu_config": {
                    "resource_cpu_request": 4,
                    "resource_cpu_limit": 8,
                    "resource_memory_request": 16,
                    "resource_memory_limit": 32,
                },
                "redeploy": True,
            }
        }

class InferenceTaskScale(BaseModel):
    desired_replicas: int = Field(..., gt=0, description="部署实例数")

class InferenceTaskUpdate(BaseModel):
    update_type: UpdateEnum = Field(..., description="更新类型：start 或 stop")
   
# ==================== 响应模型 ====================

# ==================== 创建推理任务后的精简响应模型 ====================
class InferenceTaskCreatedResponse(BaseModelWithTimezone):
    """创建推理任务后的精简响应模型"""
    id: int = Field(..., description="任务ID")
    server_name: str = Field(..., description="推理任务名称")
    description: Optional[str] = Field(None, description="推理任务描述")
    project_id: int = Field(..., description="关联项目ID")
    message: Optional[str] = Field(None, description="提示信息")
    model_source: ModelSourceEnum = Field(..., description="模型来源（base_model/trained_model）")
    model_name: str = Field(..., description="关联模型名称")


class InferenceTaskSummaryResponse(BaseModel):
    """推理任务汇总响应模型"""
    id: int = Field(..., description="任务ID")
    server_name: str = Field(..., description="推理任务名称")
    description: Optional[str] = Field(None, description="推理任务描述")
    project_id: int = Field(..., description="关联项目ID")
    status: TaskStatus = Field(..., description="任务状态")
    model_source: ModelSourceEnum = Field(..., description="模型来源（base_model/trained_model）")
    model_name: str = Field(..., description="关联模型名称")
    desired_replicas: int = Field(..., description="部署实例数")
    ready_replicas: int = Field(..., description="已就绪实例数")
    created_by: str = Field(..., description="创建人")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    access_url: Optional[str] = Field(None, description="推理实例的访问地址（服务启动后暴露给用户可访问的 URL）")
    proxy_access_url: Optional[str] = Field(
        None,
        description="经平台代理访问 ML 推理后端的 URL 前缀（仅 model_source=ml_model 时返回，与 /api/v1/ml_backend/proxy 一致）",
    )
    network_architecture: str = Field(
        "-",
        description="网络架构：仅 model_source=ml_model 时取模型管理中该版本的「网络结构」；其他来源或未填写时为 -",
    )


class MlHandleInfo(BaseModel):
    """ML 部署 model.py 句柄信息（关联表 inference_task_ml_handles + 派生下载链接）"""

    ml_handle_upload_id: Optional[str] = Field(None, description="分片上传 merge 返回的 uploadId")
    ml_handle_jfs_path: Optional[str] = Field(None, description="推理处理脚本在存储中的路径")
    ml_handle_source_type: Optional[str] = Field(
        None,
        description="创建部署时记录的 model.py 来源：upload 或 notebook（与关联表一致；旧数据可能为空）",
    )
    notebook_id: Optional[int] = Field(
        None,
        description="来源为 notebook 时记录的 Notebook 主键（旧数据可能为空）",
    )
    handle_source_ref: Optional[str] = Field(
        None,
        description="来源为 notebook 时记录的工作区内 .py 相对路径（与创建时 ml_model_config.handle_source_ref 一致或推断结果；upload 来源为空）",
    )
    ml_handle_download_url: Optional[str] = Field(
        None,
        description="推理处理脚本（model.py）通过 JFS 代理下载的链接",
    )


class InferenceTaskResponse(BaseModel):
    """指定推理服务名称响应模型"""
    id: int = Field(..., description="推理任务ID")
    server_name: str = Field(..., description="推理任务名称")
    model_name: str = Field(..., description="关联模型名称")
    model_id: int = Field(..., description="关联模型ID（基础模型或训练模型）")
    model_source: ModelSourceEnum = Field(..., description="模型来源（base_model/trained_model）")
    trained_model_version: Optional[str] = Field(None, description="训练生成模型版本，当 model_source 为 trained_model 时返回")
    project_id: int = Field(..., description="关联项目ID")
    status: TaskStatus = Field(..., description="任务状态")
    desired_replicas: int = Field(default=1, gt=0, description="部署实例数")
    created_at: datetime = Field(..., description="创建时间")
    image_id: int = Field(..., gt=0, description="镜像ID")
    run_command: str = Field(..., description="容器启动命令")
    backend_parameters: Optional[List[str]] = Field(default=[], description="推理引擎参数列表")
    env_vars: Optional[Dict[str, str]] = Field(default={}, description="环境变量字典")
    inference_engine_type: BackendEnum = Field(..., description="推理引擎类型")
    graphics_card_resource: GraphicsCardResourceConfig = Field(..., description="图形卡资源配置")
    app_name: str = Field(..., description="Kubernetes 中的应用名称")
    resource_cpu_config: ResourceCpuConfig = Field(..., description="CPU资源配置")
    ml_handle: Optional[MlHandleInfo] = Field(
        None,
        description="ML 部署句柄信息（JSON 对象）；非 ml_model 或无关联表记录时为 null",
    )


class InferenceTaskUpdateResponse(InferenceTaskCreatedResponse):
    """更新推理任务响应模型"""
    pass
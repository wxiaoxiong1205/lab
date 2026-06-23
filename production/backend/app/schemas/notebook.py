from pathlib import Path
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, condecimal, model_validator
from datetime import datetime
from enum import Enum
import re

from pydantic_settings import BaseSettings

from app.common.status import TaskStatus
from app.core import settings
from app.schemas.common import BaseModelWithTimezone
from app.schemas.model import MlTaskType

NOTEBOOK_WORK_PATH = "/lab/work"
NOTEBOOK_PROBE_API = "api"

class NotebookBizType(str, Enum):
    """Notebook 业务类型：区分大模型训练与机器学习"""
    LLM = "llm"
    MACHINE_LEARNING = "machine_learning"


class NotebookViewMode(str, Enum):
    """Notebook 列表视图模式"""
    MANAGE = "manage"
    USE = "use"


class NotebookBuiltInPortType(str, Enum):
    """Notebook 内置占用端口"""
    JUPYTER = "9000"
    SSH = "22"
    ML_BACKEND = "9090"


NOTEBOOK_BUILT_IN_PORTS = {
    int(NotebookBuiltInPortType.JUPYTER.value),
    int(NotebookBuiltInPortType.SSH.value),
}

class NotebookPortProtocol(str, Enum):
    """Notebook 暴露端口协议类型"""
    TCP = "TCP"
    UDP = "UDP"


class NotebookPortUsage(str, Enum):
    """Notebook 暴露端口的用途"""
    JUPYTER = "jupyter"
    SSH = "ssh"
    TENSORBOARD = "tensorboard"
    VSCODE = "vscode"
    ML_BACKEND = "ml_backend"
    DEBUG = "debug"
    OTHER = "other"


class NotebookExtDatasetType(str, Enum):
    """Notebook ext.dataset 支持的数据集类型"""
    TRAINING = "training"
    VALIDATION = "validation"
    TEST = "test"
    INFERENCE_RESULT = "inference_result"
    MACHINE_LEARNING_DATASET = "machine_learning_dataset"


class NotebookExtModelType(str, Enum):
    """Notebook ext.models 支持的模型类型"""
    BASE_MODELS = "base_models"
    FINETUNED_MODELS = "finetuned_models"
    MACHINE_LEARNING_MODELS = "machine_learning_models"


class NotebookExtKey(str, Enum):
    """Notebook ext 顶层键"""
    MODEL = "model"
    MEMORY = "memory"
    CATEGORY = "category"
    DATASET = "dataset"
    MODELS = "models"


class LabJupyterEnv(BaseSettings):
    TZ: str = "Asia/Shanghai"
    LAB_DATA1: Path = Path("/lab/data1")
    LAB_DATA2: Path = Path("/lab/data2")
    LAB_DATA3: Path = Path("/lab/data3")
    LAB_MODEL1: Path = Path("/lab/model1")
    LAB_MODEL2: Path = Path("/lab/model2")
    LAB_MODEL3: Path = Path("/lab/model3")

# 精度控制
CpuType = condecimal(max_digits=4, decimal_places=2, gt=0)
MemoryType = condecimal(max_digits=5, decimal_places=2, gt=0)

class NotebookBase(BaseModel):
    instance_name: str = Field(..., min_length=1, max_length=50, description="实例名称")
    image: str = Field(..., min_length=1, max_length=255, description="容器镜像地址")
    gpu_type: Optional[str] = Field(None, max_length=64, description="GPU/NPU 类型（例如 nvidia.com/gpu、huawei.com/npu）")
    gpu_count: Optional[int] = Field(0, ge=0, description="GPU/NPU 数量")
    resource_cpu_request: CpuType = Field(..., description="CPU 请求，单位：核（G）")
    resource_cpu_limit: CpuType = Field(..., description="CPU 限制，单位：核（G）")
    resource_memory_request: MemoryType = Field(..., description="内存请求，单位：GiB")
    resource_memory_limit: MemoryType = Field(..., description="内存限制，单位：GiB")
    status: Optional[TaskStatus] = Field(TaskStatus.CREATED, description="实例状态")
    access_url: Optional[str] = Field(None, max_length=512, description="Notebook 实例的访问地址（服务启动后暴露给用户可访问的 URL）")
    describe: Optional[str] = Field(None, max_length=1000, description="描述")
    is_public: bool = Field(False, description="是否公开")

    max_run_hours: Optional[int] = Field(None,ge=0,  le=24,description="最大运行时长（小时），0-24之间的整数")
    max_run_minutes: Optional[int] = Field(None,ge=0,le=59,description="最大运行时长（分钟），0-59之间的整数")
    ext: Optional[Dict[str, Any]] = Field(default={},
                                          description='{"model":"A800","memory":"80G","category":"GPU","dataset":{"training":[1,2],"validation":[1,2],"test":[1,2],"inference_result":[1,2],"machine_learning_dataset":[{"dataset_id":1,"format":"jsonl"},{"dataset_id":2,"format":"coco"}]},"models":{"base_models":[1,2],"finetuned_models":[1,2],"machine_learning_models":[1,2]}}')
    source_example_id: Optional[int] = Field(None, description="来源案例id")
    biz_type: Optional[NotebookBizType] = Field(NotebookBizType.LLM, description="业务类型：llm(大模型训练)/machine_learning(机器学习)")
    model_service_id: Optional[int] = Field(None, description="在线推理服务id")
    usage: Optional[MlTaskType] = Field(
        None,
        description="ML 后端标识：pytorch/tensorflow/onnx/paddle/ml/llm，用于与模型部署按 usage 筛选",
    )

    model_config = ConfigDict(use_enum_values=True)

    @property
    def total_max_minutes(self) -> int:
        """计算总最大运行时长（分钟）"""
        """计算总最大运行时长（分钟），空值当 0 处理"""
        h = self.max_run_hours or 0
        m = self.max_run_minutes or 0
        return h * 60 + m

class NotebookPortItemCreate(BaseModel):
    """Notebook 端口映射（notebook_ports 表）"""
    model_config = ConfigDict(from_attributes=True)

    protocol: NotebookPortProtocol = Field(NotebookPortProtocol.TCP, description="端口协议类型")
    port_usage: NotebookPortUsage = Field(NotebookPortUsage.OTHER, description="端口用途")
    container_port: int = Field(..., ge=1, le=65535, description="容器端口号")
    description: Optional[str] = Field(None, max_length=1000, description="端口用途描述")

    @model_validator(mode='after')
    def check_container_port(self) -> 'NotebookPortItemCreate':
        if self.container_port in NOTEBOOK_BUILT_IN_PORTS:
            raise ValueError(f'端口为内置保留端口，禁止占用: {self.container_port}')
        return self


class NotebookPortUpdate(BaseModel):
    """Notebook 端口更新请求"""
    id: Optional[int] = Field(None, description="id（单独修改不需要，编辑notebook时没有id视为新增）")
    protocol: NotebookPortProtocol = Field(NotebookPortProtocol.TCP, description="端口协议类型")
    container_port: int = Field(..., ge=1, le=65535, description="容器端口号")
    description: Optional[str] = Field(None, max_length=1000, description="端口用途描述")

    @model_validator(mode='after')
    def check_container_port(self) -> 'NotebookPortUpdate':
        if self.container_port in NOTEBOOK_BUILT_IN_PORTS:
            raise ValueError(f'端口为内置保留端口，禁止占用: {self.container_port}')
        return self


class NotebookCreate(NotebookBase):
    is_ssh: bool = Field(False, description="是否开启ssh")
    ssh_username: Optional[str] = Field(None, max_length=100, description="ssh用户")
    ssh_password: Optional[str] = Field(None, max_length=100, description="ssh密码")
    ports: Optional[List[NotebookPortItemCreate]] = Field(None, description="端口列表")

    @model_validator(mode='after')
    def check_resource(self) -> 'NotebookCreate':
        if self.is_ssh:
            if not self.ssh_username or not self.ssh_password:
                raise ValueError('开启 SSH 时必须填写 ssh_username 与 ssh_password')
            if not bool(re.fullmatch(r'[A-Za-z]+', self.ssh_username)):
                raise ValueError('用户名限制为全英文')
            if len(self.ssh_password) < 8:
                raise ValueError('密码长度不能少于 8 位')
            has_upper = bool(re.search(r'[A-Z]', self.ssh_password))
            has_lower = bool(re.search(r'[a-z]', self.ssh_password))
            has_digit = bool(re.search(r'\d', self.ssh_password))
            classes = sum([has_upper, has_lower, has_digit])
            if classes < 2:
                raise ValueError('密码必须包含大写字母、小写字母、数字中的至少两类')

        if self.resource_cpu_request > self.resource_cpu_limit:
            raise ValueError('cpu资源限制数不能大于请求数')

        if self.resource_memory_request > self.resource_memory_limit:
            raise ValueError('内存资源限制数不能大于请求数')
        notebook_max_open_ports = int(settings.NOTEBOOK_MAX_OPEN_PORTS)
        if self.ports:
            if len(self.ports) > notebook_max_open_ports:
                raise ValueError(f'一个Notebook最多只能配置{notebook_max_open_ports}个开放端口')
            seen_container_ports = set()
            for port in self.ports:
                if port.container_port in seen_container_ports:
                    raise ValueError(f'端口已存在: {port.container_port}')
                seen_container_ports.add(port.container_port)
        return self

class NotebookUpdate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    instance_name: Optional[str] = Field(None, min_length=1, max_length=50, description="实例名称")
    image: Optional[str] = Field(None, min_length=1, max_length=255, description="容器镜像地址")
    gpu_type: Optional[str] = Field(None, max_length=64, description="GPU/NPU 类型")
    gpu_count: Optional[int] = Field(None, ge=0, description="GPU/NPU 数量")
    resource_cpu_request: Optional[CpuType] = Field(None, description="CPU 请求")
    resource_cpu_limit: Optional[CpuType] = Field(None, description="CPU 限制")
    resource_memory_request: Optional[MemoryType] = Field(None, description="内存请求")
    resource_memory_limit: Optional[MemoryType] = Field(None, description="内存限制")
    # access_url: Optional[str] = Field(None, max_length=512, description="Notebook 实例的访问地址（服务启动后暴露给用户可访问的 URL）")
    describe: Optional[str] = Field(None, max_length=1000, description="描述")
    # biz_type: Optional[NotebookBizType] = Field(None, description="业务类型：llm(大模型训练)/machine_learning(机器学习)")
    usage: Optional[MlTaskType] = Field(
        None,
        description="ML 后端标识：pytorch/tensorflow/onnx/paddle/ml/llm",
    )
    max_run_hours: Optional[int] = Field(None, ge=0, le=24, description="最大运行时长（小时），0-24之间的整数")
    max_run_minutes: Optional[int] = Field(None, ge=0, le=59, description="最大运行时长（分钟），0-59之间的整数")
    ext: Optional[Dict[str, Any]] = Field(
        None,
        description='扩展信息，结构同创建接口（dataset/models/model/memory/category 等）',
    )
    model_service_id: Optional[int] = Field(None, description="在线推理服务id")
    is_public: Optional[bool] = Field(None, description="是否公开")
    is_ssh: Optional[bool] = Field(None, description="是否开启ssh")
    ssh_username: Optional[str] = Field(None, max_length=100, description="ssh用户")
    ssh_password: Optional[str] = Field(None, max_length=100, description="ssh密码")
    ports: Optional[List[NotebookPortUpdate]] = Field(
        None,
        description="端口列表全量同步"
                    "ml-backend-port（9090）等内置端口由系统管理，不在范围内。"
                    "传 None 表示不动端口；传空数组表示清空所有用户端口。",
    )

    @model_validator(mode='after')
    def check_resource_and_ports(self) -> 'NotebookUpdate':
        if self.is_ssh is True:
            if self.ssh_username is None and self.ssh_password is None:
                raise ValueError('开启 SSH 时至少需要填写 ssh_username 或 ssh_password')
            if self.ssh_username is not None and not bool(re.fullmatch(r'[A-Za-z]+', self.ssh_username)):
                raise ValueError('用户名限制为全英文')
            if self.ssh_password is not None:
                if len(self.ssh_password) < 8:
                    raise ValueError('密码长度不能少于 8 位')
                has_upper = bool(re.search(r'[A-Z]', self.ssh_password))
                has_lower = bool(re.search(r'[a-z]', self.ssh_password))
                has_digit = bool(re.search(r'\d', self.ssh_password))
                classes = sum([has_upper, has_lower, has_digit])
                if classes < 2:
                    raise ValueError('密码必须包含大写字母、小写字母、数字中的至少两类')

        if (
            self.resource_cpu_request is not None
            and self.resource_cpu_limit is not None
            and self.resource_cpu_request > self.resource_cpu_limit
        ):
            raise ValueError('cpu资源限制数不能大于请求数')
        if (
            self.resource_memory_request is not None
            and self.resource_memory_limit is not None
            and self.resource_memory_request > self.resource_memory_limit
        ):
            raise ValueError('内存资源限制数不能大于请求数')
        if self.ports is not None:
            notebook_max_open_ports = int(settings.NOTEBOOK_MAX_OPEN_PORTS)
            if len(self.ports) > notebook_max_open_ports:
                raise ValueError(f'一个Notebook最多只能配置{notebook_max_open_ports}个开放端口')
            seen_container_ports = set()
            for port in self.ports:
                if port.container_port in seen_container_ports:
                    raise ValueError(f'端口已存在: {port.container_port}')
                seen_container_ports.add(port.container_port)
        return self

    @property
    def total_max_minutes(self) -> Optional[int]:
        """根据 max_run_hours / max_run_minutes 计算总最大运行时长（分钟）。

        仅在两个字段中至少有一个被显式传入时返回；否则返回 None，调用方据此判断是否需要更新。
        """
        if self.max_run_hours is None and self.max_run_minutes is None:
            return None
        h = self.max_run_hours or 0
        m = self.max_run_minutes or 0
        return h * 60 + m

class NotebookPortItem(BaseModel):
    """Notebook 端口映射（notebook_ports 表）"""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="主键")
    notebook_id: int = Field(..., description="Notebook ID")
    protocol: NotebookPortProtocol = Field(NotebookPortProtocol.TCP, description="端口协议类型")
    port_usage: NotebookPortUsage = Field(..., description="端口用途")
    port: int = Field(..., ge=1, le=65535, description="外部端口号")
    container_port: Optional[int] = Field(None, description="容器端口号")
    description: Optional[str] = Field(None, max_length=1000, description="端口用途描述")
    access_url: Optional[str] = Field(None, max_length=512, description="访问 URL")
    proxy_access_url: Optional[str] = Field(
        None,
        max_length=768,
        description="经平台代理访问该端口的 URL 前缀",
    )
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class NotebookSSHConfigResponse(BaseModel):
    ssh_username: Optional[str] = Field(None, max_length=100, description="ssh用户")
    ssh_password: Optional[str] = Field(None, max_length=100, description="ssh密码")
    ssh_key: Optional[str] = Field(None, max_length=100, description="sshkey 公钥的SHA256")
    is_ssh: bool = Field(..., description="是否开启ssh")
    notebook_id: int = Field(..., description="notebook id")
    project_id: int = Field(..., description="项目id")


class NotebookSSHConfigUpdate(BaseModel):
    is_ssh: bool = Field(..., description="是否开启ssh")
    ssh_username: Optional[str] = Field(None, max_length=100, description="ssh用户")
    ssh_password: Optional[str] = Field(None, max_length=100, description="ssh密码")

    @model_validator(mode='after')
    def check_ssh(self) -> 'NotebookSSHConfigUpdate':
        if self.is_ssh:
            if self.ssh_username is None and self.ssh_password is None:
                raise ValueError('开启 SSH 时至少需要填写 ssh_username 或 ssh_password')

            if self.ssh_username is not None and not bool(re.fullmatch(r'[A-Za-z]+', self.ssh_username)):
                raise ValueError('用户名限制为全英文')

            if self.ssh_password is not None:
                if len(self.ssh_password) < 8:
                    raise ValueError('密码长度不能少于 8 位')
                has_upper = bool(re.search(r'[A-Z]', self.ssh_password))
                has_lower = bool(re.search(r'[a-z]', self.ssh_password))
                has_digit = bool(re.search(r'\d', self.ssh_password))

                classes = sum([has_upper, has_lower, has_digit])
                if classes < 2:
                    raise ValueError('密码必须包含大写字母、小写字母、数字中的至少两类')
        return self

class NotebookDetailResponse(NotebookBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    running_hours: Optional[int] = Field(None, description="时")
    running_minutes: Optional[int] = Field(None, description="分")
    running_seconds: Optional[int] = Field(None, description="秒")
    ssh_username: Optional[str] = Field(None, max_length=100, description="ssh用户")
    ssh_key: Optional[str] = Field(None, max_length=100, description="sshkey 公钥的SHA256")
    ssh_url: Optional[str] = Field(None, max_length=100, description="sshkey 公钥的SHA256")
    max_runtime_minutes: Optional[int] = Field(None, description="Notebook 实例最大运行分钟数（超时后自动停止）")
    ext: Optional[Dict[str, Any]] = Field(default={}, description='{"model":"A800","memory":"80G","category":"GPU"}')
    dataset_names: Optional[Dict[str, List[str]]] = Field(None, description="关联的数据集名称，格式：{\"training\": [\"数据集1\", \"数据集2\"], \"validation\": [\"数据集3\"], \"test\": [\"数据集4\"], \"inference_result\": [\"推理结果集1\"], \"machine_learning_dataset\": [\"机器学习数据集1\"]}")
    model_names: Optional[Dict[str, List[str]]] = Field(None, description="关联的模型名称，格式：{\"base_models\": [\"基础模型1\", \"基础模型2\"], \"finetuned_models\": [\"微调模型1\"], \"machine_learning_models\": [\"机器学习模型1\"]}")
    ports: Optional[List[NotebookPortItem]] = Field(
        default=None,
        description="Notebook 端口与访问地址列表",
    )
    model_service_name: Optional[str] = Field(None, description="在线推理服务名称")
    created_id: Optional[int] = Field(None, description='创建者用户ID')
    created_by: str = Field(None, description='创建者用户名称')

class NotebookResponse(NotebookBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    max_runtime_minutes: Optional[int] = Field(None, description="Notebook 实例最大运行分钟数（超时后自动停止）")
    running_hours: Optional[int] = Field(None, description="时")
    running_minutes: Optional[int] = Field(None, description="分")
    running_seconds: Optional[int] = Field(None, description="秒")
    ssh_username: Optional[str] = Field(None, description="ssh用户")
    is_ssh: Optional[bool] = Field(None, description="是否支持ssh")
    can_operate: bool = Field(True, description="当前用户是否可操作该 Notebook")
    operation_denied_reason: Optional[str] = Field(None, description="不可操作原因")
    ext: Optional[Dict[str, Any]] = Field(default={}, description='{"model":"A800","memory":"80G","category":"GPU"}')
    created_id: Optional[int] = Field(None, description='创建者用户ID')
    created_by: str = Field(None, description='创建者用户名称')
    ports: Optional[List[NotebookPortItem]] = Field(
        default=None,
        description="Notebook 端口与访问地址列表（与详情一致）",
    )


class ExampleNotebookBase(BaseModel):
    """Notebook 案例基础模型"""
    name: str = Field(..., max_length=255, description="案例名称")
    describe: Optional[str] = Field(None, description="描述")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="用户名")
    is_available: bool = Field(default=False, description="是否可用（False=不可用，True=可用）")
    biz_type: Optional[NotebookBizType] = Field(NotebookBizType.LLM, description="业务类型：llm(大模型训练)/machine_learning(机器学习)")


class ExampleNotebookCreate(ExampleNotebookBase):
    """创建 Notebook 案例请求模型"""
    pass


class ExampleNotebookUpdate(BaseModel):
    """更新 Notebook 案例请求模型"""
    name: str = Field(..., max_length=255, description="案例名称")
    describe: Optional[str] = Field(None, description="描述")


class ExampleNotebookResponse(ExampleNotebookBase, BaseModelWithTimezone):
    """Notebook 案例响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime


class PublishNotebookAsExampleRequest(BaseModel):
    """发布 Notebook 为案例的请求模型"""
    name: str = Field(..., max_length=255, description="案例名称")
    describe: Optional[str] = Field(None, description="案例描述")


class PublishNotebookAsExampleResponse(BaseModel):
    """发布 Notebook 为案例的响应模型"""
    celery_task_id: str = Field(..., description="Celery 任务ID")
    message: str = Field(..., description="提示信息")


class UploadExampleImageResponse(BaseModel):
    """上传案例图片响应模型"""
    image_url: str = Field(..., description="图片访问地址")


class ExampleNotebookPermissionResponse(BaseModel):
    """当前用户是否具备案例编辑/删除权限"""
    has_permission: bool = Field(..., description="当前用户是否具备案例编辑/删除权限")


class NotebookVisibilityPermissionResponse(BaseModel):
    """Notebook 可见但是否可操作"""
    can_operate: bool = Field(..., description="当前用户是否可操作该 Notebook")
    reason: Optional[str] = Field(None, description="不可操作原因")


class NotebookFilesResponse(BaseModel):
    """根据 Notebook 查询工作目录文件列表"""
    project_id: int = Field(..., description="项目ID")
    notebook_id: int = Field(..., description="Notebook ID")
    path: str = Field("/", description="查询的工作目录子路径")
    files: List[Dict] = Field(default_factory=list, description="文件或目录名称列表")

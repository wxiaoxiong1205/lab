from typing import Dict, List, Optional
from sqlalchemy import Column, Integer, String, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped
from app.common.status import TaskStatus
from app.models.models import baseModel
from app.schemas.inference_task import BackendEnum


class InferenceTask(baseModel):
    """推理任务表，包含推理配置等信息"""
    __tablename__ = "inference_tasks"

    server_name: Mapped[str] = Column(String(100), nullable=False, comment="推理任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="推理任务描述")
    model_id: Mapped[int] = Column(Integer, nullable=False, comment="关联模型ID（基础模型或训练模型）")
    model_source: Mapped[str] = Column(String(50), nullable=False, comment="模型来源（base_model/trained_model/ml_model）")
    model_path: Mapped[str] = Column(String(1024), nullable=False, comment="模型存储路径")
    model_name: Mapped[str] = Column(String(255), nullable=False, comment="关联模型名称")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    desired_replicas: Mapped[int] = Column(Integer, nullable=False, default=1, comment="期望部署实例数")
    ready_replicas: Mapped[int] = Column(Integer, nullable=False, default=0, comment="已就绪实例数")
    status: Mapped[str] = Column(String(50), nullable=False, default=TaskStatus.CREATED, comment="任务状态")
    inference_engine_type: Mapped[str] = Column(String(50), nullable=False, default=BackendEnum.VLLM, comment="推理引擎类型")
    image_id: Mapped[int] = Column(Integer, nullable=False, comment="关联镜像ID")
    image_name: Mapped[str] = Column(String(255), nullable=False, comment="关联镜像名称")
    run_command: Mapped[str] = Column(String, nullable=False, comment="推理运行命令")
    backend_parameters: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, comment="推理引擎参数列表")
    env_vars: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="环境变量字典")
    gpu_count: Mapped[int] = Column(Integer, nullable=False, default=1, comment="GPU数量（向后兼容字段，从 graphics_card_resource.count 同步）")
    gpu_type: Mapped[str] = Column(String(64), nullable=True,
                                   comment="GPU/NPU 类型（例如 nvidia.com/gpu、huawei.com/npu）")
    graphics_card_resource: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="GPU/NPU 资源配置（包含 card_type, card_model, count, card_memory, k8s_resource_type）")
    lab_k8s_uuid: Mapped[str] = Column(String(100), nullable=True, comment="自定义k8s uuid")
    namespace: Mapped[str] = Column(String(64), nullable=False, comment="K8s 命名空间")
    access_url: Mapped[str] = Column(String(512), nullable=True,
                                     comment="推理实例的访问地址（服务启动后暴露给用户可访问的 URL）")
    k8s_service_nodeport: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="K8s 服务端口名称")
    resource_cpu_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="CPU资源配置（包含 resource_cpu_request, resource_cpu_limit, resource_memory_request, resource_memory_limit）")


class InferenceTaskMlHandle(baseModel):
    """推理任务 ML 处理脚本关联表，存 inference_tasks.id；仅 model_source=ml_model 时有记录"""
    __tablename__ = "inference_task_ml_handles"

    inference_task_id: Mapped[int] = Column(
        Integer,
        nullable=False,
        comment="推理任务 ID（inference_tasks.id），由业务方维护一致性",
    )
    ml_handle_upload_id: Mapped[Optional[str]] = Column(
        String(100), nullable=True, comment="ML 部署推理处理脚本对应的分片上传 uploadId",
    )
    ml_handle_jfs_path: Mapped[Optional[str]] = Column(
        String(512), nullable=True, comment="推理处理脚本在 JuiceFS 上的落库路径（model_handle/model.py）",
    )
    ml_handle_source_type: Mapped[Optional[str]] = Column(
        String(32),
        nullable=True,
        comment="model.py 来源：upload / notebook（部署详情回显；历史数据可能为空）",
    )
    notebook_id: Mapped[Optional[int]] = Column(
        Integer,
        nullable=True,
        comment="来源为 notebook 时的 Notebook 主键（部署详情回显）",
    )
    handle_source_ref: Mapped[Optional[str]] = Column(
        String(500),
        nullable=True,
        comment="Notebook 工作区内用于部署的 .py 相对路径（与 ml_model_config.handle_source_ref 语义一致；upload 来源为空）",
    )

    __table_args__ = (
        UniqueConstraint("inference_task_id", name="uk_inference_task_ml_handle_task_id"),
    )

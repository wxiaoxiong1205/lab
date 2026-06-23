from typing import Optional, Dict
from sqlalchemy import Column, String, Index, Integer, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped
from datetime import datetime

from app.common.status import TaskStatus
from app.models.models import baseModel


class BaseModel(baseModel):
    """基础模型表，用于存储可用的预训练模型"""
    __tablename__ = "base_models"
    
    name: Mapped[str] = Column(String(100), nullable=False, comment="模型名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="模型描述")
    _model_type: Mapped[str] = Column("model_type", String(200), nullable=False, server_default="", comment="模型类型列表，逗号分隔，如 text-generation,image-generation")
    model_provider: Mapped[str] = Column(String(50), nullable=False, comment="模型提供商")
    model_path: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="模型路径")
    progress: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="下载进度")
    status: Mapped[str] = Column(String(200), nullable=True, comment="模型状态")
    _model_tags: Mapped[str] = Column("model_tags",String(200),nullable=True,server_default="",comment="模型标签列表，逗号分隔，存储固定标识，如 inference,training")
    model_source: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="来源")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    k8s_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="用于下载模型的K8s资源ID")
    lab_k8s_uuid: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="自定义k8s uuid")
    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="日志路径")

    # property 对应 Pydantic 字段
    @property
    def model_type(self) -> list[str]:
        """数据库读取 → List[str]"""
        if not self._model_type:
            return []
        return self._model_type.split(",")

    @model_type.setter
    def model_type(self, values):
        """
        支持几种输入：
        - List[ModelType]
        - List[str]
        - None
        - already comma string
        """
        if values is None:
            self._model_type = ""
            return

        # 如果已经是字符串 → 用户原样传入
        if isinstance(values, str):
            self._model_type = values
            return

        # 如果是 List[ModelType]
        if all(hasattr(v, "value") for v in values):
            self._model_type = ",".join(v.value for v in values)
            return

        # 如果是 List[str]
        if all(isinstance(v, str) for v in values):
            self._model_type = ",".join(values)
            return

        raise ValueError(f"model_type 接收到未知类型: {values!r}")

    @property
    def model_tags(self) -> list[str]:
        """数据库读取 → List[str]"""
        if not self._model_tags:
            return []
        return self._model_tags.split(",")

    @model_tags.setter
    def model_tags(self, values):
        """
        支持几种输入：
        - List[ModelTags]
        - List[str]
        - None
        - already comma string
        """
        if values is None:
            self._model_tags = None
            return

        # 如果已经是字符串 → 用户原样传入
        if isinstance(values, str):
            self._model_tags = values
            return

        # 如果是 List[ModelTags]
        if all(hasattr(v, "value") for v in values):
            self._model_tags = ",".join(v.value for v in values)
            return

        # 如果是 List[str]
        if all(isinstance(v, str) for v in values):
            self._model_tags = ",".join(values)
            return


        raise ValueError(f"model_tags 接收到未知类型: {values!r}")

    __table_args__ = (
        Index('idx_base_models_type', 'model_type'),
        Index('idx_base_models_provider', 'model_provider')
    )


class TrainedModel(baseModel):
    """训练后的模型表，用于管理训练完成的模型"""
    __tablename__ = "trained_models"
    
    # 模型基本信息
    name: Mapped[str] = Column(String(100), nullable=False, comment="模型名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="模型描述")
    model_type: Mapped[str] = Column(String(50), nullable=False, comment="模型类型")
    model_path: Mapped[str] = Column(String(200), nullable=True, comment="模型路径")
    model_version: Mapped[str] = Column(String(50), nullable=False, default="v1", comment="模型版本")
    
    # 关联任务信息
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="所属项目ID")
    task_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="关联的训练任务ID")
    task_name: Mapped[Optional[str]] = Column(String(255), nullable=True, comment="关联的训练任务名称")
    task_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="关联的训练任务版本号")
    
    # 训练相关字段
    base_model_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="基础模型ID")
    base_model_name: Mapped[Optional[str]] = Column(String(255), nullable=True, comment="基础模型名称")
    checkpoint: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="训练检查点路径或标识")
    notebook_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="关联的notebook任务ID")
    notebook_name: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="关联的notebook任务名称")
    model_source_type: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="模型来源类型")
    notebook_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="notebook文件地址")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    lab_k8s_uuid: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="自定义k8s uuid")
    # 任务状态
    status: Mapped[Optional[str]] = Column(String(50), nullable=True, default=TaskStatus.CREATED, comment="任务状态")

    # 执行信息
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="开始时间")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")
    estimated_duration: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="预计持续时间(秒)")

    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="日志路径")
    # 训练资源配置 (JSON) - 存储完整的 GPU/NPU 资源配置信息
    graphics_card_resource: Mapped[Optional[Dict]] = Column(JSON, nullable=True,
                                                            comment="GPU/NPU 资源配置（包含 card_type, card_model, count, card_memory, k8s_resource_type）")

    __table_args__ = (
        Index('idx_trained_models_task_id', 'task_id'),
        Index('idx_trained_models_base_model_id', 'base_model_id'),
        Index('idx_trained_models_type', 'model_type'),
    )


class MLModel(baseModel):
    """机器学习模型版本表（Notebook 等来源），用于模型管理与部署，不参与推理结果集"""
    __tablename__ = "ml_models"

    name: Mapped[str] = Column(String(100), nullable=False, comment="模型名称")
    model_version: Mapped[str] = Column(String(50), nullable=False, comment="版本号，如 V1, V2")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="模型/版本描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="所属项目ID")
    model_type: Mapped[str] = Column(String(50), nullable=False, comment="模型类型：text, image 等")
    annotation_type: Mapped[Optional[str]] = Column(
        String(128),
        nullable=True,
        comment="标注/任务大类第二层：text_classification, entity_recognition, image_classification 等与数据集对齐",
    )
    task_type: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="任务子类型：text-classification, entity-recognition 等")
    source_type: Mapped[str] = Column(String(50), nullable=False, comment="来源：notebook")
    notebook_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="关联 Notebook 主键（notebooks.id），创建时必填")
    source_ref: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="来源引用（如 Notebook 选中的模型标识/相对路径）")
    tokenizer_source_ref: Mapped[Optional[str]] = Column(
        String(500),
        nullable=True,
        comment="tokenizer 与 source_type 对齐：notebook 为工作区 tokenizer.json 相对路径；local_upload 文本模型为 tokenizer 分片 merge 的 uploadId",
    )
    network_structure: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="网络结构描述")
    artifact_uri: Mapped[Optional[str]] = Column(String(1024), nullable=True, comment="模型产物 JFS 完整路径")
    tokenizer_uri: Mapped[Optional[str]] = Column(String(1024), nullable=True, comment="tokenizer 产物 JFS 完整路径")
    status: Mapped[str] = Column(
        String(50),
        nullable=False,
        default=TaskStatus.CREATING.value,
        comment="状态：创建中（产物异步复制中）/ 已完成 / 失败（与 TaskStatus 中文值一致）",
    )

    __table_args__ = (
        UniqueConstraint('project_id', 'name', 'model_version', 'tenant_id', name='uq_ml_models_project_name_version_tenant'),
        Index('idx_ml_models_project_id', 'project_id'),
        Index('idx_ml_models_name', 'name'),
        Index('idx_ml_models_status', 'status'),
        Index('idx_ml_models_source_type', 'source_type'),
    )

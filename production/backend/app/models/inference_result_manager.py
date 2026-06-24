from datetime import datetime
from typing import Optional, Dict, List, Any
from sqlalchemy import Column, Integer, String, Index, Float, JSON, DateTime, Boolean
from sqlalchemy.orm import Mapped
from app.models.models import baseModel
from app.schemas.evaluation_task import InferenceParamType


class InferenceResultDataset(baseModel):
    """推理结果数据集表，用于管理推理结果数据集"""
    __tablename__ = "inference_result_datasets"
    
    # 基本信息
    name: Mapped[str] = Column(String(50), nullable=False, comment="数据集名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="数据集描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    
    # 推理方式：offline(离线推理)、online(在线推理)、import(导入推理结果集)
    inference_method: Mapped[str] = Column(String(20), nullable=False,
                                           comment="推理方式：offline离线推理, online在线推理, import导入推理结果集，third_api第三方api推理")
    
    # 模型/服务信息（根据推理方式不同，使用不同字段）
    model_source: Mapped[Optional[str]] = Column(String(50), nullable=True, default="base_model",
                                                  comment="模型来源：base_model基础模型, trained_model训练模型（离线推理使用）")
    model_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="待推理模型ID（base_models.id 或 trained_models.id）")
    model_name: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="待推理模型名称及版本（离线推理使用）")
    online_service_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="待推理服务ID（在线推理使用）")
    online_service_name: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="待推理服务名称及版本（在线推理使用）")
    
    # 待推理数据信息
    source_dataset_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="待推理数据ID（训练数据集ID）")
    source_dataset_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="待推理数据名称")
    
    # 待推理模型参数（JSON格式，字典，键为推理参数类型，值为参数值）
    inference_params: Optional[dict[InferenceParamType, Any]] = Column(JSON, nullable=True, comment="待推理模型参数（字典格式，键为推理参数类型枚举，值为参数值，可选键：temperature, top_p, max_tokens, presence_penalty）")
    
    # 显卡资源配置（JSON格式，包含 card_type, card_model, count, card_memory, k8s_resource_type）
    graphics_card_resource: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="GPU/NPU 资源配置（包含 card_type, card_model, count, card_memory, k8s_resource_type）")
    
    # 文件信息（导入推理结果集使用）
    file_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="文件路径（导入推理结果集使用）")
    file_size: Mapped[Optional[float]] = Column(Float, nullable=True, comment="文件大小(MB)")
    upload_method: Mapped[Optional[str]] = Column(String(20), nullable=True,
                                                  comment="上传方式：local本地上传, url_url获取（导入推理结果集使用）")
    
    # 数据集类型和格式（参考训练数据集的格式处理）
    dataset_type: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态")
    dataset_format: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式")

    # 数据集用途（推理结果集、业务推理结果集）
    # todo 推理结果数据集添加usage参数，区分业务推理结果集和普通推理结果集，业务推理结果集进行推理时，只能选择 【业务测试结果集】进行推理，默认default-inference
    # default-inference默认推理：非业务数据集推理方式，也就是老的推理结果数据集
    # business-inference业务推理：业务数据集推理方式，也就是新的业务推理结果数据集
    usage: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="数据集用途：default-inference默认推理、business-inference业务推理")

    # 数据统计信息
    total_items: Mapped[Optional[int]] = Column(Integer, nullable=True, default=0, comment="总数据量（推理结果项数量）")
    
    # 状态信息
    status: Mapped[str] = Column(String(50), nullable=False, default="created",
                                 comment="状态：created已创建, processing处理中, completed已完成, failed失败")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    progress: Mapped[int] = Column(Integer, nullable=False, default=0, comment="进度(0-100)")
    
    # K8s相关
    lab_k8s_uuid: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="自定义k8s uuid")
    celery_task_id: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="Celery任务ID")
    
    # 时间信息
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="开始时间")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")

    # 存储日志的路径
    log_path: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="存储日志的路径")

    manual_trigger_required: Mapped[Optional[bool]] = Column(Boolean, nullable=True, default=False,
                                                             comment="是否需要手动启动")
    
    # 处理错误信息（参考 training_datasets 的 processing_error 字段）
    processing_error: Mapped[Optional[str]] = Column(
        String(1000), 
        nullable=True, 
        comment="处理失败时的错误信息"
    )
    
    __table_args__ = (
        Index('idx_inference_result_datasets_project', 'project_id'),
        Index('idx_inference_result_datasets_method', 'inference_method'),
        Index('idx_inference_result_datasets_status', 'status'),
    )

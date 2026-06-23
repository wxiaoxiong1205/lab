from datetime import datetime
from typing import List, Dict, Optional, Any
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Text, Float
from sqlalchemy.orm import Mapped
from app.common.status import TaskStatus
from app.models.models import baseModel


class TrainingTask(baseModel):
    """训练任务表，包含训练配置和数据集信息"""
    __tablename__ = "training_tasks"
    
    # 基本信息
    name: Mapped[str] = Column(String(100), nullable=False, comment="训练任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="训练任务描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    version: Mapped[str] = Column(String(50), nullable=False, default="v1", comment="任务版本号")
    
    # 基础模型配置 (JSON)
    base_model: Mapped[Dict] = Column(JSON, nullable=False, comment="基础模型配置")
    
    # 训练类型配置 (JSON)
    training_type: Mapped[Dict] = Column(JSON, nullable=False, comment="训练类型配置")
    
    # 数据处理配置 (JSON)
    data_processing: Mapped[Dict] = Column(JSON, nullable=False, comment="数据处理配置")
    
    # 训练数据集列表 (JSON)
    dataset_items: Mapped[List[Dict]] = Column(JSON, nullable=False, default=list, comment="训练数据集列表")
    
    # 基础训练参数 (JSON)
    basic: Mapped[Dict] = Column(JSON, nullable=False, comment="基础训练参数")
    
    # 高级配置 (JSON)
    advanced: Mapped[Dict] = Column(JSON, nullable=False, comment="高级配置")
    
    # LoRA配置 (JSON)
    lora_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="LoRA训练配置")
    
    # DPO配置 (JSON)
    dpo_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="DPO训练配置")
    
    # 评估配置 (JSON)
    evaluation: Mapped[Dict] = Column(JSON, nullable=False, comment="评估配置")
    
    # 评估数据集列表 (JSON)
    eval_dataset_items: Mapped[List[Dict]] = Column(JSON, nullable=False, default=list, comment="评估数据集列表")
    
    # 保存配置 (JSON)
    save: Mapped[Dict] = Column(JSON, nullable=False, comment="保存配置")
    
    # 监控配置 (JSON)
    monitor: Mapped[Dict] = Column(JSON, nullable=False, comment="监控配置")
    
    # 自定义参数 (JSON)
    additional_params: Mapped[Dict] = Column(JSON, nullable=False, default=dict, comment="额外的训练参数")
    
    # 训练资源配置 (JSON) - 存储完整的 GPU/NPU 资源配置信息
    graphics_card_resource: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="GPU/NPU 资源配置（包含 card_type, card_model, count, card_memory, k8s_resource_type）")
    
    # 训练资源配置（向后兼容字段，保留用于快速查询）
    gpu_count: Mapped[int] = Column(Integer, nullable=False, default=1, comment="GPU数量（向后兼容字段，从 graphics_card_resource.count 同步）")
    
    # 自定义k8s uuid
    lab_k8s_uuid: Mapped[str] = Column(String(100), nullable=True, comment="自定义k8s uuid")

    # 任务状态
    status: Mapped[str] = Column(String(50), nullable=False, default=TaskStatus.CREATED, comment="任务状态")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")

    #status: Mapped[str] = Column(String(20), nullable=False, default="created", comment="任务状态：created, pending, running, completed, failed, cancelled")
    progress: Mapped[float] = Column(Float, nullable=False, default=0.0, comment="训练进度(0-100)")
    
    # 执行信息
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="开始时间")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")
    estimated_duration: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="预计持续时间(秒)")
    
    # 训练日志
    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="训练日志路径")
    # training_logs: Mapped[Optional[str]] = Column(Text, nullable=True, comment="训练日志")
    
    # 训练监控
    metrics_url: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="监控界面URL")
    
    # 模型输出路径
    model_output_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="训练模型在JFS上的实际存储路径")
    
    # Celery任务相关
    celery_task_id: Mapped[Optional[str]] = Column(String(255), nullable=True, comment="Celery任务ID")
    
    __table_args__ = (
        Index('idx_training_tasks_project', 'project_id'),
        Index('idx_training_tasks_status', 'status'),
        Index('idx_training_tasks_name', 'name'),
    )
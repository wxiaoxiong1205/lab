from typing import Dict, Optional
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Float, Boolean, BigInteger
from sqlalchemy.orm import Mapped
from app.models.models import baseModel


class DataCleaningTask(baseModel):
    """清洗任务表（输入/输出数据集与版本）"""
    __tablename__ = "data_cleaning_tasks"
    
    # 基本信息
    name: Mapped[str] = Column(String(128), nullable=False, comment="清洗任务名称")
    project_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联项目ID")
    
    # 数据来源
    source: Mapped[str] = Column(String(50), nullable=False, default="existed_dataset", comment="数据来源：existed_dataset/upload")
    
    # 输入/输出数据集
    input_dataset_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="输入数据集ID")
    output_dataset_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="输出数据集ID")
    
    # 策略配置
    override: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否覆盖原版本（清洗策略）")
    
    # 任务状态（使用 TaskStatus 枚举值）
    status: Mapped[str] = Column(String(16), nullable=False, default="排队中", comment="任务状态：创建/排队中/启动中/运行中/已完成/失败/终止/停止")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    
    # 算子配置（任务不关联模板ID，模板仅用于复用配置）
    steps_snapshot: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="算子配置快照（执行时锁定）")
    
    # 字段选择
    selected_fields: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="选择的字段列表（用于指定需要清洗的字段）")
    
    # 统计信息
    total_samples: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总样本数")
    total_characters: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总字符数")
    file_size: Mapped[Optional[float]] = Column(Float, nullable=True, comment="文件大小（MB）")
    
    # 数据集路径
    dataset_path: Mapped[Optional[str]] = Column(String(256), nullable=True, comment="输入数据集文件路径")
    output_path: Mapped[Optional[str]] = Column(String(256), nullable=True, comment="输出数据集文件路径")
    log_path: Mapped[Optional[str]] = Column(String(256), nullable=True, comment="日志文件路径")
    
    # Celery 和 K8s 相关
    celery_task_id: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="Celery任务ID")
    lab_k8s_uuid: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="K8s资源UUID标识")
    
    # 错误信息
    error_message: Mapped[Optional[str]] = Column(String(1024), nullable=True, comment="错误信息")
    
    # 时间相关
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="开始时间")
    completed_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")
    
    __table_args__ = (
        Index('idx_data_cleaning_tasks_project', 'project_id'),
        Index('idx_data_cleaning_tasks_status', 'status'),
        Index('idx_data_cleaning_tasks_input_dataset', 'input_dataset_id'),
    )


class DataCleaningTemplate(baseModel):
    """清洗模板表"""
    __tablename__ = "data_cleaning_templates"
    
    # 基本信息
    project_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联项目ID（0表示全局内置模板）")
    
    # 是否系统内置模板
    is_builtin: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否系统内置模板")
    
    # 算子流程配置
    steps_json: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="算子流程配置JSON")
    
    __table_args__ = (
        Index('idx_data_cleaning_templates_project', 'project_id'),
    )

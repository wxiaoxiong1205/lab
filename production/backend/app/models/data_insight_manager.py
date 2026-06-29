from datetime import datetime
from typing import Dict, Optional

from sqlalchemy import Column, DateTime, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped

from app.models.models import baseModel


class DataInsightTask(baseModel):
    """数据洞察任务表。"""
    __tablename__ = "data_insight_tasks"

    name: Mapped[str] = Column(String(100), nullable=False, comment="任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="任务描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目ID")
    source_dataset_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="源数据集ID")
    source_dataset_name: Mapped[str] = Column(String(100), nullable=False, comment="源数据集名称")
    source_dataset_version: Mapped[str] = Column(String(50), nullable=False, comment="源数据集版本")
    source_dataset_usage: Mapped[str] = Column(String(50), nullable=False, comment="源数据集用途")
    dataset_type: Mapped[str] = Column(String(50), nullable=False, comment="数据集类型")
    training_method_type: Mapped[str] = Column(String(50), nullable=False, comment="训练方法类型")
    dataset_format: Mapped[str] = Column(String(50), nullable=False, comment="数据格式")
    status: Mapped[str] = Column(String(50), nullable=False, default="completed", comment="任务状态")
    config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="任务配置")
    result_summary: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="洞察结果摘要")
    result_samples: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="洞察样本分页缓存")
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment="错误信息")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")

    __table_args__ = (
        Index("idx_data_insight_tasks_project", "project_id"),
        Index("idx_data_insight_tasks_status", "status"),
    )


class DataAugmentationTask(baseModel):
    """数据增强任务表。"""
    __tablename__ = "data_augmentation_tasks"

    name: Mapped[str] = Column(String(100), nullable=False, comment="任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="任务描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目ID")
    source_dataset_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="增强前数据集ID")
    source_dataset_name: Mapped[str] = Column(String(100), nullable=False, comment="增强前数据集名称")
    source_dataset_version: Mapped[str] = Column(String(50), nullable=False, comment="增强前数据集版本")
    source_dataset_usage: Mapped[str] = Column(String(50), nullable=False, comment="增强前数据集用途")
    output_dataset_name: Mapped[str] = Column(String(100), nullable=False, comment="增强后数据集名称")
    output_dataset_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="增强后数据集版本")
    dataset_type: Mapped[str] = Column(String(50), nullable=False, comment="数据集类型")
    training_method_type: Mapped[str] = Column(String(50), nullable=False, comment="训练方法类型")
    dataset_format: Mapped[str] = Column(String(50), nullable=False, comment="数据格式")
    status: Mapped[str] = Column(String(50), nullable=False, default="completed", comment="任务状态")
    config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="增强配置")
    result_summary: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="增强结果摘要")
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment="错误信息")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")

    __table_args__ = (
        Index("idx_data_augmentation_tasks_project", "project_id"),
        Index("idx_data_augmentation_tasks_status", "status"),
    )

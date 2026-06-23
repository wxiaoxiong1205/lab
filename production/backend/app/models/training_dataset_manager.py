from typing import Dict, Optional, List

from sqlalchemy import Column, Integer, String, JSON, Index, Float
from sqlalchemy.orm import Mapped

from app.models.models import baseModel


class TrainingDataset(baseModel):
    """数据集表，用于管理训练、验证和测试用的数据集"""
    __tablename__ = "training_datasets"
    
    # 基本信息
    name: Mapped[str] = Column(String(100), nullable=False, comment="数据集名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="数据集描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    version: Mapped[str] = Column(String(50), nullable=False, default="v1", comment="数据集版本号")
    
    # 数据集类型和配置
    dataset_type: Mapped[str] = Column(String(50), nullable=False, comment="数据集类型：文本生成, 图像生成, 图像理解等")
    training_method_type: Mapped[str] = Column(String(50), nullable=False, comment="训练方法类型：sft, dpo等")
    dataset_format: Mapped[str] = Column(String(50), nullable=False, comment="数据格式：prompt-response, role-based, prefix-suffix-middle")
    usage: Mapped[str] = Column(String(20), nullable=False, default="training", comment="数据集用途：training训练数据集, validation验证数据集, test测试数据集")
    dataset_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="数据集配置信息")
    metadata_fields: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, comment="数据集字段元数据，上传解析完成后生成")
    
    # 数据集统计信息
    total_samples: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总样本数")
    total_characters: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总字符数")
    file_size: Mapped[Optional[float]] = Column(Float, nullable=True, comment="文件大小(MB)")
    
    # 数据集路径
    dataset_path: Mapped[str] = Column(String(500), nullable=False, default="", comment="数据集文件路径")
    
    # 处理状态相关字段
    processing_status: Mapped[str] = Column(
        String(20), 
        nullable=False, 
        default="completed",
        comment="处理状态：pending处理中, completed处理完成, failed处理失败"
    )
    processing_error: Mapped[Optional[str]] = Column(
        String(1000), 
        nullable=True, 
        comment="处理失败时的错误信息"
    )
    temp_file_path: Mapped[Optional[str]] = Column(
        String(500), 
        nullable=True, 
        comment="临时文件路径（处理完成后删除）"
    )
    
    __table_args__ = (
        Index('idx_training_datasets_project', 'project_id'),
        Index('idx_training_datasets_type', 'dataset_type'),
    )

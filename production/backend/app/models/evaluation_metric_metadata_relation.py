from typing import Optional
from sqlalchemy import Column, Integer, String, Index, ForeignKey
from sqlalchemy.orm import Mapped
from app.models.models import baseModel


class EvaluationMetricMetadataRelation(baseModel):
    """评估指标与数据集元数据字段关联表
    
    用于存储系统指标和评估任务中使用的数据集元数据字段的绑定关系
    """
    __tablename__ = "evaluation_metric_metadata_relations"
    
    id: Mapped[int] = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    metric_id: Mapped[int] = Column(Integer, nullable=False, comment="评估指标ID（关联evaluation_metrics表）")
    evaluation_task_id: Mapped[int] = Column(Integer, nullable=False, comment="评估任务ID（关联evaluation_tasks表）")
    metadata_field: Mapped[str] = Column(String(200), nullable=False, comment="元数据字段名称（如：model_response、standard_response、metadata.prompt_length等）")
    metrics_param_field: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="模板中定义的指标参数字段名（映射到evaluation_prompt_config中的content_fields，如：Model Response、Standard Response等）")
    
    __table_args__ = (
        Index('idx_evaluation_metric_metadata_metric', 'metric_id'),
        Index('idx_evaluation_metric_metadata_task', 'evaluation_task_id'),
        Index('idx_evaluation_metric_metadata_field', 'metadata_field'),
        Index('uk_evaluation_metric_metadata', 'metric_id', 'evaluation_task_id', 'metadata_field', 'tenant_id', unique=True),
    )


from typing import Optional, List, Dict
from sqlalchemy import Column, Integer, String, Index, JSON, Boolean
from sqlalchemy.orm import Mapped
from app.models.models import baseModel


class MetricType:
    """指标类型常量"""
    BASIC_METRIC = "basic_metric"  # 基础评估指标
    REFEREE_SYSTEM_METRIC = "referee_system_metric"  # 裁判员评估系统指标


class EvaluationMetrics(baseModel):
    """评估指标表，用于存储基础评估指标和裁判员评估系统指标
    
    基础评估指标（metric_type=basic_metric）只读，不提供增删改接口
    裁判员评估系统指标（metric_type=referee_system_metric）支持增删改查
    """
    __tablename__ = "evaluation_metrics"
    
    id: Mapped[int] = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = Column(String(50), nullable=False, comment="指标名称（如：准确率、F1、ROUGE-1等）")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="指标说明")
    metric_code: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="指标代码（用于程序识别，如：accuracy、f1、rouge-1等），仅基础评估指标使用")
    metric_type: Mapped[str] = Column(String(20), nullable=False, default=MetricType.BASIC_METRIC, comment="指标类型：basic_metric基础评估指标, referee_system_metric裁判员评估系统指标")
    project_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="关联项目ID（仅裁判员评估系统指标使用，基础评估指标为NULL）")
    score_scope: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, comment="指标分值范围列表（JSON格式，存储多个分值范围，每个范围包含score_min、score_max、score_definitions，如：[{\"score_min\": 0, \"score_max\": 10, \"score_definitions\": \"0分表示完全不符合，10分表示完全符合\"}]）")
    metrics_param: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, comment="指标参数列表（JSON格式，存储MetricsParam枚举值的列表，如：[\"input\", \"actual_output\"]）")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="排序顺序")
    is_builtin: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否为系统内置指标（True表示系统默认指标，不可编辑/删除）")
    
    __table_args__ = (
        Index('idx_evaluation_metrics_code', 'metric_code'),
        Index('idx_evaluation_metrics_type', 'metric_type'),
        Index('idx_evaluation_metrics_project', 'project_id'),
        Index('idx_evaluation_metrics_tenant_id', 'tenant_id'),
    )


from datetime import datetime
from typing import Optional, Dict, List
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Text, Numeric
from sqlalchemy.orm import Mapped
from app.models.models import baseModel


class EvaluationTask(baseModel):
    """评估任务表，用于管理模型评估任务"""
    __tablename__ = "evaluation_tasks"
    
    # 基本信息
    name: Mapped[str] = Column(String(100), nullable=False, comment="任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="任务描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    version: Mapped[str] = Column(String(50), nullable=False, default="v1", comment="任务版本号（重新评估时自动递增）")
    parent_task_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="父任务ID（重新评估时关联原始任务ID，首次创建为NULL）")
    
    # 评估配置
    evaluation_type: Mapped[str] = Column(String(20), nullable=False, comment="评估类型：single单个评估, comparison对比评估")
    data_source: Mapped[str] = Column(String(20), nullable=False, comment="评估数据来源：existing已有推理结果集, new新建推理结果集")
    dataset_format: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="数据格式：prompt-response/role-based/prefix-suffix-middle等")
    evaluation_method: Mapped[str] = Column(String(20), nullable=False, comment="评估方法：referee裁判员评估, basic_metric基础指标评估, all同时进行两种评估, manual人工评估")
    
    # 裁判员评估配置
    referee_model_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="裁判模型/服务ID（裁判员评估时使用）")
    referee_model_name: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="裁判模型/服务名称")
    referee_model_source: Mapped[Optional[str]] = Column(String(20), nullable=True, comment="裁判模型来源：base_model基础模型, trained_model训练模型（仅referee_type=model时有效）")
    referee_type: Mapped[Optional[str]] = Column(String(20), nullable=True, comment="裁判资源类型：model离线模型, service在线服务（裁判员评估时使用）")
    graphics_card_resource: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="GPU/NPU 资源配置（裁判员评估离线推理时使用，包含 card_type, card_model, count, card_memory, k8s_resource_type）")
    referee_inference_params: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="裁判模型推理参数配置（裁判员评估时使用）")
    evaluation_prompt_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="评估Prompt配置（裁判员评估时使用）")
    
    # 基础指标评估配置
    basic_metric_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="基础指标配置（基础指标评估时使用）")
    
    # 人工评估配置（人工评估时使用）
    dataset_type: Mapped[Optional[str]] = Column(String(20), nullable=True, comment="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（人工评估时使用，模型评估时为NULL）")
    sampling_rate: Mapped[Optional[float]] = Column(Numeric(5, 2), nullable=True, comment="数据采样率（0-100，NULL表示不采样，人工评估时使用）")
    total_items: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总评估项数（人工评估时使用，模型评估时为NULL）")
    completed_items: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="已完成评估项数（人工评估时使用，模型评估时为NULL）")
    
    # 状态信息
    status: Mapped[str] = Column(String(50), nullable=False, default="created", comment="状态：created已创建, processing处理中, completed已完成, failed失败, annotating标注中（人工评估时使用）")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    progress: Mapped[int] = Column(Integer, nullable=False, default=0, comment="进度(0-100)")
    
    # K8s相关
    lab_k8s_uuid: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="自定义k8s uuid")
    celery_task_id: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="Celery任务ID")
    
    # 结果文件路径（存储在JuiceFS中）
    result_file_path: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, comment="评估结果明细文件路径列表（存储在JuiceFS中）")
    
    # 时间信息
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="开始时间")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment="错误信息")

    # 存储日志的路劲
    log_path: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="存储日志的路劲")
    
    __table_args__ = (
        Index('idx_evaluation_tasks_project', 'project_id'),
        Index('idx_evaluation_tasks_status', 'status'),
        Index('idx_evaluation_tasks_type', 'evaluation_type'),
        Index('idx_evaluation_tasks_method', 'evaluation_method'),
        Index('idx_evaluation_tasks_parent', 'parent_task_id'),
        Index('idx_evaluation_tasks_name_version', 'name', 'version', 'tenant_id'),
    )


class EvaluationTaskDatasetModelRelation(baseModel):
    """评估任务-推理结果集-待评估模型关联表，用于明确表示评估任务中推理结果集与待评估模型的对应关系"""
    __tablename__ = "evaluation_task_dataset_model_relation"
    
    evaluation_task_id: Mapped[int] = Column(Integer, nullable=False, comment="关联评估任务ID")
    inference_result_dataset_id: Mapped[int] = Column(Integer, nullable=False, comment="关联推理结果集ID")
    inference_result_dataset_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="推理结果集名称（冗余字段，便于查询）")
    evaluated_model_id: Mapped[int] = Column(Integer, nullable=False, comment="待评估模型/服务ID")
    evaluated_model_name: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="待评估模型/服务名称（冗余字段，便于查询）")
    evaluated_model_source: Mapped[Optional[str]] = Column(String(20), nullable=True, comment="待评估模型来源：base_model基础模型, trained_model训练模型, service在线服务（离线推理时区分base/trained）")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="排序顺序（用于对比评估时确定显示顺序）")
    api_params: Mapped[Dict] = Column(JSON, nullable=True , comment="api参数")
    
    __table_args__ = (
        Index('idx_evaluation_task_dataset_model_task', 'evaluation_task_id'),
        Index('idx_evaluation_task_dataset_model_dataset', 'inference_result_dataset_id'),
        Index('idx_evaluation_task_dataset_model_model', 'evaluated_model_id'),
        Index('idx_evaluation_task_dataset_model_task_dataset', 'evaluation_task_id', 'inference_result_dataset_id'),
        Index('idx_evaluation_task_dataset_model_task_model', 'evaluation_task_id', 'evaluated_model_id'),
        Index('uk_evaluation_task_dataset_model', 'evaluation_task_id', 'inference_result_dataset_id', 'evaluated_model_id', 'tenant_id', unique=True),
    )


class EvaluationReport(baseModel):
    """评估报告汇总表，用于存储评估任务的汇总统计信息"""
    __tablename__ = "evaluation_reports"
    
    evaluation_task_id: Mapped[int] = Column(Integer, nullable=False, comment="关联评估任务ID")
    evaluated_model_id: Mapped[int] = Column(Integer, nullable=False, comment="待评估模型/服务ID")
    evaluated_model_name: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="待评估模型/服务名称")
    evaluated_model_source: Mapped[Optional[str]] = Column(String(20), nullable=True, comment="待评估模型来源：base_model基础模型, trained_model训练模型, service在线服务")
    evaluation_method: Mapped[str] = Column(String(20), nullable=False, comment="评估方法：referee裁判员评估, basic_metric基础指标评估（task和report是一对多的，此时不会出现all的情况）")
    calculation_method: Mapped[Optional[str]] = Column(String(20), nullable=True, comment="计算方式（兼容字段，已废弃，使用metric_summary中的aggregative_metrics）")
    metric_summary: Mapped[Optional[List]] = Column(JSON, nullable=True, comment="聚合指标数组，格式：[{\"calculation_method\": \"average\", \"metric_summary\": {...}}, ...]")
    comparison_data: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="对比报告数据（对比评估时使用）")
    
    __table_args__ = (
        Index('idx_evaluation_reports_task', 'evaluation_task_id'),
        Index('idx_evaluation_reports_model', 'evaluated_model_id'),
        Index('idx_evaluation_reports_task_model', 'evaluation_task_id', 'evaluated_model_id'),
        Index('idx_evaluation_reports_method', 'evaluation_method'),
        Index('uk_evaluation_reports_task_model_method', 'evaluation_task_id', 'evaluated_model_id', 'evaluation_method', 'tenant_id', unique=True),
    )


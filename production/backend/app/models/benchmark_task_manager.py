from datetime import datetime
from typing import Optional, Dict, List
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Text, Boolean, BigInteger, Float
from sqlalchemy.dialects.postgresql import JSONB, ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped

from app.common.status import TaskStatus
from app.models.models import baseModel


class BenchmarkTask(baseModel):
    """基准评估任务表"""
    __tablename__ = "benchmark_tasks"
    
    name: Mapped[str] = Column(String(100), nullable=False, comment="任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="任务描述")
    project_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联项目ID")
    model_type: Mapped[str] = Column(String(20), nullable=False, comment="模型类型：model离线模型/service在线服务")
    model_provider: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="在线服务模型提供商，仅 model_type=service 时有效")
    inference_params: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="推理参数配置（如 temperature、max_tokens 等，键为推理参数类型枚举值）")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    schedule_enabled: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否启用定时任务")
    schedule_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="定时配置（cron表达式等）")
    status: Mapped[str] = Column(String(50), nullable=False, default=TaskStatus.CREATED.value, comment="状态：创建/排队中/运行中/已完成/失败/终止")
    progress: Mapped[int] = Column(Integer, nullable=False, default=0, comment="进度(0-100)")
    lab_k8s_uuid: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="K8s Job UUID")
    celery_task_id: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="Celery任务ID")
    graphics_card_resource: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="GPU/NPU资源配置")
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="开始时间")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment="错误信息")
    result_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="评估结果文件路径")
    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="日志文件路径")
    
    __table_args__ = (
        Index('idx_benchmark_tasks_project', 'project_id'),
        Index('idx_benchmark_tasks_status', 'status'),
    )


class BenchmarkTaskModelRelation(baseModel):
    """基准评估任务-模型关联表"""
    __tablename__ = "benchmark_task_model_relation"
    
    benchmark_task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联基准评估任务ID")
    model_id: Mapped[int] = Column(BigInteger, nullable=False, comment="待评估模型/服务ID")
    model_name: Mapped[str] = Column(String(200), nullable=False, comment="模型/服务名称")
    model_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="模型版本")
    model_type: Mapped[str] = Column(String(20), nullable=False, comment="模型类型：model/service")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="排序顺序")
    
    __table_args__ = (
        Index('idx_benchmark_task_model_task', 'benchmark_task_id'),
        Index('idx_benchmark_task_model_model', 'model_id'),
        Index('uk_benchmark_task_model', 'benchmark_task_id', 'model_id', 'tenant_id', unique=True),
    )


class BenchmarkTaskDatasetRelation(baseModel):
    """基准评估任务-数据集关联表（存 dataset_code + invoke_name，与 OpenCompass / BenchmarkResult 一致）"""
    __tablename__ = "benchmark_task_dataset_relation"
    
    benchmark_task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联基准评估任务ID")
    dataset_code: Mapped[str] = Column(String(100), nullable=False, comment="数据集代码（OpenCompass 标识符，展示时按 code 查 BenchmarkDataset 取 id/name）")
    invoke_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="调用时使用的模块名，如 gsm8k_gen；为空则用 code+_gen")
    export_var: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="OpenCompass 配置导出的变量名，如 LCB_datasets；为空则用 {code}_datasets")

    __table_args__ = (
        Index('idx_benchmark_task_dataset_task', 'benchmark_task_id'),
        Index('idx_benchmark_task_dataset_code', 'dataset_code'),
        Index('uk_benchmark_task_dataset', 'benchmark_task_id', 'dataset_code', 'tenant_id', unique=True),
    )


class BenchmarkDataset(baseModel):
    """基准评估数据集表"""
    __tablename__ = "benchmark_datasets"
    
    name: Mapped[str] = Column(String(100), nullable=False, comment="数据集名称")
    code: Mapped[str] = Column(String(100), nullable=False, comment="数据集代码（OpenCompass标识符）")
    invoke_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="调用时使用的模块名，如 gsm8k_gen；为空则用 code+_gen")
    export_var: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="OpenCompass 配置导出的变量名，如 LCB_datasets；为空则用 {code}_datasets")
    language: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="语言：英文/中文/数学等")
    original_sample_count: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="原始样本数")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="说明")
    category: Mapped[str] = Column(String(50), nullable=False, comment="分类：language_understanding语言理解/knowledge学科/math数学/reasoning推理/code代码")
    model_types: Mapped[Optional[List[str]]] = Column(PG_ARRAY(String), nullable=True, comment="适用模型类型：text-generation/image-generation/image-understanding/multimodal，为空表示兼容全部")
    is_builtin: Mapped[bool] = Column(Boolean, nullable=False, default=True, comment="是否为系统内置数据集")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="排序顺序")
    
    __table_args__ = (
        Index('idx_benchmark_datasets_code', 'code'),
        Index('idx_benchmark_datasets_category', 'category'),
        Index('uk_benchmark_datasets_code', 'code', 'tenant_id', unique=True),
    )


class BenchmarkResult(baseModel):
    """评估结果表"""
    __tablename__ = "benchmark_results"
    
    benchmark_task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联基准评估任务ID")
    model_id: Mapped[int] = Column(BigInteger, nullable=False, comment="待评估模型/服务ID")
    model_name: Mapped[str] = Column(String(200), nullable=False, comment="模型/服务名称")
    model_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="模型版本")
    dataset_code: Mapped[str] = Column(String(100), nullable=False, comment="数据集代码")
    score: Mapped[float] = Column(Float, nullable=False, comment="评估分数")
    
    __table_args__ = (
        Index('idx_benchmark_results_task', 'benchmark_task_id'),
        Index('idx_benchmark_results_model', 'model_id'),
        Index('idx_benchmark_results_dataset_code', 'dataset_code'),
        Index('uk_benchmark_results', 'benchmark_task_id', 'model_id', 'dataset_code', 'tenant_id', unique=True),
    )


class BenchmarkLeaderboard(baseModel):
    """基准评估榜单表"""
    __tablename__ = "benchmark_leaderboard"
    
    project_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联项目ID")
    model_id: Mapped[int] = Column(BigInteger, nullable=False, comment="模型/服务ID")
    model_name: Mapped[str] = Column(String(200), nullable=False, comment="模型/服务名称")
    model_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="模型版本")
    average_score: Mapped[float] = Column(Float, nullable=False, default=0.0, comment="平均得分（各数据集平均值）")
    dataset_scores: Mapped[Optional[Dict]] = Column(JSONB, nullable=True, comment="各数据集得分（JSON格式）")
    last_task_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="最近一次评估任务ID")
    last_evaluated_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="最近一次评估时间")
    
    __table_args__ = (
        Index('idx_benchmark_leaderboard_project', 'project_id'),
        Index('idx_benchmark_leaderboard_model', 'model_id'),
        Index('idx_benchmark_leaderboard_score', 'average_score'),
        Index('uk_benchmark_leaderboard_model', 'project_id', 'model_id', 'tenant_id', unique=True),
    )

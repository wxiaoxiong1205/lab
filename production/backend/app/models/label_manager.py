from typing import Dict, Optional, List
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Float, Boolean, BigInteger, UniqueConstraint
from sqlalchemy.orm import Mapped
from sqlalchemy.dialects.postgresql import JSONB
from app.models.models import baseModel


class LabelDataset(baseModel):
    """标注数据集表，用于管理标注数据集的基本信息"""
    __tablename__ = "label_datasets"
    
    # 基本信息
    name: Mapped[str] = Column(String(100), nullable=False, comment="标注数据集名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="标注数据集描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    
    # 数据来源
    source: Mapped[str] = Column(String(50), nullable=False, comment="数据来源：existed_dataset/upload")
    source_dataset_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="来源数据集ID")
    submit_dataset_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="提交数据集ID")
    override: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否覆盖原版本")
    
    # 数据集类型和格式
    dataset_type: Mapped[str] = Column(String(50), nullable=False, comment="标注类型：文本/图像/图像理解等")
    dataset_format: Mapped[str] = Column(String(50), nullable=False, comment="数据格式：prompt-response, role-based, prefix-suffix-middle")
    task_type: Mapped[str] = Column(String(20), nullable=False, comment="任务类型：online（在线）/ multi（多人）")
    
    # 数据集统计信息
    total_samples: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总样本数")
    total_characters: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="总字符数")
    file_size: Mapped[Optional[float]] = Column(Float, nullable=True, comment="文件大小（MB）")
    
    # 数据集路径
    dataset_path: Mapped[str] = Column(String(500), nullable=False, comment="数据集文件路径")
    
    __table_args__ = (
        Index('idx_label_datasets_project', 'project_id'),
        Index('idx_label_datasets_type', 'dataset_type'),
    )


class LabelMachineLearningDataset(baseModel):
    """机器学习标注任务数据集表（与 label_datasets 分离）"""
    __tablename__ = "label_machine_learning_datasets"

    name: Mapped[str] = Column(String(100), nullable=False, comment="标注任务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="标注任务描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联项目ID")
    source_dataset_id: Mapped[int] = Column(BigInteger, nullable=False, comment="来源机器学习数据集ID")
    submit_dataset_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="提交数据集ID")
    override: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否覆盖原版本")

    task_type: Mapped[str] = Column(String(50), nullable=False, comment="任务类型")
    data_type: Mapped[Optional[str]] = Column(String(32), nullable=True, comment="数据类型")
    annotation_type: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="标注类型")
    template_type: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="标注模板")

    # 机器学习类别信息快照（创建任务时固化）
    class_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="类别数量")
    label_schema_json: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="类别映射快照")

    total_samples: Mapped[int] = Column(Integer, nullable=False, default=0, comment="总样本数")
    dataset_path: Mapped[str] = Column(String(500), nullable=False, comment="dataset.jsonl 路径")

    __table_args__ = (
        Index('idx_label_ml_datasets_project', 'project_id'),
        Index('idx_label_ml_datasets_source', 'source_dataset_id'),
    )


class LabelTask(baseModel):
    """标注任务表：在线/多人标注任务"""
    __tablename__ = "label_tasks"
    
    # 任务基本信息
    biz_type: Mapped[str] = Column(String(32), nullable=False, default="llm", comment="任务业务类型：llm/machine_learning")
    task_type: Mapped[str] = Column(String(16), nullable=False, comment="任务类型：online/multi")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="任务描述")
    label_dataset_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联的标注数据集ID")
    status: Mapped[str] = Column(String(16), nullable=False, comment="任务状态")
    
    # 多人标注相关字段
    audit_sampling_ratio: Mapped[int] = Column(Integer, nullable=False, default=100, comment="审核抽检比例（1-100，默认100%）")
    
    __table_args__ = (
        Index('idx_label_tasks_biz_type', 'biz_type'),
        Index('idx_label_tasks_dataset', 'label_dataset_id'),
        Index('idx_label_tasks_type', 'task_type'),
    )


class LabelProgress(baseModel):
    """标注进度统计（按成员）"""
    __tablename__ = "label_progress"
    
    task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="任务ID")
    user_id: Mapped[int] = Column(BigInteger, nullable=False, comment="成员用户ID（在线标注为创建者）")
    assigned_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="分配样本数")
    saved_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="暂存样本数")
    final_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="最终提交样本数")
    
    __table_args__ = (
        Index('idx_label_progress_task', 'task_id'),
        Index('idx_label_progress_user', 'user_id'),
    )


class LabelAutoModel(baseModel):
    """模型/服务注册表（AI自动标注配置）"""
    __tablename__ = "label_auto_models"
    
    task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="任务ID")
    model_id: Mapped[int] = Column(BigInteger, nullable=False, comment="关联模型ID")
    param_config_json: Mapped[Optional[Dict]] = Column(JSON, nullable=True, comment="参数配置JSON")
    
    __table_args__ = (
        Index('idx_label_auto_models_task', 'task_id'),
    )


class LabelTaskMember(baseModel):
    """标注任务成员表（截止时间到人：每个标注员/审核员各自 deadline）"""
    __tablename__ = "label_task_members"
    
    task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="任务ID")
    user_id: Mapped[int] = Column(BigInteger, nullable=False, comment="成员用户ID")
    role: Mapped[str] = Column(String(16), nullable=False, comment="成员角色：annotator（标注员）/auditor（审核员）")
    assign_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="分配样本数量")
    deadline: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="该成员的截止时间（到人）")
    
    __table_args__ = (
        Index('idx_label_task_members_task', 'task_id'),
        Index('idx_label_task_members_user', 'user_id'),
        Index('idx_label_task_members_role', 'role'),
    )


class LabelAuditProgress(baseModel):
    """审核进度统计（按审核员）"""
    __tablename__ = "label_audit_progress"
    
    task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="任务ID")
    auditor_id: Mapped[int] = Column(BigInteger, nullable=False, comment="审核员ID")
    assigned_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="分配审核样本数")
    reviewed_passed_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="审核通过样本数")
    reviewed_failed_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="审核不通过样本数")
    submitted_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="已提交审核数；>0 表示本轮已点击提交，禁止再次操作；返工后 REWORK→AUDITING 时置 0 以便继续审")
    
    __table_args__ = (
        Index('idx_label_audit_progress_task', 'task_id'),
        Index('idx_label_audit_progress_auditor', 'auditor_id'),
    )


class LabelTaskAssignmentRule(baseModel):
    """分配规则表（核心表：保证分配的样本下次进来还是他之前标注/审核的那些）"""
    __tablename__ = "label_task_assignment_rules"
    
    task_id: Mapped[int] = Column(BigInteger, nullable=False, comment="任务ID")
    role: Mapped[str] = Column(String(16), nullable=False, comment="成员角色：annotator（标注员）/auditor（审核员）")
    user_ids: Mapped[List[int]] = Column(JSONB, nullable=False, comment="用户ID列表（JSON数组），如 [123, 456]")
    assign_counts: Mapped[List[int]] = Column(JSONB, nullable=False, comment="每个用户的分配数量列表（JSON数组），如 [500, 500]")
    random_seed: Mapped[int] = Column(Integer, nullable=False, comment="随机种子（用于打乱分配顺序）")
    total_samples: Mapped[int] = Column(Integer, nullable=False, comment="总样本数")
    
    __table_args__ = (
        UniqueConstraint('task_id', 'role', name='uk_task_assignment_rules_task_role'),
        Index('idx_label_task_assignment_rules_task_role', 'task_id', 'role'),
    )


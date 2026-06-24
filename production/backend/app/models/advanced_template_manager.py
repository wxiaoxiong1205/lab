from typing import List, Optional

from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped

from app.models.models import baseModel


class AdvancedTemplate(baseModel):
    """高级模板主表。"""

    __tablename__ = "advanced_templates"

    name: Mapped[str] = Column(String(100), nullable=False, comment="模板名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="模板描述")
    domain: Mapped[str] = Column(String(50), nullable=False, comment="使用领域，如 training/evaluation/inference/deployment")
    template_type: Mapped[str] = Column(String(50), nullable=False, comment="模板类型，如 grpo/sft/rag_eval")
    status: Mapped[str] = Column(String(20), nullable=False, default="draft", comment="状态：draft/enabled/disabled")
    visibility: Mapped[str] = Column(String(20), nullable=False, default="system", comment="可见性：system/project/private")
    yaml_content: Mapped[Optional[str]] = Column(Text, nullable=True, comment="YAML内容")
    root_template_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="根模板ID，同一模板版本族共享")
    version: Mapped[int] = Column(Integer, nullable=False, default=1, comment="版本号")
    is_current: Mapped[bool] = Column(Boolean, nullable=False, default=True, comment="是否当前版本")

    __table_args__ = (
        UniqueConstraint("name", "domain", "template_type", "version", "tenant_id", name="uq_advanced_templates_name_domain_type_version_tenant"),
        Index("idx_advanced_templates_domain_type", "domain", "template_type"),
        Index("idx_advanced_templates_status", "status"),
        Index("idx_advanced_templates_root_version", "root_template_id", "version"),
        Index("idx_advanced_templates_current", "root_template_id", "is_current"),
    )


class AdvancedTemplateField(baseModel):
    """高级模板字段表。"""

    __tablename__ = "advanced_template_fields"

    template_id: Mapped[int] = Column(Integer, ForeignKey("advanced_templates.id"), nullable=False, comment="模板ID")
    field_name: Mapped[str] = Column(String(100), nullable=False, comment="字段名")
    category: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="一级分类")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="字段描述")
    field_type: Mapped[str] = Column(String(50), nullable=False, comment="字段类型：int/float/string/bool/enum/json")
    enum_options: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, comment="枚举选项列表")
    default_value: Mapped[Optional[str]] = Column(Text, nullable=True, comment="默认值，按字段类型解析")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="排序")
    required: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否必填")
    enabled: Mapped[bool] = Column(Boolean, nullable=False, default=True, comment="是否启用")

    __table_args__ = (
        UniqueConstraint("template_id", "field_name", name="uq_advanced_template_fields_template_field"),
        Index("idx_advanced_template_fields_template", "template_id"),
        Index("idx_advanced_template_fields_category", "template_id", "category"),
        Index("idx_advanced_template_fields_order", "template_id", "sort_order"),
    )


class AdvancedTemplateTaskReference(baseModel):
    """模板任务引用表。"""

    __tablename__ = "advanced_template_task_references"

    task_type: Mapped[str] = Column(String(50), nullable=False, comment="任务类型，如 training/evaluation/inference")
    task_id: Mapped[int] = Column(Integer, nullable=False, comment="任务ID")
    template_id: Mapped[int] = Column(Integer, ForeignKey("advanced_templates.id"), nullable=False, comment="模板ID")

    __table_args__ = (
        UniqueConstraint("task_type", "task_id", "tenant_id", name="uq_advanced_template_task_references_task_tenant"),
        Index("idx_advanced_template_task_references_template", "template_id"),
    )

from typing import Dict, Optional

from sqlalchemy import Boolean, Column, Index, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped

from app.models.models import baseModel


class TrainingParameterTemplate(baseModel):
    """Reusable training parameter template."""

    __tablename__ = "training_parameter_templates"

    name: Mapped[str] = Column(String(100), nullable=False, comment="模板名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="模板描述")
    training_method: Mapped[str] = Column(String(50), nullable=False, default="rft-grpo", comment="训练方法")
    fine_tune_type: Mapped[str] = Column(String(20), nullable=False, comment="参数类型: full/lora")
    template_content: Mapped[str] = Column(Text, nullable=False, comment="YAML模板内容")
    params: Mapped[Dict] = Column(JSON, nullable=False, default=dict, comment="解析后的训练参数")
    enabled: Mapped[bool] = Column(Boolean, nullable=False, default=True, comment="是否启用")

    __table_args__ = (
        UniqueConstraint("tenant_id", "training_method", "name", name="uq_training_param_template_name"),
        Index("idx_training_param_template_method_enabled", "training_method", "enabled"),
    )

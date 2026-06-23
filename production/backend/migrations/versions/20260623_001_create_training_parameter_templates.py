"""create training parameter templates

Revision ID: 20260623_001
Revises:
Create Date: 2026-06-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260623_001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "training_parameter_templates",
        sa.Column("name", sa.String(length=100), nullable=False, comment="模板名称"),
        sa.Column("description", sa.String(length=1000), nullable=True, comment="模板描述"),
        sa.Column("training_method", sa.String(length=50), nullable=False, comment="训练方法"),
        sa.Column("fine_tune_type", sa.String(length=20), nullable=False, comment="参数类型: full/lora"),
        sa.Column("template_content", sa.Text(), nullable=False, comment="YAML模板内容"),
        sa.Column("params", sa.JSON(), nullable=False, comment="解析后的训练参数"),
        sa.Column("enabled", sa.Boolean(), nullable=False, comment="是否启用"),
        sa.Column("id", sa.Integer(), nullable=False, comment="主键ID"),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_id", sa.BigInteger(), nullable=True, comment="创建者用户ID"),
        sa.Column("created_by", sa.String(length=100), nullable=True, comment="创建者用户名称"),
        sa.Column("tenant_id", sa.String(length=32), nullable=False, comment="租户ID"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "training_method", "name", name="uq_training_param_template_name"),
    )
    op.create_index(
        "idx_training_param_template_method_enabled",
        "training_parameter_templates",
        ["training_method", "enabled"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_training_param_template_method_enabled", table_name="training_parameter_templates")
    op.drop_table("training_parameter_templates")

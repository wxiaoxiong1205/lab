"""dataset version operations

Revision ID: 20260626_dataset_ops
Revises: 20260626_v115_data
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260626_dataset_ops"
down_revision = "20260626_v115_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_version_operations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_id", sa.BigInteger(), nullable=True),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.Column("tenant_id", sa.String(length=32), nullable=False),
        sa.Column("operation_id", sa.String(length=64), nullable=False),
        sa.Column("dataset_kind", sa.String(length=32), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("operation_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("row_numbers", sa.JSON(), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("removed_count", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=False), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_id", name="uq_dataset_version_operations_operation_id"),
    )
    op.create_index("idx_dataset_version_operations_dataset", "dataset_version_operations", ["dataset_kind", "dataset_id"])
    op.create_index("idx_dataset_version_operations_status", "dataset_version_operations", ["status"])
    op.create_index("idx_dataset_version_operations_type", "dataset_version_operations", ["operation_type"])


def downgrade() -> None:
    op.drop_index("idx_dataset_version_operations_type", table_name="dataset_version_operations")
    op.drop_index("idx_dataset_version_operations_status", table_name="dataset_version_operations")
    op.drop_index("idx_dataset_version_operations_dataset", table_name="dataset_version_operations")
    op.drop_table("dataset_version_operations")

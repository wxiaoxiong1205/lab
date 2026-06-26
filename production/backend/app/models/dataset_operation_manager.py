from datetime import datetime
from typing import List, Optional

from sqlalchemy import Column, DateTime, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped

from app.models.models import baseModel


class DatasetVersionOperation(baseModel):
    """数据集版本操作任务表，用于记录删除行等可恢复的后台操作。"""

    __tablename__ = "dataset_version_operations"

    operation_id: Mapped[str] = Column(String(64), nullable=False, unique=True, comment="操作ID")
    dataset_kind: Mapped[str] = Column(String(32), nullable=False, comment="数据集类型：llm_dataset/machine_learning_dataset")
    dataset_id: Mapped[int] = Column(Integer, nullable=False, comment="数据集版本ID")
    version: Mapped[str] = Column(String(50), nullable=False, comment="版本号")
    operation_type: Mapped[str] = Column(String(32), nullable=False, comment="操作类型：delete_rows")
    status: Mapped[str] = Column(String(32), nullable=False, default="queued", comment="状态：queued/running/succeeded/failed")
    row_numbers: Mapped[List[int]] = Column(JSON, nullable=False, default=list, comment="操作影响的全局行号")
    requested_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="请求删除数量")
    removed_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="实际删除数量")
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment="失败原因")
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="完成时间")

    __table_args__ = (
        Index("idx_dataset_version_operations_dataset", "dataset_kind", "dataset_id"),
        Index("idx_dataset_version_operations_status", "status"),
        Index("idx_dataset_version_operations_type", "operation_type"),
    )

from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas import BaseModelWithTimezone


class BaseSchema(BaseModelWithTimezone):
    id: Optional[int] = Field(None, description="主键id")
    created_at: Optional[datetime] = Field(..., description="创建时间")
    updated_at: Optional[datetime] = Field(..., description="更新时间")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="用户名")
    # 所有表必须包含 tenant_id 字段（存储租户标识）
    tenant_id: Optional[str] = Field(None, description="租户id")


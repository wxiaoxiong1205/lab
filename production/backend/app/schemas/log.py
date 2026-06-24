from datetime import datetime
from typing import Optional, List

from pydantic import Field, BaseModel

from app.schemas.base import BaseSchema


class OperatorLogsResponse(BaseSchema):
    account: Optional[str] = Field(..., description="账号")
    ip_addres: Optional[str] = Field(None, description="ip地址")
    table_name: Optional[str] = Field(None, description="表名")
    function_name: Optional[str] = Field(None, description="功能名")
    operation_type: Optional[str] = Field(None, description="操作类型")
    operation_content: Optional[str] = Field(None, description="操作内容")
    audit_status: Optional[int] = Field(None, description="审计状态", alias="logAudStatus")
    audit_reason: Optional[str] = Field(None, description="审计原因", alias="logAudReason")
    audit_time: Optional[datetime] = Field(None, description="审计时间", alias="logAudTime")

    class Config:
        # 允许同时使用属性名和别名
        populate_by_name = True

class OperatorLogsRequest(BaseModel):
    account: Optional[str] = Field(None, description="账号")
    created_by: Optional[str] = Field(None, description="用户名")
    ip_addres: Optional[str] = Field(None, description="ip地址")
    table_name: Optional[str] = Field(None, description="表名")
    function_name: Optional[str] = Field(None, description="功能名")
    operation_type: Optional[str] = Field(None, description="操作类型")
    operation_content: Optional[str] = Field(None, description="操作内容")
    start_time: Optional[datetime] = Field(None, description="开始时间")
    end_time: Optional[datetime] = Field(None, description="结束时间")
    audit_status: Optional[int] = Field(None, description="审计状态", alias="logAudStatus")
    audit_reason: Optional[str] = Field(None, description="审计原因", alias="logAudReason")

    class Config:
        # 允许同时使用属性名和别名
        populate_by_name = True

class BatchApprovalUpdateRequest(BaseModel):
    ids: List[int] = Field(None, description="审计数据id列表")
    audit_status: Optional[int] = Field(None, description="审计状态", alias="logAudStatus")
    audit_reason: Optional[str] = Field(None, description="审计原因", alias="logAudReason")
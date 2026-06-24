"""
任务日志相关的Schema模型
"""
from typing import List
from pydantic import BaseModel, Field


class TaskLogEntry(BaseModel):
    """任务日志条目模型"""
    timestamp: str = Field(..., description="时间戳")
    level: str = Field(..., description="日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)")
    message: str = Field(..., description="日志消息")


class TaskLogsResponse(BaseModel):
    """任务日志响应模型"""
    logs: List[TaskLogEntry] = Field(..., description="日志列表")
    start: int = Field(..., description="下一次查询的起始位置")


class TaskLogQuery(BaseModel):
    """任务日志查询参数模型"""
    start: int = Field(0, ge=0, description="起始位置（从0开始）")
    limit: int = Field(20, ge=1, le=100, description="限制条数（1-100）") 
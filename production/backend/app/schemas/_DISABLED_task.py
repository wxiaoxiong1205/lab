from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import Field, ConfigDict, field_validator
from app.schemas.common import BaseModelWithTimezone, BaseModel

class TaskBase(BaseModel):
    """任务基础模型"""
    name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    prompt_messages: Optional[Dict[str, Any]] = Field(None, description="提示消息内容")
    llm_config_content: Optional[Dict[str, Any]] = Field(None, description="LLM配置内容")
    task_type: str = Field("answer-generation", description="任务类型")
    variable_mappings: Optional[Dict[str, str]] = Field(None, description="变量映射")

class TaskCreate(TaskBase):
    """创建任务请求模型"""
    directory_id: Optional[int] = Field(None, description="数据集目录ID，用于按目录筛选")
    prompt_id: Optional[int] = Field(None, description="提示词ID（兼容模式）")
    llm_config_id: Optional[int] = Field(None, description="LLM配置ID（兼容模式）")

class TaskUpdate(BaseModel):
    """更新任务请求模型"""
    name: Optional[str] = Field(None, description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    variable_mappings: Optional[Dict[str, str]] = Field(None, description="变量映射")

class TaskResponse(TaskBase, BaseModelWithTimezone):
    """任务响应模型"""
    id: int = Field(..., description="任务ID")
    status: str = Field(..., description="任务状态")
    progress: float = Field(..., description="任务进度 (0-100)")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    started_at: Optional[datetime] = Field(None, description="开始时间")
    
    celery_task_id: Optional[str] = Field(None, description="Celery任务ID")
    log_path: Optional[str] = Field(None, description="日志文件路径")
    total_count: Optional[int] = Field(0, description="任务总处理数据条数")
    processed_count: Optional[int] = Field(0, description="已处理数据条数")
    successful_count: Optional[int] = Field(0, description="成功处理数据条数")
    failed_count: Optional[int] = Field(0, description="失败处理数据条数")
    error_message: Optional[str] = Field(None, description="错误信息")
    finished_at: Optional[datetime] = Field(None, description="完成时间（成功或失败）")

    @field_validator('total_count', 'processed_count', 'successful_count', 'failed_count', mode='before')
    @classmethod
    def convert_none_to_zero(cls, v):
        """将None值转换为0，确保计数字段永远不为None"""
        return 0 if v is None else v

class TaskListResponse(BaseModel):
    """任务列表响应模型"""
    total: int = Field(..., description="任务总数")
    tasks: List[TaskResponse] = Field(..., description="任务列表")
    model_config = ConfigDict(from_attributes=True)

class TaskStatusUpdate(BaseModel):
    """任务状态更新请求模型"""
    action: str = Field(..., description="操作类型 (start, pause, resume, cancel)")

 
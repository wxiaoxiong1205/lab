from datetime import datetime
from typing import List, Optional, Dict, Any, Literal, Union
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.common import BaseModelWithTimezone

class DatasetLogResponse(BaseModelWithTimezone):
    """数据集执行日志响应模型"""
    id: int
    dataset_id: Optional[int] = None
    project_id: int
    question: str
    context: Optional[str] = None
    output: Optional[str] = None
    last_message: Optional[str] = None
    ground_truth: Optional[str] = None
    
    # 执行上下文信息
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    task_id: Optional[int] = None
    task_name: Optional[str] = None
    log_type: Optional[str] = None
    
    # 模型和提示信息
    prompt_id: Optional[int] = None
    prompt_title: Optional[str] = None
    prompt_content: Optional[str] = None
    prompt_template_format: Optional[str] = None
    
    model_id: Optional[int] = None
    model_name: Optional[str] = None
    model_provider: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    
    # 输入和元数据
    input_values: Optional[Dict] = None
    meta_info: Optional[Dict] = None
    llm_config_content: Optional[Dict] = None  # LLM配置内容
    prompt_messages: Optional[Union[Dict, List[Dict]]] = None  # 提示消息可以是字典或字典列表
    tools_called: Optional[List] = None  # 调用的工具列表
    
    # 执行状态信息
    success: bool
    error_message: Optional[str] = None
    execution_time_ms: Optional[int] = None
    
    # 时间信息
    created_at: datetime
    ttft_ms : Optional[int] = None
    


class DatasetLogSearch(BaseModel):
    """数据集执行日志搜索条件"""
    dataset_id: Optional[int] = Field(None, description="数据集ID，用于查询特定数据集的日志")
    question: Optional[str] = Field(None, description="问题模糊搜索")
    prompt_id: Optional[int] = Field(None, description="提示ID")
    model_id: Optional[int] = Field(None, description="模型ID")
    success: Optional[bool] = Field(None, description="是否成功")
    request_id: Optional[str] = Field(None, description="请求ID")
    session_id: Optional[str] = Field(None, description="会话ID")
    
    created_after: Optional[datetime] = Field(None, description="创建时间晚于")
    created_before: Optional[datetime] = Field(None, description="创建时间早于")
    
    sort_by: Literal["created_at", "execution_time_ms", "question"] = Field(
        default="created_at",
        description="排序字段"
    )
    sort_order: Literal["asc", "desc"] = Field(
        default="desc",
        description="排序方向"
    )

class DatasetLogListResponse(BaseModel):
    """数据集执行日志列表响应"""
    total: int = Field(..., description="日志总数")
    items: List[DatasetLogResponse] = Field(..., description="日志列表")
    
    model_config = ConfigDict(from_attributes=True)

class BatchDeleteRequest(BaseModel):
    """批量删除日志请求模型"""
    log_ids: List[int] = Field(..., description="要删除的日志ID列表") 
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
from app.schemas.common import BaseModelWithTimezone

# 工具相关Schema
class Tool(BaseModel):
    """工具信息模型"""
    name: str = Field(..., description="工具名称")
    description: Optional[str] = Field(None, description="工具描述")
    reasoning: Optional[str] = Field(None, description="使用此工具的推理过程")
    output: Optional[Any] = Field(None, description="工具输出结果")
    input_parameters: Optional[Dict[str, Any]] = Field(
        None, description="工具输入参数"
    )

# 数据集目录相关Schema
class DatasetDirectoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="目录名称")
    description: Optional[str] = Field(None, max_length=500, description="目录描述")
 

class DatasetDirectoryCreate(DatasetDirectoryBase):
    pass

class DatasetDirectoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="目录名称")
    description: Optional[str] = Field(None, max_length=500, description="目录描述")

class DatasetDirectoryResponse(BaseModelWithTimezone):
    id: int
    name: str
    description: Optional[str] = None
    project_id: int
    dataset_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }

# 数据集相关Schema
class DatasetBase(BaseModel):
    question: str = Field(..., min_length=1)
    meta_info: Optional[Dict[str, Any]] = Field(default_factory=dict)

    ground_truth: Optional[str] = None
    output: Optional[str] = None
    context: Optional[List[str]] = Field(default_factory=list, description="上下文信息列表")
    retrieval_context: Optional[List[str]] = Field(default_factory=list, description="检索上下文列表")
    tools_called: Optional[List[Tool]] = Field(default_factory=list, description="调用的工具列表")
    expected_tools: Optional[List[Tool]] = Field(default_factory=list, description="期望调用的工具列表")
    comments: Optional[str] = Field(None, description="数据集备注信息")

class DatasetCreate(DatasetBase):
    @classmethod
    def validate_meta_info(cls, meta_info: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        验证meta_info是否为合法的JSON结构
        
        Args:
            meta_info: 元数据信息
            
        Returns:
            验证后的meta_info
            
        Raises:
            ValueError: 如果JSON格式不合法
        """
        if meta_info is None:
            return {}
        return meta_info

class DatasetResponse(BaseModelWithTimezone):
    id: int
    question: str
    meta_info: Dict[str, Any]
    project_id: int
    directory_id: Optional[int] = None

    ground_truth: Optional[str] = None
    output: Optional[str] = None
    context: Optional[List[str]] = []
    retrieval_context: Optional[List[str]] = []
    tools_called: Optional[List[Tool]] = []
    expected_tools: Optional[List[Tool]] = []
    comments: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class DatasetSearch(BaseModel):
    question: Optional[str] = None
    # 标签功能已废弃，移除tag_match_type字段
    sort_by: Literal["created_at", "updated_at", "question"] = Field(
        default="created_at",
        description="排序字段"
    )
    sort_order: Literal["asc", "desc"] = Field(
        default="desc",
        description="排序方向"
    )
    created_after: Optional[datetime] = Field(
        default=None,
        description="创建时间晚于"
    )
    created_before: Optional[datetime] = Field(
        default=None,
        description="创建时间早于"
    )

class DatasetBatchDelete(BaseModel):
    dataset_ids: List[int] = Field(..., min_items=1, description="要删除的数据集ID列表")

class DatasetUpdate(BaseModel):
    question: Optional[str] = Field(None, min_length=1)
    meta_info: Optional[Dict[str, Any]] = None
    ground_truth: Optional[str] = None
    output: Optional[str] = None
    context: Optional[List[str]] = None
    retrieval_context: Optional[List[str]] = None
    tools_called: Optional[List[Tool]] = None
    expected_tools: Optional[List[Tool]] = None
    comments: Optional[str] = None
    
    @classmethod
    def validate_meta_info(cls, meta_info: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        验证meta_info是否为合法的JSON结构
        
        Args:
            meta_info: 元数据信息
            
        Returns:
            验证后的meta_info
            
        Raises:
            ValueError: 如果JSON格式不合法
        """
        if meta_info is None:
            return {}
        return meta_info 
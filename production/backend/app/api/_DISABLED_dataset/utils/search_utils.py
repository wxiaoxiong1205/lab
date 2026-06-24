from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_, or_, desc, asc, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB, array, TIMESTAMP

from app.models.models import Dataset, DatasetLog

def build_search_query(
    project_id: int,
    question: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    directory_id: Optional[int] = None
):
    """Build a search query for datasets
    
    Args:
        project_id: Project ID
        question: Optional search term for question field

        created_after: Optional filter for datasets created after this time
        created_before: Optional filter for datasets created before this time
        directory_id: Optional directory ID to filter datasets by directory
        
    Returns:
        SQLAlchemy query object
    """
    # Base query - filter by project
    query = select(Dataset).filter(Dataset.project_id == project_id)
    
    # Add question filter if provided
    if question:
        query = query.filter(Dataset.question.ilike(f"%{question}%"))
    

    
    # Add date range filters if provided
    if created_after:
        query = query.filter(Dataset.created_at >= created_after)
    if created_before:
        query = query.filter(Dataset.created_at <= created_before)
    
    # Add directory filter if provided
    if directory_id is not None:
        query = query.filter(Dataset.directory_id == directory_id)
    
    return query

def apply_sorting(
    query,
    sort_by: str = "created_at",
    sort_order: str = "desc"
):
    """Apply sorting to a query
    
    Args:
        query: SQLAlchemy query object
        sort_by: Field to sort by
        sort_order: Sort order ("asc" or "desc")
        
    Returns:
        SQLAlchemy query object with sorting applied
    """
    # Map sort field to model attribute
    sort_field_map = {
        "created_at": Dataset.created_at,
        "updated_at": Dataset.updated_at,
        "question": Dataset.question
    }
    
    sort_field = sort_field_map.get(sort_by, Dataset.created_at)
    
    # Apply sort order
    if sort_order == "asc":
        return query.order_by(asc(sort_field))
    else:
        return query.order_by(desc(sort_field))

async def execute_search_query(
    db: AsyncSession,
    query,
    skip: int = 0,
    limit: int = 10
) -> Dict[str, Any]:
    """Execute a search query and return results with pagination
    
    Args:
        db: Database session
        query: SQLAlchemy query object
        skip: Number of records to skip
        limit: Maximum number of records to return
        
    Returns:
        Dict containing results and pagination info
    """
    # Get total count
    count_query = query.with_only_columns(func.count()).order_by(None)
    total_count = await db.scalar(count_query)
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    # Execute query
    result = await db.execute(query)
    datasets = result.scalars().all()
    
    return {
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "data": datasets
    }

def convert_date_shorthand(date_string: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """将日期简写转换为日期范围
    
    支持格式:
    - "1d", "2d", ..., "nd": 表示从当前日期开始向前n天
    - 也可以直接接收datetime对象
    
    Args:
        date_string: 日期简写字符串，例如"1d", "7d"等
        
    Returns:
        (created_after, created_before): 转换后的起止日期元组
    """
    if not date_string:
        return None, None
        
    # 如果已经是datetime对象，直接返回
    if isinstance(date_string, datetime):
        return date_string, None
        
    try:
        # 处理类似"1d", "7d"等格式
        if isinstance(date_string, str) and date_string.endswith('d'):
            days = int(date_string[:-1])
            if days <= 0:
                raise ValueError("Days must be a positive integer")
                
            now = datetime.now(timezone.utc)
            if days == 1:
                # 1d表示今天
                created_after = now.replace(hour=0, minute=0, second=0, microsecond=0)
            else:
                # nd表示从n-1天前到今天
                created_after = (now - timedelta(days=days-1)).replace(hour=0, minute=0, second=0, microsecond=0)
                
            created_before = now.replace(hour=23, minute=59, second=59, microsecond=999999)
            return created_after, created_before
    except (ValueError, TypeError):
        # 如果解析失败，返回None
        pass
        
    return None, None

def build_dataset_log_search_query(
    project_id: int,
    dataset_id: Optional[int] = None,
    question: Optional[str] = None,
    prompt_id: Optional[int] = None,
    model_id: Optional[int] = None,
    success: Optional[bool] = None,
    request_id: Optional[str] = None,
    session_id: Optional[str] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    task_id: Optional[int] = None,
    log_type: Optional[str] = None,
    date_range: Optional[str] = None,
    exact_match: Optional[bool] = False
):
    """Build a search query for dataset logs
    
    Args:
        project_id: Project ID (required)
        dataset_id: Optional dataset ID to filter logs for a specific dataset
        question: Optional search term for question field
        prompt_id: Optional prompt ID
        model_id: Optional model ID
        success: Optional success status (True/False)
        request_id: Optional request ID
        session_id: Optional session ID
        created_after: Optional filter for logs created after this time
        created_before: Optional filter for logs created before this time
        task_id: Optional task ID to filter logs from a specific task
        log_type: Optional log type to filter (chat/job)
        date_range: Optional date range shorthand (e.g., "1d", "7d")
        exact_match: If True, use exact match for question; otherwise use fuzzy match (default: False)
        
    Returns:
        SQLAlchemy query object
    """
    # Base query - filter by project
    query = select(DatasetLog).filter(DatasetLog.project_id == project_id)
    
    # Apply filters if provided
    if dataset_id is not None:
        query = query.filter(DatasetLog.dataset_id == dataset_id)
    
    if question:
        # 根据exact_match参数决定使用精确匹配还是模糊匹配
        if exact_match:
            query = query.filter(DatasetLog.question == question)
        else:
            query = query.filter(DatasetLog.question.ilike(f"%{question}%"))
    
    if prompt_id is not None:
        query = query.filter(DatasetLog.prompt_id == prompt_id)
    
    if model_id is not None:
        query = query.filter(DatasetLog.model_id == model_id)
    
    if success is not None:
        query = query.filter(DatasetLog.success == success)
    
    if request_id:
        query = query.filter(DatasetLog.request_id == request_id)
    
    if session_id:
        query = query.filter(DatasetLog.session_id == session_id)
    
    # 添加任务ID过滤
    if task_id is not None:
        query = query.filter(DatasetLog.task_id == task_id)
    
    # 添加日志类型过滤
    if log_type is not None:
        query = query.filter(DatasetLog.log_type == log_type)
    
    # 处理日期范围简写
    if date_range:
        range_after, range_before = convert_date_shorthand(date_range)
        if range_after:
            created_after = range_after
        if range_before:
            created_before = range_before
    
    # Add date range filters if provided
    if created_after:
        # Ensure timezone awareness and cast to TIMESTAMP WITH TIME ZONE
        if created_after.tzinfo is None:
            created_after = created_after.replace(tzinfo=timezone.utc)
        query = query.filter(DatasetLog.created_at >= created_after.astimezone(timezone.utc))
    
    if created_before:
        # Ensure timezone awareness and cast to TIMESTAMP WITH TIME ZONE
        if created_before.tzinfo is None:
            created_before = created_before.replace(tzinfo=timezone.utc)
        query = query.filter(DatasetLog.created_at <= created_before.astimezone(timezone.utc))
        
    return query

def apply_dataset_log_sorting(
    query,
    sort_by: str = "created_at",
    sort_order: str = "desc"
):
    """Apply sorting to a dataset log query
    
    Args:
        query: SQLAlchemy query object
        sort_by: Field to sort by
        sort_order: Sort order ("asc" or "desc")
        
    Returns:
        SQLAlchemy query object with sorting applied
    """
    # Map sort field to model attribute
    sort_field_map = {
        "created_at": DatasetLog.created_at,
        "execution_time_ms": DatasetLog.execution_time_ms,
        "question": DatasetLog.question
    }
    
    sort_field = sort_field_map.get(sort_by, DatasetLog.created_at)
    
    # Apply sort order
    if sort_order == "asc":
        return query.order_by(asc(sort_field))
    else:
        return query.order_by(desc(sort_field)) 
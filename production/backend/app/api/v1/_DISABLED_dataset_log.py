from typing import Dict, List, Optional, Tuple
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
import logging

# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate

from app.database.base import get_db
from app.models.models import DatasetLog, User, JwtUserInfo
from app.schemas.log import DatasetLogResponse, BatchDeleteRequest
from app.api.dataset.utils import (
    validate_project,
    build_dataset_log_search_query,
    apply_dataset_log_sorting
)
from app.utils.dependencies import get_db_and_user
from fastapi import status
# 导入统一错误消息工具模块
from app.utils.error_messages import data_not_found_error

# 创建独立的路由器，添加前缀和标签，便于Swagger界面管理
router = APIRouter(prefix="/api/v1/dataset_logs", tags=["dataset-logs"])

@router.get("/project/{project_id}", response_model=Page[DatasetLogResponse])
async def list_dataset_logs(
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
    log_type: Optional[str] = Query(None, description="日志类型，如'chat'或'job'"),
    date_range: Optional[str] = Query(None, description="简化日期格式，如'1d'表示今天,'7d'表示最近7天"),
    exact_match: bool = Query(default=False, description="问题内容是否精确匹配，默认为模糊匹配"),
    sort_by: str = Query(default="created_at", enum=["created_at", "execution_time_ms", "question"]),
    sort_order: str = Query(default="desc", enum=["asc", "desc"]),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Page[DatasetLogResponse]:
    """获取项目的数据集执行日志列表，支持多种过滤和排序条件 - 使用 fastapi-pagination 进行分页
    
    Args:
        project_id: 项目ID
        dataset_id: 可选的数据集ID，用于过滤特定数据集的日志
        question: 可选的问题搜索词
        prompt_id: 可选的提示ID
        model_id: 可选的模型ID
        success: 可选的执行状态（成功/失败）
        request_id: 可选的请求ID
        session_id: 可选的会话ID
        created_after: 可选的创建时间下限
        created_before: 可选的创建时间上限
        task_id: 可选的任务ID
        log_type: 可选的日志类型（chat或job）
        date_range: 简化日期格式，如'1d'表示今天,'7d'表示最近7天
        exact_match: 问题内容是否精确匹配，默认为模糊匹配
        sort_by: 排序字段
        sort_order: 排序方向
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Page[DatasetLogResponse]: 分页的日志列表
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目
    await validate_project(db, project_id)
    
    # 构建查询
    query = build_dataset_log_search_query(
        project_id=project_id,
        dataset_id=dataset_id,
        question=question,
        prompt_id=prompt_id,
        model_id=model_id,
        success=success,
        request_id=request_id,
        session_id=session_id,
        created_after=created_after,
        created_before=created_before,
        task_id=task_id,
        log_type=log_type,
        date_range=date_range,
        exact_match=exact_match
    )
    
    # 应用排序
    query = apply_dataset_log_sorting(query, sort_by, sort_order)
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)

@router.get("/project/{project_id}/log/{log_id}", response_model=DatasetLogResponse)
async def get_dataset_log(
    project_id: int,
    log_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> DatasetLog:
    """获取特定的数据集执行日志详情
    
    Args:
        project_id: 项目ID
        log_id: 日志ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        DatasetLogResponse: 日志详情
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目
    await validate_project(db, project_id)
    
    # 获取日志
    result = await db.execute(
        select(DatasetLog).filter(
            DatasetLog.id == log_id,
            DatasetLog.project_id == project_id
        )
    )
    log = result.scalar_one_or_none()
    
    if not log:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )
    
    return log

@router.delete("/project/{project_id}/batch", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete_dataset_logs(
    project_id: int,
    request: BatchDeleteRequest = Body(...),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """批量删除数据集执行日志
    
    Args:
        project_id: 项目ID
        request: 包含要删除的日志ID列表的请求体
        deps: 组合依赖，包含数据库会话和当前用户
    
    Returns:
        None: 统一返回204状态码，无响应体内容
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目
    await validate_project(db, project_id)
    
    if not request.log_ids:
        raise HTTPException(
            status_code=400,
            detail="No log IDs provided for deletion"
        )
    
    # 批量删除日志
    result = await db.execute(
        delete(DatasetLog).where(
            DatasetLog.id.in_(request.log_ids),
            DatasetLog.project_id == project_id
        )
    )
    
    # 提交事务
    await db.commit()
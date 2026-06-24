import logging
from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from sqlalchemy.exc import IntegrityError

import json

from app.database.base import get_db
from app.models.models import Task, User, Dataset, JwtUserInfo
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskResponse,
    TaskStatusUpdate
)
from app.schemas.task_log import TaskLogsResponse
from app.utils.task_manager import (
    create_task,
    start_task, cancel_task, delete_task,retry_error_task
)
from app.utils.auth import get_current_user
from app.utils.dependencies import get_db_and_user  # 导入组合依赖函数
from app.tasks.constants import TaskStatus
from app.utils.redis_log_reader import get_task_logs, load_archived_logs_to_redis, redis_log_reader

# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate

# 导入统一错误消息工具模块
from app.utils.error_messages import data_not_found_error

from app.core.logging import logger

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

async def validate_task_belongs_to_project(db: AsyncSession, task_id: int, project_id: int) -> Task:
    """
    验证任务是否属于指定项目
    
    Args:
        db: 数据库会话
        task_id: 任务ID
        project_id: 项目ID
        
    Returns:
        Task: 验证通过的任务对象
        
    Raises:
        HTTPException: 任务不存在或不属于指定项目时抛出异常
    """
    query = select(Task).where(and_(Task.id == task_id, Task.project_id == project_id))
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    
    if not task:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )
    return task


@router.post("/by-project/{project_id}", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create(
    project_id: int = Path(..., description="项目ID"),
    task_data: TaskCreate = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Task:
    """
    在指定项目下创建新任务
    
    Args:
        project_id: 项目ID（路径参数）
        task_data: 任务创建数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        创建的任务对象
        
    Raises:
        HTTPException: 创建失败时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    try:
        # 创建任务，直接使用路径参数中的project_id
        task = await create_task(
            db=db,
            name=task_data.name,
            project_id=project_id,  # 使用路径参数中的project_id
            task_type=task_data.task_type,
            prompt_messages=task_data.prompt_messages,
            llm_config_content=task_data.llm_config_content,
            directory_id=task_data.directory_id,
            variable_mappings=task_data.variable_mappings,
            description=task_data.description,
            prompt_id=task_data.prompt_id,
            llm_config_id=task_data.llm_config_id
        )
        return task
    except Exception as e:
        logger.error(f"Error creating task in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating task: {str(e)}"
        )

@router.get("/by-project/{project_id}/list", response_model=Page[TaskResponse])
async def list(
    project_id: int = Path(..., description="项目ID"),
    status: Optional[str] = Query(None, description="任务状态筛选"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Page[TaskResponse]:
    """
    获取指定项目下的任务列表 - 使用 fastapi-pagination 进行分页
    
    Args:
        project_id: 项目ID（路径参数，必需）
        status: 任务状态（可选筛选条件）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        分页任务列表
    """
    db, current_user = deps  # 解包依赖
    
    # 构建查询条件 - 项目ID是必需条件
    conditions = [Task.project_id == project_id]
    
    # 添加状态过滤条件
    if status is not None:
        conditions.append(Task.status == status)
    
    # 构建查询
    query = select(Task).where(and_(*conditions))
    
    # 按创建时间降序排列
    query = query.order_by(Task.created_at.desc())
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)


@router.get("/by-project/{project_id}/task/{task_id}", response_model=TaskResponse)
async def get(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> TaskResponse:
    """
    获取指定项目下的任务详情
    
    Args:
        project_id: 项目ID（路径参数）
        task_id: 任务ID（路径参数）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        任务详情
        
    Raises:
        HTTPException: 任务不存在或不属于指定项目时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    # 验证任务是否属于指定项目
    task = await validate_task_belongs_to_project(db, task_id, project_id)
    
    return task

@router.patch("/by-project/{project_id}/task/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def update(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    task_data: TaskUpdate = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> TaskResponse:
    """
    更新指定项目下的任务
    
    Args:
        project_id: 项目ID（路径参数）
        task_id: 任务ID（路径参数）
        task_data: 任务更新数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        更新后的任务
        
    Raises:
        HTTPException: 任务不存在、不属于指定项目或状态不允许更新时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    # 验证任务是否属于指定项目
    task = await validate_task_belongs_to_project(db, task_id, project_id)
    
    # 检查任务状态是否允许更新
    if task.status not in TaskStatus.EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task with status {task.status} cannot be updated"
        )
    
    # 一次性更新所有字段
    update_data = task_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(task, field, value)
    
    # 更新时间戳
    task.updated_at = datetime.utcnow()
    
    # 一次性提交所有更改
    await db.commit()
    await db.refresh(task)
    
    return task

@router.post("/by-project/{project_id}/task/{task_id}/status", response_model=TaskResponse)
async def update_status_action(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    status_update: TaskStatusUpdate = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> TaskResponse:
    """
    更新指定项目下任务的状态
    
    Args:
        project_id: 项目ID（路径参数）
        task_id: 任务ID（路径参数）
        status_update: 状态更新数据，包含要执行的操作
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        更新状态后的任务
        
    Raises:
        HTTPException: 任务不存在、不属于指定项目或操作失败时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    # 验证任务是否属于指定项目
    await validate_task_belongs_to_project(db, task_id, project_id)
    
    action = status_update.action.lower()
    
    try:
        if action == "start" :
            # 启动
            task = await start_task(db, task_id)        
        elif action == "cancel":
            # 取消任务
            task = await cancel_task(db, task_id)            
            
        else:
            # 未知操作
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown action: {action}"
            )
        return task
        
    except ValueError as e:
        # 处理业务逻辑错误（如状态不允许转换等）
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        # 处理其他错误
        logger.error(f"Error updating task {task_id} status in project {project_id} with action {action}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating task status: {str(e)}"
        )



@router.delete("/by-project/{project_id}/task/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """
    删除指定项目下的任务
    
    Args:
        project_id: 项目ID（路径参数）
        task_id: 任务ID（路径参数）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Raises:
        HTTPException: 任务不存在、不属于指定项目或删除失败时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    # 验证任务是否属于指定项目
    await validate_task_belongs_to_project(db, task_id, project_id)
    
    try:
        success = await delete_task(db, task_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete task"
            )
    except ValueError as e:
        # 处理业务逻辑错误，如尝试删除正在运行的任务或任务不存在
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except IntegrityError as e:
        # 处理外键约束错误
        logger.error(f"IntegrityError deleting task {task_id} in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete task due to related records. Error: {str(e)}"
        )
    except Exception as e:
        # 处理其他未预期的错误
        error_message = str(e)
        logger.error(f"Unexpected error deleting task {task_id} in project {project_id}: {error_message}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error deleting task: {error_message}"
        )


@router.post("/by-project/{project_id}/task/{task_id}/retry-error", status_code=status.HTTP_200_OK)
async def retry_error(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Dict[str, Any]:
    """
    重试失败的任务
    
    重试前会检查Redis中是否有任务日志，如果没有则先从MinIO恢复日志到Redis中
    
    Args:
        project_id: 项目ID（路径参数）
        task_id: 任务ID（路径参数）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Dict[str, Any]: 成功消息
        
    Raises:
        HTTPException: 任务不存在、不属于指定项目或重试失败时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    # 验证任务是否属于指定项目，并获取任务对象
    task = await validate_task_belongs_to_project(db, task_id, project_id)
    task_type = task.task_type
    try:
        # 检查Redis中是否存在任务日志，如果没有则从MinIO恢复
        log_key = f"{task_type}:{task_id}"
        redis_has_logs = redis_log_reader.key_exists(log_key)
        
        # 如果Redis中没有日志，且任务有log_path，尝试从MinIO恢复日志
        if not redis_has_logs and task.log_path:
            logger.info(f"重试任务前检查：Redis中无任务{task_id}日志，尝试从MinIO恢复: {task.log_path}")
            try:
                # 从MinIO加载日志到Redis
                load_archived_logs_to_redis(task_id, task.log_path, key_prefix=task_type)
                logger.info(f"成功从MinIO恢复任务{task_id}日志到Redis")
            except Exception as log_e:
                # 日志恢复失败不影响重试功能，只记录警告
                logger.warning(f"从MinIO恢复任务{task_id}日志失败，但不影响重试功能: {str(log_e)}")
        
        # 调用重试错误任务函数
        await retry_error_task(db, task_id, project_id)
        # 返回成功消息
        return {"detail":"重试任务成功"}
        
    except Exception as e:
        # 处理其他未预期的错误
        error_message = str(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"重试任务失败: {error_message}"
        )


@router.get("/by-project/{project_id}/task/{task_id}/logs", response_model=TaskLogsResponse)
async def get_logs(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    start: int = Query(0, ge=0, description="起始位置（从0开始）"),
    limit: int = Query(20, ge=1, le=100, description="限制条数（1-100）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> TaskLogsResponse:
    """
    获取指定项目下任务的日志
    
    Args:
        project_id: 项目ID（路径参数）
        task_id: 任务ID（路径参数）
        start: 起始位置（查询参数，默认0）
        limit: 限制条数（1-100）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        TaskLogsResponse: 任务日志数据
        
    Raises:
        HTTPException: 任务不存在或不属于指定项目时抛出异常
    """
    db, current_user = deps  # 解包依赖
    
    # 验证任务是否属于指定项目，并获取任务信息
    task = await validate_task_belongs_to_project(db, task_id, project_id)
    task_type = task.task_type
    
    try:
        # 检查Redis中是否存在日志
        log_key = f"{task_type}:{task_id}"  
        redis_has_logs = redis_log_reader.key_exists(log_key)
        
        # 如果Redis中没有日志，且任务有log_path，尝试从MinIO恢复日志
        if not redis_has_logs and task.log_path:
            logger.info(f"Redis中无任务{task_id}日志，尝试从MinIO恢复: {task.log_path}")
            # 从MinIO加载日志到Redis
            load_archived_logs_to_redis(task_id, task.log_path, key_prefix=task_type)

        # 从Redis获取任务日志（无论是原有的还是刚恢复的）
        log_data = get_task_logs(task_id, start, limit, key_prefix=task_type)
        # 构建响应数据
        return TaskLogsResponse(
            logs=log_data.get("logs", []),
            start=log_data.get("start")
        )
    except Exception as e:
        logger.error(f"Error getting logs for task {task_id} in project {project_id}: {str(e)}")
        # 返回空日志而不是抛出异常，确保前端能正常处理
        return TaskLogsResponse(
            logs=[],
            start=-1
        ) 
import logging
from typing import List, Optional, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, and_, desc, asc, delete
from sqlalchemy.ext.asyncio import AsyncSession

# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate

from app.database.base import get_db
from app.models.models import Metric, MetricDirectory, Project, User, JwtUserInfo
from app.schemas.metric import (
    MetricDirectoryCreate, MetricDirectoryResponse, MetricDirectoryUpdate
)
from app.utils.dependencies import get_db_and_user
# 导入统一错误消息工具模块
from app.utils.error_messages import data_exists_error, data_not_found_error

# 创建独立的路由器，添加前缀和标签，便于Swagger界面管理
router = APIRouter(prefix="/api/v1/metric_directories", tags=["metric-directories"])
logger = logging.getLogger(__name__)


async def validate_project(db: AsyncSession, project_id: int) -> Project:
    """验证项目是否存在"""
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    return project


@router.post("/project/{project_id}", response_model=MetricDirectoryResponse, status_code=status.HTTP_201_CREATED)
async def create_metric_directory(
    project_id: int,
    directory_data: MetricDirectoryCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> MetricDirectory:
    """创建新的指标目录
    
    Args:
        project_id: 项目ID
        directory_data: 目录数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        创建的指标目录
    """
    db, current_user = deps  # 解包依赖
    
    try:
        # 验证项目是否存在
        await validate_project(db, project_id)
        
        # 检查同一项目下是否已存在同名目录
        existing_directory = await db.execute(
            select(MetricDirectory).where(
                MetricDirectory.name == directory_data.name,
                MetricDirectory.project_id == project_id
            )
        )
        if existing_directory.scalar_one_or_none():
            # 统一错误格式：数据已存在
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=data_exists_error(directory_data.name)
            )
        
        # 创建新目录，直接使用路径参数中的project_id
        new_directory = MetricDirectory(
            name=directory_data.name,
            description=directory_data.description,
            project_id=project_id,  # 使用路径参数中的project_id
            metric_count=0,
        )
        
        db.add(new_directory)
        await db.commit()
        await db.refresh(new_directory)
        
        return new_directory
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"创建指标目录失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建指标目录失败: {str(e)}"
        )


@router.get("/project/{project_id}", response_model=Page[MetricDirectoryResponse])
async def list_metric_directories(
    project_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Page[MetricDirectoryResponse]:
    """获取项目下所有指标目录 - 使用 fastapi-pagination 进行分页
    
    Args:
        project_id: 项目ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        分页的指标目录列表
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目是否存在
    await validate_project(db, project_id)
    
    # 构建查询
    query = select(MetricDirectory).filter(MetricDirectory.project_id == project_id).order_by(MetricDirectory.created_at.desc())
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)


@router.get("/project/{project_id}/directory/{directory_id}", response_model=MetricDirectoryResponse)
async def get_metric_directory(
    project_id: int,
    directory_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> MetricDirectory:
    """获取指定目录详情
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        指标目录对象
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目是否存在
    await validate_project(db, project_id)
    
    # 查询指标目录
    result = await db.execute(
        select(MetricDirectory).filter(
            MetricDirectory.id == directory_id,
            MetricDirectory.project_id == project_id
        )
    )
    directory = result.scalar_one_or_none()
    if not directory:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    
    return directory


@router.put("/project/{project_id}/directory/{directory_id}", response_model=MetricDirectoryResponse, status_code=status.HTTP_200_OK)
async def update_metric_directory(
    project_id: int,
    directory_id: int,
    directory_data: MetricDirectoryUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> MetricDirectory:
    """更新指标目录
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        directory_data: 更新数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        更新后的指标目录
    """
    db, current_user = deps  # 解包依赖
    
    try:
        # 验证项目是否存在
        await validate_project(db, project_id)
        
        # 获取指定项目中的目录
        result = await db.execute(
            select(MetricDirectory).filter(
                MetricDirectory.id == directory_id,
                MetricDirectory.project_id == project_id
            )
        )
        directory = result.scalar_one_or_none()
        if not directory:
            # 统一错误格式：数据不存在
            raise HTTPException(
                status_code=500,
                detail=data_not_found_error()
            )
        
        # 如果更新名称，检查是否与现有目录冲突
        if directory_data.name is not None and directory_data.name != directory.name:
            existing_directory = await db.execute(
                select(MetricDirectory).where(
                    MetricDirectory.name == directory_data.name,
                    MetricDirectory.project_id == project_id,
                    MetricDirectory.id != directory_id
                )
            )
            if existing_directory.scalar_one_or_none():
                # 统一错误格式：数据已存在
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=data_exists_error(directory_data.name)
                )
            directory.name = directory_data.name
        
        # 更新描述
        if directory_data.description is not None:
            directory.description = directory_data.description
        
        await db.commit()
        await db.refresh(directory)
        
        return directory
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"更新指标目录失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新指标目录失败: {str(e)}"
        )


@router.delete("/project/{project_id}/directory/{directory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric_directory(
    project_id: int,
    directory_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """删除指标目录
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        deps: 组合依赖，包含数据库会话和当前用户
    """
    db, current_user = deps  # 解包依赖
    
    try:
        # 获取指定项目中的目录
        result = await db.execute(
            select(MetricDirectory).filter(
                MetricDirectory.id == directory_id,
                MetricDirectory.project_id == project_id
            )
        )
        directory = result.scalar_one_or_none()
        if not directory:
            raise HTTPException(
                status_code=500,
                detail=data_not_found_error()
            )
        # . 批量删除相关的所有 指标
        delete_query = delete(Metric).where(Metric.directory_id == directory_id)
        await db.execute(delete_query)

        # 删除目录
        await db.delete(directory)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"删除指标目录失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除指标目录失败: {str(e)}"
        )

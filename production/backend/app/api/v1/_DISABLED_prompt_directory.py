from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, text, delete
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import paginate, apaginate

from app.database.base import get_db
from app.models.models import PromptDirectory, Prompt, Project, User, JwtUserInfo
from app.schemas.prompt import (
    PromptDirectoryCreate, 
    PromptDirectoryUpdate, 
    PromptDirectoryResponse
)
from app.api.prompt import validate_project
from app.utils.dependencies import get_db_and_user  # 导入组合依赖函数
# 导入统一错误消息工具模块
from app.utils.error_messages import data_exists_error, data_not_found_error

router = APIRouter(prefix="/api/v1/prompt_directories", tags=["prompt-directories"])

@router.post("/project/{project_id}", response_model=PromptDirectoryResponse, status_code=status.HTTP_201_CREATED)
async def create_directory(
    project_id: int,
    directory: PromptDirectoryCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> PromptDirectoryResponse:
    """创建提示词目录
    
    Args:
        project_id: 项目ID
        directory: 目录数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        创建的目录
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目存在
    await validate_project(db, project_id)
    
    # 检查同一项目下是否已存在同名目录
    result = await db.execute(
        select(PromptDirectory).where(
            PromptDirectory.project_id == project_id,
            PromptDirectory.name == directory.name
        )
    )
    if result.scalars().first():
        # 统一错误格式：数据已存在
        raise HTTPException(
            status_code=400,
            detail=data_exists_error(directory.name)
        )
    
    # 创建目录
    db_directory = PromptDirectory(
        name=directory.name,
        description=directory.description,
        project_id=project_id,
        prompt_count=0
    )
    
    db.add(db_directory)
    await db.commit()
    await db.refresh(db_directory)
    
    return db_directory

@router.get("/project/{project_id}", response_model=Page[PromptDirectoryResponse])
async def list_directories(
    project_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Page[PromptDirectoryResponse]:
    """获取项目下的所有提示词目录 - 使用 fastapi-pagination 进行分页
    
    Args:
        project_id: 项目ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        分页的提示词目录列表
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目存在
    await validate_project(db, project_id)
    
    # 构建查询
    query = select(PromptDirectory).where(PromptDirectory.project_id == project_id).order_by(PromptDirectory.name)
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)

@router.get("/project/{project_id}/directory/{directory_id}", response_model=Dict)
async def get_directory(
    project_id: int,
    directory_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Dict:
    """获取目录详情和包含的提示词数量
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        目录详情和提示词数量
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目存在
    await validate_project(db, project_id)
    
    # 获取目录
    result = await db.execute(
        select(PromptDirectory)
        .where(
            PromptDirectory.id == directory_id,
            PromptDirectory.project_id == project_id
        )
    )
    
    directory = result.scalars().first()
    if not directory:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    
    return {
        "directory": {
            "id": directory.id,
            "name": directory.name,
            "description": directory.description,
            "project_id": directory.project_id,
            "prompt_count": directory.prompt_count,
            "created_at": directory.created_at,
            "updated_at": directory.updated_at
        },
        "prompt_count": directory.prompt_count
    }

@router.put("/project/{project_id}/directory/{directory_id}", response_model=PromptDirectoryResponse, status_code=status.HTTP_200_OK)
async def update_directory(
    project_id: int,
    directory_id: int,
    directory_update: PromptDirectoryUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> PromptDirectoryResponse:
    """更新提示词目录
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        directory_update: 更新数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        更新后的目录
    """
    db, current_user = deps  # 解包依赖
    
    # 验证项目存在
    await validate_project(db, project_id)
    
    # 获取目录
    result = await db.execute(
        select(PromptDirectory)
        .where(
            PromptDirectory.id == directory_id,
            PromptDirectory.project_id == project_id
        )
    )
    
    directory = result.scalars().first()
    if not directory:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    
    # 如果更新名称，检查是否与已有目录冲突
    if directory_update.name and directory_update.name != directory.name:
        name_check = await db.execute(
            select(PromptDirectory).where(
                PromptDirectory.project_id == project_id,
                PromptDirectory.name == directory_update.name,
                PromptDirectory.id != directory_id
            )
        )
        if name_check.scalars().first():
            # 统一错误格式：数据已存在
            raise HTTPException(
                status_code=400,
                detail=data_exists_error(directory_update.name)
            )
        directory.name = directory_update.name
    
    # 更新描述
    if directory_update.description is not None:
        directory.description = directory_update.description
    
    await db.commit()
    await db.refresh(directory)
    
    return directory

@router.delete("/project/{project_id}/directory/{directory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_directory(
    project_id: int,
    directory_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """删除提示词目录
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        None: 统一返回204状态码，无响应体内容
    """
    db, current_user = deps  # 解包依赖
    # 获取目录
    result = await db.execute(
        select(PromptDirectory)
        .where(
            PromptDirectory.id == directory_id,
            PromptDirectory.project_id == project_id
        )
    )
    directory = result.scalars().first()
    if not directory:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    # 4. 批量删除相关的所有 prompt
    delete_query = delete(Prompt).where(Prompt.directory_id == directory_id)
    await db.execute(delete_query)
    await db.delete(directory)
    await db.commit()

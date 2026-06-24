"""
全局依赖注入工具

此模块提供了组合的依赖注入函数，用于简化路由中的重复依赖声明。
通过预定义的依赖组合，可以减少代码重复并提高可维护性。
"""

from typing import Tuple
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import get_db
from app.models.models import User, JWTPayLoad, JwtUserInfo
from app.utils.auth import get_current_user, get_current_active_user, get_current_admin_user
from app.utils import app_runtime_context
from app.common.permission_constants import SuperAdminAccount


def is_tenant_admin(current_user: JwtUserInfo, is_san_yuan: bool) -> bool:
    """
    判断是否为租户管理员（三元模式和非三元模式统一处理）
    
    Args:
        current_user: 当前用户信息
        is_san_yuan: 是否为三元模式
        
    Returns:
        True表示是租户管理员，False表示不是
    """
    # 非三元模式：主账号判断
    if current_user.username == current_user.enterpriseCode:
        return True
    
    # 三元模式：特殊管理员账号判断（权限和租户管理员相同，只是登录账号不同）
    if is_san_yuan:
        return current_user.username in SuperAdminAccount.ALL_ACCOUNTS
    
    return False


async def get_db_and_user(
    db: AsyncSession = Depends(get_db),
    current_user: JwtUserInfo = Depends(get_current_user)
) -> Tuple[AsyncSession, JwtUserInfo]:
    """
    获取数据库会话和当前用户的组合依赖
    
    这是最常用的依赖组合，适用于大部分需要认证的API端点
    
    Returns:
        Tuple[AsyncSession, User]: 数据库会话和当前用户对象
    """
    return db, current_user


# 去除了admin的概念，以后会改为菜单和角色的操作
async def get_db_and_admin(
    db: AsyncSession = Depends(get_db),
    admin_user: JwtUserInfo = Depends(get_current_admin_user)
) -> Tuple[AsyncSession, User]:
    """
    获取数据库会话和管理员用户的组合依赖
    
    适用于需要管理员权限的API端点
    
    Returns:
        Tuple[AsyncSession, User]: 数据库会话和管理员用户对象
    """
    return db, admin_user


async def get_db_and_tenant_admin(
    db: AsyncSession = Depends(get_db),
    current_user: JwtUserInfo = Depends(get_current_user)
) -> Tuple[AsyncSession, JwtUserInfo]:
    """
    获取数据库会话和租户管理员的组合依赖
    
    只有租户管理员（主账号或三元模式超级管理员）可以访问
    
    Returns:
        Tuple[AsyncSession, JwtUserInfo]: 数据库会话和租户管理员用户对象
        
    Raises:
        HTTPException: 如果不是租户管理员，返回403错误
    """
    is_san_yuan = app_runtime_context.get_san_yuan_tag()
    
    if not is_tenant_admin(current_user, is_san_yuan):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要租户管理员权限"
        )
    
    return db, current_user


# 为了向后兼容，保留单独的依赖函数引用
get_database = get_db
get_authenticated_user = get_current_user
get_admin_user = get_current_admin_user 
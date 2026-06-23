"""
权限检查服务

提供权限检查相关的函数，用于中间件和业务代码中检查用户权限
"""
import re
import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.models.models import UserDataRole, Permission, RolePermission
from app.utils import app_runtime_context
from app.utils.user_info_context import get_current_user_info
from app.common.permission_constants import RoleType, ScopeType, GLOBAL_TENANT_ID
from app.services.permission.cache import get_permission_cache

logger = logging.getLogger("app.services.permission.permission")


async def get_permission_by_url(
    db: AsyncSession, 
    url: str, 
    method: str
) -> Optional[Permission]:
    """
    根据URL和HTTP方法查询权限配置，如果不存在则返回None（表示不需要权限检查）
    使用缓存优化性能
    
    Args:
        db: 数据库会话
        url: 请求URL路径
        method: HTTP方法
        
    Returns:
        Permission对象或None
    """
    cache = get_permission_cache()
    return await cache.get_permission_by_url(db, url, method)


async def get_user_data_roles(
    db: AsyncSession, 
    user_id: int
) -> List[UserDataRole]:
    """
    获取用户的数据权限角色列表（使用缓存优化性能）
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        
    Returns:
        用户数据权限角色列表
    """
    cache = get_permission_cache()
    return await cache.get_user_data_roles(db, user_id)


async def check_url_permission(
    db: AsyncSession,
    url: str,
    method: str,
    user_id: int,
    project_id: Optional[int] = None
) -> bool:
    """
    检查用户是否有URL访问权限（需要先确认URL在权限配置表中）
    
    检查逻辑：
    1. 首先检查是否是租户管理员（租户管理员拥有所有权限，直接通过）
    2. 查询RolePermission表，获取该URL对应的角色类型
    3. 检查用户是否有对应的数据权限角色
    4. 如果是项目级别操作，还需要检查用户是否是该项目管理员或平台管理员
    
    Args:
        db: 数据库会话
        url: 请求URL路径
        method: HTTP方法
        user_id: 用户ID
        project_id: 项目ID（从URL中提取，如果URL包含项目ID）
        
    Returns:
        True表示有权限，False表示无权限
    """
    tenant_id = app_runtime_context.get_tenant_id()
    
    # 首先检查是否是租户管理员（租户管理员拥有所有权限，直接通过）
    from app.utils.dependencies import is_tenant_admin
    from app.utils.user_info_context import get_current_user_info
    current_user = get_current_user_info()
    if current_user:
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        if is_tenant_admin(current_user, is_san_yuan):
            logger.debug(f"权限检查通过：用户 {user_id} 是租户管理员 | URL: {url} | 方法: {method}")
            return True
    
    # 获取权限配置
    permission = await get_permission_by_url(db, url, method)
    if not permission:
        # URL不在权限配置表中，允许所有认证用户访问
        logger.debug(f"权限检查通过：URL不在权限配置表中 | URL: {url} | 方法: {method}")
        return True
    
    logger.debug(
        f"权限检查开始 | 用户ID: {user_id} | URL: {url} | 方法: {method} | "
        f"权限代码: {permission.permission_code} | 租户ID: {tenant_id}"
    )
    
    # 查询该权限对应的角色类型（使用缓存）
    cache = get_permission_cache()
    role_permissions = await cache.get_role_permissions(db, permission.permission_code)
    
    if not role_permissions:
        # 没有配置角色权限，默认拒绝
        logger.warning(
            f"权限检查失败：权限 {permission.permission_code} 没有配置角色权限 | "
            f"用户ID: {user_id} | URL: {url} | 方法: {method}"
        )
        return False
    
    logger.debug(
        f"权限 {permission.permission_code} 配置的角色类型: "
        f"{[rp.role_type for rp in role_permissions]}"
    )
    
    # 获取用户的数据权限角色
    user_roles = await get_user_data_roles(db, user_id)
    
    logger.debug(
        f"用户 {user_id} 的数据权限角色: "
        f"{[(ur.role_type, ur.scope_type, ur.scope_id) for ur in user_roles]}"
    )
    
    # 获取该权限支持的角色类型集合
    allowed_role_types = {rp.role_type for rp in role_permissions}
    
    # 优先检查平台管理员权限（平台管理员权限优先于项目管理员）
    # 如果该权限配置了PLATFORM_ADMIN，且用户是平台管理员，则直接通过
    if RoleType.PLATFORM_ADMIN in allowed_role_types:
        for user_role in user_roles:
            if user_role.role_type == RoleType.PLATFORM_ADMIN:
                logger.debug(
                    f"权限检查通过：用户 {user_id} 是平台管理员 | "
                    f"权限代码: {permission.permission_code} | URL: {url}"
                )
                return True
    
    # 检查项目管理员权限（必须匹配具体项目，没有project_id则不通过）
    if RoleType.PROJECT_ADMIN in allowed_role_types and project_id:
        for user_role in user_roles:
            if user_role.role_type == RoleType.PROJECT_ADMIN:
                if user_role.scope_id == project_id:
                    logger.debug(
                        f"权限检查通过：用户 {user_id} 是项目 {project_id} 的项目管理员 | "
                        f"权限代码: {permission.permission_code} | URL: {url}"
                    )
                    return True
    
    logger.warning(
        f"权限检查失败：用户 {user_id} 没有对应的角色权限 | "
        f"权限代码: {permission.permission_code} | URL: {url} | 方法: {method} | "
        f"需要的角色类型: {[rp.role_type for rp in role_permissions]} | "
        f"用户角色: {[(ur.role_type, ur.scope_type, ur.scope_id) for ur in user_roles]}"
    )
    return False


async def is_platform_admin(
    db: AsyncSession, 
    user_id: Optional[int] = None
) -> bool:
    """
    检查用户是否为平台管理员
    
    Args:
        db: 数据库会话
        user_id: 用户ID，如果为None则从上下文获取
        
    Returns:
        True表示是平台管理员，False表示不是
    """
    if user_id is None:
        current_user = get_current_user_info()
        if not current_user:
            return False
        user_id = current_user.userId
    
    tenant_id = app_runtime_context.get_tenant_id()
    
    stmt = select(UserDataRole).where(
        and_(
            UserDataRole.user_id == user_id,
            UserDataRole.role_type == RoleType.PLATFORM_ADMIN,
            UserDataRole.scope_type == ScopeType.PLATFORM,
            UserDataRole.scope_id.is_(None),
            UserDataRole.tenant_id == tenant_id
        )
    )
    
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def is_project_admin(
    db: AsyncSession, 
    project_id: int, 
    user_id: Optional[int] = None
) -> bool:
    """
    检查用户是否为指定项目的项目管理员
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        user_id: 用户ID，如果为None则从上下文获取
        
    Returns:
        True表示是项目管理员，False表示不是
    """
    if user_id is None:
        current_user = get_current_user_info()
        if not current_user:
            return False
        user_id = current_user.userId
    
    tenant_id = app_runtime_context.get_tenant_id()
    
    stmt = select(UserDataRole).where(
        and_(
            UserDataRole.user_id == user_id,
            UserDataRole.role_type == RoleType.PROJECT_ADMIN,
            UserDataRole.scope_type == ScopeType.PROJECT,
            UserDataRole.scope_id == project_id,
            UserDataRole.tenant_id == tenant_id
        )
    )
    
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def can_manage_project(
    db: AsyncSession, 
    project_id: int, 
    user_id: Optional[int] = None
) -> bool:
    """
    检查用户是否可以管理指定项目（平台管理员或项目管理员）
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        user_id: 用户ID，如果为None则从上下文获取
        
    Returns:
        True表示可以管理，False表示不能管理
    """
    # 平台管理员可以管理所有项目
    if await is_platform_admin(db, user_id):
        return True
    
    # 项目管理员可以管理被授权的项目
    return await is_project_admin(db, project_id, user_id)


async def can_delete_project(
    db: AsyncSession, 
    project_id: int, 
    user_id: Optional[int] = None
) -> bool:
    """
    检查用户是否可以删除指定项目（只有平台管理员可以删除）
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        user_id: 用户ID，如果为None则从上下文获取
        
    Returns:
        True表示可以删除，False表示不能删除
    """
    return await is_platform_admin(db, user_id)


def extract_project_id(url: str) -> Optional[int]:
    """
    从URL中提取project_id
    
    支持的URL格式：
    - /api/v1/projects/{project_id}
    - /api/v1/projects/{project_id}/...
    - /api/v1/projects/ssh-config-user/{project_id}
    - /api/v1/projects/{project_id}/user/...
    
    Args:
        url: 请求URL路径
        
    Returns:
        项目ID或None
    """
    # 匹配 /api/v1/projects/ 后面的数字（项目ID）
    # 支持多种格式：
    # - /api/v1/projects/123
    # - /api/v1/projects/123/user/...
    # - /api/v1/projects/ssh-config-user/123
    # - /api/v1/projects/123/ssh-config/...
    patterns = [
        r'/api/v1/projects/(\d+)',  # /api/v1/projects/{project_id} 或 /api/v1/projects/{project_id}/...
        r'/api/v1/projects/[^/]+/(\d+)',  # /api/v1/projects/ssh-config-user/{project_id} 等格式
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                continue
    return None


async def validate_at_least_one_project_admin(
    db: AsyncSession,
    project_id: int,
    user_ids_to_remove: Optional[List[int]] = None
) -> None:
    """
    校验项目至少保留一个管理员
    
    在删除项目成员或撤销项目管理员权限时调用，确保项目至少保留一个管理员
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        user_ids_to_remove: 要删除/撤销的用户ID列表（可选，如果为None则检查当前管理员数量是否<=1）
        
    Raises:
        HTTPException: 如果删除后管理员数量 < 1
    """
    from fastapi import HTTPException, status
    tenant_id = app_runtime_context.get_tenant_id()
    
    # 查询当前所有的项目管理员
    result = await db.execute(
        select(UserDataRole).where(
            and_(
                UserDataRole.scope_id == project_id,
                UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                UserDataRole.scope_type == ScopeType.PROJECT,
                UserDataRole.tenant_id == tenant_id
            )
        )
    )
    all_admins = result.scalars().all()
    total_admin_count = len(all_admins)
    
    if user_ids_to_remove:
        # 计算要删除的管理员数量
        admin_user_ids = {admin.user_id for admin in all_admins}
        remove_count = len([uid for uid in user_ids_to_remove if uid in admin_user_ids])
        remaining_count = total_admin_count - remove_count
    else:
        # 如果没有指定要删除的用户，检查当前管理员数量
        remaining_count = total_admin_count - 1
    
    # 校验：删除后至少保留一个项目管理员
    if remaining_count < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="项目至少需要保留一个项目管理员，无法删除所有管理员"
        )

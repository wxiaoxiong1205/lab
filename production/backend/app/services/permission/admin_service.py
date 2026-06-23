"""
权限管理服务实现
"""
import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete

from app.models.models import UserDataRole, JwtUserInfo
from app.schemas.permission import (
    GrantPlatformAdminResponse,
    PlatformAdminListItem,
    GrantProjectAdminResponse,
    ProjectAdminListItem,
    BatchGrantPlatformAdminResponse,
    BatchGrantProjectAdminResponse
)
from app.schemas.user_page_payload import UserPagePayload, UserBasePagePayload
from app.schemas.user_extraI import UserExtraItem
from app.services.permission.interface import AdminPermissionService
from app.services.permission.permission import is_platform_admin
from app.services.permission.cache import get_permission_cache
from app.services.user.interface import UserService
from app.utils import app_runtime_context
from app.utils.dependencies import is_tenant_admin
from app.common.permission_constants import RoleType, ScopeType
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class DefaultAdminPermissionService(AdminPermissionService):
    """权限管理服务默认实现"""
    
    def __init__(self, user_service: Optional[UserService] = None):
        self.user_service = user_service
    
    async def grant_platform_admin(
        self,
        db: AsyncSession,
        user_id: int,
        current_user: JwtUserInfo
    ) -> GrantPlatformAdminResponse:
        """授权平台管理员"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 检查是否已经是平台管理员
        existing = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.user_id == user_id,
                    UserDataRole.role_type == RoleType.PLATFORM_ADMIN,
                    UserDataRole.scope_type == ScopeType.PLATFORM,
                    UserDataRole.scope_id.is_(None),
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该用户已经是平台管理员"
            )
        
        # 创建平台管理员记录
        user_data_role = UserDataRole(
            user_id=user_id,
            role_type=RoleType.PLATFORM_ADMIN,
            scope_type=ScopeType.PLATFORM,
            scope_id=None,
            tenant_id=tenant_id,
            created_id=current_user.userId,
            created_by=current_user.username
        )
        
        db.add(user_data_role)
        await db.commit()
        await db.refresh(user_data_role)
        
        # 清除用户角色缓存
        cache = get_permission_cache()
        cache.invalidate_user_role_cache(tenant_id, user_id)
        
        return GrantPlatformAdminResponse(
            id=user_data_role.id,
            user_id=user_data_role.user_id,
            created_id=user_data_role.created_id,
            created_by=user_data_role.created_by,
            created_at=user_data_role.created_at
        )
    
    async def revoke_platform_admin(
        self,
        db: AsyncSession,
        user_id: int,
        current_user: JwtUserInfo
    ) -> None:
        """撤销平台管理员权限"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 不能撤销自己的权限
        if user_id == current_user.userId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能撤销自己的平台管理员权限"
            )
        
        # 删除平台管理员记录
        result = await db.execute(
            delete(UserDataRole).where(
                and_(
                    UserDataRole.user_id == user_id,
                    UserDataRole.role_type == RoleType.PLATFORM_ADMIN,
                    UserDataRole.scope_type == ScopeType.PLATFORM,
                    UserDataRole.scope_id.is_(None),
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该用户不是平台管理员"
            )
        
        await db.commit()
        
        # 清除用户角色缓存
        cache = get_permission_cache()
        cache.invalidate_user_role_cache(tenant_id, user_id)
    
    async def list_platform_admins(
        self,
        db: AsyncSession,
        username: Optional[str] = None,
        page: int = 1,
        size: int = 10
    ) -> UserPagePayload:
        """查询平台管理员列表（支持分页和用户名模糊查询）"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 查询所有平台管理员的user_id和授权时间
        result = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.role_type == RoleType.PLATFORM_ADMIN,
                    UserDataRole.scope_type == ScopeType.PLATFORM,
                    UserDataRole.scope_id.is_(None),
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        
        roles = result.scalars().all()
        user_ids = [role.user_id for role in roles]
        
        # 如果没有平台管理员，返回空分页结果
        if len(user_ids) == 0:
            return UserPagePayload(
                size=size,
                total=0,
                totalPages=1,
                rows=[],
                number=page
            )
        
        # 获取用户信息
        user_page = await self.user_service.user_infos(ids=user_ids, username=username, page=page, page_size=size)
        
        # 添加加入时间（授权时间）
        _append_platform_admin_join_time(user_page.rows, roles)
        
        return user_page
    
    async def list_not_platform_admins(
        self,
        db: AsyncSession,
        current_user: JwtUserInfo,
        username: Optional[str] = None,
        page: int = 1,
        size: int = 10
    ) -> UserBasePagePayload:
        """查询未关联为平台管理员的用户列表（支持分页和用户名模糊查询）"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 查询所有平台管理员的user_id
        result = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.role_type == RoleType.PLATFORM_ADMIN,
                    UserDataRole.scope_type == ScopeType.PLATFORM,
                    UserDataRole.scope_id.is_(None),
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        
        roles = result.scalars().all()
        platform_admin_user_ids = [role.user_id for role in roles]
        # 排除租户管理员
        platform_admin_user_ids.append(current_user.userId)
        
        # 使用UserService查询用户列表，排除已关联为平台管理员的用户
        return await self.user_service.iam_ignore_user_infos(
            ids=platform_admin_user_ids, 
            username=username, 
            page=page, 
            page_size=size
        )
    
    async def batch_grant_platform_admin(
        self,
        db: AsyncSession,
        user_ids: List[int],
        current_user: JwtUserInfo
    ) -> BatchGrantPlatformAdminResponse:
        """批量授权平台管理员"""
        tenant_id = app_runtime_context.get_tenant_id()
        success_items = []
        failed_items = []
        
        # 去重
        unique_user_ids = list(set(user_ids))
        
        # 查询已经是平台管理员的用户
        existing_result = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.user_id.in_(unique_user_ids),
                    UserDataRole.role_type == RoleType.PLATFORM_ADMIN,
                    UserDataRole.scope_type == ScopeType.PLATFORM,
                    UserDataRole.scope_id.is_(None),
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        existing_users = {role.user_id for role in existing_result.scalars().all()}
        
        # 批量创建平台管理员记录
        new_roles = []
        for user_id in unique_user_ids:
            if user_id in existing_users:
                failed_items.append({
                    "user_id": user_id,
                    "reason": "该用户已经是平台管理员"
                })
            else:
                user_data_role = UserDataRole(
                    user_id=user_id,
                    role_type=RoleType.PLATFORM_ADMIN,
                    scope_type=ScopeType.PLATFORM,
                    scope_id=None,
                    tenant_id=tenant_id,
                    created_id=current_user.userId,
                    created_by=current_user.username
                )
                new_roles.append(user_data_role)
        
        # 批量插入
        if new_roles:
            db.add_all(new_roles)
            await db.commit()
            
            # 刷新并构建成功响应
            for role in new_roles:
                await db.refresh(role)
                success_items.append(
                    GrantPlatformAdminResponse(
                        id=role.id,
                        user_id=role.user_id,
                        created_id=role.created_id,
                        created_by=role.created_by,
                        created_at=role.created_at
                    )
                )
            
            # 清除用户角色缓存
            cache = get_permission_cache()
            for role in new_roles:
                cache.invalidate_user_role_cache(tenant_id, role.user_id)
        
        return BatchGrantPlatformAdminResponse(
            success_count=len(success_items),
            failed_count=len(failed_items),
            success_items=success_items,
            failed_items=failed_items
        )
    
    async def grant_project_admin(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
        current_user: JwtUserInfo
    ) -> GrantProjectAdminResponse:
        """授权项目管理员"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 检查当前用户是否是平台管理员或租户管理员
        is_san_yuan = app_runtime_context.get_san_yuan_tag()
        is_admin = await is_platform_admin(db, current_user.userId) or is_tenant_admin(current_user, is_san_yuan)
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="需要平台管理员权限"
            )
        
        # 检查是否已经是项目管理员
        existing = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.user_id == user_id,
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.scope_id == project_id,
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该用户已经是该项目的项目管理员"
            )
        
        # 创建项目管理员记录
        user_data_role = UserDataRole(
            user_id=user_id,
            role_type=RoleType.PROJECT_ADMIN,
            scope_type=ScopeType.PROJECT,
            scope_id=project_id,
            tenant_id=tenant_id,
            created_id=current_user.userId,
            created_by=current_user.username
        )
        
        db.add(user_data_role)
        await db.commit()
        await db.refresh(user_data_role)
        
        # 清除用户角色缓存
        cache = get_permission_cache()
        cache.invalidate_user_role_cache(tenant_id, user_id)
        
        return GrantProjectAdminResponse(
            id=user_data_role.id,
            project_id=project_id,
            user_id=user_data_role.user_id,
            created_id=user_data_role.created_id,
            created_by=user_data_role.created_by,
            created_at=user_data_role.created_at
        )
    
    async def revoke_project_admin(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
        current_user: JwtUserInfo
    ) -> None:
        """撤销项目管理员权限"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 检查当前用户是否是平台管理员或租户管理员
        is_san_yuan = app_runtime_context.get_san_yuan_tag()
        is_admin = await is_platform_admin(db, current_user.userId) or is_tenant_admin(current_user, is_san_yuan)
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="需要平台管理员或租户管理员权限"
            )
        
        # 查询当前所有的项目管理员，检查要撤销的用户是否是项目管理员
        all_admins_result = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.scope_id == project_id,
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        all_admins = all_admins_result.scalars().all()
        
        # 检查要撤销的用户是否是项目管理员
        target_admin = None
        for admin in all_admins:
            if admin.user_id == user_id:
                target_admin = admin
                break
        
        if not target_admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该用户不是该项目的项目管理员"
            )
        
        # 校验：删除后至少保留一个项目管理员
        from app.services.permission.permission import validate_at_least_one_project_admin
        await validate_at_least_one_project_admin(db, project_id, [user_id])
        
        # 删除项目管理员记录
        result = await db.execute(
            delete(UserDataRole).where(
                and_(
                    UserDataRole.user_id == user_id,
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.scope_id == project_id,
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        
        await db.commit()
        
        # 清除用户角色缓存
        cache = get_permission_cache()
        cache.invalidate_user_role_cache(tenant_id, user_id)
    
    async def list_project_admins(
        self,
        db: AsyncSession,
        project_id: int
    ) -> List[ProjectAdminListItem]:
        """查询项目管理员列表"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        result = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.scope_id == project_id,
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        
        roles = result.scalars().all()
        
        return [
            ProjectAdminListItem(
                id=role.id,
                project_id=project_id,
                user_id=role.user_id,
                created_id=role.created_id,
                created_by=role.created_by,
                created_at=role.created_at
            )
            for role in roles
        ]
    
    async def batch_grant_project_admin(
        self,
        db: AsyncSession,
        project_id: int,
        user_ids: List[int],
        current_user: JwtUserInfo
    ) -> BatchGrantProjectAdminResponse:
        """批量授权项目管理员"""
        tenant_id = app_runtime_context.get_tenant_id()
        
        # 检查当前用户是否是平台管理员或租户管理员
        is_san_yuan = app_runtime_context.get_san_yuan_tag()
        is_admin = await is_platform_admin(db, current_user.userId) or is_tenant_admin(current_user, is_san_yuan)
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="需要平台管理员权限"
            )
        
        success_items = []
        failed_items = []
        
        # 去重
        unique_user_ids = list(set(user_ids))
        
        # 查询已经是项目管理员的用户
        existing_result = await db.execute(
            select(UserDataRole).where(
                and_(
                    UserDataRole.user_id.in_(unique_user_ids),
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.scope_id == project_id,
                    UserDataRole.tenant_id == tenant_id
                )
            )
        )
        existing_users = {role.user_id for role in existing_result.scalars().all()}
        
        # 批量创建项目管理员记录
        new_roles = []
        for user_id in unique_user_ids:
            if user_id in existing_users:
                failed_items.append({
                    "user_id": user_id,
                    "reason": "该用户已经是该项目的项目管理员"
                })
            else:
                user_data_role = UserDataRole(
                    user_id=user_id,
                    role_type=RoleType.PROJECT_ADMIN,
                    scope_type=ScopeType.PROJECT,
                    scope_id=project_id,
                    tenant_id=tenant_id,
                    created_id=current_user.userId,
                    created_by=current_user.username
                )
                new_roles.append(user_data_role)
        
        # 批量插入
        if new_roles:
            db.add_all(new_roles)
            await db.commit()
            
            # 刷新并构建成功响应
            for role in new_roles:
                await db.refresh(role)
                success_items.append(
                    GrantProjectAdminResponse(
                        id=role.id,
                        project_id=project_id,
                        user_id=role.user_id,
                        created_id=role.created_id,
                        created_by=role.created_by,
                        created_at=role.created_at
                    )
                )
            
            # 清除用户角色缓存
            cache = get_permission_cache()
            for role in new_roles:
                cache.invalidate_user_role_cache(tenant_id, role.user_id)
        
        return BatchGrantProjectAdminResponse(
            success_count=len(success_items),
            failed_count=len(failed_items),
            success_items=success_items,
            failed_items=failed_items
        )


def _append_platform_admin_join_time(user_list: List[UserExtraItem], roles: List[UserDataRole]):
    """为平台管理员列表添加加入时间（授权时间）"""
    # 创建 user_id -> role 的映射，方便查找
    role_map = {role.user_id: role for role in roles}
    
    for user in user_list:
        role = role_map.get(user.userId)
        if role:
            user.joinTime = role.created_at

"""
权限管理服务接口
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

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


class AdminPermissionService(ABC):
    """权限管理服务接口"""
    
    @abstractmethod
    async def grant_platform_admin(
        self,
        db: AsyncSession,
        user_id: int,
        current_user: JwtUserInfo
    ) -> GrantPlatformAdminResponse:
        """授权平台管理员"""
        pass
    
    @abstractmethod
    async def revoke_platform_admin(
        self,
        db: AsyncSession,
        user_id: int,
        current_user: JwtUserInfo
    ) -> None:
        """撤销平台管理员权限"""
        pass
    
    @abstractmethod
    async def list_platform_admins(
        self,
        db: AsyncSession,
        username: Optional[str] = None,
        page: int = 1,
        size: int = 10
    ) -> UserPagePayload:
        """查询平台管理员列表（支持分页和用户名模糊查询）"""
        pass
    
    @abstractmethod
    async def list_not_platform_admins(
        self,
        db: AsyncSession,
        current_user: JwtUserInfo,
        username: Optional[str] = None,
        page: int = 1,
        size: int = 10
    ) -> UserBasePagePayload:
        """查询未关联为平台管理员的用户列表（支持分页和用户名模糊查询）"""
        pass
    
    @abstractmethod
    async def batch_grant_platform_admin(
        self,
        db: AsyncSession,
        user_ids: List[int],
        current_user: JwtUserInfo
    ) -> BatchGrantPlatformAdminResponse:
        """批量授权平台管理员"""
        pass
    
    @abstractmethod
    async def grant_project_admin(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
        current_user: JwtUserInfo
    ) -> GrantProjectAdminResponse:
        """授权项目管理员"""
        pass
    
    @abstractmethod
    async def revoke_project_admin(
        self,
        db: AsyncSession,
        project_id: int,
        user_id: int,
        current_user: JwtUserInfo
    ) -> None:
        """撤销项目管理员权限"""
        pass
    
    @abstractmethod
    async def list_project_admins(
        self,
        db: AsyncSession,
        project_id: int
    ) -> List[ProjectAdminListItem]:
        """查询项目管理员列表"""
        pass
    
    @abstractmethod
    async def batch_grant_project_admin(
        self,
        db: AsyncSession,
        project_id: int,
        user_ids: List[int],
        current_user: JwtUserInfo
    ) -> BatchGrantProjectAdminResponse:
        """批量授权项目管理员"""
        pass

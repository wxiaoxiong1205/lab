"""
权限管理API接口

提供平台管理员和项目管理员的管理接口
"""
import logging
from typing import Tuple, List, Optional
from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import JwtUserInfo
from app.schemas.permission import (
    PermissionMenuVisibleResponse,
    GrantPlatformAdminRequest,
    GrantPlatformAdminResponse,
    RevokePlatformAdminRequest,
    PlatformAdminListItem,
    BatchGrantPlatformAdminRequest,
    BatchGrantPlatformAdminResponse,
    GrantProjectAdminRequest,
    GrantProjectAdminResponse,
    RevokeProjectAdminRequest,
    ProjectAdminListItem,
    BatchGrantProjectAdminRequest,
    BatchGrantProjectAdminResponse
)
from app.schemas.user_page_payload import UserPagePayload, UserBasePagePayload
from app.utils.dependencies import get_db_and_user, get_db_and_tenant_admin
from app.utils import app_runtime_context
from app.services.permission.interface import AdminPermissionService
from app.services.user.interface import UserService
from app.core.depend_manager import AutoContainer
from app.common.permission_constants import SuperAdminAccount

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1",
    tags=["admin-permissions"],
    responses={404: {"description": "Not found"}},
)


@router.get("/permissions/menu/visible", response_model=PermissionMenuVisibleResponse)
async def check_permission_menu_visible(
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> PermissionMenuVisibleResponse:
    """
    检查当前用户是否可以查看权限管理菜单
    
    只有租户管理员（主账号或三元模式超级管理员）可以查看
    """
    db, current_user = deps
    is_san_yuan = app_runtime_context.get_san_yuan_tag()
    
    # 主账号判断
    if current_user.username == current_user.enterpriseCode:
        return PermissionMenuVisibleResponse(visible=True, reason="主账号")
    
    # 三元模式特殊账号判断
    if is_san_yuan:
        if current_user.username in SuperAdminAccount.ALL_ACCOUNTS:
            return PermissionMenuVisibleResponse(visible=True, reason="三元模式超级管理员")
    
    return PermissionMenuVisibleResponse(visible=False, reason="无权限")


# ==================== 平台管理员管理接口 ====================

@router.post("/platform/grant", response_model=GrantPlatformAdminResponse, status_code=status.HTTP_201_CREATED)
@inject
async def grant_platform_admin(
    request: GrantPlatformAdminRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_tenant_admin),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> GrantPlatformAdminResponse:
    """
    授权平台管理员
    
    只有租户管理员（主账号或三元模式超级管理员）可以操作
    """
    db, current_user = deps
    return await admin_permission_service.grant_platform_admin(db, request.user_id, current_user)


@router.post("/platform/revoke", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def revoke_platform_admin(
    request: RevokePlatformAdminRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_tenant_admin),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
):
    """
    撤销平台管理员权限
    
    只有租户管理员（主账号或三元模式超级管理员）可以操作
    不能撤销自己的平台管理员权限
    """
    db, current_user = deps
    await admin_permission_service.revoke_platform_admin(db, request.user_id, current_user)


@router.get("/platform/list", response_model=UserPagePayload)
@inject
async def list_platform_admins(
    username: Optional[str] = Query(None, description="用户名模糊查询"),
    page: int = Query(1, ge=1, description="页码，从1开始"),
    size: int = Query(10, ge=1, le=100, description="每页条数，最大100"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_tenant_admin),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service]),
    user_service: UserService = Depends(Provide[AutoContainer.user_service])
) -> UserPagePayload:
    """
    查询平台管理员列表（支持分页和用户名模糊查询）
    
    只有租户管理员（主账号或三元模式超级管理员）可以操作
    """
    db, current_user = deps
    # 设置user_service到admin_permission_service
    if hasattr(admin_permission_service, 'user_service'):
        admin_permission_service.user_service = user_service
    return await admin_permission_service.list_platform_admins(db, username=username, page=page, size=size)


@router.get("/platform/users/not-associated", response_model=UserBasePagePayload)
@inject
async def list_not_platform_admins(
    username: Optional[str] = Query(None, description="用户名模糊查询"),
    page: int = Query(1, ge=1, description="页码，从1开始"),
    size: int = Query(10, ge=1, le=100, description="每页条数，最大100"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_tenant_admin),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service]),
    user_service: UserService = Depends(Provide[AutoContainer.user_service])
) -> UserBasePagePayload:
    """
    查询未关联为平台管理员的用户列表（支持分页和用户名模糊查询）
    
    只有租户管理员（主账号或三元模式超级管理员）可以操作
    """
    db, current_user = deps
    # 设置user_service到admin_permission_service
    if hasattr(admin_permission_service, 'user_service'):
        admin_permission_service.user_service = user_service
    return await admin_permission_service.list_not_platform_admins(db, current_user=current_user, username=username, page=page, size=size)


@router.post("/platform/batch-grant", response_model=BatchGrantPlatformAdminResponse, status_code=status.HTTP_200_OK)
@inject
async def batch_grant_platform_admin(
    request: BatchGrantPlatformAdminRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_tenant_admin),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> BatchGrantPlatformAdminResponse:
    """
    批量授权平台管理员
    
    只有租户管理员（主账号或三元模式超级管理员）可以操作
    支持一次授权多个用户，返回成功和失败的详细信息
    """
    db, current_user = deps
    return await admin_permission_service.batch_grant_platform_admin(db, request.user_ids, current_user)


# ==================== 项目管理员管理接口 ====================

@router.post("/project/{project_id}/grant", response_model=GrantProjectAdminResponse, status_code=status.HTTP_201_CREATED)
@inject
async def grant_project_admin(
    project_id: int,
    request: GrantProjectAdminRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> GrantProjectAdminResponse:
    """
    授权项目管理员
    
    只有平台管理员可以操作
    """
    db, current_user = deps
    return await admin_permission_service.grant_project_admin(db, project_id, request.user_id, current_user)


@router.post("/project/{project_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def revoke_project_admin(
    project_id: int,
    request: RevokeProjectAdminRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
):
    """
    撤销项目管理员权限
    
    只有平台管理员可以操作
    """
    db, current_user = deps
    await admin_permission_service.revoke_project_admin(db, project_id, request.user_id, current_user)


@router.get("/project/{project_id}/list", response_model=List[ProjectAdminListItem])
@inject
async def list_project_admins(
    project_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> List[ProjectAdminListItem]:
    """
    查询项目管理员列表
    
    只有平台管理员可以操作
    """
    db, current_user = deps
    return await admin_permission_service.list_project_admins(db, project_id)


@router.post("/project/{project_id}/batch-grant", response_model=BatchGrantProjectAdminResponse, status_code=status.HTTP_200_OK)
@inject
async def batch_grant_project_admin(
    project_id: int,
    request: BatchGrantProjectAdminRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> BatchGrantProjectAdminResponse:
    """
    批量授权项目管理员
    
    只有平台管理员可以操作
    支持一次授权多个用户，返回成功和失败的详细信息
    """
    db, current_user = deps
    return await admin_permission_service.batch_grant_project_admin(db, project_id, request.user_ids, current_user)

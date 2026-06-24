from typing import Tuple, Optional

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, status, Query
from fastapi import BackgroundTasks
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page, Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import Project, JwtUserInfo
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectDetailResponse, ProjectImageBuildNamespace
from app.schemas.user import UserIds, ProjectUserBatchResponse, UserItem
from app.schemas.user_page_payload import UserPagePayload, UserBasePagePayload
from app.services.project.interface import ProjectService
from app.services.user.interface import UserService
from app.services.permission.interface import AdminPermissionService
from app.utils import app_runtime_context
from app.utils.dependencies import get_db_and_user, get_db_and_admin  # 导入组合依赖函数

# 导入统一错误消息工具模块

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.get("/list", response_model=Page[ProjectResponse])
@inject
async def list_projects(
        # 使用组合依赖
        params: Params = Depends(),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
) -> Page[ProjectResponse]:
    """获取项目列表，需要用户认证 - 使用 fastapi-pagination 进行分页"""
    db, current_user = deps  # 解包依赖
    return await project_service.list(current_user=current_user, params=params)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.PROJECT_MANAGER, table_name="projects",
                        operator_type=OperatorType.ADD, operator_content_key=["project.name"],
                        self_service_field_mapping=None, scope_service_field_mapping=None)
async def create_project(
        project: ProjectCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service]),
        admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> Project:
    """创建新项目，需要用户认证"""
    db, current_user = deps  # 解包依赖
    # 设置admin_permission_service到project_service
    if hasattr(project_service, 'admin_permission_service'):
        project_service.admin_permission_service = admin_permission_service
    return await project_service.create(project=project, current_user=current_user)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
@inject
async def get_project(
        project_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
) -> ProjectDetailResponse:
    """获取项目详情，需要用户认证"""
    db, current_user = deps  # 解包依赖

    return await project_service.get_by_id(project_id, current_user)


@router.put("/{project_id}", response_model=ProjectResponse, status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.PROJECT_MANAGER, table_name="projects",
                        operator_type=OperatorType.EDIT, operator_content_key=["project.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_project(
        project_id: int,
        project: ProjectCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service]),
        admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> Project:
    """更新项目，需要用户认证"""
    db, current_user = deps  # 解包依赖
    # 设置admin_permission_service到project_service
    if hasattr(project_service, 'admin_permission_service'):
        project_service.admin_permission_service = admin_permission_service
    return await project_service.update_by_id(project_id, project,current_user)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.PROJECT_MANAGER, table_name="projects",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"},
                        scope_service_field_mapping=None)
async def delete_project(
        project_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),  # 使用组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
) -> None:
    """删除项目及其所有关联数据，需要用户认证
    """
    db, current_user = deps  # 解包依赖
    return await project_service.delete(project_id)




@router.get("/{project_id}/user/list", response_model=UserPagePayload)
@inject
async def project_users_list(
        project_id: int,
        username: Optional[str] = None,
        page: int = Query(1, ge=1, description="页码，从1开始"),
        # 页大小：默认10，最小值1，最大值100（避免一次性返回过多数据）
        size: int = Query(10, ge=1, le=100, description="每页条数，最大100"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),  # 使用管理员组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
) -> UserPagePayload:
    """获取用户列表 - 需要管理员权限，使用 fastapi-pagination 进行分页"""
    db, admin_user = deps  # 解包依赖

    return await project_service.project_users_list(project_id, username, page, size)


@router.get("/{project_id}/users/not-associated", response_model=UserBasePagePayload)
@inject
async def project_not_associated_users_list(
        project_id: int,
        username: Optional[str] = None,
        page: int = Query(1, ge=1, description="页码，从1开始"),
        # 页大小：默认10，最小值1，最大值100（避免一次性返回过多数据）
        size: int = Query(10, ge=1, le=100, description="每页条数，最大100"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),  # 使用管理员组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
) -> UserBasePagePayload:
    """获取用户列表 - 需要管理员权限，使用 fastapi-pagination 进行分页"""
    db, admin_user = deps  # 解包依赖

    return await project_service.project_not_associated_users_list(project_id, username, page, size)


@router.post("/{project_id}/user/batch_save", response_model=ProjectUserBatchResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.PROJECT_MANAGER, table_name="project_user",
                        operator_type=OperatorType.ADD, operator_content_key=None,
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def project_user_batch_save(
        project_id: int,
        request: UserIds,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),  # 使用管理员组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service]),
        user_service: UserService = Depends(Provide[AutoContainer.user_service])
) -> ProjectUserBatchResponse:
    db, admin_user = deps  # 解包依赖

    #
    user: UserItem = await user_service.user_id(request.user_ids[0])
    project: ProjectDetailResponse = await project_service.get_by_id(project_id)
    app_runtime_context.set_operator_log_content(f"{user.username}，{project.name}")

    return await project_service.project_user_batch_save(project_id, request, admin_user)



@router.post("/{project_id}/user/batch_remove", response_model=ProjectUserBatchResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.PROJECT_MANAGER, table_name="project_user",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def project_user_batch_remove(
        project_id: int,
        request: UserIds,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),  # 使用管理员组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service]),
        user_service: UserService = Depends(Provide[AutoContainer.user_service]),
        admin_permission_service: AdminPermissionService = Depends(Provide[AutoContainer.admin_permission_service])
) -> ProjectUserBatchResponse:
    db, admin_user = deps  # 解包依赖

    user: UserItem = await user_service.user_id(request.user_ids[0])
    project: ProjectDetailResponse = await project_service.get_by_id(project_id)
    app_runtime_context.set_operator_log_content(f"{user.username}，{project.name}")
    
    if hasattr(project_service, 'admin_permission_service'):
        project_service.admin_permission_service = admin_permission_service

    return await project_service.project_user_batch_remove(project_id, request, admin_user)



@router.put("/project-image-build-namespace/{project_id}", response_model=ProjectImageBuildNamespace)
@inject
async def update_project_image_build_namespace(
        project_id: int,
        namespace: ProjectImageBuildNamespace,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),  # 使用管理员组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
) -> ProjectImageBuildNamespace:
    """修改项目自定义镜像命名空间，需要管理员"""
    db, current_user = deps  # 解包依赖

    return await project_service.update_project_image_build_namespace(project_id, namespace)

@router.get("/get-project-image-build-namespace/{project_id}", response_model=None)
@inject
async def get_project_image_build_namespace(
        project_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),  # 使用组合依赖
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
):
    """获取项目自定义镜像命名空间"""
    db, current_user = deps  # 解包依赖

    return await project_service.get_project_image_build_namespace(project_id)

@router.post("/set/sa/permission/all", response_model=None)
@inject
async def set_sa_permission_all_projects(
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
):
    """设置所有项目sa权限"""
    return await project_service.set_sa_permission_all_projects()

@router.post("/set/project-read-only-pvc/all", response_model=None)
@inject
async def set_project_read_only_pvc_all(
        project_service: ProjectService = Depends(Provide[AutoContainer.project_service])
):
    """设置所有命名空间只读权限"""
    return await project_service.set_project_read_only_pvc_all()
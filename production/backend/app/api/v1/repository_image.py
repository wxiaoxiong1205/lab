from datetime import datetime
from typing import Tuple, List, Optional, Union

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, status, Query, Path
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page, Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.inference_task import BackendEnum
from app.schemas.repository_image import RepositoryImageResponse, RepositoryImageDetailResponse, RepositoryImageCreate, \
    ImageType, RepositoryImageTypeResp, CardType, CardModel, CudaVersion, SaveNotebookAsImageRequest, \
    SaveNotebookAsImageResponse, ImageBuildLogLogResponse, ImageBuildLogResponse, ImageSource, \
    NotebookBuildingResponse, AddImageRequest
from app.services.repository_image.interface import RepositoryImageService
from app.utils.dependencies import get_db_and_user, get_db_and_admin  # 导入组合依赖函数

# 导入统一错误消息工具模块

router = APIRouter(prefix="/api/v1/repository_images", tags=["repository_images"])


@router.get("/list", response_model=Page[RepositoryImageResponse])
@inject
async def list_repository_images(
        page: int = Query(1, ge=1, description="页码（从 1 开始）"),
        page_size: int = Query(10, ge=1, le=1000, description="每页数量"),
        image_name: Optional[str] = Query(None, max_length=255, description="镜像名模糊搜索"),
        image_type: Optional[ImageType] = Query(None, description="镜像类型过滤"),
        image_source: Optional[ImageSource] = Query(None, description="镜像来源"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> Page[RepositoryImageResponse]:
    """获取镜像列表，使用 fastapi-pagination 进行分页"""
    db, current_user = deps  # 解包依赖

    return await repository_image_service.list_repository_images(page, page_size, image_name, image_type, image_source)


@router.post("/create", response_model=RepositoryImageResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="repository_images",
                        operator_type=OperatorType.ADD, operator_content_key=["repository_image_create.image"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_repository_image(
        repository_image_create: RepositoryImageCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> RepositoryImageResponse:
    """管理员角色-创建镜像"""
    db, current_user = deps
    return await repository_image_service.create_repository_image(repository_image_create, current_user)


@router.get("/{image_id}", response_model=RepositoryImageDetailResponse)
@inject
async def find_repository_image(
        image_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> RepositoryImageDetailResponse:
    """获取镜像详情"""
    db, current_user = deps  # 解包依赖
    return await repository_image_service.find_repository_image(image_id)


@router.put("/{image_id}", response_model=RepositoryImageResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="repository_images",
                        operator_type=OperatorType.EDIT, operator_content_key=["repository_image_update.image"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_repository_image(
        image_id: int,
        repository_image_update: RepositoryImageCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> RepositoryImageResponse:
    """管理员角色-修改镜像"""
    db, current_user = deps

    return await repository_image_service.update_repository_image(image_id, repository_image_update, current_user)


@router.delete("/{image_id}", status_code=204)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="repository_images",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping={
                            "service_name": "repository_image_service",
                            "field_name": "image_id",
                            "tag_field_name": "name"},
                        scope_service_field_mapping=None)
async def delete_repository_image(
        image_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
):
    """管理员角色-删除镜像"""
    db, current_user = deps
    return await repository_image_service.delete_repository_image(image_id)


@router.get("/by_project/{project_id}/{type}", response_model=List[RepositoryImageDetailResponse])
@inject
async def find_image_list_by_project_id(
        project_id: int,
        type: ImageType,
        sub_type: Optional[BackendEnum] = Query(default=None, description="子类型"),
        card_category: Optional[Union[CardType,str]] = Query(default=None, description="显卡类型"),
        card_model: Optional[Union[CardModel,str]] = Query(default=None, description="显卡型号"),
        cuda_version: Optional[Union[CudaVersion,str]] = Query(default=None, description="cuda版本"),
        python_version: Optional[str] = Query(default=None, description="python版本"),
        is_card_model_null: Optional[bool] = Query(default=False, description="是否查找card_model为NULL的默认镜像"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> List[RepositoryImageDetailResponse]:
    """获取镜像列表"""
    db, current_user = deps  # 解包依赖

    return await repository_image_service.find_image_list_by_project_id(
        project_id, type, sub_type, card_category, card_model,
        cuda_version, python_version, is_card_model_null
    )

@router.get("/by_project/{project_id}/{type}/page", response_model=Page[RepositoryImageDetailResponse])
@inject
async def find_image_list_by_project_id_page(
        project_id: int,
        type: ImageType,
        sub_type: Optional[BackendEnum] = Query(default=None, description="子类型"),
        card_category: Optional[Union[CardType,str]] = Query(default=None, description="显卡类型"),
        card_model: Optional[Union[CardModel,str]] = Query(default=None, description="显卡型号"),
        cuda_version: Optional[Union[CudaVersion,str]] = Query(default=None, description="cuda版本"),
        python_version: Optional[str] = Query(default=None, description="python版本"),
        is_card_model_null: Optional[bool] = Query(default=False, description="是否查找card_model为NULL的默认镜像"),
        tag_element_ids: Optional[List[int]] = Query(default=None, description="标签元素ID列表过滤"),
        params: Params = Depends(),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> Page[RepositoryImageDetailResponse]:
    """获取镜像列表"""
    db, current_user = deps  # 解包依赖

    return await repository_image_service.find_image_list_by_project_id_page(
        project_id, type, sub_type, card_category, card_model,
        cuda_version, python_version, is_card_model_null, params, tag_element_ids
    )


@router.get("/find-namespaces/list", response_model=Page[str])
@inject
async def list_namespaces_list(
        repository_id: int = Query(..., gt=0, description="仓库id"),
        search_type: int = Query(1, description="搜索类型（1:命名空间，2:镜像名称）"),
        namespaces: Optional[str] = Query(None, description="命名空间"),
        image_name: Optional[str] = Query(None, description="镜像名称"),
        params: Params = Depends(),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> Page[str]:
    """获取镜像列表，使用 fastapi-pagination 进行分页"""

    return await repository_image_service.list_namespaces_list(repository_id, search_type, namespaces, image_name,
                                                               params)


@router.get("/enums/type-list", response_model=List[RepositoryImageTypeResp])
async def get_repository() -> List[RepositoryImageTypeResp]:
    """返回镜像类型枚举（值+中文描述）"""
    return [
        RepositoryImageTypeResp(label=item.desc, value=item.value)
        for item in ImageType
        if item.is_show
    ]


@router.post("/save-notebook-as-image/{project_id}/{notebook_id}", response_model=SaveNotebookAsImageResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="repository_images",
                        operator_type=OperatorType.ADD, operator_content_key=["save_notebook_as_image.image_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def save_notebook_as_image(
        project_id: int,
        notebook_id: int,
        notebook_as_image_request: SaveNotebookAsImageRequest,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> SaveNotebookAsImageResponse:
    """保存 notebook 环境为自定义镜像"""
    db, current_user = deps
    return await repository_image_service.save_notebook_as_image(project_id, notebook_id, notebook_as_image_request, current_user)

@router.post("/build_image_completed/{task_id}", response_model=RepositoryImageResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="repository_images",
                        operator_type=OperatorType.ADD, operator_content_key=["save_notebook_as_image.image_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def build_image_completed(
        task_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> RepositoryImageResponse:
    """镜像构建任务完成后处理"""
    db, current_user = deps
    return await repository_image_service.build_image_completed(task_id)


@router.get("/build_image/{task_id}/logs", response_model=ImageBuildLogLogResponse)
@inject
async def get_image_build_logs(
        task_id: int = Path(..., description="镜像构建任务ID"),
        end_time: datetime = Query(..., description="结束时间（ISO格式），用于指定Loki查询的结束时间点"),
        days: Optional[int] = Query(30, description="如果没有归档日志，从结束时间往前查询N天的日志"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> ImageBuildLogLogResponse:
    """获取镜像构建任务日志

    Args:
        task_id: 镜像构建任务ID
        end_time: 结束时间（可选），用于指定Loki查询的结束时间点
        days: 如果没有归档日志，从结束时间往前查询N天的日志（可选）
        deps: 组合依赖

    Returns:
        镜像构建任务日志响应，包含是否归档和日志内容
    """
    db, current_user = deps
    return await repository_image_service.get_image_build_logs(task_id, end_time, days)


@router.get("/build_image/{task_id}/logs/range", response_model=ImageBuildLogLogResponse)
@inject
async def get_image_build_logs_by_time_range(
        task_id: int = Path(..., description="镜像构建任务ID"),
        start_time: datetime = Query(..., description="开始时间（ISO格式）"),
        end_time: datetime = Query(..., description="结束时间（ISO格式）"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> ImageBuildLogLogResponse:
    """根据时间范围获取镜像构建任务日志

    Args:
        task_id: 镜像构建任务ID
        start_time: 开始时间（ISO格式）
        end_time: 结束时间（ISO格式）
        deps: 组合依赖

    Returns:
        镜像构建任务日志响应，包含是否归档和日志内容
    """
    db, current_user = deps
    return await repository_image_service.get_image_build_logs_by_time_range(task_id, start_time, end_time)


@router.get("/custom/{project_id}/list", response_model=Page[ImageBuildLogResponse])
@inject
async def list_custom_images(
        project_id: int = Path(..., description="项目ID"),
        business_type: str = Query(..., max_length=255, description="业务类型"),
        page: Optional[Page] = None,
        size: Optional[int] = None,
        image_name: Optional[str] = Query(None, max_length=255, description="镜像名模糊搜索（基于输出镜像名称）"),
        image_type: Optional[ImageType] = Query(None, description="镜像类型过滤"),
        status: Optional[str] = Query(None, description="构建状态过滤"),
        tag_element_ids: Optional[List[int]] = Query(None, description="标签元素ID列表过滤"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> Page[ImageBuildLogResponse]:
    """获取项目下的镜像构建记录列表（分页）"""
    db, current_user = deps
    return await repository_image_service.list_custom_images(
        project_id, business_type, page, size, image_name, image_type, status, tag_element_ids
    )


@router.delete("/build_image/{build_log_id}", status_code=204)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="image_build_log",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def delete_image_build_log(
        build_log_id: int = Path(..., description="镜像构建记录ID"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
):
    """删除镜像构建记录（只能删除失败或完成的记录，同时删除repository_images表中的镜像(屏蔽删除仓库镜像)）"""
    db, current_user = deps
    return await repository_image_service.delete_image_build_log(build_log_id)


@router.post("/custom/{project_id}/add-image", response_model=ImageBuildLogResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_LIST, table_name="image_build_log",
                        operator_type=OperatorType.ADD, operator_content_key=["request.image_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def add_image(
        project_id: int = Path(..., description="项目ID"),
        request: AddImageRequest = ...,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> ImageBuildLogResponse:
    """添加镜像到 image_build_log 表"""
    db, current_user = deps
    return await repository_image_service.add_image(project_id, request, current_user)


@router.get("/build_image/{notebook_id}/is_notebook_building", response_model=NotebookBuildingResponse)
@inject
async def is_notebook_building(
        notebook_id: int = Path(..., description="Notebook ID"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_image_service: RepositoryImageService = Depends(Provide[AutoContainer.repository_image_service])
) -> NotebookBuildingResponse:
    """检查 notebook 是否正在构建镜像"""
    db, current_user = deps
    return await repository_image_service.is_notebook_building(notebook_id)

from typing import Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page, pagination_ctx
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.custom_params import CustomParams
from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.file_management import FileFolderResponse, FileManagementFileResponse
from app.schemas.openapi.v1.common import OpenApiPageData, OpenApiResponse, openapi_success
from app.schemas.openapi.v1.file_management import (
    OpenFileFolder,
    OpenFileFolderCreate,
    OpenFileFolderUpdate,
    OpenFileManagementFile,
)
from app.services.file_management.interface import FileManagementService
from app.services.openapi.v1.file_management_service import (
    to_file_folder,
    to_file_folder_page,
    to_file_management_file,
    to_file_management_file_page,
)
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/file-management", tags=["openapi-file-management"])


@router.post(
    "/folders",
    response_model=OpenApiResponse[OpenFileFolder],
    status_code=status.HTTP_201_CREATED,
    summary="创建文件夹",
    operation_id="openapi_v1_file_management_create_folder",
)
@inject
async def create_folder(
    folder: OpenFileFolderCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenFileFolder]:
    db, current_user = deps
    result = await file_management_service.create_folder(folder, current_user)
    return openapi_success(to_file_folder(result))


@router.get(
    "/folders",
    response_model=OpenApiResponse[OpenApiPageData[OpenFileFolder]],
    summary="查询文件夹列表",
    operation_id="openapi_v1_file_management_list_folders",
    dependencies=[Depends(pagination_ctx(Page[FileFolderResponse], CustomParams))],
)
@inject
async def list_folders(
    project_id: int = Query(..., description="项目 ID。"),
    folder_name: Optional[str] = Query(None, description="文件夹名称模糊搜索。"),
    page: Optional[int] = Query(1, ge=1, description="页码。"),
    size: Optional[int] = Query(10, ge=1, le=100, description="每页数量。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenApiPageData[OpenFileFolder]]:
    db, current_user = deps
    result = await file_management_service.list_folders(project_id, folder_name, page, size, current_user)
    return openapi_success(to_file_folder_page(result))


@router.get(
    "/folders/{folder_id}",
    response_model=OpenApiResponse[OpenFileFolder],
    summary="查询文件夹详情",
    operation_id="openapi_v1_file_management_get_folder",
)
@inject
async def get_folder(
    folder_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenFileFolder]:
    db, current_user = deps
    result = await file_management_service.get_folder(folder_id, current_user)
    return openapi_success(to_file_folder(result))


@router.put(
    "/folders/{folder_id}",
    response_model=OpenApiResponse[OpenFileFolder],
    summary="更新文件夹",
    operation_id="openapi_v1_file_management_update_folder",
)
@inject
async def update_folder(
    folder_id: int,
    folder_update: OpenFileFolderUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenFileFolder]:
    db, current_user = deps
    result = await file_management_service.update_folder(folder_id, folder_update, current_user)
    return openapi_success(to_file_folder(result))


@router.delete(
    "/folders",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="删除文件夹",
    operation_id="openapi_v1_file_management_delete_folder",
)
@inject
async def delete_folder(
    folder_ids: Optional[str] = Query(None, description="文件夹 ID 字符串，多个 ID 用英文逗号分隔。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[None]:
    db, current_user = deps
    await file_management_service.delete_folder(folder_ids=folder_ids, current_user=current_user)
    return openapi_success()


@router.get(
    "/files",
    response_model=OpenApiResponse[OpenApiPageData[OpenFileManagementFile]],
    summary="查询文件列表",
    operation_id="openapi_v1_file_management_list_files",
    dependencies=[Depends(pagination_ctx(Page[FileManagementFileResponse], CustomParams))],
)
@inject
async def list_files(
    project_id: int = Query(..., description="项目 ID。"),
    folder_id: Optional[int] = Query(None, description="文件夹 ID，为空时查询所有文件。"),
    file_name: Optional[str] = Query(None, description="文件名模糊搜索。"),
    suffix: Optional[str] = Query(None, description="文件后缀搜索，如 jsonl、jpg。"),
    page: Optional[int] = Query(1, ge=1, description="页码。"),
    size: Optional[int] = Query(10, ge=1, le=100, description="每页数量。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenApiPageData[OpenFileManagementFile]]:
    db, current_user = deps
    result = await file_management_service.list_files(project_id, folder_id, file_name, suffix, page, size, current_user)
    return openapi_success(to_file_management_file_page(result))


@router.get(
    "/files/download",
    summary="下载文件",
    operation_id="openapi_v1_file_management_download_file",
)
@inject
async def download_file(
    file_id: Optional[int] = Query(None, description="单个文件 ID。"),
    file_ids: Optional[str] = Query(None, description="文件 ID 字符串，多个 ID 用英文逗号分隔。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> StreamingResponse:
    db, current_user = deps
    return await file_management_service.download_file(file_id=file_id, file_ids=file_ids, current_user=current_user)


@router.get(
    "/files/{file_id}",
    response_model=OpenApiResponse[OpenFileManagementFile],
    summary="查询文件详情",
    operation_id="openapi_v1_file_management_get_file",
)
@inject
async def get_file(
    file_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenFileManagementFile]:
    db, current_user = deps
    result = await file_management_service.get_file(file_id, current_user)
    return openapi_success(to_file_management_file(result))


@router.delete(
    "/files",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="删除文件",
    operation_id="openapi_v1_file_management_delete_file",
)
@inject
async def delete_file(
    file_ids: str = Query(..., description="文件 ID 字符串，多个 ID 用英文逗号分隔。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[None]:
    db, current_user = deps
    await file_management_service.delete_file(file_ids, current_user)
    return openapi_success()


@router.post(
    "/files/add",
    response_model=OpenApiResponse[OpenFileManagementFile],
    status_code=status.HTTP_201_CREATED,
    summary="保存上传文件信息",
    operation_id="openapi_v1_file_management_save_file_by_upload_id",
)
@inject
async def save_file_by_upload_id(
    upload_id: str = Query(..., description="上传会话 ID。"),
    project_id: int = Query(..., description="项目 ID。"),
    folder_id: Optional[int] = Query(None, description="文件夹 ID，为空表示根目录。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service]),
) -> OpenApiResponse[OpenFileManagementFile]:
    db, current_user = deps
    result = await file_management_service.save_file_info_by_upload_id(
        upload_id=upload_id,
        project_id=project_id,
        folder_id=folder_id,
        current_user=current_user,
    )
    return openapi_success(to_file_management_file(result))

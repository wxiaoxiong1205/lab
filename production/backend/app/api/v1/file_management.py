from typing import Optional, List
from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, status, Query
from fastapi_pagination import Page

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.file_management import (
    FileFolderCreate,
    FileFolderUpdate,
    FileFolderResponse,
    FileManagementFileResponse
)
from app.services.file_management.interface import FileManagementService
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/file-management", tags=["file-management"])


@router.post("/folders", response_model=FileFolderResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_folder(
    folder: FileFolderCreate,
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> FileFolderResponse:
    """创建文件夹
    
    ## 功能说明
    在指定项目下创建文件夹，用于组织文件。
    
    ## 请求参数
    - `name`: 文件夹名称（必填，1-100字符）
    - `description`: 文件夹描述（可选，最大500字符）
    - `project_id`: 项目ID（必填）
    
    ## 业务规则
    - 同一项目下文件夹名称不能重复
    - 文件夹名称不能为空
    - 需要验证项目是否存在
    """
    return await file_management_service.create_folder(folder, current_user)


@router.get("/folders", response_model=Page[FileFolderResponse], status_code=status.HTTP_200_OK)
@inject
async def list_folders(
    project_id: int = Query(..., description="项目ID"),
    name: Optional[str] = Query(None, description="文件夹名称模糊搜索"),
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> Page[FileFolderResponse]:
    """查询文件夹列表
    
    ## 功能说明
    查询指定项目下的文件夹列表，支持按名称模糊搜索。
    
    ## 查询参数
    - `project_id`: 项目ID（必填）
    - `name`: 文件夹名称模糊搜索（可选）
    - `page`: 页码（可选，默认1）
    - `size`: 每页数量（可选，默认10，最大100）
    """
    return await file_management_service.list_folders(project_id, name, page, size, current_user)


@router.get("/folders/{folder_id}", response_model=FileFolderResponse, status_code=status.HTTP_200_OK)
@inject
async def get_folder(
    folder_id: int,
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> FileFolderResponse:
    """查询文件夹详情
    
    ## 功能说明
    查询指定文件夹的详细信息，包括文件数量。
    
    ## 路径参数
    - `folder_id`: 文件夹ID
    """
    return await file_management_service.get_folder(folder_id, current_user)


@router.put("/folders/{folder_id}", response_model=FileFolderResponse, status_code=status.HTTP_200_OK)
@inject
async def update_folder(
    folder_id: int,
    folder_update: FileFolderUpdate,
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> FileFolderResponse:
    """更新文件夹
    
    ## 功能说明
    更新文件夹的名称和描述。
    
    ## 路径参数
    - `folder_id`: 文件夹ID
    
    ## 请求参数
    - `name`: 文件夹名称（可选，1-100字符）
    - `description`: 文件夹描述（可选，最大500字符）
    
    ## 业务规则
    - 更新后文件夹名称在同一项目下不能重复
    - 只能更新名称和描述
    """
    return await file_management_service.update_folder(folder_id, folder_update, current_user)

@router.delete("/folders", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_folder(
    folder_ids: Optional[str] = Query(None, description="文件夹ID字符串，多个ID用英文逗号分隔，例如：1,2,3"),
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> None:
    """删除文件夹（支持批量删除）
    
    ## 功能说明
    删除指定文件夹。只有当文件夹下没有文件时才能删除。支持批量删除。
    
    ## 查询参数
    - `folder_ids`: 文件夹ID字符串，多个ID用英文逗号分隔，例如：1,2,3
    
    ## 业务规则
    - 必须提供`folder_ids` 之一
    - 只有当文件夹下没有文件时才能删除
    - 如果文件夹下有文件，返回错误提示
    - 批量删除时，若文件夹下有文件，跳过删除该文件
    """
    return await file_management_service.delete_folder(folder_ids=folder_ids, current_user=current_user)


@router.get("/files", response_model=Page[FileManagementFileResponse], status_code=status.HTTP_200_OK)
@inject
async def list_files(
    project_id: int = Query(..., description="项目ID"),
    folder_id: Optional[int] = Query(None, description="文件夹ID，为空时查询所有文件"),
    name: Optional[str] = Query(None, description="文件名模糊搜索"),
    suffix: Optional[str] = Query(None, description="文件后缀搜索（如：jsonl、jpg）"),
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> Page[FileManagementFileResponse]:
    """查询文件列表
    
    ## 功能说明
    查询指定项目下的文件列表，支持按文件夹、文件名、文件后缀筛选。
    
    ## 查询参数
    - `project_id`: 项目ID（必填）
    - `folder_id`: 文件夹ID（可选，为空时查询所有文件）
    - `name`: 文件名模糊搜索（可选）
    - `suffix`: 文件后缀搜索（可选，如：jsonl、jpg，不需要包含点号）
    - `page`: 页码（可选，默认1）
    - `size`: 每页数量（可选，默认10，最大100）
    """
    return await file_management_service.list_files(project_id, folder_id, name, suffix, page, size, current_user)


@router.get("/files/download", status_code=status.HTTP_200_OK)
@inject
async def download_file(
    file_id: Optional[int] = Query(None, description="单个文件ID（单个下载时使用）"),
    file_ids: Optional[str] = Query(None, description="文件ID字符串，多个ID用英文逗号分隔（批量下载时使用，会打包为zip），例如：1,2,3"),
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
):
    """下载文件
    
    ## 功能说明
    下载指定文件，支持单个文件下载或批量文件下载（批量下载会打包为zip）。
    
    ## 查询参数
    - `file_id`: 单个文件ID（单个下载时使用）
    - `file_ids`: 文件ID字符串，多个ID用英文逗号分隔（批量下载时使用，会打包为zip），例如：1,2,3
    
    ## 响应
    - 单个文件：文件流（StreamingResponse）
    - 批量文件：ZIP文件流（StreamingResponse）
    
    ## 业务规则
    - 必须提供 `file_id` 或 `file_ids` 之一
    - 单个下载：从 JuiceFS 读取文件并流式返回
    - 批量下载：将所有文件打包为zip并流式返回
    - 支持大文件下载
    - 如果文件不存在，返回 404
    """
    return await file_management_service.download_file(file_id=file_id, file_ids=file_ids, current_user=current_user)


@router.get("/files/{file_id}", response_model=FileManagementFileResponse, status_code=status.HTTP_200_OK)
@inject
async def get_file(
    file_id: int,
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> FileManagementFileResponse:
    """查询文件详情
    
    ## 功能说明
    查询指定文件的详细信息。
    
    ## 路径参数
    - `file_id`: 文件ID
    """
    return await file_management_service.get_file(file_id, current_user)


@router.delete("/files", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_file(
    file_ids: str = Query(..., description="文件ID字符串，多个ID用英文逗号分隔，例如：1,2,3"),
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> None:
    """删除文件（支持批量删除）
    
    ## 功能说明
    删除指定文件，支持批量删除。同时删除JuiceFS中的实际文件、数据库记录、上传会话和分片上传记录。
    
    ## 查询参数
    - `file_ids`: 文件ID字符串，多个ID用英文逗号分隔，例如：1,2,3
    
    ## 业务规则
    - 删除文件记录
    - 删除 JuiceFS 中的实际文件
    - 删除对应的上传会话（ChunkUploadSession）
    - 删除对应的分片上传记录（ChunkUploadRecord）
    - 如果删除失败，记录错误日志但不影响数据库记录删除
    - 批量删除时，如果某个文件删除失败，会继续删除其他文件
    - 删除前会打印需要删除的文件ID列表
    """
    return await file_management_service.delete_file(file_ids, current_user)


@router.post("/files/add", response_model=FileManagementFileResponse, status_code=status.HTTP_201_CREATED)
@inject
async def save_file_by_upload_id(
    upload_id: str = Query(..., description="上传会话ID"),
    project_id: int = Query(..., description="项目ID"),
    folder_id: Optional[int] = Query(None, description="文件夹ID（可选，为空表示根目录）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    file_management_service: FileManagementService = Depends(Provide[AutoContainer.file_management_service])
) -> FileManagementFileResponse:
    """根据 upload_id 保存文件信息
    
    ## 功能说明
    在分片上传成功后，根据 upload_id 从 ChunkUploadSession 中获取文件信息并保存到文件管理表。
    
    ## 查询参数
    - `upload_id`: 上传会话ID（必填）
    - `project_id`: 项目ID（必填）
    - `folder_id`: 文件夹ID（可选，为空表示根目录）
    
    ## 业务规则
    - 上传会话必须已完成（is_complete=True）
    - 文件URL必须存在
    - 如果文件信息已存在，返回现有记录
    - 如果指定了文件夹ID，必须验证文件夹存在且属于该项目
    """
    return await file_management_service.save_file_info_by_upload_id(
        upload_id=upload_id,
        project_id=project_id,
        folder_id=folder_id,
        current_user=current_user
    )

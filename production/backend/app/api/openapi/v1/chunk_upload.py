from typing import Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, File, Form, Path, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.chunk_upload import (
    ChunkUploadFileUsage,
    ChunkUploadInitRequest,
    ChunkUploadMergeRequest,
    ChunkUploadProgressRequest,
)
from app.schemas.openapi.v1.chunk_upload import (
    OpenChunkUploadCompleteRequest,
    OpenChunkUploadCompleteResponse,
    OpenChunkUploadInitRequest,
    OpenChunkUploadInitResult,
    OpenChunkUploadProgressResponse,
)
from app.schemas.openapi.v1.common import OpenApiResponse, openapi_success
from app.services.chunk_upload.interface import ChunkUploadService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/uploads", tags=["openapi-uploads"])


@router.post(
    "/init",
    response_model=OpenApiResponse[OpenChunkUploadInitResult],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="初始化分片上传",
    operation_id="openapi_v1_uploads_create_upload",
)
@inject
async def create_upload(
    request: OpenChunkUploadInitRequest = Body(..., description="初始化分片上传请求。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service]),
) -> OpenApiResponse[OpenChunkUploadInitResult]:
    result = await chunk_upload_service.init_upload(
        ChunkUploadInitRequest(
            fileName=request.file_name,
            fileSize=request.file_size,
            chunkSize=request.chunk_size,
            fileHash=request.file_hash,
        )
    )
    return openapi_success(OpenChunkUploadInitResult(upload_id=result.uploadId, exists=result.exists))


@router.put(
    "/{upload_id}/chunks/{chunk_index}",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="上传文件分片",
    operation_id="openapi_v1_uploads_upload_chunk",
)
@inject
async def upload_chunk(
    upload_id: str = Path(..., description="上传会话 ID。"),
    chunk_index: int = Path(..., ge=0, description="分片索引，从 0 开始。"),
    file: UploadFile = File(..., description="分片文件。"),
    file_hash: str = Form(..., description="文件 SHA-256 哈希值。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service]),
) -> OpenApiResponse[None]:
    await chunk_upload_service.upload_chunk(
        upload_id=upload_id,
        chunk_index=chunk_index,
        file_hash=file_hash,
        chunk_file=file,
    )
    return openapi_success()


@router.post(
    "/{upload_id}/complete",
    response_model=OpenApiResponse[OpenChunkUploadCompleteResponse],
    response_model_exclude_none=True,
    summary="完成分片上传",
    operation_id="openapi_v1_uploads_complete_upload",
)
@inject
async def complete_upload(
    request: OpenChunkUploadCompleteRequest = Body(..., description="完成分片上传请求。"),
    upload_id: str = Path(..., description="上传会话 ID。"),
    usage: Optional[ChunkUploadFileUsage] = Query(ChunkUploadFileUsage.PUBLIC, description="文件用途。"),
    project_id: Optional[int] = Query(None, description="项目 ID。非公共用途时必填。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service]),
) -> OpenApiResponse[OpenChunkUploadCompleteResponse]:
    merge_request = ChunkUploadMergeRequest(
        uploadId=upload_id,
        fileHash=request.file_hash,
        fileName=request.file_name,
        totalChunks=request.total_chunks,
    ).model_copy(update={"usage": usage, "project_id": project_id})
    result = await chunk_upload_service.merge_chunks(merge_request)
    return openapi_success(
        OpenChunkUploadCompleteResponse(
            file_name=result.fileName,
            file_size=result.fileSize,
            upload_id=result.uploadId,
            chunk_size=result.chunkSize,
            total_chunks=result.totalChunkNum,
            success=result.success,
            error=result.error,
            file_url=result.fileUrl,
            start_time=result.startTime,
            end_time=result.endTime,
        ),
    )


@router.get(
    "/{upload_id}",
    response_model=OpenApiResponse[OpenChunkUploadProgressResponse],
    summary="查询分片上传进度",
    operation_id="openapi_v1_uploads_get_upload",
)
@inject
async def get_upload(
    upload_id: str = Path(..., description="上传会话 ID。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service]),
) -> OpenApiResponse[OpenChunkUploadProgressResponse]:
    result = await chunk_upload_service.get_progress(ChunkUploadProgressRequest(uploadId=upload_id))
    return openapi_success(
        OpenChunkUploadProgressResponse(
            uploaded_chunks=result.uploadedChunks,
            is_complete=result.isComplete,
        ),
    )

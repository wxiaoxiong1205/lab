from typing import Tuple, Optional
from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, status, Body, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.core.logging import logger
from app.models.models import JwtUserInfo
from app.schemas.chunk_upload import (
    ChunkUploadInitRequest,
    ChunkUploadInitResult,
    StandardResponse,
    ChunkUploadMergeRequest,
    ChunkUploadMergeResponse,
    ChunkUploadProgressRequest,
    ChunkUploadProgressResponse,
    ChunkUploadFileUsage
)
from app.services.chunk_upload.interface import ChunkUploadService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/upload", tags=["chunk-upload"])


@router.post("/init", response_model=StandardResponse[ChunkUploadInitResult], status_code=status.HTTP_200_OK)
@inject
async def init_upload(
    request: ChunkUploadInitRequest = Body(..., description="初始化上传请求"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service])
) -> StandardResponse[ChunkUploadInitResult]:
    """初始化上传会话
    
    ## 功能说明
    创建新的上传会话，支持断点续传。不再支持秒传，即使文件已存在也会创建新的上传会话。
    
    ## 请求格式
    使用 JSON body 格式：
    
    ```json
    {
        "fileName": "example.xlsx",
        "fileSize": 223642,
        "chunkSize": 5242880,
        "fileHash": "581f6c463a27c9874bbc88f08b778645bbcb17ed8ad10c8c4eeca4d7e3307291",
    }
    ```
    
    ## 请求参数
    - `fileName`: 文件名（必填）
    - `fileSize`: 文件大小（字节，必填，>0）
    - `chunkSize`: 分片大小（字节，必填，>0）
    - `fileHash`: 文件SHA-256哈希值（必填）
    
    ## 响应格式
    ```json
    {
        "code": 0,
        "message": "success",
        "result": {
            "uploadId": "上传会话ID",
            "exists": false
        }
    }
    ```
    
    - `code`: 状态码，0表示成功
    - `message`: 错误信息
    - `result`: 结果数据
      - `uploadId`: 上传会话ID
      - `exists`: 文件是否已存在（可选）
    """
    db, current_user = deps
    try:
        response = await chunk_upload_service.init_upload(request)
        return StandardResponse(
            code=0,
            message="success",
            result=ChunkUploadInitResult(
                uploadId=response.uploadId,
                exists=response.exists
            )
        )
    except HTTPException as e:
        # HTTPException 需要转换为标准响应格式
        return StandardResponse(
            code=e.status_code,
            message=e.detail if isinstance(e.detail, str) else str(e.detail),
            result=None
        )
    except Exception as e:
        logger.error(f"初始化上传失败: {str(e)}", exc_info=True)
        return StandardResponse(
            code=500,
            message=f"初始化上传失败: {str(e)}",
            result=None
        )


@router.post("/chunk", response_model=StandardResponse[None], status_code=status.HTTP_200_OK)
@inject
async def upload_chunk(
    file: UploadFile = File(..., description="分片文件"),
    chunkIndex: int = Form(..., ge=0, description="分片索引"),
    uploadId: str = Form(..., description="上传会话ID"),
    fileHash: str = Form(..., description="文件SHA-256哈希值"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service])
) -> StandardResponse[None]:
    """上传分片
    
    ## 功能说明
    上传单个分片文件。支持断点续传，已上传的分片会被跳过。
    
    ## 请求参数
    - `file`: 分片文件（二进制数据）
    - `chunkIndex`: 分片索引（从0开始）
    - `uploadId`: 上传会话ID
    - `fileHash`: 文件SHA-256哈希值
    
    ## 响应格式
    ```json
    {
        "code": 0,
        "message": "success",
        "result": null
    }
    ```
    
    - `code`: 状态码，0表示成功
    - `message`: 错误信息
    - `result`: 结果数据（成功时为 null）
    """
    db, current_user = deps
    try:
        await chunk_upload_service.upload_chunk(
            upload_id=uploadId,
            chunk_index=chunkIndex,
            file_hash=fileHash,
            chunk_file=file
        )
        return StandardResponse(
            code=0,
            message="success",
            result=None
        )
    except HTTPException as e:
        # HTTPException 需要转换为标准响应格式
        return StandardResponse(
            code=e.status_code,
            message=e.detail if isinstance(e.detail, str) else str(e.detail),
            result=None
        )
    except Exception as e:
        logger.error(f"上传分片失败: {str(e)}", exc_info=True)
        return StandardResponse(
            code=500,
            message=f"上传分片失败: {str(e)}",
            result=None
        )


@router.post("/merge", response_model=StandardResponse[ChunkUploadMergeResponse], status_code=status.HTTP_200_OK)
@inject
async def merge_chunks(
    request: ChunkUploadMergeRequest = Body(..., description="合并分片请求"),
    usage: Optional[ChunkUploadFileUsage] = Query(ChunkUploadFileUsage.PUBLIC, description="文件用途（可选，默认为 public）"),
    project_id: Optional[int] = Query(None, description="项目id（当用途不为公共时，需要提供项目id）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service]),
) -> StandardResponse[ChunkUploadMergeResponse]:
    """合并分片
    
    ## 功能说明
    合并所有已上传的分片，生成最终文件。根据 usage 参数将文件存储到不同目录。
    合并完成后会清理临时分片文件。
    
    ## 请求格式
    使用 JSON body 格式：
    
    ```json
    {
        "uploadId": "上传会话ID",
        "fileHash": "文件SHA-256哈希值",
        "fileName": "文件名",
        "totalChunks": 总分片数
    }
    ```
    
    ## 请求参数
    
    ### Body 参数（JSON）
    - `uploadId`: 上传会话ID（必填）
    - `fileHash`: 文件SHA-256哈希值（必填）
    - `fileName`: 文件名（必填）
    - `totalChunks`: 总分片数（必填，>0）
    
    ### Query 参数
    - `usage`: 文件用途（可选，默认为 `public`）
      - `public`: 公共用途，文件保存到 `/public/chunk_upload/files/{upload_id}/`
      - `file-management`: 文件管理用途，文件保存到 `/{namespace}/file-management/{base_path}/`
    - `project_id`: 项目id（可选，当用途不为公共时，需要提供项目id）
    
    ## 响应格式
    ```json
    {
        "code": 0,
        "message": "success",
        "result": {
            "fileName": "文件名称",
            "fileSize": 文件大小,
            "uploadId": "上传会话标识",
            "chunkSize": 分片大小,
            "totalChunkNum": 分片数量,
            "success": true,
            "fileUrl": "文件上传地址",
            "startTime": "开始时间",
            "endTime": "结束时间"
        }
    }
    ```
    
    - `code`: 状态码，0表示成功
    - `message`: 错误信息
    - `result`: 结果数据
      - `fileName`: 文件名称
      - `fileSize`: 文件大小
      - `uploadId`: 上传会话标识
      - `chunkSize`: 分片大小
      - `totalChunkNum`: 分片数量
      - `success`: 是否成功
      - `fileUrl`: 文件上传地址（JuiceFS路径）
      - `startTime`: 开始时间
      - `endTime`: 结束时间
    """
    db, current_user = deps
    try:
        # 将 Query 参数合并到 request 对象中
        merge_request = request.model_copy(update={
            "usage": usage,
            "project_id": project_id
        })
        
        response = await chunk_upload_service.merge_chunks(merge_request)
        return StandardResponse(
            code=0,
            message="success",
            result=response
        )
    except HTTPException as e:
        # HTTPException 需要转换为标准响应格式
        return StandardResponse(
            code=e.status_code,
            message=e.detail if isinstance(e.detail, str) else str(e.detail),
            result=None
        )
    except Exception as e:
        logger.error(f"合并分片失败: {str(e)}", exc_info=True)
        return StandardResponse(
            code=500,
            message=f"合并分片失败: {str(e)}",
            result=None
        )


@router.get("/progress", response_model=StandardResponse[ChunkUploadProgressResponse], status_code=status.HTTP_200_OK)
@inject
async def get_progress(
    uploadId: str = Query(..., description="上传会话ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    chunk_upload_service: ChunkUploadService = Depends(Provide[AutoContainer.chunk_upload_service])
) -> StandardResponse[ChunkUploadProgressResponse]:
    """查询上传进度
    
    ## 功能说明
    查询指定上传会话的进度信息，包括已上传的分片列表和完成状态。
    
    ## 请求参数
    - `uploadId`: 上传会话ID
    
    ## 响应格式
    ```json
    {
        "code": 0,
        "message": "success",
        "result": {
            "uploadedChunks": [0, 1, 2],
            "isComplete": false
        }
    }
    ```
    
    - `code`: 状态码，0表示成功
    - `message`: 错误信息
    - `result`: 结果数据
      - `uploadedChunks`: 已上传分片索引列表
      - `isComplete`: 是否已完成
    """
    db, current_user = deps
    try:
        request = ChunkUploadProgressRequest(uploadId=uploadId)
        response = await chunk_upload_service.get_progress(request)
        return StandardResponse(
            code=0,
            message="success",
            result=response
        )
    except HTTPException as e:
        # HTTPException 需要转换为标准响应格式
        return StandardResponse(
            code=e.status_code,
            message=e.detail if isinstance(e.detail, str) else str(e.detail),
            result=None
        )
    except Exception as e:
        logger.error(f"查询上传进度失败: {str(e)}", exc_info=True)
        return StandardResponse(
            code=500,
            message=f"查询上传进度失败: {str(e)}",
            result=None
        )



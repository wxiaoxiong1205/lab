from abc import ABC, abstractmethod
from typing import List
from fastapi import UploadFile

from app.repository.chunk_upload_mapper import ChunkUploadMapper
from app.repository.chunk_upload_record_mapper import ChunkUploadRecordMapper
from app.schemas.chunk_upload import (
    ChunkUploadInitRequest,
    ChunkUploadInitResponse,
    ChunkUploadMergeRequest,
    ChunkUploadMergeResponse,
    ChunkUploadProgressRequest,
    ChunkUploadProgressResponse
)
from app.services.storage.interface import StorageService


class ChunkUploadService(ABC):
    """分片上传服务抽象接口类"""

    def __init__(self, mapper: ChunkUploadMapper, record_mapper: ChunkUploadRecordMapper, storage: StorageService) -> None:
        self.storage = storage
        self.mapper = mapper
        self.record_mapper = record_mapper
    
    @abstractmethod
    async def init_upload(
        self,
        request: ChunkUploadInitRequest
    ) -> ChunkUploadInitResponse:
        """初始化上传会话"""
        pass
    
    @abstractmethod
    async def upload_chunk(
        self,
        upload_id: str,
        chunk_index: int,
        file_hash: str,
        chunk_file: UploadFile
    ) -> None:
        """上传分片"""
        pass
    
    @abstractmethod
    async def merge_chunks(
        self,
        request: ChunkUploadMergeRequest
    ) -> ChunkUploadMergeResponse:
        """合并分片"""
        pass
    
    @abstractmethod
    async def get_progress(
        self,
        request: ChunkUploadProgressRequest
    ) -> ChunkUploadProgressResponse:
        """查询上传进度"""
        pass
    
    @abstractmethod
    async def cleanup_upload_data(
        self,
        upload_id: str
    ) -> None:
        """清理分片上传相关的数据
        
        删除分片上传的原始文件、上传会话和分片记录。
        该方法通常在上传的文件被成功使用后调用（如文件已保存到最终位置）。
        
        Args:
            upload_id: 分片上传ID
        """
        pass
    
    @abstractmethod
    async def get_file_by_upload_id(
        self,
        upload_id: str
    ) -> UploadFile:
        """通过upload_id从JuiceFS获取分片上传的文件
        
        该方法用于获取已完成分片上传的文件，返回UploadFile对象，方便其他服务复用。
        
        Args:
            upload_id: 分片上传ID
            
        Returns:
            UploadFile: 文件对象，包含文件名和内容
            
        Raises:
            HTTPException: 如果上传会话不存在、未完成或文件不存在
        """
        pass



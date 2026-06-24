from abc import ABC, abstractmethod
from typing import Optional
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page

from app.models.models import JwtUserInfo
from app.schemas.file_management import (
    FileFolderCreate,
    FileFolderUpdate,
    FileFolderResponse,
    FileManagementFileResponse
)
from app.services.storage.interface import StorageService


class FileManagementService(ABC):
    """文件管理服务接口"""
    
    def __init__(self, storage: StorageService) -> None:
        self.storage = storage
    
    @abstractmethod
    async def create_folder(
        self,
        folder: FileFolderCreate,
        current_user: JwtUserInfo
    ) -> FileFolderResponse:
        """创建文件夹"""
        pass
    
    @abstractmethod
    async def list_folders(
        self,
        project_id: int,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> Page[FileFolderResponse]:
        """查询文件夹列表"""
        pass
    
    @abstractmethod
    async def get_folder(
        self,
        folder_id: int,
        current_user: Optional[JwtUserInfo] = None
    ) -> FileFolderResponse:
        """查询文件夹详情"""
        pass
    
    @abstractmethod
    async def update_folder(
        self,
        folder_id: int,
        folder_update: FileFolderUpdate,
        current_user: JwtUserInfo
    ) -> FileFolderResponse:
        """更新文件夹"""
        pass
    
    @abstractmethod
    async def delete_folder(
        self,
        folder_ids: Optional[str] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> None:
        """删除文件夹（支持批量删除）
        
        Args:
            folder_ids: 多个文件夹ID，用英文逗号分隔（如："1,2,3"）
            current_user: 当前用户信息
        """
        pass
    
    @abstractmethod
    async def save_file_info_by_upload_id(
        self,
        upload_id: str,
        project_id: int,
        folder_id: Optional[int],
        current_user: JwtUserInfo
    ) -> FileManagementFileResponse:
        """根据 upload_id 保存文件信息（上传成功后调用）
        
        从 ChunkUploadSession 中获取文件信息并保存到文件管理表
        """
        pass
    
    @abstractmethod
    async def list_files(
        self,
        project_id: int,
        folder_id: Optional[int] = None,
        name: Optional[str] = None,
        suffix: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> Page[FileManagementFileResponse]:
        """查询文件列表"""
        pass
    
    @abstractmethod
    async def get_file(
        self,
        file_id: int,
        current_user: Optional[JwtUserInfo] = None
    ) -> FileManagementFileResponse:
        """查询文件详情"""
        pass
    
    @abstractmethod
    async def delete_file(
        self,
        file_ids: str,
        current_user: Optional[JwtUserInfo] = None
    ) -> None:
        """删除文件（支持批量删除）
        
        Args:
            file_ids: 文件ID字符串，多个ID用英文逗号分隔（如："1,2,3"）
            current_user: 当前用户信息
        """
        pass
    
    @abstractmethod
    async def download_file(
        self,
        file_id: Optional[int] = None,
        file_ids: Optional[str] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> StreamingResponse:
        """下载文件
        
        支持单个文件下载或批量文件下载（打包为zip）
        
        Args:
            file_id: 单个文件ID（单个下载时使用）
            file_ids: 文件ID字符串，多个ID用英文逗号分隔（批量下载时使用，会打包为zip）
            current_user: 当前用户信息（可选）
        """
        pass


from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from fastapi_pagination import Page


class FileFolderCreate(BaseModel):
    """创建文件夹请求"""
    name: str = Field(..., min_length=1, max_length=100, description="文件夹名称")
    description: Optional[str] = Field(None, max_length=1000, description="文件夹描述")
    project_id: int = Field(..., description="项目ID")


class FileFolderUpdate(BaseModel):
    """更新文件夹请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="文件夹名称")
    description: Optional[str] = Field(None, max_length=1000, description="文件夹描述")


class FileFolderResponse(BaseModel):
    """文件夹响应"""
    id: int
    name: str
    description: Optional[str]
    project_id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]
    file_count: int = Field(0, description="文件夹下的文件数量")
    
    class Config:
        from_attributes = True


class FileManagementFileResponse(BaseModel):
    """文件信息响应"""
    id: int
    file_name: str
    file_size: int
    file_hash: str
    file_path: str
    folder_id: Optional[int]
    folder_name: Optional[str] = Field(None, description="文件夹名称")
    project_id: int
    upload_id: Optional[str]
    created_at: datetime
    created_by: Optional[str]
    
    class Config:
        from_attributes = True


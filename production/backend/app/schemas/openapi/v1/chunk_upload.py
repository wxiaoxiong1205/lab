from typing import Optional

from pydantic import BaseModel, Field


class OpenChunkUploadInitRequest(BaseModel):
    file_name: str = Field(..., description="文件名。")
    file_size: int = Field(..., gt=0, description="文件大小，单位字节。")
    chunk_size: int = Field(..., gt=0, description="分片大小，单位字节。")
    file_hash: str = Field(..., description="文件 SHA-256 哈希值。")


class OpenChunkUploadInitResult(BaseModel):
    upload_id: str = Field(..., description="上传会话 ID。")
    exists: Optional[bool] = Field(None, description="文件是否已存在。")


class OpenChunkUploadCompleteRequest(BaseModel):
    file_hash: str = Field(..., description="文件 SHA-256 哈希值。")
    file_name: str = Field(..., description="文件名。")
    total_chunks: int = Field(..., gt=0, description="总分片数。")


class OpenChunkUploadCompleteResponse(BaseModel):
    file_name: str = Field(..., description="文件名。")
    file_size: int = Field(..., description="文件大小，单位字节。")
    upload_id: str = Field(..., description="上传会话 ID。")
    chunk_size: int = Field(..., description="分片大小，单位字节。")
    total_chunks: int = Field(..., description="总分片数。")
    success: bool = Field(..., description="是否成功。")
    error: Optional[str] = Field(None, description="错误信息。")
    file_url: Optional[str] = Field(None, description="文件地址。")
    start_time: Optional[str] = Field(None, description="开始时间。")
    end_time: Optional[str] = Field(None, description="结束时间。")


class OpenChunkUploadProgressResponse(BaseModel):
    uploaded_chunks: list[int] = Field(default_factory=list, description="已上传分片索引列表。")
    is_complete: bool = Field(..., description="是否已完成。")

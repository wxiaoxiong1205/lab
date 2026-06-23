from typing import Optional, List, Generic, TypeVar
from pydantic import BaseModel, Field
from enum import Enum

# 定义泛型类型变量
T = TypeVar('T')


class StandardResponse(BaseModel, Generic[T]):
    """通用响应格式"""
    code: int = Field(..., description="状态码，0表示成功")
    message: str = Field(..., description="错误信息")
    result: Optional[T] = Field(None, description="结果数据")


# 分片上传文件用途枚举
class ChunkUploadFileUsage(str, Enum):
    """分片上传文件用途枚举"""
    PUBLIC = "public", "公共"
    FILE_MANAGEMENT = "file-management", "文件管理"

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        return self._description


class ChunkUploadInitRequest(BaseModel):
    """初始化上传请求"""
    fileName: str = Field(..., description="文件名")
    fileSize: int = Field(..., gt=0, description="文件大小（字节）")
    chunkSize: int = Field(..., gt=0, description="分片大小（字节）")
    fileHash: str = Field(..., description="文件SHA-256哈希值")


class ChunkUploadInitResult(BaseModel):
    """初始化上传结果数据"""
    uploadId: str = Field(..., description="上传会话ID")
    exists: Optional[bool] = Field(None, description="文件是否已存在")


class ChunkUploadInitResponse(BaseModel):
    """初始化上传响应（保留用于向后兼容）"""
    uploadId: str = Field(..., description="上传会话ID")
    exists: Optional[bool] = Field(None, description="是否支持断点续传（已废弃，保留用于兼容）")


class ChunkUploadChunkRequest(BaseModel):
    """上传分片请求（FormData，通过API参数接收）"""
    chunkIndex: int = Field(..., ge=0, description="分片索引")
    uploadId: str = Field(..., description="上传会话ID")
    fileHash: str = Field(..., description="文件SHA-256哈希值")


class ChunkUploadMergeRequest(BaseModel):
    """合并分片请求"""
    uploadId: str = Field(..., description="上传会话ID")
    fileHash: str = Field(..., description="文件SHA-256哈希值")
    fileName: str = Field(..., description="文件名")
    totalChunks: int = Field(..., gt=0, description="总分片数")


class ChunkUploadMergeResponse(BaseModel):
    """合并分片响应"""
    fileName: str = Field(..., description="文件名称")
    fileSize: int = Field(..., description="文件大小")
    uploadId: str = Field(..., description="上传会话标识")
    chunkSize: int = Field(..., description="分片大小")
    totalChunkNum: int = Field(..., description="分片数量")
    error: Optional[str] = Field(None, description="错误信息")
    success: bool = Field(..., description="是否成功")
    fileUrl: Optional[str] = Field(None, description="文件上传地址")
    startTime: Optional[str] = Field(None, description="开始时间")
    endTime: Optional[str] = Field(None, description="结束时间")


class ChunkUploadProgressRequest(BaseModel):
    """查询进度请求"""
    uploadId: str = Field(..., description="上传会话ID")


class ChunkUploadProgressResponse(BaseModel):
    """查询进度响应"""
    uploadedChunks: List[int] = Field(..., description="已上传分片索引列表")
    isComplete: bool = Field(..., description="是否已完成")



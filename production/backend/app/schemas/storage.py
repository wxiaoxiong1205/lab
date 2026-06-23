from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, validator
from app.schemas.common import BaseModelWithTimezone

class StorageBase(BaseModel):
    """存储配置基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="存储配置名称")
    type: str = Field(..., min_length=1, max_length=50, description="存储类型(TOS/MinIO/NFS等)")
    description: Optional[str] = Field(None, max_length=1000, description="描述信息")
    config: Dict[str, Any] = Field(default={}, description="存储配置信息")


class StorageCreate(StorageBase):
    """创建存储配置的请求模型"""

    @validator('name')
    def validate_name(cls, v):
        """验证存储配置名称"""
        if not v or not v.strip():
            raise ValueError('存储配置名称不能为空')
        return v.strip()

    @validator('type')
    def validate_type(cls, v):
        """验证存储类型"""
        if not v or not v.strip():
            raise ValueError('存储类型不能为空')
        # 支持的存储类型
        valid_types = ['TOS', 'MINIO', 'NFS', 'OBS', 'EOS']
        normalized = v.strip().upper()
        if normalized not in valid_types:
            raise ValueError(f'存储类型必须是以下之一: {", ".join(valid_types)}')
        return normalized

    @validator('config')
    def validate_config(cls, v, values):
        """根据存储类型验证配置信息"""
        storage_type = values.get('type', '').upper()

        if storage_type == 'MINIO':
            # 对象存储需要的基本配置
            required_fields = ['endpoint', 'access_key', 'secret_key','bucket']
            for field in required_fields:
                if field not in v or not v[field]:
                    raise ValueError(f'{storage_type}存储需要提供{field}')

        elif storage_type == 'NFS':
            # NFS需要的配置
            required_fields = ['endpoint','remote_path']
            for field in required_fields:
                if field not in v or not v[field]:
                    raise ValueError(f'NFS存储需要提供{field}')
        elif storage_type == 'TOS':
            # TOS需要的配置
            required_fields = ['endpoint', 'access_key', 'secret_key', 'region', 'bucket']
            for field in required_fields:
                if field not in v or not v[field]:
                    raise ValueError(f'TOS存储需要提供{field}')
        elif storage_type == 'EOS':
            # EOS 需要的配置
            required_fields = ['endpoint', 'access_key', 'secret_key', 'bucket']
            for field in required_fields:
                if field not in v or not v[field]:
                    raise ValueError(f'EOS存储需要提供{field}')

        elif storage_type == 'OBS':
            # OBS需要的配置
            required_fields = ['access_key', 'secret_key', 'region', 'bucket']
            for field in required_fields:
                if field not in v or not v[field]:
                    raise ValueError(f'OBS存储需要提供{field}')

        return v or {}


class StorageUpdate(BaseModel):
    """更新存储配置的请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="存储配置名称")
    type: Optional[str] = Field(None, min_length=1, max_length=50, description="存储类型")
    description: Optional[str] = Field(None, max_length=1000, description="描述信息")
    config: Optional[Dict[str, Any]] = Field(None, description="存储配置信息")

    @validator('name')
    def validate_name(cls, v):
        """验证存储配置名称"""
        if v is not None:
            if not v or not v.strip():
                raise ValueError('存储配置名称不能为空')
            return v.strip()
        return v

    @validator('type')
    def validate_type(cls, v):
        """验证存储类型"""
        if v is not None:
            if not v or not v.strip():
                raise ValueError('存储类型不能为空')
            valid_types = ['TOS', 'MINIO', 'NFS', 'OBS', 'EOS']
            normalized = v.strip().upper()
            if normalized not in valid_types:
                raise ValueError(f'存储类型必须是以下之一: {", ".join(valid_types)}')
            return normalized
        return v


class StorageResponse(BaseModelWithTimezone):
    """存储配置响应模型"""
    id: int = Field(..., description="存储配置ID")
    name: str = Field(..., description="存储配置名称")
    type: str = Field(..., description="存储类型")
    description: Optional[str] = Field(None, description="描述信息")
    status: str = Field(..., description="连接状态")
    config: Dict[str, Any] = Field(..., description="存储配置信息")
    cluster_number: Optional[int] = Field(None, description="关联集群数量")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    last_test_time: Optional[datetime] = Field(None, description="最后测试时间")
    is_init: bool = Field(..., description="是否初始化")


class StorageConnectivityResponse(BaseModel):
    """存储配置连通性测试响应模型"""
    is_connected: bool = Field(..., description="是否连接成功")


# 存储绑定/解绑集群相关模型
class StorageBindClustersRequest(BaseModel):
    """存储绑定集群请求模型"""
    cluster_ids: List[int] = Field(..., description="要绑定的集群ID列表，如果要置空传空数组")

    @validator('cluster_ids')
    def validate_cluster_ids(cls, v):
        """验证集群ID列表"""
        # 可以为空，绑定与解绑接口共用
        # if not v:
        #     raise ValueError('集群ID列表不能为空')
        if v:
            if len(v) != len(set(v)):
                raise ValueError('集群ID列表不能包含重复的ID')
        return v


class StorageBindClustersResponse(BaseModel):
    """存储绑定集群响应模型"""
    success: bool = Field(..., description="是否绑定成功")


class StorageUnbindClustersRequest(BaseModel):
    """存储解绑集群请求模型"""
    cluster_ids: List[int] = Field(..., min_items=1, description="要解绑的集群ID列表")

    @validator('cluster_ids')
    def validate_cluster_ids(cls, v):
        """验证集群ID列表"""
        if not v:
            raise ValueError('集群ID列表不能为空')
        if len(v) != len(set(v)):
            raise ValueError('集群ID列表不能包含重复的ID')
        return v


class StorageUnbindClustersResponse(BaseModel):
    """存储解绑集群响应模型"""
    success: bool = Field(..., description="是否解绑成功")


class StorageMountResponse(BaseModel):
    """存储挂载响应模型"""
    success: bool = Field(..., description="是否挂载成功")

class StorageInitResponse(BaseModel):
    """存储文件系统初始化响应模型"""
    success: bool = Field(..., description="是否初始化成功")
    meta_url: str = Field(..., description="元数据url")

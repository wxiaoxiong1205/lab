from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, validator
from app.schemas.common import BaseModelWithTimezone
from enum import Enum

# 类型枚举
class RepositoryType(str,Enum):
    # 重写枚举，方便暴露成接口使用
    def __new__(cls, value, desc):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    VOLCENGINE = ("volcengine", "火山云")
    PRIVATE_HARBOR = ("private_harbor", "私有Harbor")

class RepositoryBase(BaseModel):
    """镜像仓库基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="仓库名称")
    repository_address: str = Field(..., description="仓库地址")
    auth_type: str = Field(..., description="认证方式", pattern="^(username_password|token|none)$")
    auth_config: Optional[Dict[str, Any]] = Field(default={}, description="认证配置信息")
    manager_address: Optional[str] = Field(None, max_length=500, description="管理地址")
    namespace: str = Field(..., max_length=50, description="镜像命名空间/项目")
    type: RepositoryType = Field(..., description="厂商类型(volcengine/private_harbor等)")
    config: Dict[str, Any] = Field(..., description="仓库api调用配置信息")


class RepositoryCreate(RepositoryBase):
    """创建镜像仓库的请求模型"""
    
    @validator('repository_address')
    def validate_repository_address(cls, v):
        """验证仓库地址格式"""
        if not v or not v.strip():
            raise ValueError('仓库地址不能为空')
        # 基本的URL格式验证
        v = v.strip()
        if not (v.startswith('http://') or v.startswith('https://') or '.' in v):
            raise ValueError('仓库地址格式不正确')
        return v
    
    @validator('auth_config')
    def validate_auth_config(cls, v, values):
        """根据认证类型验证认证配置"""
        auth_type = values.get('auth_type')
        if auth_type == 'username_password':
            if not v or 'username' not in v or 'password' not in v:
                raise ValueError('用户名密码认证需要提供username和password')
        elif auth_type == 'token':
            if not v or 'token' not in v:
                raise ValueError('Token认证需要提供token')
        return v or {}

    @validator('config')
    def validate_config(cls, v, values):
        """根据仓库类型验证配置信息"""
        type = values.get('type', '')

        if type == RepositoryType.VOLCENGINE.value:
            # 火山云需要的基本配置
            fields = []
            required_fields = ['region', 'access_key', 'secret_key', 'registry']
            for field in required_fields:
                if field not in v or not v[field]:
                    fields.append(field)
            if fields:
                raise ValueError(f'{type}仓库需要提供{fields}')

        elif type == RepositoryType.PRIVATE_HARBOR.value:
            # 私有harbor需要的配置
            fields = []
            required_fields = ['access_key', 'secret_key']
            for field in required_fields:
                if field not in v or not v[field]:
                    fields.append(field)
            if fields:
                raise ValueError(f'{type}仓库需要提供{fields}')
        return v or {}

class RepositoryUpdate(BaseModel):
    """更新镜像仓库的请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="仓库名称")
    repository_address: Optional[str] = Field(None, description="仓库地址")
    auth_type: Optional[str] = Field(None, description="认证方式", pattern="^(username_password|token|none)$")
    auth_config: Optional[Dict[str, Any]] = Field(None, description="认证配置信息")
    manager_address: Optional[str] = Field(None, max_length=500, description="管理地址")
    namespace: str = Field(..., max_length=50, description="镜像命名空间/项目")
    type: RepositoryType = Field(..., description="厂商类型(volcengine/private_harbor等)")
    config: Dict[str, Any] = Field(default={}, description="仓库api调用配置信息")

    @validator('repository_address')
    def validate_repository_address(cls, v):
        """验证仓库地址格式"""
        if v is not None:
            if not v or not v.strip():
                raise ValueError('仓库地址不能为空')
            v = v.strip()
            if not (v.startswith('http://') or v.startswith('https://') or '.' in v):
                raise ValueError('仓库地址格式不正确')
        return v

    @validator('config')
    def validate_config(cls, v, values):
        """根据仓库类型验证配置信息"""
        type = values.get('type', '')

        if type == RepositoryType.VOLCENGINE.value:
            # 火山云需要的基本配置
            fields = []
            required_fields = ['region', 'access_key', 'secret_key', 'registry']
            for field in required_fields:
                if field not in v or not v[field]:
                    fields.append(field)
            if fields:
                raise ValueError(f'{type}仓库需要提供{fields}')

        elif type == RepositoryType.PRIVATE_HARBOR.value:
            # 私有harbor需要的配置
            fields = []
            required_fields = ['access_key', 'secret_key']
            for field in required_fields:
                if field not in v or not v[field]:
                    fields.append(field)
            if fields:
                raise ValueError(f'{type}仓库需要提供{fields}')
        return v or {}


class RepositoryResponse(BaseModelWithTimezone):
    """镜像仓库响应模型"""
    id: int = Field(..., description="仓库ID")
    name: str = Field(..., description="仓库名称")
    repository_address: str = Field(..., description="仓库地址")
    auth_type: str = Field(..., description="认证方式")
    auth_config: Dict[str, Any] = Field(..., description="认证配置信息")
    manager_address: Optional[str] = Field(None, description="管理地址")
    cluster_number: Optional[int] = Field(None, description="关联集群数量")
    status: str = Field(..., description="仓库状态")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    namespace: str = Field(..., max_length=50, description="镜像命名空间/项目")
    type: RepositoryType = Field(..., description="厂商类型(volcengine/private_harbor等)")
    config: Dict[str, Any] = Field(default={}, description="仓库api调用配置信息")


class RepositoryConnectivityResponse(BaseModel):
    """镜像仓库连通性测试响应模型"""
    repository_id: int = Field(..., description="仓库ID")
    is_connected: bool = Field(..., description="是否连接成功")


class RepositoryBindClustersRequest(BaseModel):
    """绑定集群的请求模型"""
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


class RepositoryBindClustersResponse(BaseModel):
    """绑定集群的响应模型"""
    success: bool = Field(..., description="是否绑定成功")


class RepositoryUnbindClustersRequest(BaseModel):
    """解绑集群的请求模型"""
    cluster_ids: List[int] = Field(..., description="要解绑的集群ID列表")
    
    @validator('cluster_ids')
    def validate_cluster_ids(cls, v):
        """验证集群ID列表"""
        if not v:
            raise ValueError('集群ID列表不能为空')
        if len(v) != len(set(v)):
            raise ValueError('集群ID列表不能包含重复的ID')
        return v


class RepositoryUnbindClustersResponse(BaseModel):
    """解绑集群的响应模型"""
    success: bool = Field(..., description="是否解绑成功")


class AvailableClusterResponse(BaseModel):
    """可用集群响应模型"""
    id: int = Field(..., description="集群ID")
    name: str = Field(..., description="集群名称")
    api_server: str = Field(..., description="API服务器地址")
    status: str = Field(..., description="集群状态")
    version: Optional[str] = Field(None, description="K8s版本")

class OccupiedClusterResponse(BaseModel):
    """被占用用集群响应模型"""
    id: int = Field(..., description="集群ID")
    name: str = Field(..., description="集群名称")
    api_server: str = Field(..., description="API服务器地址")
    status: str = Field(..., description="集群状态")
    version: Optional[str] = Field(None, description="K8s版本")

class RepositoryTypeResp(BaseModel):
    value: str
    label: str

class MessageResponse(BaseModel):
    """消息响应模型"""
    success: bool = Field(..., description="是否成功")
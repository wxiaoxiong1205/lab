from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, validator
from app.schemas.common import BaseModelWithTimezone
from enum import Enum

# 类型枚举
class VolcengineKubeType(str,Enum):
    # 重写枚举，方便暴露成接口使用
    def __new__(cls, value, desc):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    VCI_G1V_2XLARGE = ("vci.g1v.2xlarge", "vCPU:8/内存:32G/GPU数量:Tesla V100 × 1/GPU 显存:32 × 1")
    VCI_G1V_4XLARGE = ("vci.g1v.4xlarge", "vCPU:8/内存:32G/GPU数量:Tesla V100 × 2/GPU 显存:32 × 2")
    VCI_G1V_8XLARGE = ("vci.g1v.8xlarge", "vCPU:8/内存:32G/GPU数量:Tesla V100 × 4/GPU 显存:32 × 4")
    VCI_G1V_20XLARGE = ("vci.g1v.20xlarge", "vCPU:8/内存:32G/GPU数量:Tesla V100 × 8/GPU 显存:32 × 8")

# k8s标签枚举
class KubeLabelsType(Enum):
    DP_GRAPHICS_CARD_CATEGORY = "dp_graphics_card_category"
    DP_GRAPHICS_CARD_MODEL = "dp_graphics_card_model"
    DP_GRAPHICS_CARD_ALLOCATABLE = "dp_graphics_card_allocatable"
    DP_GRAPHICS_CARD_MEMORY = "dp_graphics_card_memory"

class KubernetesBase(BaseModel):
    """K8s 集群基础模型"""
    name: str = Field(..., min_length=1, max_length=50, description="集群名称")
    config: str = Field(..., description="K8s配置信息(kubeconfig内容)")
    description: Optional[str] = Field(None, max_length=1000, description="描述信息")



class KubernetesCreate(KubernetesBase):
    """创建 K8s 集群的请求模型"""
    
    @validator('config')
    def validate_config(cls, v):
        """验证配置格式"""
        if not v or not v.strip():
            raise ValueError('配置信息不能为空')
        return v.strip()


class KubernetesUpdate(BaseModel):
    """更新 K8s 集群的请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="集群名称")
    config: Optional[str] = Field(None, description="K8s配置信息(kubeconfig内容)")
    api_server: Optional[str] = Field(None, max_length=255, description="API服务器地址")
    description: Optional[str] = Field(None, max_length=1000, description="描述信息")
    
    @validator('config')
    def validate_config(cls, v):
        """验证配置格式"""
        # if v is not None and (not v or not v.strip()):
        #     raise ValueError('配置信息不能为空')
        return v.strip() if v else v
    

class KubernetesResponse(BaseModelWithTimezone):
    """K8s 集群响应模型"""
    id: int = Field(..., description="集群ID")
    name: str = Field(..., description="集群名称")
    status: str = Field(..., description="集群状态")
    api_server: str = Field(..., description="API服务器地址")
    description: Optional[str] = Field(None, max_length=1000, description="描述信息")
    version: Optional[str] = Field(None, description="K8s版本")
    node_number: Optional[int] = Field(None, description="节点数量")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    storage_id:Optional[int] = Field(None, description="存储id")
    repository_id: Optional[int] = Field(None, description="仓库id")
    is_mount: Optional[bool] = Field(None, description="是否已挂载")
    ext: Optional[Dict[str, Any]] = Field(default={}, description='{}集群扩展标签信息')


class KubernetesConnectivityResponse(BaseModel):
    """K8s 集群连通性测试响应模型"""
    cluster_id: int = Field(..., description="集群ID")
    is_connected: bool = Field(..., description="是否连接成功")

class KubernetesBindStorageResponse(BaseModel):
    """绑定存储的响应模型"""
    success: bool = Field(..., description="是否绑定成功")

class KubernetesBindRepositoryResponse(BaseModel):
    """绑定镜像仓库的响应模型"""
    success: bool = Field(..., description="是否绑定成功")

class ResourcesTypeResp(BaseModel):
    value: str
    label: str

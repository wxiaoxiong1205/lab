import os
from datetime import datetime
from typing import Dict, Any, Tuple, Optional, List
from abc import ABC, abstractmethod

from fastapi import UploadFile
from fastapi_pagination import Page
import juicefs
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import JwtUserInfo, User, KubernetesResource, StorageResource
from app.repository.storage import StorageMapper
from app.schemas.storage import (
    StorageCreate, StorageUpdate, StorageResponse, StorageConnectivityResponse,
    StorageBindClustersRequest, StorageBindClustersResponse, StorageUnbindClustersRequest,
    StorageUnbindClustersResponse, StorageMountResponse, StorageInitResponse
)
from app.schemas.repository import AvailableClusterResponse, OccupiedClusterResponse


class StorageService(ABC):
    """存储配置服务抽象接口类"""
    def __init__(self, mapper: StorageMapper) -> None:
        self.mapper = mapper

    @abstractmethod
    async def get_available_clusters(
            self,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[AvailableClusterResponse]:
        """获取可用集群列表（未被存储关联+被镜像仓库关联的集群）"""
        pass

    @abstractmethod
    async def get_occupied_clusters(
            self,
            storage_id: int,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[OccupiedClusterResponse]:
        """根据存储ID获取被占用集群列表（已被存储关联+被镜像仓库关联的集群）"""
        pass

    @abstractmethod
    async def list_storage_configs(
            self,
            type: Optional[str] = None,
            search: Optional[str] = None,
            available: Optional[bool] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[StorageResponse]:
        """获取存储配置列表（分页）"""
        pass

    @abstractmethod
    async def create_storage_config(
            self,
            storage: StorageCreate,
            current_user: JwtUserInfo
    ) -> StorageResource:
        """创建新的存储配置"""
        pass

    @abstractmethod
    async def get_storage_config(
            self,
            storage_id: int
    ) -> StorageResource:
        """获取存储配置详情"""
        pass

    @abstractmethod
    async def update_storage_config(
            self,
            storage_id: int,
            storage_update: StorageUpdate
    ) -> StorageResource:
        """更新存储配置信息"""
        pass

    @abstractmethod
    async def delete_storage_config(
            self,
            storage_id: int
    ) -> None:
        """删除存储配置"""
        pass

    @abstractmethod
    async def test_storage_connectivity(
            self,
            storage_id: int
    ) -> StorageConnectivityResponse:
        """测试存储配置连通性"""
        pass

    @abstractmethod
    async def bind_clusters_to_storage(
            self,
            storage_id: int,
            request: StorageBindClustersRequest,
            current_user: JwtUserInfo
    ) -> StorageBindClustersResponse:
        """绑定集群到存储配置"""
        pass

    @abstractmethod
    async def unbind_clusters_from_storage(
            self,
            storage_id: int,
            request: StorageUnbindClustersRequest
    ) -> StorageUnbindClustersResponse:
        """从存储配置解绑集群"""
        pass

    @abstractmethod
    async def mount_storage_to_cluster(
            self,
            storage_id: int,
            cluster_id: int
    ) -> StorageMountResponse:
        """将存储配置挂载到指定集群"""
        pass

    @abstractmethod
    async def init_juicefs_format(
            self,
            storage_id: int
    ) -> StorageInitResponse:
        """初始化存储文件系统（JuiceFS格式）"""
        pass

    # ------------------------------ 内部辅助方法抽象 ------------------------------
    @abstractmethod
    async def _test_connectivity(
            self,
            storage_type: str,
            config: Dict[str, Any]
    ) -> bool:
        """内部方法：执行具体存储类型的连通性测试"""
        pass

    @abstractmethod
    async def _get_file_from_minio(
            self,
            object_name: str,
            suffix: str = ".tgz"
    ) -> str:
        """内部方法：从MinIO下载文件到临时目录"""
        pass

    @abstractmethod
    async def _get_juicefs_csi_driver_path(self) -> str:
        """内部方法：获取JuiceFS CSI Driver的Helm Chart路径"""
        pass

    @abstractmethod
    async def _get_alloy_path(self) -> str:
        """内部方法：获取Alloy的Helm Chart路径"""
        pass

    @abstractmethod
    async def _add_secret_and_storageclass(
            self,
            kubeconfig_str: str,
            namespace: str,
            metaurl: str,
            storage: StorageResource
    ) -> None:
        """内部方法：创建存储Secret和StorageClass"""
        pass

    @abstractmethod
    async def _bucket_is_empty(
            self,
            storage_type: str,
            config: Dict[str, Any]
    ) -> bool:
        """内部方法：检查存储桶是否为空"""
        pass

    @abstractmethod
    async def _init_juicefs_format_and_shared_directory(
            self,
            metaurl: str,
            storage: StorageResource
    ) -> bool:
        """内部方法：初始化JuiceFS文件系统和共享目录"""
        pass

    @abstractmethod
    async def get_by_id(self, id_field_value):
        pass

    @abstractmethod
    async def JUICEFS_CLIENT(self, tenant_id: Optional[str] = None) -> juicefs.Client:
        """构建JUICEFS客户端"""
        pass

    @abstractmethod
    def get_new_redis_client(self):
        pass


    @abstractmethod
    async def upgrade_alloy(self, harbor_url, harbor_base_namespace, harbor_username, harbor_password, alloy_namespace,
                            kubeconfig_str):
        pass

    @abstractmethod
    async def upload_file(
            self,
            object_path: str,
            file: UploadFile
    ):
        pass

    @abstractmethod
    async def download_file(self, object_path: str):
        """从 MinIO 下载文件"""
        pass
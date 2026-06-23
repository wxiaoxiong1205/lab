import asyncio
from typing import Optional
from abc import ABC, abstractmethod
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import JwtUserInfo, RepositoryResource
from app.repository.repository_mapper import RepositoryMapper
from app.schemas.repository import (
    RepositoryCreate, RepositoryUpdate, RepositoryResponse,
    RepositoryConnectivityResponse, RepositoryBindClustersRequest,
    RepositoryBindClustersResponse, RepositoryUnbindClustersRequest,
    RepositoryUnbindClustersResponse, AvailableClusterResponse,
    OccupiedClusterResponse
)


class RepositoryService(ABC):
    """镜像仓库服务抽象接口类"""
    def __init__(self, mapper: RepositoryMapper) -> None:
        self.mapper = mapper

    @abstractmethod
    async def get_available_clusters(
        self,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[AvailableClusterResponse]:
        """获取可用集群列表（未被仓库关联的集群）"""
        pass

    @abstractmethod
    async def get_occupied_clusters(
        self,

        repository_id: int,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[OccupiedClusterResponse]:
        """根据仓库id获取被占用集群列表"""
        pass

    @abstractmethod
    async def list_repositories(
        self,
        auth_type: Optional[str] = None,
        search: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        available: Optional[bool] = None,
    ) -> Page[RepositoryResponse]:
        """获取镜像仓库列表（分页）"""
        pass

    @abstractmethod
    async def create_repository(
        self,

        repository: RepositoryCreate,
        current_user: JwtUserInfo
    ) -> RepositoryResource:
        """创建新的镜像仓库"""
        pass

    @abstractmethod
    async def get_repository(
        self,

        repository_id: int
    ) -> RepositoryResource:
        """获取镜像仓库详情"""
        pass

    @abstractmethod
    async def update_repository(
        self,

        repository_id: int,
        repository_update: RepositoryUpdate
    ) -> RepositoryResource:
        """更新镜像仓库信息"""
        pass

    @abstractmethod
    async def delete_repository(
        self,

        repository_id: int
    ) -> None:
        """删除镜像仓库"""
        pass

    @abstractmethod
    async def test_repository_connectivity(
        self,

        repository_id: int
    ) -> RepositoryConnectivityResponse:
        """测试镜像仓库连通性"""
        pass

    @abstractmethod
    async def bind_clusters_to_repository(
        self,

        repository_id: int,
        request: RepositoryBindClustersRequest,
        current_user: JwtUserInfo
    ) -> RepositoryBindClustersResponse:
        """绑定集群到镜像仓库"""
        pass

    @abstractmethod
    async def unbind_clusters_from_repository(
        self,

        repository_id: int,
        request: RepositoryUnbindClustersRequest
    ) -> RepositoryUnbindClustersResponse:
        """从镜像仓库解绑集群"""
        pass

    @abstractmethod
    async def init_db(self):
        """
        初始化系统默认数据
        """
        pass
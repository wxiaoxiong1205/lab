from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any, Optional

from fastapi_pagination import Page

from app.models.models import JwtUserInfo
from app.models.models import (
    KubernetesResource, StorageResource, RepositoryResource
)
from app.repository.base_mapper import BaseMapper
from app.schemas.k8s import (
    KubernetesCreate, KubernetesUpdate, KubernetesResponse,
    KubernetesConnectivityResponse, KubernetesBindStorageResponse,
    KubernetesBindRepositoryResponse
)
from starlette.websockets import WebSocket

from app.services.storage.interface import StorageService


class K8sService(ABC):
    """K8s集群服务抽象接口类"""
    def __init__(self, mapper: BaseMapper, storage: StorageService) -> None:
        self.mapper = mapper
        self.storage = storage
        pass

    # ------------------------------ 核心业务接口 ------------------------------
    @abstractmethod
    async def list_k8s_clusters(
            self,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[KubernetesResponse]:
        """获取K8s集群列表（分页）"""
        pass

    @abstractmethod
    async def create_k8s_cluster(
            self, current_user: JwtUserInfo, cluster: KubernetesCreate
    ) -> KubernetesResource:
        """创建新的K8s集群（含配置解析和集群信息获取）"""
        pass

    @abstractmethod
    async def get_k8s_cluster(
            self, cluster_id: int
    ) -> KubernetesResource:
        """获取指定K8s集群详情"""
        pass

    @abstractmethod
    async def update_k8s_cluster(
            self, cluster_id: int, cluster_update: KubernetesUpdate
    ) -> KubernetesResource:
        """更新K8s集群信息（支持部分字段更新）"""
        pass

    @abstractmethod
    async def delete_k8s_cluster(
            self, cluster_id: int
    ) -> None:
        """删除K8s集群（含关联存储/仓库清理和CSI卸载）"""
        pass

    @abstractmethod
    async def test_k8s_cluster_connectivity(
            self, cluster_id: int
    ) -> KubernetesConnectivityResponse:
        """测试K8s集群连通性（更新集群状态和基础信息）"""
        pass

    @abstractmethod
    async def bind_storage_to_cluster(
            self, current_user: JwtUserInfo, cluster_id: int, storage_id: int
    ) -> KubernetesBindStorageResponse:
        """将存储绑定到K8s集群（含关联关系维护）"""
        pass

    @abstractmethod
    async def bind_repository_to_cluster(
            self, current_user: JwtUserInfo, cluster_id: int, repository_id: int
    ) -> KubernetesBindRepositoryResponse:
        """将镜像仓库绑定到K8s集群（含关联关系维护）"""
        pass

    @abstractmethod
    async def list_available_k8s_clusters(
            self,
    ) -> List[KubernetesResponse]:
        """获取可用K8s集群列表（已挂载存储且绑定仓库）"""
        pass

    # ------------------------------ 内部辅助接口 ------------------------------
    @abstractmethod
    async def _validate_k8s_cluster_exists(
            self, cluster_id: int
    ) -> KubernetesResource:
        """验证K8s集群存在，不存在则抛出404异常"""
        pass

    @abstractmethod
    async def _validate_storage_exists(
            self, storage_id: int
    ) -> StorageResource:
        """验证存储资源存在且状态正常，异常则抛出对应异常"""
        pass

    @abstractmethod
    async def _validate_repository_exists(
            self, repository_id: int
    ) -> RepositoryResource:
        """验证镜像仓库存在，不存在则抛出404异常"""
        pass

    @abstractmethod
    def _parse_kubeconfig(self, config_str: str) -> Tuple[str, Dict[str, Any]]:
        """解析kubeconfig，返回API Server地址和解析后的配置字典"""
        pass

    @abstractmethod
    async def _get_k8s_cluster_info(self, config_dict: Dict[str, Any]) -> Tuple[str, int]:
        """获取K8s集群信息（版本和节点数）"""
        pass

    @abstractmethod
    async def _uninstall_csi_driver(self, kubeconfig_str: str) -> None:
        """卸载K8s集群中的CSI驱动（JuiceFS相关）"""
        pass

    @abstractmethod
    async def k8s_resource_list(self,project_id: int) -> List[Dict[str, Any]]:
        """获取集群显卡资源"""
        pass

    @abstractmethod
    async def k8s_graphics_card_model_list(self,project_id: int,resource_type: str) -> List[Dict[str, Any]]:
        """获取集群显卡型号资源"""
        pass
    @abstractmethod
    async def get_by_id(self, id_field_value):
        pass

    @abstractmethod
    async def allocatable_list(self, project_id: int, resource_type: str, resource_card_model: str) -> Dict[str, Any]:
        """获取集群可分配显卡型号资源"""
        pass

    @abstractmethod
    async def list_deployment_pods(self, project_id: int, app_name: str) -> List[Dict]:
        """
        根据 Deployment 的 selector 查询 Pod 副本列表
        """
        pass

    @abstractmethod
    async def ws_pod_logs(
            self,
            project_id: int,
            pod_name: str,
            websocket: WebSocket,
            tail_lines: Optional[int] = None
    ) -> None:
        """WebSocket 实时日志流（转发 Loki /tail WebSocket 消息）"""
        pass

    @abstractmethod
    async def upgrade_alloy_by_cluster_id(self, cluster_id: int):
        """
        根据id升级集群upgrade_alloy
        """
        pass

    @abstractmethod
    async def upgrade_alloy(self, cluster_id: Optional[int] = None):
        """
        按需升级集群alloy：如果传了cluster_id则只升级该集群，不传则循环升级所有可用集群
        """
        pass
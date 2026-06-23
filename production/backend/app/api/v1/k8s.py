from typing import List, Tuple, Optional, Dict, Any

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, status, Query, WebSocket
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import KubernetesResource, JwtUserInfo
from app.schemas.k8s import (
    KubernetesCreate,
    KubernetesUpdate,
    KubernetesResponse,
    KubernetesConnectivityResponse, KubernetesBindStorageResponse, KubernetesBindRepositoryResponse,
)
from app.services.k8s.interface import K8sService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/k8s", tags=["kubernetes"])


@router.get("/clusters", response_model=Page[KubernetesResponse])
@inject
async def list_k8s_clusters(
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> Page[KubernetesResponse]:
    """获取K8s集群列表，使用分页"""
    db, current_user = deps

    return await k8s_service.list_k8s_clusters(page, size)


@router.post("/clusters", response_model=KubernetesResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.CLUSTER_MANAGER, table_name="k8s_resources",
                        operator_type=OperatorType.ADD, operator_content_key=["cluster.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_k8s_cluster(
        cluster: KubernetesCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> KubernetesResource:
    """创建新的K8s集群"""
    db, current_user = deps
    return await k8s_service.create_k8s_cluster(current_user, cluster)


@router.get("/clusters/{cluster_id}", response_model=KubernetesResponse)
@inject
async def get_k8s_cluster(
        cluster_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> KubernetesResource:
    """获取K8s集群详情"""
    db, current_user = deps

    return await k8s_service.get_k8s_cluster(cluster_id)


@router.put("/clusters/{cluster_id}", response_model=KubernetesResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.CLUSTER_MANAGER, table_name="k8s_resources",
                        operator_type=OperatorType.EDIT, operator_content_key=["cluster_update.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_k8s_cluster(
        cluster_id: int,
        cluster_update: KubernetesUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> KubernetesResource:
    """更新K8s集群信息"""
    db, current_user = deps
    return await k8s_service.update_k8s_cluster(cluster_id, cluster_update)


@router.delete("/clusters/{cluster_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.CLUSTER_MANAGER, table_name="k8s_resources",
                        operator_type=OperatorType.DELETE, operator_content_key=["cluster_update.name"],
                        self_service_field_mapping={
                            "service_name": "k8s_service", "field_name": "cluster_id", "tag_field_name": "name"},
                        scope_service_field_mapping=None)
async def delete_k8s_cluster(
        cluster_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> None:
    """删除K8s集群"""
    db, current_user = deps

    return await k8s_service.delete_k8s_cluster(cluster_id)


@router.post("/clusters/{cluster_id}/test-connectivity", response_model=KubernetesConnectivityResponse)
@inject
async def test_k8s_cluster_connectivity(
        cluster_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> KubernetesConnectivityResponse:
    """测试K8s集群连通性"""
    db, current_user = deps

    return await k8s_service.test_k8s_cluster_connectivity(cluster_id)


@router.post("/{cluster_id}/{storage_id}/bind-storage", response_model=KubernetesBindStorageResponse)
@inject
async def bind_storage_to_clusters(
        cluster_id: int,
        storage_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> KubernetesBindStorageResponse:
    """绑定存储到集群"""
    db, current_user = deps

    return await k8s_service.bind_storage_to_cluster(current_user, cluster_id, storage_id)


@router.post("/{cluster_id}/{repository_id}/bind-repository", response_model=KubernetesBindRepositoryResponse)
@inject
async def bind_repository_to_clusters(
        cluster_id: int,
        repository_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> KubernetesBindRepositoryResponse:
    """绑定镜像仓库到集群"""
    db, current_user = deps

    return await k8s_service.bind_repository_to_cluster(current_user, cluster_id, repository_id)


@router.get("/available-clusters", response_model=List[KubernetesResponse])
@inject
async def list_k8s_available_clusters(
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> List[KubernetesResponse]:
    """获取K8s集群可用列表，使用分页"""
    db, current_user = deps

    return await k8s_service.list_available_k8s_clusters()


@router.get("/k8s-resource/by-project/{project_id}/list", response_model=List[Dict[str, Any]])
@inject
async def k8s_resource_list(
        project_id: int,
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> List[Dict[str, Any]]:
    """获取集群显卡资源"""
    return await k8s_service.k8s_resource_list(project_id)


@router.get("/k8s-graphics-card-model/by-project/{project_id}", response_model=List[Dict[str, Any]])
@inject
async def k8s_graphics_card_model_list(
        project_id: int,
        resource_type:str = Query(..., description="资源类型"),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> List[Dict[str, Any]]:
    """获取集群显卡型号资源"""
    return await k8s_service.k8s_graphics_card_model_list(project_id, resource_type)


@router.get("/allocatable/by-project/{project_id}/list", response_model=Dict[str, Any])
@inject
async def allocatable_list(
        project_id: int,
        resource_type:str = Query(..., description="资源类型"),
        resource_card_model:str = Query(..., description="资源显卡型号"),
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> Dict[str, Any]:
    """获取集群可分配显卡型号资源"""
    return await k8s_service.allocatable_list(project_id, resource_type, resource_card_model)


@router.get("/namespaces/{project_id}/deployments/{app_name}/pods", response_model=List[Dict])
@inject
async def list_deployment_pods(project_id: int,
                         app_name: str,
                         k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
) -> List[Dict]:
    """
    根据 Deployment 的 selector 查询 Pod 副本列表
    """
    return await k8s_service.list_deployment_pods(project_id,app_name)

@router.websocket("/namespaces/{project_id}/pods/{pod_name}/logs/stream")
@inject
async def ws_pod_logs(
        websocket: WebSocket,
        project_id: int,
        pod_name: str,
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
):
    """
    WebSocket 日志流：
    - 后端转发 Loki /loki/api/v1/tail 的 websocket 消息（{"streams":[...]}）
    - 支持 query 参数：tail_lines
    """
    tail_lines_raw = websocket.query_params.get("tail_lines")
    tail_lines = int(tail_lines_raw) if tail_lines_raw and tail_lines_raw.isdigit() else None

    await k8s_service.ws_pod_logs(
        project_id=project_id,
        pod_name=pod_name,
        websocket=websocket,
        tail_lines=tail_lines
    )

@router.post("/upgrade-alloy")
@inject
async def upgrade_alloy(
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
):
    """升级所有可用集群的alloy"""
    return await k8s_service.upgrade_alloy()

@router.post("/{cluster_id}/upgrade-alloy")
@inject
async def upgrade_alloy_by_cluster_id(
        cluster_id: int,
        k8s_service: K8sService = Depends(Provide[AutoContainer.k8s_service])
):
    """升级指定集群的alloy"""
    return await k8s_service.upgrade_alloy(cluster_id)

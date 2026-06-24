import asyncio
import os
from datetime import datetime
import tempfile

from dependency_injector.wiring import inject, Provide
from minio import Minio
import yaml
from typing import Dict, Any, Tuple, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import select, update, delete, and_, or_, exists
from sqlalchemy.ext.asyncio import AsyncSession

# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate
from fastapi.responses import StreamingResponse

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.config import settings
from app.core.depend_manager import AutoContainer
from app.core.logging import logger

from app.database.base import get_db
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import KubernetesRepositoryRelation, RepositoryResource, StorageResource, User, \
    KubernetesResource, KubernetesStorageRelation, JwtUserInfo
from app.schemas.storage import (
    StorageCreate,
    StorageUpdate,
    StorageResponse,
    StorageConnectivityResponse,
    StorageBindClustersRequest,
    StorageBindClustersResponse,
    StorageUnbindClustersRequest,
    StorageUnbindClustersResponse,
    StorageMountResponse, StorageInitResponse,
)
from app.schemas.repository import AvailableClusterResponse
from app.schemas.repository import OccupiedClusterResponse
from app.schemas.common import ConnectionStatus
from app.services.storage.interface import StorageService
from app.utils.dependencies import get_db_and_user
from app.utils.error_messages import data_not_found_error, data_is_associated_and_cannot_be_deleted
from app.utils.helm_utils import run_helm_with_kubeconfig
from app.utils.k8s_utils import create_harbor_secret, create_storage_secret, create_storageclass
from app.utils.storage_enum import StoragePath
from app.utils.storage_factory import BucketCheckerFactory
from app.utils.storage_utils import StorageUtils

# 存储管理弃用
router = APIRouter(prefix="/api/v1/storage", tags=["storage"])

@router.get("/available-clusters", response_model=Page[AvailableClusterResponse])
@inject
async def get_available_clusters(
    name: Optional[str] = None,
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> Page[AvailableClusterResponse]:
    """获取可用集群列表（未被存储关联的集群和被镜像仓库关联的集群），支持按名称模糊搜索"""
    db, current_user = deps

    return await storage_service.get_available_clusters(name, page, size)




@router.get("/occupied-clusters/{storage_id}", response_model=Page[OccupiedClusterResponse])
@inject
async def get_occupied_clusters(
        storage_id: int,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> Page[OccupiedClusterResponse]:
    """根据存储id获取被占用集群列表（已被存储关联的集群和被镜像仓库关联的集群），支持按名称模糊搜索"""
    db, current_user = deps

    return await storage_service.get_occupied_clusters(storage_id, name, page, size)



@router.get("", response_model=Page[StorageResponse])
@inject
async def list_storage_configs(
    type: Optional[str] = None,
    search: Optional[str] = None,
    available: Optional[bool] = None,
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> Page[StorageResponse]:
    """获取存储配置列表，使用分页"""
    db, current_user = deps

    return await storage_service.list_storage_configs(type, search, available, page, size)




@router.post("", response_model=StorageResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.STORAGE_CONFIG, table_name="storage_resources",
                        operator_type=OperatorType.ADD, operator_content_key=["storage.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_storage_config(
    storage: StorageCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageResource:
    """创建新的存储配置"""
    db, current_user = deps
    return await storage_service.create_storage_config(storage, current_user)




@router.get("/{storage_id}", response_model=StorageResponse)
@inject
async def get_storage_config(
    storage_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageResource:
    """获取存储配置详情"""
    db, current_user = deps
    return await storage_service.get_storage_config(storage_id)




@router.put("/{storage_id}", response_model=StorageResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.STORAGE_CONFIG, table_name="storage_resources",
                        operator_type=OperatorType.EDIT, operator_content_key=["storage_update.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_storage_config(
    storage_id: int,
    storage_update: StorageUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageResource:
    """更新存储配置信息"""
    db, current_user = deps

    return await storage_service.update_storage_config(storage_id, storage_update)




@router.delete("/{storage_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.STORAGE_CONFIG, table_name="storage_resources",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping={
                            "service_name": "storage_service",
                            "field_name": "storage_id",
                            "tag_field_name": "name"},
                        scope_service_field_mapping=None)
async def delete_storage_config(
    storage_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> None:
    """删除存储配置"""
    db, current_user = deps

    return await storage_service.delete_storage_config(storage_id)




@router.post("/{storage_id}/test-connectivity", response_model=StorageConnectivityResponse)
@inject
async def test_storage_connectivity(
    storage_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageConnectivityResponse:
    """测试存储配置连通性"""
    db, current_user = deps

    return await storage_service.test_storage_connectivity(storage_id)





@router.post("/{storage_id}/bind-clusters", response_model=StorageBindClustersResponse)
@inject
async def bind_clusters_to_storage(
    storage_id: int,
    request: StorageBindClustersRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageBindClustersResponse:
    """绑定集群到存储配置"""
    db, current_user = deps
    return await storage_service.bind_clusters_to_storage(storage_id, request, current_user)




@router.delete("/{storage_id}/unbind-clusters", response_model=StorageUnbindClustersResponse)
@inject
async def unbind_clusters_from_storage(
    storage_id: int,
    request: StorageUnbindClustersRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageUnbindClustersResponse:
    """从存储配置解绑集群"""
    db, current_user = deps

    return await storage_service.unbind_clusters_from_storage(storage_id, request)




@router.post("/{storage_id}/mount/{cluster_id}", response_model=StorageMountResponse)
@inject
async def mount_storage_to_cluster(
    storage_id: int,
    cluster_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
) -> StorageMountResponse:
    """将存储配置挂载到指定集群"""
    db, current_user = deps
    return await storage_service.mount_storage_to_cluster(storage_id, cluster_id)




@router.post("/init-juicefs-format/{storage_id}", response_model=StorageInitResponse)
@inject
async def init_juicefs_format(
        storage_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])
)-> StorageInitResponse:
    """初始化存储文件系统"""
    db, current_user = deps

    return await storage_service.init_juicefs_format(storage_id)

@router.get("/download/{tenant_id}/{path:path}")
@inject
async def download_jfs_file(
        tenant_id: str,
        path: str,
        storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])):
    async def iterfile():
        jfs_client = await storage_service.JUICEFS_CLIENT(tenant_id)
        with jfs_client.open(path, "rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(iterfile(), media_type="application/octet-stream")

@router.post("/upload/minio/file")
@inject
async def upload_minio_file(
        object_path: str = Form(...),
        file: UploadFile = File(...),
        storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])):
    """
        上传文件到 MinIO 指定路径
        object_path 示例：
          - datasets/train/data.csv
        """
    return await storage_service.upload_file(
        object_path=object_path,
        file=file
    )

@router.get("/download-file/{path:path}")
@inject
async def download_minio_file(
        path: str,
        storage_service: StorageService = Depends(Provide[AutoContainer.storage_service])):
    """
        从 MinIO 指定路径下载文件
        path 示例：
          - datasets/train/data.csv
        """
    return await storage_service.download_file(object_path=path)
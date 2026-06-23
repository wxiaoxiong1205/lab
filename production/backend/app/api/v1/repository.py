from typing import Tuple, Optional, List

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, status, HTTPException
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.database.base import get_db
from app.models.models import RepositoryResource, JwtUserInfo, StorageResource
from app.schemas.repository import (
    RepositoryCreate,
    RepositoryUpdate,
    RepositoryResponse,
    RepositoryConnectivityResponse,
    RepositoryBindClustersRequest,
    RepositoryBindClustersResponse,
    RepositoryUnbindClustersRequest,
    RepositoryUnbindClustersResponse,
    AvailableClusterResponse,
    OccupiedClusterResponse, RepositoryTypeResp, RepositoryType, MessageResponse,
)
from app.services.repository.interface import RepositoryService
from app.services.storage.interface import StorageService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/repository", tags=["repository"])

@router.get("/available-clusters", response_model=Page[AvailableClusterResponse])
@inject
async def get_available_clusters(
    name: Optional[str] = None,
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> Page[AvailableClusterResponse]:
    """获取可用集群列表（未被仓库关联的集群），支持按名称模糊搜索"""
    db, current_user = deps

    return await repository_service.get_available_clusters(name, page, size)



@router.get("/occupied-clusters/{repository_id}", response_model=Page[OccupiedClusterResponse])
@inject
async def get_occupied_clusters(
        repository_id:int,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> Page[OccupiedClusterResponse]:
    """根据仓库id获取被占用集群列表（已经被仓库关联的集群），支持按名称模糊搜索"""
    db, current_user = deps

    return await repository_service.get_occupied_clusters(repository_id, name, page, size)


    
@router.get("", response_model=Page[RepositoryResponse])
@inject
async def list_repositories(
    auth_type: Optional[str] = None,
    search: Optional[str] = None,
    page: Optional[int] = None,
    size: Optional[int] = None,
    available: Optional[bool] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> Page[RepositoryResponse]:
    """获取镜像仓库列表，使用分页"""
    db, current_user = deps

    return await repository_service.list_repositories(auth_type, search, page, size, available)
    


@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_REPOSITORY, table_name="repository_resources",
                        operator_type=OperatorType.ADD, operator_content_key=["repository.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_repository(
    repository: RepositoryCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> RepositoryResource:
    """创建新的镜像仓库"""
    db, current_user = deps

    return await repository_service.create_repository(repository, current_user)
    



@router.get("/{repository_id}", response_model=RepositoryResponse)
@inject
async def get_repository(
    repository_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> RepositoryResource:
    """获取镜像仓库详情"""
    db, current_user = deps
    return await repository_service.get_repository(repository_id)
    



@router.put("/{repository_id}", response_model=RepositoryResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_REPOSITORY, table_name="repository_resources",
                        operator_type=OperatorType.EDIT, operator_content_key=["repository_update.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_repository(
    repository_id: int,
    repository_update: RepositoryUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> RepositoryResource:
    """更新镜像仓库信息"""
    db, current_user = deps

    return await repository_service.update_repository(repository_id, repository_update)
    



@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.IMAGE_REPOSITORY, table_name="repository_resources",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping={
                            "service_name": "repository_service",
                            "field_name": "repository_id",
                            "tag_field_name": "name"},
                        scope_service_field_mapping=None)
async def delete_repository(
    repository_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> None:
    """删除镜像仓库"""
    db, current_user = deps

    return await repository_service.delete_repository(repository_id)
    



@router.post("/{repository_id}/test-connectivity", response_model=RepositoryConnectivityResponse)
@inject
async def test_repository_connectivity(
    repository_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> RepositoryConnectivityResponse:
    """测试镜像仓库连通性"""
    db, current_user = deps

    return await repository_service.test_repository_connectivity(repository_id)
    



@router.post("/{repository_id}/bind-clusters", response_model=RepositoryBindClustersResponse)
@inject
async def bind_clusters_to_repository(
    repository_id: int,
    request: RepositoryBindClustersRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> RepositoryBindClustersResponse:
    """绑定集群到镜像仓库"""
    db, current_user = deps

    return await repository_service.bind_clusters_to_repository(repository_id, request, current_user)
    



@router.delete("/{repository_id}/unbind-clusters", response_model=RepositoryUnbindClustersResponse)
@inject
async def unbind_clusters_from_repository(
    repository_id: int,
    request: RepositoryUnbindClustersRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> RepositoryUnbindClustersResponse:
    """从镜像仓库解绑集群"""
    db, current_user = deps

    return await repository_service.unbind_clusters_from_repository(repository_id, request)


@router.get("/enums/type-list", response_model=List[RepositoryTypeResp])
# @inject
async def get_repository()->List[RepositoryTypeResp]:
    """返回仓库类型枚举（值+中文描述）"""
    return [
        RepositoryTypeResp(value=item.value, label=item.desc)
        for item in RepositoryType
    ]

@router.post("/sync/init-db",response_model=MessageResponse,status_code=status.HTTP_201_CREATED,summary="初始化系统默认数据",)
@inject
async def init_db(
    repository_service: RepositoryService = Depends(Provide[AutoContainer.repository_service])
) -> MessageResponse:
    """
    初始化系统默认数据
    """
    # 业务层完成初始化
    await repository_service.init_db()

    return MessageResponse(success=True)



@router.delete("/jfs/dir/public/benchmark", response_model=MessageResponse, summary="删除/public/benchmark(临时操作，清除脏数据，可以反复操作，后续该接口废弃)")
@inject
async def delete_jfs_dir(
    db: AsyncSession = Depends(get_db),
    storage_service: StorageService = Depends(Provide[AutoContainer.storage_service]),
) -> MessageResponse:
    # 不鉴权：遍历所有租户的存储分别删除
    jfs_path = 'public/benchmark'
    normalized_subpath = (jfs_path or "").lstrip("/").rstrip("/")

    parts = [p for p in normalized_subpath.split("/") if p]
    if not parts or any(p in {".", ".."} for p in parts):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非法路径")

    result = await db.execute(select(StorageResource.tenant_id).distinct())
    tenant_ids = [row[0] for row in result.fetchall() if row and row[0]]

    failures: list[str] = []
    for tenant_id in tenant_ids:
        # 只删除租户目录下指定子路径，避免误删租户根
        target_path = f"/{normalized_subpath}"

        try:
            jfs = await storage_service.JUICEFS_CLIENT(tenant_id)
            if not jfs.exists(target_path):
                continue

            try:
                jfs.rmr(target_path)
            except Exception:
                # 兼容：如果不是目录或 rmr 失败，尝试按文件删除
                jfs.remove(target_path)
        except Exception as e:
            failures.append(f"{tenant_id}: {str(e)}")

    if failures:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "部分租户删除失败", "failures": failures},
        )
    return MessageResponse(success=True)


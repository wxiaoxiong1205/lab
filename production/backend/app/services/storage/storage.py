import io
import os
import os
import tempfile
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import HTTPException, status, UploadFile
from fastapi_pagination import Page
from fastapi.responses import StreamingResponse
from minio import Minio
from sqlalchemy import select, update, delete, and_, or_, exists

from app.core.config import settings, _parse_sentinel_hosts
from app.core.logging import logger
from app.models.models import (
    KubernetesRepositoryRelation, RepositoryResource, StorageResource,
    KubernetesResource, KubernetesStorageRelation, JwtUserInfo
)
from app.schemas.common import ConnectionStatus
from app.schemas.repository import AvailableClusterResponse, OccupiedClusterResponse
from app.schemas.storage import (
    StorageCreate, StorageUpdate, StorageResponse, StorageConnectivityResponse,
    StorageBindClustersRequest, StorageBindClustersResponse, StorageUnbindClustersRequest,
    StorageUnbindClustersResponse, StorageMountResponse, StorageInitResponse
)
from app.utils.error_messages import data_not_found_error, data_is_associated_and_cannot_be_deleted
from app.utils.helm_utils import run_helm_with_kubeconfig
from app.utils.http_util import build_content_disposition_header
from app.utils.k8s_utils import create_harbor_secret, create_storage_secret, create_storageclass, build_url_with_protocol
from app.utils.storage_enum import StoragePath
from app.utils.storage_factory import BucketCheckerFactory
from app.utils.storage_utils import StorageUtils
from .interface import StorageService
from ...database.base import get_db_session
from ...repository.storage import StorageMapper
import juicefs

from ...schemas.model import ModelProvider
from ...utils.app_runtime_context import get_tenant_id
from ...utils.timezone_utils import get_current_shanghai_time


class DefaultStorageService(StorageService):
    """存储配置服务实现类（继承抽象接口）"""

    def __init__(self, mapper: StorageMapper) -> None:
        self.mapper = mapper
        self.client = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY,
                            secret_key=settings.MINIO_SECRET_KEY, secure=settings.MINIO_SECURE.lower() == 'true')
        # 按 storage_id 缓存 JuiceFS 客户端，避免重复实例化
        self._juicefs_client_cache: Dict[str, juicefs.Client] = {}

    # ------------------------------ 集群查询相关 ------------------------------
    async def get_available_clusters(
            self,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[AvailableClusterResponse]:
        try:
            # 构建查询：查找没有被存储关联的集群 OR 被镜像仓库关联的集群
            query = select(KubernetesResource).filter(
                and_(
                    # 未被存储关联的集群
                    ~KubernetesResource.id.in_(
                        select(KubernetesStorageRelation.k8s_id)
                    ),
                    # 被镜像仓库关联的集群
                    KubernetesResource.id.in_(
                        select(KubernetesRepositoryRelation.k8s_id)
                    )
                )
            )

            # 如果提供了名称参数，进行模糊搜索
            if name:
                query = query.filter(KubernetesResource.name.ilike(f"%{name}%"))

            # 按创建时间降序排列
            query = query.order_by(KubernetesResource.created_at.desc())

            # 使用 fastapi-pagination 进行分页
            return await self.mapper.query_page(query, page, size)

        except Exception as e:
            logger.error(f"Failed to get available clusters: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取可用集群失败: {str(e)}")

    async def get_occupied_clusters(
            self,
            storage_id: int,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[OccupiedClusterResponse]:
        try:
            # 构建查询：查找没有被存储关联的集群 OR 被镜像仓库关联的集群
            query = select(KubernetesResource).filter(
                and_(
                    # 被占用存储关联的集群
                    KubernetesResource.id.in_(
                        select(KubernetesStorageRelation.k8s_id).filter(
                            KubernetesStorageRelation.storage_id == storage_id)
                    ),
                    # 被镜像仓库关联的集群
                    KubernetesResource.id.in_(
                        select(KubernetesRepositoryRelation.k8s_id)
                    )
                )
            )

            # 如果提供了名称参数，进行模糊搜索
            if name:
                query = query.filter(KubernetesResource.name.ilike(f"%{name}%"))

            # 按创建时间降序排列
            query = query.order_by(KubernetesResource.created_at.desc())

            # 使用 fastapi-pagination 进行分页
            return await self.mapper.query_page(query, page, size)

        except Exception as e:
            logger.error(f"Failed to get occupied clusters By ID: {str(e)}")
            raise HTTPException(status_code=500, detail=f"根据id获取被占用集群失败: {str(e)}")

    # ------------------------------ 存储配置CRUD ------------------------------
    async def list_storage_configs(
            self,
            type: Optional[str] = None,
            search: Optional[str] = None,
            available: Optional[bool] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[StorageResponse]:
        # 基础查询：按创建时间降序
        # 构建查询，按创建时间降序排列
        query = select(StorageResource).order_by(StorageResource.created_at.desc())
        if type:
            query = query.where(StorageResource.type == type)
        if search:
            query = query.where(
                or_(StorageResource.name.ilike(f"%{search}%"),
                    StorageResource.description.ilike(f"%{search}%")
                    )
            )
        if available:
            query = query.where(StorageResource.status == "连接正常",
                                StorageResource.is_init == True
                                )

        # 使用 fastapi-pagination 进行分页
        return await self.mapper.query_page(query, page, size)

    async def create_storage_config(
            self,
            storage: StorageCreate,
            current_user: JwtUserInfo
    ) -> StorageResource:
        try:
            # 校验租户存储唯一
            query = await self.mapper.execute(select(StorageResource).limit(1))
            storage_resource = query.scalar_one_or_none()
            if storage_resource:
                raise HTTPException(status_code=400, detail="存储配置已存在")

            # 创建存储配置数据
            storage_data = storage.model_dump()
            storage_data.update({
                'created_id': current_user.userId,
                'created_by': current_user.username,
                'status': ConnectionStatus.UNTESTED.value  # 初始状态
            })

            new_storage = StorageResource(**storage_data)
            if storage_data['type'] == 'NFS':
                new_storage.status = ConnectionStatus.CONNECTED.value
            await self.mapper.insert(new_storage)
            await self.mapper.commit()
            await self.mapper.refresh(new_storage)
            logger.info(f"Created storage config: {new_storage.name} (ID: {new_storage.id})")
            return new_storage

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to create storage config: {str(e)}")
            raise HTTPException(status_code=500, detail=f"创建存储配置失败: {str(e)}")

    async def get_storage_config(
            self,
            storage_id: int
    ) -> StorageResource:
        # 查询存储配置详情
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        return storage

    async def update_storage_config(
            self,
            storage_id: int,
            storage_update: StorageUpdate
    ) -> StorageResource:
        # 验证存储配置是否存在
        db_storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not db_storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        if storage_update.config != 'NFS' and db_storage.config['bucket'] != storage_update.config['bucket']:
            if db_storage.is_init:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='存储已经初始化，无法进行修改')

        try:
            # 更新字段
            update_data = storage_update.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_storage, key, value)

            # 如果更新了关键配置，重置状态
            if any(key in update_data for key in ['type', 'config']):
                db_storage.status = ConnectionStatus.UNTESTED.value

            await self.mapper.commit()
            await self.mapper.refresh(db_storage)
            self.invalidate_juicefs_client(storage_id)

            logger.info(f"Updated storage config: {db_storage.name} (ID: {db_storage.id})")
            return db_storage

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to update storage config {storage_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"更新存储配置失败: {str(e)}")

    async def delete_storage_config(
            self,
            storage_id: int
    ) -> None:
        # 验证存储配置是否存在
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        # 查询关联信息
        storage_relation_query = await self.mapper.execute(
            select(KubernetesStorageRelation.id).filter(KubernetesStorageRelation.storage_id == storage_id))
        storage_relation_id = storage_relation_query.scalars().first()
        if storage_relation_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=data_is_associated_and_cannot_be_deleted()
            )

        try:
            await self.mapper.execute(delete(StorageResource).where(StorageResource.id == storage_id))
            await self.mapper.commit()
            self.invalidate_juicefs_client(storage_id)

            logger.info(f"Deleted storage config: {storage.name} (ID: {storage_id})")
            return None

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to delete storage config {storage_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"删除存储配置失败: {str(e)}")

    # ------------------------------ 连通性测试 ------------------------------
    async def test_storage_connectivity(
            self,
            storage_id: int
    ) -> StorageConnectivityResponse:
        # 验证存储配置是否存在
        # 获取存储配置信息
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        try:
            # 根据存储类型进行连通性测试
            is_connected = False

            storage_type = storage.type.upper()
            config = storage.config or {}

            if storage_type in ['TOS', 'MINIO', 'NFS', 'OBS', 'EOS']:
                # 对象存储连通性测试
                is_connected = await self._test_connectivity(storage_type, config)
            else:
                raise HTTPException(status_code=400, detail=f"不支持的存储类型: {storage_type}")

            # 更新存储连接状态
            new_status = ConnectionStatus.CONNECTED.value if is_connected else ConnectionStatus.FAILED.value

            # 更新数据库中的状态
            await self.mapper.execute(
                update(StorageResource)
                .where(StorageResource.id == storage_id)
                .values(status=new_status, last_test_time=get_current_shanghai_time())
            )
            await self.mapper.commit()

            logger.info(f"Storage connectivity test - name: {storage.name}, Connected: {is_connected}")

            return StorageConnectivityResponse(
                is_connected=is_connected,
            )

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to test storage connectivity {storage_id}: {str(e)}")

            # 测试异常时，将状态设为失败
            try:
                await self.mapper.execute(
                    update(StorageResource)
                    .where(StorageResource.id == storage_id)
                    .values(status=ConnectionStatus.FAILED.value, last_test_time=get_current_shanghai_time())
                )
                await self.mapper.commit()
            except Exception:
                pass

            raise HTTPException(status_code=500, detail=f"测试存储配置连通性失败: {str(e)}")

    # ------------------------------ 集群绑定/解绑 ------------------------------
    async def bind_clusters_to_storage(
            self,
            storage_id: int,
            request: StorageBindClustersRequest,
            current_user: JwtUserInfo
    ) -> StorageBindClustersResponse:
        # 验证存储配置是否存在
        # 验证存储配置是否存在
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        try:
            # 验证所有集群是否存在
            cluster_results = await self.mapper.query(
                select(KubernetesResource.id).filter(KubernetesResource.id.in_(request.cluster_ids))
            )
            existing_cluster_ids = set(cluster_results)
            if len(existing_cluster_ids) != len(request.cluster_ids):
                raise HTTPException(
                    status_code=400,
                    detail="错误的集群ID"
                )

            # 查询出原来的绑定关关系，剔除不在本次绑定列表的集群
            exist_relation = await self.mapper.query(select(KubernetesResource.id).filter(
                KubernetesResource.id.in_(
                    select(KubernetesStorageRelation.k8s_id).filter(
                        KubernetesStorageRelation.storage_id == storage_id)
                )
            ))
            exist_relation_ids = set(exist_relation)
            removed_ids = exist_relation_ids - existing_cluster_ids

            if removed_ids:
                await self.mapper.execute(delete(KubernetesStorageRelation).where(
                    KubernetesStorageRelation.storage_id == storage_id,
                    KubernetesStorageRelation.k8s_id.in_(removed_ids)
                ))

            # 批量插入绑定关系，数据库层自动忽略重复数据
            relation_data_list = []
            for cluster_id in request.cluster_ids:
                relation_data_list.append({
                    'k8s_id': cluster_id,
                    'storage_id': storage_id,
                    'created_id': current_user.userId,
                    'created_by': current_user.username,
                    'created_at': get_current_shanghai_time(),
                    'updated_at': get_current_shanghai_time()
                })
            if relation_data_list:
                # 使用 ON CONFLICT DO NOTHING 来忽略重复绑定
                from sqlalchemy.dialects.postgresql import insert
                stmt = insert(KubernetesStorageRelation.__table__).values(relation_data_list)
                stmt = stmt.on_conflict_do_nothing(constraint='uq_k8s_storage')
                await self.mapper.execute(stmt)

            # 重新查询当前存储关联的集群总数并更新
            total_clusters_result = await self.mapper.query(
                select(KubernetesStorageRelation).filter(
                    KubernetesStorageRelation.storage_id == storage_id
                )
            )
            total_clusters = len(total_clusters_result)

            await self.mapper.execute(
                update(StorageResource)
                .where(StorageResource.id == storage_id)
                .values(cluster_number=total_clusters)
            )

            await self.mapper.commit()

            logger.info(
                f"Storage {storage_id} cluster binding completed. Processed: {len(request.cluster_ids)} clusters, Total clusters: {total_clusters}")

            return StorageBindClustersResponse(
                success=True,
            )

        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to bind clusters to storage {storage_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"绑定集群失败: {str(e)}")

    async def unbind_clusters_from_storage(
            self,
            storage_id: int,
            request: StorageUnbindClustersRequest
    ) -> StorageUnbindClustersResponse:
        # 验证存储配置是否存在
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        try:
            # 验证所有集群是否存在
            cluster_results = await self.mapper.query(
                select(KubernetesResource.id).filter(KubernetesResource.id.in_(request.cluster_ids))
            )
            existing_cluster_ids = set(cluster_results)
            if len(existing_cluster_ids) != len(request.cluster_ids):
                raise HTTPException(
                    status_code=400,
                    detail="错误的集群ID"
                )

            # 查询挂载情况
            sub_where = exists().where(
                KubernetesStorageRelation.k8s_id.in_(request.cluster_ids),
                KubernetesStorageRelation.storage_id == storage_id,
                KubernetesStorageRelation.is_mount,
                KubernetesResource.id == KubernetesStorageRelation.k8s_id
            )
            is_mount_kubernetes_resource = await self.mapper.query(select(KubernetesResource).where(sub_where))
            is_mount_names = {row.name for row in is_mount_kubernetes_resource}

            if is_mount_names:
                raise HTTPException(status_code=400,
                                    detail=f"集群{','.join(is_mount_names)}存储已经挂载，不可手动解绑。请重新选择！！！")

            # 批量删除绑定关系
            await self.mapper.execute(
                delete(KubernetesStorageRelation).filter(
                    and_(
                        KubernetesStorageRelation.storage_id == storage_id,
                        KubernetesStorageRelation.k8s_id.in_(request.cluster_ids)
                    )
                )
            )
            # 重新查询当前存储关联的集群总数并更新
            total_clusters_result = await self.mapper.query(
                select(KubernetesStorageRelation).filter(
                    KubernetesStorageRelation.storage_id == storage_id
                )
            )
            total_clusters = len(total_clusters_result)

            await self.mapper.execute(
                update(StorageResource)
                .where(StorageResource.id == storage_id)
                .values(cluster_number=total_clusters)
            )

            await self.mapper.commit()

            logger.info(
                f"Storage {storage_id} cluster unbinding completed. Processed: {len(request.cluster_ids)} clusters, Total clusters: {total_clusters}")

            return StorageUnbindClustersResponse(
                success=True,
            )

        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to unbind clusters from storage {storage_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"解绑集群失败: {str(e)}")

    # ------------------------------ 存储挂载 ------------------------------
    async def mount_storage_to_cluster(
            self,
            storage_id: int,
            cluster_id: int
    ) -> StorageMountResponse:
        # 验证存储配置是否存在
        # 验证存储配置是否存在
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        # 验证集群是否存在
        cluster = await self.mapper.query_one(
            select(KubernetesResource).filter(KubernetesResource.id == cluster_id))

        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        try:
            # 检查存储和集群的绑定关系是否存在
            relation = await self.mapper.query_one(
                select(KubernetesStorageRelation).filter(
                    and_(
                        KubernetesStorageRelation.storage_id == storage_id,
                        KubernetesStorageRelation.k8s_id == cluster_id
                    )
                )
            )

            if not relation:
                raise HTTPException(status_code=400, detail="存储配置和集群尚未建立绑定关系，请先绑定")

            # 检查是否已经挂载
            if relation.is_mount:
                logger.info(f"Storage {storage_id} already mounted to cluster {cluster_id}")
                return StorageMountResponse(
                    success=True,
                )

            # 获取仓库信息
            repository = await self.mapper.query_one(
                select(RepositoryResource)
                .join(KubernetesRepositoryRelation, RepositoryResource.id == KubernetesRepositoryRelation.repository_id)
                .filter(KubernetesRepositoryRelation.k8s_id == cluster_id)
            )
            if not repository:
                raise HTTPException(status_code=400, detail="集群未绑定仓库或仓库不存在")

            kubeconfig_str = cluster.config
            driver_namespace = "deepexilab-csi-driver"
            alloy_namespace = "deepexilab-alloy"
            secret_name = "deepexilab-csi-driver-secret"
            # todo 目前只考虑了 auth_type 为 username_password
            harbor_url = repository.repository_address
            harbor_username = repository.auth_config['username']
            harbor_password = repository.auth_config['password']
            harbor_base_namespace = repository.namespace

            # 创建deepexilab-csi-driver Harbor secret
            success = await create_harbor_secret(
                harbor_url=harbor_url,
                harbor_user_name=harbor_username,
                harbor_password=harbor_password,
                namespace=driver_namespace,
                secret_name=secret_name,
                kubeconfig_str=kubeconfig_str
            )

            if not success:
                raise HTTPException(status_code=500, detail=f"创建{driver_namespace}:Harbor secret失败")

            # harbor_url需要去掉协议头
            harbor_url = harbor_url.split("://", 1)[-1]
            # 准备Helm values配置
            juicefs_helm_values = {
                "image": {
                    "repository": f"{harbor_url}/{harbor_base_namespace}/juicedata/juicefs-csi-driver",
                    "tag": os.getenv('JUICEFS-CSI-DRIVER-TAG', 'v0.29.0')
                },
                "dashboardImage": {
                    "repository": f"{harbor_url}/{harbor_base_namespace}/juicedata/csi-dashboard",
                    "tag": os.getenv('CSI-DASHBOARD-TAG', 'v0.29.0')
                },
                "sidecars": {
                    "livenessProbeImage": {
                        "repository": f"{harbor_url}/{harbor_base_namespace}/sig-storage/livenessprobe",
                        "tag": os.getenv('LIVENESSPROBE-TAG', 'v2.12.0')
                    },
                    "nodeDriverRegistrarImage": {
                        "repository": f"{harbor_url}/{harbor_base_namespace}/sig-storage/csi-node-driver-registrar",
                        "tag": os.getenv('CSI-NODE-DRIVER-REGISTRAR-TAG', 'v2.9.0')
                    },
                    "csiResizerImage": {
                        "repository": f"{harbor_url}/{harbor_base_namespace}/sig-storage/csi-resizer",
                        "tag": os.getenv('CSI-RESIZER-TAG', 'v1.9.0')
                    }
                },
                "defaultMountImage": {
                    "ce": f"{harbor_url}/{harbor_base_namespace}/juicedata/mount:ce-v1.3.0"
                },
                "imagePullSecrets": [
                    {"name": secret_name}
                ]
            }
            # 从minio获取juicefs-csi-driver-0.29.0.tgz
            juicefs_csi_driver_path = await self._get_juicefs_csi_driver_path()

            # 安装JuiceFS CSI driver
            rc, out, err = run_helm_with_kubeconfig(
                kubeconfig_str=kubeconfig_str,
                release_name="juicefs-csi-driver",
                chart_path=juicefs_csi_driver_path,
                namespace=driver_namespace,
                helm_values=juicefs_helm_values
            )

            if rc != 0:
                raise HTTPException(status_code=500, detail=f"Helm安装失败: {err}")

            # 添加存储配置secret和storageclass
            metaurl = f'{settings.STORAGE_ENDPOINT}{storage_id}'
            await self._add_secret_and_storageclass(kubeconfig_str=kubeconfig_str, namespace=driver_namespace,
                                                    metaurl=metaurl, storage=storage)

            # 安装alloy
            await self.upgrade_alloy(harbor_url=harbor_url, harbor_base_namespace=harbor_base_namespace,
                                     harbor_username=harbor_username, harbor_password=harbor_password,
                                     alloy_namespace=alloy_namespace,
                                     kubeconfig_str=kubeconfig_str)

            # 执行挂载操作 - 将is_mount设置为True
            await self.mapper.execute(
                update(KubernetesStorageRelation)
                .where(
                    and_(
                        KubernetesStorageRelation.storage_id == storage_id,
                        KubernetesStorageRelation.k8s_id == cluster_id
                    )
                )
                .values(is_mount=True)
            )

            await self.mapper.commit()

            return StorageMountResponse(
                success=True,
            )
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to mount storage {storage_id} to cluster {cluster_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"挂载存储失败: {str(e)}")

    # ------------------------------ 初始化文件系统 ------------------------------
    async def init_juicefs_format(
            self,
            storage_id: int
    ) -> StorageInitResponse:
        # 验证存储配置是否存在
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())
        if storage.is_init:
            raise HTTPException(status_code=404, detail="Do not initialize the data repeatedly")

        metaurl = f'{settings.STORAGE_ENDPOINT}{storage_id}'
        # 初始化文件系统和创建公共存储目录
        try:
            if not await self._init_juicefs_format_and_shared_directory(metaurl, storage):
                raise HTTPException(status_code=500, detail="初始化文件系统失败")
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"初始化文件系统失败: {str(e)}"
            )

        storage.is_init = True
        await self.mapper.commit()
        return StorageInitResponse(
            success=True,
            meta_url=metaurl
        )

    # ------------------------------ 内部辅助方法 ------------------------------
    async def _test_connectivity(
            self,
            storage_type: str,
            config: Dict[str, Any]
    ) -> bool:
        """执行具体存储类型的连通性测试（复用桶空检测逻辑）"""
        await self._bucket_is_empty(storage_type, config)
        return True

    async def _get_file_from_minio(
            self,
            object_name: str,
            suffix: str = ".tgz"
    ) -> str:
        """从MinIO下载文件到临时目录"""
        try:
            minio_client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE.lower() == 'true'
            )

            response = minio_client.get_object(
                bucket_name=settings.MINIO_BUCKET,
                object_name=object_name
            )

            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix=suffix) as tmp_file:
                tmp_file.write(response.read())

            logger.info(f"成功从MinIO下载文件: {object_name} -> {tmp_file.name}")
            return tmp_file.name

        except Exception as e:
            logger.error(f"从MinIO下载文件失败: {object_name}, 错误: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"下载文件失败: {str(e)}"
            )

    async def _get_juicefs_csi_driver_path(self) -> str:
        """获取JuiceFS CSI Driver的Helm Chart路径"""
        return await self._get_file_from_minio("helm-chart/juicefs-csi-driver-0.29.0.tgz")

    async def _get_alloy_path(self) -> str:
        """获取Alloy的Helm Chart路径"""
        return await self._get_file_from_minio("helm-chart/alloy-1.2.1.tgz")

    async def _add_secret_and_storageclass(
            self,
            kubeconfig_str: str,
            namespace: str,
            metaurl: str,
            storage: StorageResource
    ) -> None:
        """创建存储Secret和StorageClass"""
        # 创建JuiceFS Secret
        success = await create_storage_secret(
            kubeconfig_str=kubeconfig_str,
            namespace=namespace,
            metaurl=metaurl,
            storage=storage
        )

        if not success:
            raise HTTPException(status_code=500, detail="创建JuiceFS Secret失败")

        # 添加storageclass
        success = await create_storageclass(
            kubeconfig_str=kubeconfig_str,
            namespace=namespace
        )

        if not success:
            raise HTTPException(status_code=500, detail="创建JuiceFS StorageClass失败")

    async def _bucket_is_empty(
            self,
            storage_type: str,
            config: Dict[str, Any]
    ) -> bool:
        """检查存储桶是否为空"""
        try:
            if storage_type == 'MINIO':
                # MinIO example
                minio_checker = await BucketCheckerFactory.create_checker(
                    storage_type.lower(),
                    # Usage
                    url=config["endpoint"],
                    access_key=config["access_key"],
                    secret_key=config["secret_key"],
                    bucket_name=config["bucket"],
                )
                is_empty = await minio_checker.is_empty()
                logger.info(f"MinIO bucket empty: {is_empty}")
                return is_empty
            if storage_type == 'NFS':
                # NFS example
                nfs_checker = await BucketCheckerFactory.create_checker(
                    storage_type.lower(),
                    # Usage
                    endpoint=config["endpoint"],
                    remote_path=config["remote_path"],
                )
                is_empty = await nfs_checker.is_empty()
                logger.info(f"NFS bucket empty: {is_empty}")
                return is_empty

            if storage_type == 'TOS':
                # TOS example
                tos_checker = await BucketCheckerFactory.create_checker(
                    storage_type.lower(),
                    # Usage
                    endpoint=config["endpoint"],
                    region=config["region"],
                    access_key=config["access_key"],
                    secret_key=config["secret_key"],
                    bucket_name=config["bucket"],
                )
                is_empty = await tos_checker.is_empty()
                logger.info(f"TOS bucket empty: {is_empty}")
                return is_empty
            if storage_type == 'OBS':
                # OBS example
                tos_checker = await BucketCheckerFactory.create_checker(
                    storage_type.lower(),
                    # Usage
                    region=config["region"],
                    access_key=config["access_key"],
                    secret_key=config["secret_key"],
                    bucket_name=config["bucket"],
                )
                is_empty = await tos_checker.is_empty()
                logger.info(f"OBS bucket empty: {is_empty}")
                return is_empty
            if storage_type == 'EOS':
                eos_checker = await BucketCheckerFactory.create_checker(
                    storage_type.lower(),
                    endpoint=config["endpoint"],
                    access_key=config["access_key"],
                    secret_key=config["secret_key"],
                    bucket_name=config["bucket"],
                )
                is_empty = await eos_checker.is_empty()
                logger.info(f"EOS bucket empty: {is_empty}")
                return is_empty
        except Exception as e:
            logger.error(f"存储连接失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"{str(e)}")
        return False

    async def _init_juicefs_format_and_shared_directory(
            self,
            metaurl: str,
            storage: StorageResource
    ) -> bool:
        """初始化JuiceFS文件系统和共享目录"""
        # 初始化文件系统
        config_data = storage.config or {}

        if not await self._bucket_is_empty(storage.type, config_data):
            raise HTTPException(status_code=500, detail=f"该桶不为空，无法格式化")

        # 固定值
        volume_name = 'juicefs-vol'

        if storage.type == 'MINIO':
            # Validate required configuration fields
            required_fields = ['access_key', 'secret_key', 'endpoint', 'bucket']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False

            is_success = await StorageUtils.format_fs(
                storage=storage.type.lower(),
                bucket=config_data["endpoint"] + '/' + config_data["bucket"],
                access_key=config_data["access_key"],
                secret_key=config_data["secret_key"],
                meta_url=metaurl,
                volume_name=volume_name)
        elif storage.type == 'NFS':
            required_fields = ['endpoint', 'remote_path']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False

            is_success = await StorageUtils.format_fs(
                storage=storage.type.lower(),
                bucket=config_data["endpoint"] + ':' + config_data["remote_path"],
                meta_url=metaurl,
                volume_name=volume_name)
        elif storage.type == 'TOS':
            required_fields = ['access_key', 'secret_key', 'endpoint', 'bucket']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False

            is_success = await StorageUtils.format_fs(
                storage=storage.type.lower(),
                bucket=config_data["bucket"] + '.' + config_data["endpoint"],
                access_key=config_data["access_key"],
                secret_key=config_data["secret_key"],
                meta_url=metaurl,
                volume_name=volume_name)
        elif storage.type == 'OBS':
            required_fields = ['access_key', 'secret_key', 'region', 'bucket']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False

            is_success = await StorageUtils.format_fs(
                storage=storage.type.lower(),
                bucket=f'https://{config_data["bucket"]}.obs.{config_data["region"]}.myhuaweicloud.com',
                access_key=config_data["access_key"],
                secret_key=config_data["secret_key"],
                meta_url=metaurl,
                volume_name=volume_name)
        elif storage.type == 'EOS':
            required_fields = ['access_key', 'secret_key', 'endpoint', 'bucket']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False

            bucket = await build_url_with_protocol(f'{config_data["bucket"]}.{config_data["endpoint"]}')
            is_success = await StorageUtils.format_fs(
                storage=storage.type.lower(),
                bucket=bucket,
                access_key=config_data["access_key"],
                secret_key=config_data["secret_key"],
                meta_url=metaurl,
                volume_name=volume_name)
        else:
            is_success = False

        if is_success:
            models_directory = await StorageUtils.create_directory(
                remote_path=StoragePath.NOTEBOOK_BUILTIN_MODELS.storage_path, tenant_storage=volume_name,
                meta_url=metaurl)
            datasets_directory = await StorageUtils.create_directory(
                remote_path=StoragePath.NOTEBOOK_BUILTIN_DATASETS.storage_path,
                tenant_storage=volume_name, meta_url=metaurl)

            # 初始化模型提供商文件夹
            await self.init_model_provider_folder(tenant_storage=volume_name, meta_url=metaurl)
            if models_directory and datasets_directory:
                return True
        return False

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(StorageResource).where(StorageResource.id == id_field_value))
        pass

    async def JUICEFS_CLIENT(self, tenant_id: Optional[str] = None) -> juicefs.Client:
        """构建JUICEFS客户端"""
        # tenant_id 从上下文中获取
        tenant_id = tenant_id or get_tenant_id()
        if not tenant_id:
            raise HTTPException(status_code=404, detail="JUICEFS_CLIENT tenant_id is None")

        redis_key = f"tenant_storage_id:{tenant_id}"
        storage_id: Optional[str] = None

        # 获取 Redis 客户端，确保它绑定到当前事件循环
        import asyncio
        try:
            # 尝试获取当前运行的事件循环
            current_loop = asyncio.get_running_loop()

            # 检查全局 Redis 客户端是否绑定到当前事件循环
            global_redis = settings.REDIS_CLIENT
            # 检查全局客户端是否绑定到当前事件循环
            try:
                # 尝试获取全局客户端的事件循环
                global_loop = getattr(global_redis, '_loop', None)
                if global_loop is None or global_loop != current_loop:
                    # 如果绑定到不同的事件循环，创建新的客户端（支持 Sentinel）
                    redis_client = self.get_new_redis_client()
                else:
                    # 绑定到相同的事件循环，可以使用全局客户端
                    redis_client = global_redis
            except Exception:
                # 如果检查失败，创建新的客户端（支持 Sentinel）
                redis_client = self.get_new_redis_client()
        except RuntimeError:
            # 如果没有运行中的事件循环（不应该发生），使用全局客户端
            redis_client = settings.REDIS_CLIENT
            if redis_client is None:
                raise RuntimeError("redis client is not initialized")

        # 先从 redis 获取 storage_id
        try:
            storage_id = await redis_client.get(redis_key)
        except Exception:
            storage_id = None

        # redis 没命中时查库并回填
        if not storage_id:
            async with get_db_session() as db:  # 获取 AsyncSession
                query = await db.execute(select(StorageResource).where(StorageResource.tenant_id == tenant_id))
                storage_resources = query.scalars().all()
                if not storage_resources:
                    raise HTTPException(status_code=404, detail=data_not_found_error())
                storage_id = str(storage_resources[0].id)

            try:
                await redis_client.set(redis_key, storage_id, ex=60 * 60 * 24)
            except Exception as e:
                logger.warning(f"set tenant storage id cache failed, tenant_id={tenant_id}, error={e}")

        storage_id = str(storage_id)
        cache_client = self._juicefs_client_cache.get(storage_id)
        if cache_client:
            return cache_client

        storage_metaurl = f"{settings.STORAGE_ENDPOINT}{storage_id}"
        logger.info(f"create juicefs client, storage_id={storage_id}, meta_url={storage_metaurl}")
        client = juicefs.Client(name="", meta=storage_metaurl)
        self._juicefs_client_cache[storage_id] = client
        return client

    def invalidate_juicefs_client(self, storage_id: int | str) -> None:
        """清理指定 storage_id 的 JuiceFS 客户端缓存"""
        storage_id_str = str(storage_id)
        if self._juicefs_client_cache.pop(storage_id_str, None) is not None:
            logger.info(f"invalidate juicefs client cache, storage_id={storage_id_str}")

    def get_new_redis_client(self):
        if settings.REDIS_SENTINEL and settings.REDIS_SENTINEL == 'enable':
            # Sentinel 模式（异步）
            sentinel_hosts = _parse_sentinel_hosts(settings.REDIS_SENTINEL_HOST_PORT)
            if not sentinel_hosts:
                raise ValueError("REDIS_SENTINEL_HOST_PORT 配置错误，无法解析 Sentinel 地址")

            from redis.asyncio.sentinel import Sentinel

            # 创建异步 Sentinel 连接
            # 注意：只有当密码存在时才传递 password 参数
            sentinel_kwargs = {
                'socket_timeout': 0.1,
                'socket_connect_timeout': 0.1
            }
            if settings.REDIS_NODE_PASSWORD and settings.REDIS_NODE_PASSWORD.strip():
                sentinel_kwargs['password'] = settings.REDIS_NODE_PASSWORD

            sentinel = Sentinel(
                sentinel_hosts,
                **sentinel_kwargs
            )

            # 获取主节点客户端（异步 Sentinel 的 master_for 返回的是 Redis 对象，不是协程）
            # 注意：只有当密码存在时才传递 password 参数
            # 使用 REDIS_SENTINEL_DB
            db = int(settings.REDIS_SENTINEL_DB)
            master_kwargs = {
                'db': db,
                'socket_timeout': 0.1,
                'decode_responses': True
            }
            if settings.REDIS_NODE_PASSWORD and settings.REDIS_NODE_PASSWORD.strip():
                master_kwargs['password'] = settings.REDIS_NODE_PASSWORD

            redis_client = sentinel.master_for(
                settings.REDIS_MASTER_NAME,
                **master_kwargs
            )
        else:
            # 普通模式（异步）
            import redis.asyncio as redis_async
            redis_client = redis_async.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )

        return redis_client


    async def upgrade_alloy(self, harbor_url, harbor_base_namespace, harbor_username, harbor_password, alloy_namespace,
                            kubeconfig_str):
        alloy_path = await self._get_alloy_path()

        # 获取 Loki 推送端点（优先使用 LOKI_PUSH_*，否则 fallback 到 LAB_EXPORT_*）
        loki_endpoint = settings.LOKI_PUSH_ENDPOINT

        alloy_secret_name = "deepexilab-alloy-secret"
        alloy_helm_values = {
            "alloy": {
                "lokiEndpoint": loki_endpoint,
            },
            "image": {
                "repository": f"{harbor_url}/{harbor_base_namespace}/grafana/alloy",
                "pullSecrets": [
                    {"name": alloy_secret_name}
                ]
            }
        }

        # 创建alloy_secret_name Harbor secret
        success = await create_harbor_secret(
            harbor_url=harbor_url,
            harbor_user_name=harbor_username,
            harbor_password=harbor_password,
            namespace=alloy_namespace,
            secret_name=alloy_secret_name,
            kubeconfig_str=kubeconfig_str
        )

        if not success:
            raise HTTPException(status_code=500, detail=f"创建{alloy_namespace}:Harbor secret失败")

        # 安装alloy
        rc, out, err = run_helm_with_kubeconfig(
            kubeconfig_str=kubeconfig_str,
            release_name="alloy",
            chart_path=alloy_path,
            namespace=alloy_namespace,
            helm_values=alloy_helm_values
        )

        if rc != 0:
            raise HTTPException(status_code=500, detail=f"Helm安装失败: {err}")

    async def init_model_provider_folder(self, tenant_storage, meta_url):
        try:
            for item in ModelProvider:
                await StorageUtils.create_directory(
                    remote_path=f'{StoragePath.NOTEBOOK_BUILTIN_MODELS.storage_path}/{item.value}',
                    tenant_storage=tenant_storage, meta_url=meta_url)
        except Exception as e:
            logger.error(f"Error init model provider folder Get Juicefs meta_url: : {e}")


    async def upload_file(
            self,
            object_path: str,
            file: UploadFile
    ):
        # 上传
        self.client.put_object(
            bucket_name=settings.MINIO_BUCKET,
            object_name=object_path,
            data=file.file,  # 直接用底层 stream
            length=-1,  # 流式
            part_size=10 * 1024 * 1024,
            content_type=file.content_type
        )

        return {
            "success": True,
            "bucket": settings.MINIO_BUCKET,
            "object_path": object_path,
            "filename": file.filename,
        }

    async def download_file(self, object_path: str):
        try:
            response = self.client.get_object(
                bucket_name=settings.MINIO_BUCKET,
                object_name=object_path,
            )
        except Exception as e:
            logger.error(f"下载 MinIO 文件失败: {e}")
            raise HTTPException(status_code=404, detail=f"文件不存在: {object_path}")

        def iterfile():
            try:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                response.close()
                response.release_conn()

        filename = os.path.basename(object_path.rstrip("/")) or "download"
        return StreamingResponse(
            iterfile(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": build_content_disposition_header(filename)},
        )

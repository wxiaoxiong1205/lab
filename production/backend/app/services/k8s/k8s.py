import os
from datetime import datetime
from typing import List, Tuple, Dict, Any, Optional

import yaml
from app.core.config import settings
from fastapi import HTTPException, status, Request
from fastapi_pagination import Page
from kubernetes import client
from sqlalchemy import select, update, delete, insert, and_
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.core.logging import logger
from app.models.models import JwtUserInfo, Project
from app.models.models import (
    KubernetesResource, StorageResource, RepositoryResource,
    KubernetesStorageRelation, KubernetesRepositoryRelation,
    ProjectKubernetesRelation
)
from app.schemas.common import ConnectionStatus
from app.schemas.k8s import (
    KubernetesCreate, KubernetesUpdate, KubernetesResponse,
    KubernetesConnectivityResponse, KubernetesBindStorageResponse,
    KubernetesBindRepositoryResponse, VolcengineKubeType, KubeLabelsType
)
from app.utils.error_messages import data_not_found_error, data_is_associated_and_cannot_be_deleted, \
    data_not_found_error_by_name
from app.utils.helm_utils import run_uninstall_csi
from app.utils.k8s_call import get_k8s_api, k8s_call
from app.utils.k8s_utils import uninstall_secret_and_storageclass
from .interface import K8sService
from ..storage.interface import StorageService
from ...database.base import get_db_session
from ...repository.base_mapper import BaseMapper
import base64, hashlib, yaml

from ...utils.k8s_config_validate_util import validate_kubeconfig_strict
from ...utils.k8s_launcher import K8sLauncher
from ...utils import app_runtime_context
from ...utils.timezone_utils import get_current_shanghai_time


class DefaultK8sService(K8sService):
    """K8s集群服务实现类"""

    def __init__(self, mapper: BaseMapper, storage: StorageService) -> None:
        self.mapper = mapper
        self.storage = storage
        pass

    # ------------------------------ 内部辅助方法实现 ------------------------------
    async def _validate_k8s_cluster_exists(
            self, cluster_id: int
    ) -> KubernetesResource:
        """验证K8s集群存在，不存在则抛出404异常"""
        cluster = await self.mapper.query_one(select(KubernetesResource).filter(KubernetesResource.id == cluster_id))
        if not cluster:
            raise HTTPException(status_code=404, detail=data_not_found_error_by_name("K8s集群"))
        return cluster

    async def _validate_storage_exists(
            self, storage_id: int
    ) -> StorageResource:
        """验证存储资源存在且状态正常，异常则抛出对应异常"""
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))
        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error("存储资源"))
        if storage.status != "连接正常" or not storage.is_init:
            raise HTTPException(status_code=500, detail="存储资源未初始化或连接异常")
        return storage

    async def _validate_repository_exists(
            self, repository_id: int
    ) -> RepositoryResource:
        """验证镜像仓库存在，不存在则抛出404异常"""
        repo = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))
        if not repo:
            raise HTTPException(status_code=404, detail=data_not_found_error("镜像仓库"))
        return repo

    def _parse_kubeconfig(self, config_str: str) -> Tuple[str, Dict[str, Any]]:
        """解析kubeconfig，返回API Server地址和解析后的配置字典"""
        try:
            config_dict = yaml.safe_load(config_str)
            if not config_dict or "clusters" not in config_dict:
                raise ValueError("kubeconfig缺少clusters字段")

            # 提取第一个集群的API Server地址
            for cluster in config_dict["clusters"]:
                if "cluster" in cluster and "server" in cluster["cluster"]:
                    api_server = cluster["cluster"]["server"]
                    return api_server, config_dict

            raise ValueError("kubeconfig中未找到有效的API Server地址")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"kubeconfig解析失败: {str(e)}")

    def _sync_api_server_to_kubeconfig(
            self,
            config_str: str,
            api_server: str
    ) -> Tuple[str, bool]:
        """把 API Server 同步进 kubeconfig 的有效 cluster.server。"""
        normalized_api_server = (api_server or "").strip()
        if not normalized_api_server:
            raise ValueError("API Server不能为空")

        config_dict = yaml.safe_load(config_str)
        if not config_dict or "clusters" not in config_dict:
            raise ValueError("kubeconfig缺少clusters字段")

        for cluster in config_dict["clusters"]:
            if "cluster" in cluster and "server" in cluster["cluster"]:
                cluster_config = cluster["cluster"]
                if cluster_config.get("server") == normalized_api_server:
                    return config_str, False
                cluster_config["server"] = normalized_api_server
                return yaml.safe_dump(config_dict, sort_keys=False, allow_unicode=True), True

        raise ValueError("kubeconfig中未找到有效的API Server地址")

    async def _get_k8s_cluster_info(self, config_dict: Dict[str, Any]) -> Tuple[str, int]:
        """获取K8s集群信息（版本和节点数）"""
        try:
            # 初始化K8s CoreV1 API客户端
            api_instance = get_k8s_api(config_dict, client.CoreV1Api)
            # 调用API获取节点列表
            node_list = await k8s_call(api_instance.list_node)
            node_count = len(node_list.items)
            if node_count == 0:
                raise ValueError("集群中未找到节点")

            # 提取第一个节点的Kubelet版本
            k8s_version = node_list.items[0].status.node_info.kubelet_version
            return k8s_version, node_count
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"获取集群信息失败: {str(e)}")

    async def _uninstall_csi_driver(self, kubeconfig_str: str) -> None:
        """卸载K8s集群中的CSI驱动（JuiceFS相关）"""
        namespace = "deepexilab-csi-driver"
        secret_name = "juicefs-secret"
        storageclass_name = "juicefs-sc"

        # 1. 卸载Helm CSI驱动
        rc, out, err = run_uninstall_csi(
            kubeconfig_str=kubeconfig_str,
            release_name="juicefs-csi-driver",
            namespace=namespace
        )
        if rc != 0:
            raise HTTPException(status_code=500, detail=f"Helm卸载CSI驱动失败: {err}")

        # 2. 卸载Secret和StorageClass
        config_dict = yaml.safe_load(kubeconfig_str)
        await uninstall_secret_and_storageclass(
            config_dict, namespace, secret_name, storageclass_name
        )
        logger.info("CSI驱动及关联资源卸载成功")

    # ------------------------------ 核心业务方法实现（一） ------------------------------
    async def list_k8s_clusters(
            self,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[KubernetesResponse]:
        """获取K8s集群列表（分页）"""
        # 构建查询：关联存储和仓库关系（左连接）
        query = (
            select(
                KubernetesResource.id,
                KubernetesResource.name,
                KubernetesResource.status,
                KubernetesResource.api_server,
                KubernetesResource.description,
                KubernetesResource.version,
                KubernetesResource.node_number,
                KubernetesResource.created_at,
                KubernetesResource.updated_at,
                KubernetesResource.created_id,
                KubernetesResource.created_by,
                KubernetesResource.ext,
                KubernetesStorageRelation.storage_id,
                KubernetesRepositoryRelation.repository_id,
                KubernetesStorageRelation.is_mount
            )
            .join(
                KubernetesStorageRelation,
                KubernetesStorageRelation.k8s_id == KubernetesResource.id,
                isouter=True
            )
            .join(
                KubernetesRepositoryRelation,
                KubernetesRepositoryRelation.k8s_id == KubernetesResource.id,
                isouter=True
            )
            .order_by(KubernetesResource.created_at.desc())
        )
        return await self.mapper.query_page(query, page, size,False)

    async def create_k8s_cluster(
            self, current_user: JwtUserInfo, cluster: KubernetesCreate
    ) -> KubernetesResource:
        """创建新的K8s集群（含配置解析和集群信息获取）"""
        # 校验config合法
        try:
            validate_kubeconfig_strict(cluster.config)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"创建集群失败: {str(e)}")
        # 先校验集群
        is_new = await self.validate_not_duplicate_cluster(cluster.config)
        if not is_new:
            raise HTTPException(status_code=400, detail="该集群已存在（CA 相同）")
        # 校验集群名称重复
        is_exists = await self.exists(cluster.name)
        if is_exists:
            raise HTTPException(status_code=400, detail=f"已存在同名集群：{cluster.name}")

        # 1. 解析kubeconfig
        api_server, config_dict = self._parse_kubeconfig(cluster.config)

        # 2. 获取集群版本和节点数
        k8s_version, node_count = await self._get_k8s_cluster_info(config_dict)

        # 3. 构建集群数据
        cluster_data = cluster.model_dump()
        cluster_data.update({
            "api_server": api_server,
            "version": k8s_version,
            "node_number": node_count,
            "status": ConnectionStatus.CONNECTED.value,
            "created_id": current_user.userId,
            "created_by": current_user.username
        })

        # 4. 入库并返回
        try:
            new_cluster = KubernetesResource(**cluster_data)
            await self.mapper.insert(new_cluster)
            await self.mapper.commit()
            await self.mapper.refresh(new_cluster)
            logger.info(f"创建K8s集群成功: {new_cluster.name}（ID: {new_cluster.id}）")
            return new_cluster
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"创建K8s集群失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"创建集群失败: {str(e)}")

    async def get_k8s_cluster(
            self, cluster_id: int
    ) -> KubernetesResource:
        """获取指定K8s集群详情"""
        return await self._validate_k8s_cluster_exists(cluster_id)

    async def update_k8s_cluster(
            self, cluster_id: int, cluster_update: KubernetesUpdate
    ) -> KubernetesResource:
        """更新K8s集群信息（支持部分字段更新）"""
        # 1. 验证集群存在
        cluster = await self._validate_k8s_cluster_exists(cluster_id)

        # 校验集群名称重复
        is_exists = await self.exists(cluster_update.name,cluster_id)
        if is_exists:
            raise HTTPException(status_code=400, detail=f"已存在同名集群：{cluster_update.name}")

        # 2. 处理更新数据（排除空值和无效配置）
        update_data = cluster_update.model_dump(exclude_unset=True)
        if "config" in update_data and (not update_data["config"] or not update_data["config"].strip()):
            del update_data["config"]  # 过滤空配置
        if "api_server" in update_data and update_data["api_server"] is not None:
            update_data["api_server"] = update_data["api_server"].strip()
            if not update_data["api_server"]:
                del update_data["api_server"]

        if "config" in update_data:
            try:
                validate_kubeconfig_strict(update_data["config"])
                parsed_api_server, _ = self._parse_kubeconfig(update_data["config"])
                if update_data.get("api_server"):
                    synced_config, _ = self._sync_api_server_to_kubeconfig(
                        update_data["config"], update_data["api_server"]
                    )
                    update_data["config"] = synced_config
                else:
                    update_data["api_server"] = parsed_api_server
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"更新集群失败: {str(e)}")
        elif update_data.get("api_server"):
            try:
                synced_config, changed = self._sync_api_server_to_kubeconfig(
                    cluster.config, update_data["api_server"]
                )
                if changed:
                    update_data["config"] = synced_config
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"更新API Server失败: {str(e)}")

        # 3. 执行更新
        try:
            for key, value in update_data.items():
                setattr(cluster, key, value)
            await self.mapper.commit()
            await self.mapper.refresh(cluster)
            logger.info(f"更新K8s集群成功: {cluster.name}（ID: {cluster_id}）")
            return cluster
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"更新K8s集群失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"更新集群失败: {str(e)}")

    # ------------------------------ 核心业务方法实现（二） ------------------------------
    async def delete_k8s_cluster(
            self, cluster_id: int
    ) -> None:
        """删除K8s集群（含关联存储/仓库清理和CSI卸载）"""
        cluster = await self.mapper.query_one(select(KubernetesResource).filter(KubernetesResource.id == cluster_id))

        if not cluster:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        # 查询关联信息
        project_relation_query = await self.mapper.query(
            select(ProjectKubernetesRelation.id).filter(ProjectKubernetesRelation.k8s_id == cluster_id))
        if len(project_relation_query) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=data_is_associated_and_cannot_be_deleted()
            )

        try:
            kubernetes_storage_relation = await self.mapper.query_one(select(KubernetesStorageRelation)
                                                                      .where(
                KubernetesStorageRelation.k8s_id == cluster_id))
            if kubernetes_storage_relation:
                # 减少集群关联数
                await self.mapper.execute(
                    update(StorageResource).where(StorageResource.id == kubernetes_storage_relation.storage_id)
                    .values(cluster_number=StorageResource.cluster_number - 1))
                # 删除集群绑定的存储
                await self.mapper.delete_condition(
                    delete(KubernetesStorageRelation).where(KubernetesStorageRelation.k8s_id == cluster_id))

            kubernetes_repository_relation_query = await self.mapper.execute(select(KubernetesRepositoryRelation)
            .where(
                KubernetesRepositoryRelation.k8s_id == cluster_id))
            kubernetes_repository_relation = kubernetes_repository_relation_query.scalar_one_or_none()

            if kubernetes_repository_relation:
                # 减少集群关联数
                await self.mapper.execute(update(RepositoryResource).where(
                    RepositoryResource.id == kubernetes_repository_relation.repository_id)
                                          .values(cluster_number=RepositoryResource.cluster_number - 1))

                # 删除集群绑定的仓库
                await self.mapper.execute(
                    delete(KubernetesRepositoryRelation).where(KubernetesRepositoryRelation.k8s_id == cluster_id))

            # 如果已挂载，删除时需要剔除存储与驱动
            if kubernetes_storage_relation and kubernetes_storage_relation.is_mount:
                # 卸载驱动与存储相关
                namespace = "deepexilab-csi-driver"
                secret_name = "juicefs-secret"
                storageclass_name = "juicefs-sc"
                rc, out, err = run_uninstall_csi(kubeconfig_str=cluster.config, release_name="juicefs-csi-driver",
                                                 namespace=namespace)
                if rc != 0:
                    raise HTTPException(status_code=500, detail=f"Helm卸载失败: {err}")

                await uninstall_secret_and_storageclass(cluster.config, namespace, secret_name, storageclass_name)

            # 最后删除集群
            await self.mapper.execute(delete(KubernetesResource).where(KubernetesResource.id == cluster_id))
            await self.mapper.commit()

            logger.info(f"Deleted K8s cluster: {cluster.name} (ID: {cluster_id})")
            return None

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to delete K8s cluster {cluster_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"删除K8s集群失败: {str(e)}")

    async def test_k8s_cluster_connectivity(
            self, cluster_id: int
    ) -> KubernetesConnectivityResponse:
        """测试K8s集群连通性（更新集群状态和基础信息）"""
        # 获取集群信息
        cluster = await self.mapper.query_one(select(KubernetesResource).filter(KubernetesResource.id == cluster_id))

        if not cluster:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        try:
            # 解析kubeconfig
            config_dict = yaml.safe_load(cluster.config)
            # # 加载配置并尝试连接
            api_instance = get_k8s_api(config_dict, client.CoreV1Api)
            api_response = await k8s_call(api_instance.list_node)
            node_number = len(api_response.items)
            for node in api_response.items:
                version = node.status.node_info.kubelet_version
                break
            cluster.version = version
            cluster.node_number = node_number
            cluster.status = ConnectionStatus.CONNECTED.value
            # 测试连通性时同步一次
            await sync_kubernetes_labels()
            await self.mapper.commit()
            await self.mapper.refresh(cluster)
            # 连接成功
            logger.info(f"Successfully tested connectivity for K8s cluster: {cluster.name} (ID: {cluster_id})")
            return KubernetesConnectivityResponse(
                cluster_id=cluster_id,
                is_connected=True,
            )

        except Exception as e:
            # 连接失败时更新状态
            try:
                cluster.status = ConnectionStatus.FAILED.value
                await self.mapper.commit()
                await self.mapper.refresh(cluster)
            except Exception as db_error:
                logger.error(f"Failed to update cluster status: {db_error}")

            error_msg = f"连接失败: {str(e)}"
            logger.error(f"Failed to test connectivity for K8s cluster {cluster_id}: {error_msg}")
            return KubernetesConnectivityResponse(
                cluster_id=cluster_id,
                is_connected=False,
            )

    async def bind_storage_to_cluster(
            self, current_user: JwtUserInfo, cluster_id: int, storage_id: int
    ) -> KubernetesBindStorageResponse:
        """将存储绑定到K8s集群（含关联关系维护）"""
        # 验证存储配置是否存在
        storage = await self.mapper.query_one(select(StorageResource).filter(StorageResource.id == storage_id))

        if not storage:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        if storage.status != '连接正常' or not storage.is_init:
            raise HTTPException(status_code=500, detail="存储连通失败")

        try:
            # 验证所有集群是否存在
            cluster = await self.mapper.query_one(
                select(KubernetesResource.id).filter(KubernetesResource.id == cluster_id)
            )

            if not cluster:
                raise HTTPException(status_code=404, detail=data_not_found_error())

            # 查询是否存在存储关联
            cluster_storage = await self.mapper.query_one(
                select(KubernetesStorageRelation.id).filter(KubernetesStorageRelation.k8s_id == cluster_id)
            )
            if cluster_storage:
                raise HTTPException(status_code=500, detail="集群已存在存储关联无法再次绑定")

            # 批量插入绑定关系，数据库层自动忽略重复数据
            relation_data = {
                'k8s_id': cluster_id,
                'storage_id': storage_id,
                'created_id': current_user.userId,
                'created_by': current_user.username,
                'created_at': get_current_shanghai_time(),
                'updated_at': get_current_shanghai_time()
            }

            if relation_data:
                # # 使用 ON CONFLICT DO NOTHING 来忽略重复绑定
                # from sqlalchemy.dialects.postgresql import insert
                # stmt = insert(KubernetesStorageRelation.__table__).values(relation_data)
                # stmt = stmt.on_conflict_do_nothing(constraint='uq_k8s_storage')
                # await self.mapper.execute(stmt)
                await self.mapper.execute(insert(KubernetesStorageRelation).values(relation_data))

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
                f"Storage {storage_id} cluster binding completed. Processed: {cluster_id} clusters, Total clusters: {total_clusters}")

            return KubernetesBindStorageResponse(
                success=True,
            )

        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to bind clusters to storage {storage_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"绑定存储失败: {str(e)}")

    async def bind_repository_to_cluster(
            self, current_user: JwtUserInfo, cluster_id: int, repository_id: int
    ) -> KubernetesBindRepositoryResponse:
        """将镜像仓库绑定到K8s集群（含关联关系维护）"""
        # 验证仓库是否存在
        repository = await self.mapper.query_one(
            select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        if not repository:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        if repository.status != '连接正常':
            raise HTTPException(status_code=500, detail="仓库连通失败")

        try:
            # 验证所有集群是否存在
            cluster = await self.mapper.query_one(
                select(KubernetesResource.id).filter(KubernetesResource.id == cluster_id)
            )

            if not cluster:
                raise HTTPException(status_code=404, detail=data_not_found_error())

            # 查询是否存在仓库关联
            cluster_repository = await self.mapper.query_one(
                select(KubernetesRepositoryRelation.id).filter(KubernetesRepositoryRelation.k8s_id == cluster_id)
            )
            if cluster_repository:
                raise HTTPException(status_code=500, detail="集群已存在镜像仓库关联无法再次绑定")

            # 批量插入绑定关系，数据库层自动忽略重复数据
            relation_data = {
                'k8s_id': cluster_id,
                'repository_id': repository_id,
                'created_id': current_user.userId,
                'created_by': current_user.username,
                'created_at': get_current_shanghai_time(),
                'updated_at': get_current_shanghai_time()
            }
            if relation_data:
                # # 使用 ON CONFLICT DO NOTHING 来忽略重复绑定
                # from sqlalchemy.dialects.postgresql import insert
                # stmt = insert(KubernetesRepositoryRelation.__table__).values(relation_data)
                # stmt = stmt.on_conflict_do_nothing(constraint='uq_k8s_repository')
                # await self.mapper.execute(stmt)
                await self.mapper.execute(insert(KubernetesRepositoryRelation).values(relation_data))

            # 重新查询当前仓库关联的集群总数并更新
            total_clusters_result = await self.mapper.query(
                select(KubernetesRepositoryRelation).filter(
                    KubernetesRepositoryRelation.repository_id == repository_id
                )
            )
            total_clusters = len(total_clusters_result)

            await self.mapper.execute(
                update(RepositoryResource)
                .where(RepositoryResource.id == repository_id)
                .values(cluster_number=total_clusters)
            )

            await self.mapper.commit()

            logger.info(
                f"Repository {repository_id} cluster binding completed. Processed: {cluster_id} clusters, Total clusters: {total_clusters}")

            return KubernetesBindRepositoryResponse(
                success=True,
            )

        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to bind clusters to repository {repository_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"绑定集群失败: {str(e)}")

    async def list_available_k8s_clusters(
            self,
    ) -> List[KubernetesResponse]:
        """获取可用K8s集群列表（已挂载存储且绑定仓库）"""
        # 构建查询，按创建时间降序排列
        clusters = await self.mapper.query(select(KubernetesResource
                                                  ).join(
            KubernetesStorageRelation,
            KubernetesStorageRelation.k8s_id == KubernetesResource.id,
            isouter=True,  # LEFT JOIN
        ).join(
            KubernetesRepositoryRelation,
            KubernetesRepositoryRelation.k8s_id == KubernetesResource.id,
            isouter=True,  # LEFT JOIN
        ).where(KubernetesStorageRelation.is_mount == True,
                KubernetesRepositoryRelation.id != None, KubernetesResource.status == '连接正常')
                                           .order_by(KubernetesResource.created_at.desc()))

        if not clusters:
            return []

        return [KubernetesResponse.model_validate(c) for c in clusters]

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(KubernetesResource).filter(KubernetesResource.id == id_field_value))
        pass




    async def k8s_resource_list(
            self,
            project_id: int
    ) -> List[Dict[str, Any]]:
        # 查询集群资源配置
        ext = await self.mapper.query_one(select(KubernetesResource.ext).join(
            ProjectKubernetesRelation,
            ProjectKubernetesRelation.k8s_id == KubernetesResource.id,
            isouter=True,  # LEFT JOIN
        ).join(
            Project,
            Project.id == ProjectKubernetesRelation.project_id,
            isouter=True,  # LEFT JOIN
        ).where(Project.id == project_id))

        if not ext:
            return []
        manufacturer = ext.get("manufacturer")

        if manufacturer and manufacturer == '火山云':
            return [
                {"category": "GPU"}
            ]
        else:
            if ext.get('graphics_card_resource_type'):
                return [
                    {"category": item["category"]}
                    for item in ext['graphics_card_resource_type']
                ]
        return []

    async def k8s_graphics_card_model_list(self, project_id: int, resource_type: str) -> List[Dict[str, Any]]:
        """获取集群显卡型号资源"""
        # 构建查询，按创建时间降序排列
        ext = await self.mapper.query_one(select(KubernetesResource.ext).join(
            ProjectKubernetesRelation,
            ProjectKubernetesRelation.k8s_id == KubernetesResource.id,
            isouter=True,  # LEFT JOIN
        ).join(
            Project,
            Project.id == ProjectKubernetesRelation.project_id,
            isouter=True,  # LEFT JOIN
        ).where(Project.id == project_id))

        if not ext:
            return []
        manufacturer = ext.get("manufacturer")

        if manufacturer and manufacturer == '火山云':
            # 火山云动态弹性目前没有NPU
            if resource_type == 'GPU':
                return [
                    {"type": item.value, "model": item.value, "desc": item.desc}
                    for item in VolcengineKubeType
                ]
        else:
            if ext.get('graphics_card_resource_type'):
                for item in ext["graphics_card_resource_type"]:
                    if item.get("category", "").strip().upper() == resource_type:
                        resource_list = self.add_resource_desc(item.get("resource_types", []))
                        return resource_list
        return []

    async def allocatable_list(self, project_id: int, resource_type: str, resource_card_model: str) -> Dict[str, Any]:
        """获取集群可分配显卡型号资源"""
        return {}

    def add_resource_desc(self, resources):
        """
        给资源列表中每个项添加 desc 字段（由 model + memory 组成）
        支持嵌套 list/dict 结构
        """
        result = []

        def process_item(r):
            if not isinstance(r, dict):
                return
            model = r.get("model", "")
            memory = r.get("memory", "")
            if model and memory:
                r["desc"] = f"{model} ({memory})"
            elif model:
                r["desc"] = model
            elif memory:
                r["desc"] = memory
            result.append(r)

        for r in resources:
            if isinstance(r, dict):
                process_item(r)
            elif isinstance(r, list):
                for sub_r in r:
                    process_item(sub_r)

        return result

    def get_ca_hash_from_config(self, config_str: str | dict) -> str | None:
        """从 kubeconfig 字符串中提取 CA 哈希"""
        # 如果是字符串类型，则解析为字典
        if isinstance(config_str, str):
            data = yaml.safe_load(config_str)
        else:
            data = config_str

        cluster = data.get("clusters", [{}])[0].get("cluster", {})
        ca_data = cluster.get("certificate-authority-data")
        if not ca_data:
            return None

        # 解码 CA 数据并返回其哈希值
        ca_bytes = base64.b64decode(ca_data)
        return hashlib.sha256(ca_bytes).hexdigest()

    async def validate_not_duplicate_cluster(self, new_config_str: str) -> bool:
        """判断是否是重复集群"""
        new_hash = self.get_ca_hash_from_config(new_config_str)
        if not new_hash:
            raise ValueError("Kubeconfig 中没有 CA 信息")

        # 拉出所有已有记录的 config
        rows = await self.mapper.query(select(KubernetesResource.config))

        for cfg in rows:
            cfg_data = yaml.safe_load(cfg)
            ca_hash = self.get_ca_hash_from_config(cfg_data)
            if ca_hash == new_hash:
                return False  # 已存在相同 CA，拒绝添加
        return True

    async def exists(self, name: str, cluster_id=None) -> bool:
        """True 表示已存在"""
        query = select(KubernetesResource.id).where(KubernetesResource.name == name,
                                                    KubernetesResource.tenant_id == app_runtime_context.get_tenant_id())
        if cluster_id:  # 修改场景要把自身排除
            query = query.where(KubernetesResource.id != cluster_id)

        stmt = select(query.exists())
        is_exists =  await self.mapper.execute(stmt)
        return is_exists.scalar()

    async def list_deployment_pods(self, project_id: int, app_name: str) -> List[Dict]:
        """
        根据 Deployment 的 selector 查询 Pod 副本列表
        """
        # 查询集群配置
        config = await self.mapper.query(select(KubernetesResource.config)
                                         .join(ProjectKubernetesRelation,
                                               ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                                         .where(ProjectKubernetesRelation.project_id == project_id))
        if not config:
            raise HTTPException(status_code=404, detail=data_not_found_error_by_name("项目关联集群"))

        launcher = K8sLauncher(config_str=config[0])
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        pods = []
        try:
            pods = await launcher.list_deployment_pods(namespace, app_name)
        except Exception as e:
            logger.error(f"获取副本信息失败 {app_name}: {str(e)}")
            logger.error(f"获取副本信息失败 {app_name} 异常静默处理，直接返回null列表")
            return []
        return pods


    async def ws_pod_logs(
        self,
        project_id: int,
        pod_name: str,
        websocket: WebSocket,
        tail_lines: Optional[int] = None,
    ) -> None:
        """
        WebSocket 日志流：先推送 tail_lines（query_range backward），再转发 Loki /tail WebSocket 的实时消息。
        """
        from app.utils.log_service import log_service
        import json
        import httpx
        from datetime import timezone

        await websocket.accept()

        # Loki query（按你们目前实现，使用 pod/container 标签）
        label_parts = [f'pod="{pod_name}"']
        loki_query = "{" + ",".join(label_parts) + "}"

        effective_tail_lines = 200 if tail_lines is None else tail_lines
        now_ns = int(datetime.now(timezone.utc).timestamp() * 1e9)
        start_ns = now_ns

        # 先补一段历史 tail（一次性发一个 {"streams":[...]} 消息给前端）
        if effective_tail_lines and effective_tail_lines > 0:
            try:
                base_url = f"{settings.LOKI_PROTOCOL}://{settings.LOKI_ADDRESS}"
                url = f"{base_url}/loki/api/v1/query_range"
                params = {
                    "query": loki_query,
                    "end": str(now_ns),
                    "limit": str(effective_tail_lines),
                    "direction": "backward",
                }
                async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
                    resp = await client.get(url, params=params)
                    resp.raise_for_status()
                    data = resp.json()

                result = data.get("data", {}).get("result", []) or []
                out_streams = []
                max_ts: Optional[int] = None
                for s in result:
                    labels = s.get("stream", {}) or {}
                    raw_values = s.get("values", []) or []
                    raw_values = list(raw_values)[::-1]  # chronological
                    values = []
                    for ts_str, line in raw_values:
                        try:
                            ts_ns = int(ts_str)
                        except Exception:
                            continue
                        values.append([ts_str, "" if line is None else str(line)])
                        if max_ts is None or ts_ns > max_ts:
                            max_ts = ts_ns
                    if values:
                        out_streams.append({"stream": labels, "values": values})

                if out_streams:
                    await websocket.send_text(json.dumps({"streams": out_streams}, ensure_ascii=False))
                if max_ts is not None:
                    start_ns = max(start_ns, max_ts + 1)
            except Exception as e:
                logger.warning(f"WS tail preload failed: {e}")

        # 转发 Loki /tail websocket message
        try:
            async for msg in log_service.stream_tail_ws_messages_from_loki(
                query=loki_query,
                start_ns=start_ns,
                limit=100,
            ):
                await websocket.send_text(msg)
        except WebSocketDisconnect:
            return
        except Exception as e:
            logger.warning(f"WS log stream error: {e}")
            try:
                await websocket.close(code=1011)
            except Exception:
                pass


    async def upgrade_alloy_by_cluster_id(self, cluster_id: int):
        """
        根据id升级集群upgrade_alloy
        """
        # 验证集群是否存在
        cluster = await self.mapper.query_one(
            select(KubernetesResource).filter(KubernetesResource.id == cluster_id))

        if not cluster:
            raise HTTPException(status_code=404, detail="集群不存在")

        try:
            # 检查存储和集群的绑定关系是否存在
            relation = await self.mapper.query_one(
                select(KubernetesStorageRelation).filter(KubernetesStorageRelation.k8s_id == cluster_id)
            )

            if not relation:
                raise HTTPException(status_code=400, detail="存储配置和集群尚未建立绑定关系，请先绑定")

            # 检查是否已经挂载
            if not relation.is_mount:
                raise HTTPException(status_code=400, detail="集群未初始化")

            # 获取仓库信息
            repository = await self.mapper.query_one(
                select(RepositoryResource)
                .join(KubernetesRepositoryRelation, RepositoryResource.id == KubernetesRepositoryRelation.repository_id)
                .filter(KubernetesRepositoryRelation.k8s_id == cluster_id)
            )
            if not repository:
                raise HTTPException(status_code=400, detail="集群未绑定仓库或仓库不存在")

            kubeconfig_str = cluster.config
            alloy_namespace = "deepexilab-alloy"
            # todo 目前只考虑了 auth_type 为 username_password
            harbor_url = repository.repository_address
            harbor_username = repository.auth_config['username']
            harbor_password = repository.auth_config['password']
            harbor_base_namespace = repository.namespace
            # harbor_url需要去掉协议头
            harbor_url = harbor_url.split("://", 1)[-1]

            # 升级
            await self.storage.upgrade_alloy(harbor_url=harbor_url, harbor_base_namespace=harbor_base_namespace,
                                     harbor_username=harbor_username, harbor_password=harbor_password,
                                     alloy_namespace=alloy_namespace,
                                     kubeconfig_str=kubeconfig_str)
        except Exception as e:
            logger.error(f"upgrade alloy to cluster {cluster_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"升级alloy失败: {str(e)}")
        pass

    async def upgrade_alloy(self, cluster_id: Optional[int] = None):
        """
        按需升级集群alloy：如果传了cluster_id则只升级该集群，不传则循环升级所有可用集群
        """
        if cluster_id is not None:
            # 只升级指定的集群
            await self.upgrade_alloy_by_cluster_id(cluster_id)
            return {"message": f"集群 {cluster_id} 升级成功", "cluster_id": cluster_id}
        else:
            # 升级所有可用集群
            clusters = await self.list_available_k8s_clusters()
            if not clusters:
                return {"message": "没有可用的集群需要升级", "total": 0, "results": []}

            results = []
            for cluster in clusters:
                try:
                    await self.upgrade_alloy_by_cluster_id(cluster.id)
                    results.append({
                        "cluster_id": cluster.id,
                        "cluster_name": cluster.name,
                        "status": "success",
                        "message": "升级成功"
                    })
                except Exception as e:
                    logger.error(f"升级集群 {cluster.id} ({cluster.name}) 失败: {str(e)}")
                    results.append({
                        "cluster_id": cluster.id,
                        "cluster_name": cluster.name,
                        "status": "failed",
                        "error": str(e)
                    })

            success_count = sum(1 for r in results if r["status"] == "success")
            return {
                "message": f"批量升级完成：成功 {success_count}/{len(clusters)}",
                "total": len(clusters),
                "success_count": success_count,
                "failed_count": len(clusters) - success_count,
                "results": results
            }


def b64_url_decode(s: str) -> str:
    # 补全长度
    s += '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s).decode()

async def sync_kubernetes_labels():
    """同步集群labels显卡信息"""
    # 获取集群信息
    async with get_db_session() as db:  # 获取 AsyncSession
        query = await db.execute(select(KubernetesResource))

        clusters = query.scalars().all()

        if not clusters:
            return

        for cluster in clusters:
            try:
                # 解析kubeconfig
                config_dict = yaml.safe_load(cluster.config)
                # # 加载配置并尝试连接
                api_instance = get_k8s_api(config_dict, client.CoreV1Api)
                api_response = await k8s_call(api_instance.list_node)
                # 处理显卡资源标签
                await handle_graphics_card_resource(cluster=cluster, nodes=api_response)
                await db.commit()
                # 连接成功
                logger.info(f"Successfully Sync Kubernetes Labels: {cluster.name} (ID: {cluster.id})")

            except Exception as e:
                logger.error(f"Error Sync Kubernetes Labels: {e}")

async def handle_graphics_card_resource(cluster, nodes):
    """
    根据节点标签与 allocatable 信息汇总 GPU / NPU 资源类型、型号与显存
    """
    gpu_data = {}
    npu_data = {}

    for node in nodes.items:
        labels = node.metadata.labels or {}

        # 从标签中提取通用信息
        category = labels.get(KubeLabelsType.DP_GRAPHICS_CARD_CATEGORY.value)  # GPU / NPU
        model = labels.get(KubeLabelsType.DP_GRAPHICS_CARD_MODEL.value)  # A100 / Tesla-V100 ...
        alloc_key = labels.get(KubeLabelsType.DP_GRAPHICS_CARD_ALLOCATABLE.value)  # nvidia.com/gpu / huawei.com/npu910B ...
        memory = labels.get(KubeLabelsType.DP_GRAPHICS_CARD_MEMORY.value)  # 32GB / 16GB / 等

        if not (category and model and alloc_key):
            continue  # 缺少关键标签就跳过

        if alloc_key:
            alloc_key = b64_url_decode(alloc_key)

        # 归类
        category_upper = category.upper()
        entry = {"type": alloc_key, "model": model, "memory": memory}

        if category_upper == "GPU":
            gpu_data.setdefault(alloc_key, set()).add(tuple(entry.items()))
        elif category_upper == "NPU":
            npu_data.setdefault(alloc_key, set()).add(tuple(entry.items()))

    # 构造最终 JSON
    graphics_card_resource_type = []

    # GPU
    if gpu_data:
        gpu_resource_types = []
        for typ, entries in gpu_data.items():
            for entry_items in entries:
                entry = dict(entry_items)
                gpu_resource_types.append(entry)
        graphics_card_resource_type.append({
            "category": "GPU",
            "resource_types": gpu_resource_types
        })

    # NPU
    if npu_data:
        npu_resource_types = []
        for typ, entries in npu_data.items():
            for entry_items in entries:
                entry = dict(entry_items)
                npu_resource_types.append(entry)
        graphics_card_resource_type.append({
            "category": "NPU",
            "resource_types": npu_resource_types
        })

    # 写入 cluster.ext
    if not cluster.ext:
        cluster.ext = {}
    cluster.ext = {**(cluster.ext or {}), "graphics_card_resource_type": graphics_card_resource_type}

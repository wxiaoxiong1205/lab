import asyncio
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from fastapi_pagination import Page
from sqlalchemy import select, update, delete, and_

from app.core.logging import logger
from app.models.models import RepositoryResource, KubernetesResource, KubernetesRepositoryRelation, JwtUserInfo, \
    RepositoryImages
from app.schemas.common import ConnectionStatus
from app.schemas.repository import (
    RepositoryCreate, RepositoryUpdate, RepositoryResponse,
    RepositoryConnectivityResponse, RepositoryBindClustersRequest,
    RepositoryBindClustersResponse, RepositoryUnbindClustersRequest,
    RepositoryUnbindClustersResponse, AvailableClusterResponse,
    OccupiedClusterResponse, RepositoryType
)
from app.utils.error_messages import data_not_found_error, data_is_associated_and_cannot_be_deleted
from app.utils.registry_utils import registry_auth
from .interface import RepositoryService
from ...repository.repository_mapper import RepositoryMapper
from ...utils import app_runtime_context
from ...utils.repository_image_factory import RepositoryImageFactory
from ...utils.timezone_utils import get_current_shanghai_time


class DefaultRepositoryService(RepositoryService):
    """镜像仓库服务实现类（继承抽象接口，完整实现所有方法）"""
    
    def __init__(self, mapper: RepositoryMapper) -> None:
        self.mapper = mapper

    # ------------------------------ 可用集群查询 ------------------------------
    async def get_available_clusters(
            self,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[AvailableClusterResponse]:
        try:
            # 构建查询：查找没有被仓库关联的集群
            query = select(KubernetesResource).filter(
                ~KubernetesResource.id.in_(
                    select(KubernetesRepositoryRelation.k8s_id)
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

    # ------------------------------ 已占用集群查询 ------------------------------
    async def get_occupied_clusters(
            self,
            repository_id: int,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[OccupiedClusterResponse]:
        try:
            # 构建查询：查找已经被仓库关联的集群
            query = select(KubernetesResource).filter(
                KubernetesResource.id.in_(
                    select(KubernetesRepositoryRelation.k8s_id).filter(
                        KubernetesRepositoryRelation.repository_id == repository_id)
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

    # ------------------------------ 仓库列表查询 ------------------------------
    async def list_repositories(
            self,
            auth_type: Optional[str] = None,
            search: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
            available: Optional[bool] = None,
    ) -> Page[RepositoryResponse]:
        # 构建查询，按创建时间降序排列
        query = select(RepositoryResource).order_by(RepositoryResource.created_at.desc())
        if auth_type:
            query = query.where(RepositoryResource.auth_type == auth_type)
        if search:
            query = query.where(RepositoryResource.name.ilike(f"%{search}%"))
        if available:
            query = query.where(RepositoryResource.status == "连接正常")
        # 使用 fastapi-pagination 进行分页
        return await self.mapper.query_page(query, page, size)

        # ------------------------------ 仓库创建 ------------------------------
    async def create_repository(
            self,

            repository: RepositoryCreate,
            current_user: JwtUserInfo
    ) -> RepositoryResource:
        try:
            # 校验租户仓库唯一
            query = await self.mapper.execute(
                select(RepositoryResource)
                .where(RepositoryResource.tenant_id == current_user.tenantId)
                .limit(1)
            )
            repository_resource = query.scalar_one_or_none()
            if repository_resource:
                raise HTTPException(status_code=400, detail="仓库配置已存在")

            # 创建仓库数据
            repository_data = repository.model_dump()
            repository_data.update({
                'created_id': current_user.userId,
                'created_by': current_user.username,
                'status': ConnectionStatus.UNTESTED.value  # 初始状态
            })

            new_repository = RepositoryResource(**repository_data)
            await self.mapper.insert(new_repository)
            await self.mapper.commit()
            await self.mapper.refresh(new_repository)

            logger.info(f"Created repository: {new_repository.name} (ID: {new_repository.id})")
            
            # 为新租户初始化默认镜像和基础模型
            try:
                from app.init_db import init_all
                logger.info(f"开始为租户 {new_repository.tenant_id} 初始化默认数据...")
                success = await init_all(await self.mapper.get_session())
                if not success:
                    # 初始化失败，删除已创建的仓库
                    # 先回滚，再删除仓库
                    await self.mapper.rollback()
                    await self.mapper.delete(new_repository)
                    await self.mapper.commit()
                    logger.error(f"为租户 {new_repository.tenant_id} 初始化默认数据失败，已删除仓库")
                    raise HTTPException(status_code=500, detail=f"创建镜像仓库失败: 初始化默认数据失败")
                else:
                    # 成功直接提交事物
                    await self.mapper.commit()
                logger.info(f"成功为租户 {new_repository.tenant_id} 初始化默认数据")
            except HTTPException:
                # HTTPException 直接抛出
                raise
            except Exception as e:
                # 初始化过程出现异常，删除已创建的仓库
                try:
                    # 先回滚，再删除仓库
                    await self.mapper.rollback()
                    await self.mapper.delete(new_repository)
                    await self.mapper.commit()
                    logger.error(f"为租户 {new_repository.tenant_id} 初始化默认数据时发生异常，已删除仓库: {str(e)}")
                except Exception as delete_error:
                    logger.error(f"删除仓库失败: {str(delete_error)}")
                raise HTTPException(status_code=500, detail=f"创建镜像仓库失败: 初始化默认数据失败: {str(e)}")
            
            return new_repository

        except HTTPException:
            # HTTPException 直接抛出，不重复处理
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to create repository: {str(e)}")
            raise HTTPException(status_code=500, detail=f"创建镜像仓库失败: {str(e)}")

    # ------------------------------ 仓库详情查询 ------------------------------
    async def get_repository(
            self,

            repository_id: int
    ) -> RepositoryResource:
        repository = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        if not repository:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        return repository

    # ------------------------------ 仓库更新 ------------------------------
    async def update_repository(
            self,

            repository_id: int,
            repository_update: RepositoryUpdate
    ) -> RepositoryResource:
        db_repository = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        # 获取原命名空间
        source_namespace = db_repository.namespace
        if not db_repository:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        try:
            # 更新字段
            update_data = repository_update.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_repository, key, value)

            # 如果更新了关键配置，重置状态
            if any(key in update_data for key in ['repository_address', 'auth_type', 'auth_config']):
                db_repository.status = ConnectionStatus.UNTESTED.value

            if repository_update.namespace:
                # 如果变更了镜像命名空间，那么需要把旧内置镜像命名空间修改
                if repository_update.namespace != source_namespace:
                    await self.mapper.execute(update(RepositoryImages)
                                              .where(RepositoryImages.repository_id == repository_id,
                                                     RepositoryImages.namespace == source_namespace)
                                              .values(namespace=repository_update.namespace))


            await self.mapper.commit()
            await self.mapper.refresh(db_repository)

            logger.info(f"Updated repository: {db_repository.name} (ID: {db_repository.id})")
            return db_repository

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to update repository {repository_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"更新镜像仓库失败: {str(e)}")

    # ------------------------------ 仓库删除 ------------------------------
    async def delete_repository(
            self,

            repository_id: int
    ) -> None:
        repository = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        if not repository:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        # 查询关联信息
        repository_relation_query = await self.mapper.execute(
            select(KubernetesRepositoryRelation.id).filter(KubernetesRepositoryRelation.repository_id == repository_id))
        repository_relation_id = repository_relation_query.scalars().first()
        if repository_relation_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=data_is_associated_and_cannot_be_deleted()
            )

        try:
            await self.mapper.execute(delete(RepositoryResource).where(RepositoryResource.id == repository_id))

            # 同时删除内置镜像
            await self.mapper.execute(delete(RepositoryImages).where(RepositoryImages.repository_id == repository_id))
            await self.mapper.commit()

            logger.info(f"Deleted repository: {repository.name} (ID: {repository_id})")
            return None

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to delete repository {repository_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"删除镜像仓库失败: {str(e)}")

    # ------------------------------ 仓库连通性测试 ------------------------------
    async def test_repository_connectivity(
            self,

            repository_id: int
    ) -> RepositoryConnectivityResponse:
        # 获取仓库信息
        repository = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        if not repository:
            raise HTTPException(status_code=404, detail=data_not_found_error())

        try:
            # 根据认证类型准备认证信息
            username = ""
            password = ""

            if repository.auth_type == "username_password":
                auth_config = repository.auth_config or {}
                username = auth_config.get('username', '')
                password = auth_config.get('password', '')
            elif repository.auth_type == "token":
                auth_config = repository.auth_config or {}
                # 对于token认证，将token作为password使用，username留空
                password = auth_config.get('token', '')
            elif repository.auth_type == "none":
                # 无认证方式，用户名密码都留空
                pass

            # 在异步上下文中执行同步的registry认证
            is_connected = await asyncio.get_event_loop().run_in_executor(
                None, registry_auth, repository.repository_address, username, password
            )

            # 同时检查镜像仓库api
            image_factory = None
            config = repository.config
            if repository.type == RepositoryType.VOLCENGINE.value:
                # 火山云
                image_factory = await RepositoryImageFactory.create_checker(
                    RepositoryType.VOLCENGINE.value,
                    url=repository.repository_address.split("://", 1)[-1],
                    access_key=config['access_key'],
                    secret_key=config['secret_key'],
                    registry=config['registry'],
                    region=config['region'],
                )

            if repository.type == RepositoryType.PRIVATE_HARBOR.value:
                # 私有harbor
                image_factory = await RepositoryImageFactory.create_checker(
                    RepositoryType.PRIVATE_HARBOR.value,
                    harbor_url=repository.repository_address,
                    username=config['access_key'],
                    password=config['secret_key']
                )

            try:
                if image_factory:
                    await image_factory.test_connectivity()
            except Exception as e:
                raise HTTPException(status_code=503, detail=f"镜像仓库API异常: {e}")

            # 更新仓库连接状态
            new_status = ConnectionStatus.CONNECTED.value if is_connected else ConnectionStatus.FAILED.value

            # 更新数据库中的状态
            await self.mapper.execute(
                update(RepositoryResource)
                .where(RepositoryResource.id == repository_id)
                .values(status=new_status)
            )
            await self.mapper.commit()

            logger.info(f"Repository connectivity test - ID: {repository_id}, Connected: {is_connected}")

            return RepositoryConnectivityResponse(
                repository_id=repository_id,
                is_connected=is_connected
            )

        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to test repository connectivity {repository_id}: {str(e)}")

            # 测试异常时，将状态设为失败
            try:
                await self.mapper.execute(
                    update(RepositoryResource)
                    .where(RepositoryResource.id == repository_id)
                    .values(status=ConnectionStatus.FAILED.value)
                )
                await self.mapper.commit()
            except Exception:
                pass

            raise HTTPException(status_code=500, detail=f"测试镜像仓库连通性失败: {str(e)}")

    # ------------------------------ 集群绑定 ------------------------------
    async def bind_clusters_to_repository(
            self,

            repository_id: int,
            request: RepositoryBindClustersRequest,
            current_user: JwtUserInfo
    ) -> RepositoryBindClustersResponse:
        # 验证仓库是否存在
        repository = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        if not repository:
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
                    select(KubernetesRepositoryRelation.k8s_id).filter(
                        KubernetesRepositoryRelation.repository_id == repository_id)
                )
            ))
            exist_relation_ids = set(exist_relation)
            removed_ids = exist_relation_ids - existing_cluster_ids

            if removed_ids:
                await self.mapper.execute(delete(KubernetesRepositoryRelation).where(
                    KubernetesRepositoryRelation.repository_id == repository_id,
                    KubernetesRepositoryRelation.k8s_id.in_(removed_ids)
                ))

            # 批量插入绑定关系，数据库层自动忽略重复数据
            relation_data_list = []
            for cluster_id in request.cluster_ids:
                relation_data_list.append({
                    'k8s_id': cluster_id,
                    'repository_id': repository_id,
                    'created_id': current_user.userId,
                    'created_by': current_user.username,
                    'created_at': get_current_shanghai_time(),
                    'updated_at': get_current_shanghai_time()
                })
            if relation_data_list:
                # 使用 ON CONFLICT DO NOTHING 来忽略重复绑定
                from sqlalchemy.dialects.postgresql import insert
                stmt = insert(KubernetesRepositoryRelation.__table__).values(relation_data_list)
                stmt = stmt.on_conflict_do_nothing(constraint='uq_k8s_repository')
                await self.mapper.execute(stmt)

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
                f"Repository {repository_id} cluster binding completed. Processed: {len(request.cluster_ids)} clusters, Total clusters: {total_clusters}")

            return RepositoryBindClustersResponse(
                success=True,
            )

        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to bind clusters to repository {repository_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"绑定集群失败: {str(e)}")

    # ------------------------------ 集群解绑（完整实现） ------------------------------
    async def unbind_clusters_from_repository(
            self,

            repository_id: int,
            request: RepositoryUnbindClustersRequest
    ) -> RepositoryUnbindClustersResponse:
        # 验证仓库是否存在
        repository = await self.mapper.query_one(select(RepositoryResource).filter(RepositoryResource.id == repository_id))

        if not repository:
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

            # 批量删除绑定关系
            await self.mapper.execute(
                delete(KubernetesRepositoryRelation).filter(
                    and_(
                        KubernetesRepositoryRelation.repository_id == repository_id,
                        KubernetesRepositoryRelation.k8s_id.in_(request.cluster_ids)
                    )
                )
            )
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
                f"Repository {repository_id} cluster unbinding completed. Processed: {len(request.cluster_ids)} clusters, Total clusters: {total_clusters}")

            return RepositoryUnbindClustersResponse(
                success=True,
            )

        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to unbind clusters from repository {repository_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"解绑集群失败: {str(e)}")

    async def init_db(self):
        """
            初始化系统默认数据
            """
        # 为新租户初始化默认镜像和基础模型
        try:
            from app.init_db.init import init_all_result
            logger.info(f"开始初始化默认数据...")
            # 设置租户为None
            app_runtime_context.set_tenant_id(None)
            init_result = await init_all_result(await self.mapper.get_session())
            if not init_result.get("success"):
                logger.error(f"初始化默认数据失败，init_result={init_result}")
                await self.mapper.rollback()
                failed_seeders = init_result.get("failed_seeders", [])
                failed_desc = "; ".join(
                    [f"{item.get('seeder')}: {item.get('error')}" for item in failed_seeders]
                ) or "未知 seeder 错误"
                logger.error(f"初始化默认数据失败，已回滚。失败项: {failed_desc}")
                raise HTTPException(status_code=500, detail=f"创建镜像仓库失败: 初始化默认数据失败（{failed_desc}）")
            else:
                # 成功直接提交事物
                await self.mapper.commit()
            logger.info(f"成功初始化默认数据")
        except HTTPException:
            # HTTPException 直接抛出
            raise
        except Exception as e:
            try:
                await self.mapper.rollback()
                logger.error(f"初始化默认数据时发生异常: {str(e)}")
            except Exception as delete_error:
                logger.error(f"删除仓库失败: {str(delete_error)}")
            raise HTTPException(status_code=500, detail=f"初始化默认数据失败: {str(e)}")

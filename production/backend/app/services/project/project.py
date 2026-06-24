import os
from collections import defaultdict
from typing import List, Optional

import yaml
from fastapi import HTTPException, status, Depends
from fastapi_pagination import Page, Params
from kubernetes import client
from kubernetes.client import ApiException
from sqlalchemy import select, delete, insert

from app.common.permission_constants import RoleType, ScopeType
from app.core.logging import logger
from app.models.models import ProjectUser, Project, KubernetesResource, ProjectKubernetesRelation, JwtUserInfo, \
    RepositoryResource, KubernetesRepositoryRelation, UserDataRole
from app.repository.project_mapper import ProjectMapper
from app.schemas import ProjectCreate, ProjectResponse
from app.schemas.project import ProjectDetailResponse, ProjectInDB, ProjectImageBuildNamespace
from app.schemas.user import UserIds, ProjectUserBatchResponse
from app.schemas.user_extraI import UserExtraItem
from app.schemas.user_page_payload import UserBasePagePayload, UserPagePayload
from app.services.notebook.interface import NotebookService
from app.services.permission.interface import AdminPermissionService
from app.services.permission.permission import is_platform_admin, is_project_admin, validate_at_least_one_project_admin
from app.services.project.interface import ProjectService
from app.services.user.interface import UserService
from app.utils import app_runtime_context
from app.utils.dependencies import is_tenant_admin
from app.utils.error_messages import data_not_found_error
from app.utils.k8s_call import get_k8s_api, k8s_call
from app.utils.k8s_utils import create_harbor_secret, create_service_account, create_role, create_role_binding
from app.utils.notebook_proxy_cache import invalidate_project_user_cache
from app.utils.storage_enum import PvcName
from app.utils.timezone_utils import get_current_shanghai_time


class DefaultProjectService(ProjectService):
    def __init__(self, user_service: UserService, notebook_service: NotebookService, mapper: ProjectMapper,
                 admin_permission_service: Optional[AdminPermissionService] = None):
        self.user_service = user_service
        self.notebook_service = notebook_service
        self.mapper = mapper
        self.admin_permission_service = admin_permission_service
        super().__init__(user_service, notebook_service, mapper)

    async def list(self, current_user: JwtUserInfo, params: Params = Depends()) -> Page[ProjectResponse]:
        tenant_id = app_runtime_context.get_tenant_id()
        db = await self.mapper.get_session()

        # 检查是否是平台管理员
        is_platform = await is_platform_admin(db, current_user.userId)

        # 检查是否是租户管理员
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        is_tenant = is_tenant_admin(current_user, is_san_yuan)

        # 租户管理员和平台管理员可以查看所有项目
        if is_platform or is_tenant:
            query = (select(
                Project.id,
                Project.name,
                Project.description,
                Project.created_at,
                Project.updated_at,
                KubernetesResource.name.label("kubernetes_name"))
                     .join(
                ProjectKubernetesRelation,
                ProjectKubernetesRelation.project_id == Project.id,
                isouter=True,  # LEFT JOIN
            ).join(
                KubernetesResource,
                KubernetesResource.id == ProjectKubernetesRelation.k8s_id,
                isouter=True,  # LEFT JOIN
            )
                     .filter(Project.tenant_id == tenant_id)
                     .order_by(Project.created_at.desc()))
        else:
            # 项目管理员和普通用户：只能查看管理的项目
            # 1. 查询用户作为项目管理员的所有项目ID
            admin_result = await db.execute(
                select(UserDataRole.scope_id).where(
                    UserDataRole.user_id == current_user.userId,
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.tenant_id == tenant_id
                )
            )
            admin_project_ids = {project_id for project_id in admin_result.scalars().all() if project_id is not None}

            # 2. 查询用户作为普通成员参与的项目ID
            member_result = await db.execute(
                select(ProjectUser.project_id).where(
                    ProjectUser.user_id == current_user.userId
                )
            )
            member_project_ids = {project_id for project_id in member_result.scalars().all()}

            # 3. 合并两部分项目ID
            accessible_project_ids = admin_project_ids | member_project_ids

            if not accessible_project_ids:
                # 如果没有可访问的项目，直接返回空对象
                return Page[ProjectResponse](
                    items=[],
                    total=0,
                    page=1,
                    size=10,
                    pages=0
                )
            else:
                query = (select(
                    Project.id,
                    Project.name,
                    Project.description,
                    Project.created_at,
                    Project.updated_at,
                    KubernetesResource.name.label("kubernetes_name"))
                     .join(
                    ProjectKubernetesRelation,
                    ProjectKubernetesRelation.project_id == Project.id,
                    isouter=True,  # LEFT JOIN
                ).join(
                    KubernetesResource,
                    KubernetesResource.id == ProjectKubernetesRelation.k8s_id,
                    isouter=True,  # LEFT JOIN
                )
                     .filter(Project.id.in_(accessible_project_ids))
                     .filter(Project.tenant_id == tenant_id)
                     .order_by(Project.created_at.desc()))

        # 使用 fastapi-pagination 进行分页
        return await self.mapper.query_page(query, page=params.page, page_size=params.size)

    async def create(self, project: ProjectCreate, current_user: JwtUserInfo) -> Project:
        """
        创建项目

        流程：
        1. 校验项目名称和集群ID
        2. 查询集群和仓库资源
        3. 创建项目数据和项目集群关系
        4. 创建Kubernetes命名空间
        5. 授权项目管理员
        6. 提交事务

        如果任何步骤失败，会回滚数据库事务并清理已创建的Kubernetes资源
        """
        namespace_created = False
        namespace_name = None
        kubernetes_resource = None

        try:
            # 1. 校验项目名称和集群ID
            await self._validate_project_create(project, current_user.tenantId)

            # 2. 查询集群和仓库资源
            kubernetes_resource, repository_resource = await self._get_cluster_and_repository(project.kubernetes_id)

            # 3. 创建项目数据和项目集群关系
            db_project, namespace_name = await self._create_project_and_relation(project, current_user)

            # 4. 创建Kubernetes命名空间（外部操作，可能失败）
            await create_kubernetes_namespace(kubernetes_resource, namespace_name, repository_resource)
            namespace_created = True

            # 5. 批量授权项目管理员并加入成员列表（不自动提交）
            await self._grant_project_admins_and_add_members(
                db_project.id,
                project.admin_user_ids,
                current_user,
                auto_commit=False
            )

            # 6. 所有操作成功，提交事务
            await self.mapper.commit()
            await self.mapper.refresh(db_project)

            return db_project

        except HTTPException:
            # HTTPException 直接抛出
            raise
        except Exception as e:
            # 任何异常都回滚数据库事务
            await self.mapper.rollback()
            logger.error(f"创建项目失败，已回滚数据库事务: {str(e)}", exc_info=True)

            # 如果命名空间已创建，需要清理
            if namespace_created and namespace_name and kubernetes_resource:
                await self._cleanup_kubernetes_namespace(kubernetes_resource, namespace_name)

            # 统一转换为HTTPException
            raise HTTPException(status_code=500, detail=f"创建项目失败: {str(e)}")

    async def _validate_project_create(self, project: ProjectCreate, tenant_id: str):
        """校验项目创建参数"""
        is_exists = await self.exists(name=project.name, tenant_id=tenant_id)
        if is_exists:
            raise HTTPException(status_code=400, detail=f"已存在同名项目：{project.name}")

        if not project.kubernetes_id:
            raise HTTPException(status_code=400, detail="集群ID不能为空")

        if not project.admin_user_ids:
            raise HTTPException(status_code=400, detail="项目管理员用户ID列表，至少需要指定一个项目管理员")

    async def _get_cluster_and_repository(self, kubernetes_id: int) -> tuple[KubernetesResource, RepositoryResource]:
        """查询集群和仓库资源"""
        kubernetes_resource = await self.mapper.query_one(
            select(KubernetesResource).filter(KubernetesResource.id == kubernetes_id)
        )
        if not kubernetes_resource:
            raise HTTPException(status_code=400, detail="错误的集群ID")

        repository_resource = await self.mapper.query_one(
            select(RepositoryResource)
            .join(KubernetesRepositoryRelation,
                  KubernetesRepositoryRelation.repository_id == RepositoryResource.id)
            .join(KubernetesResource,
                  KubernetesResource.id == KubernetesRepositoryRelation.k8s_id)
            .where(KubernetesResource.id == kubernetes_id)
        )

        return kubernetes_resource, repository_resource

    async def _create_project_and_relation(
        self,
        project: ProjectCreate,
        current_user: JwtUserInfo
    ) -> tuple[Project, str]:
        """创建项目数据和项目集群关系"""
        # 创建项目数据
        db_project = Project(**ProjectInDB(**project.model_dump()).model_dump())
        db_project.created_id = current_user.userId
        db_project.created_by = current_user.username
        db_project.former_name = project.name
        await self.mapper.insert(db_project)
        await self.mapper.flush()
        await self.mapper.refresh(db_project)

        # 生成命名空间名称
        namespace_name = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{db_project.id}"

        # 创建项目集群关系
        project_kubernetes = ProjectKubernetesRelation(
            project_id=db_project.id,
            k8s_id=project.kubernetes_id,
            namespace=namespace_name
        )
        await self.mapper.insert(project_kubernetes)
        await self.mapper.flush()

        return db_project, namespace_name

    async def _cleanup_kubernetes_namespace(self, kubernetes_resource: KubernetesResource, namespace_name: str):
        """
        清理Kubernetes命名空间

        Args:
            kubernetes_resource: Kubernetes资源对象
            namespace_name: 命名空间名称
        """
        try:
            config_dict = yaml.safe_load(kubernetes_resource.config)
            api_instance = get_k8s_api(config_dict, client.CoreV1Api)
            await k8s_call(api_instance.delete_namespace, name=namespace_name)
            logger.info(f"已清理命名空间: {namespace_name}")
        except ApiException as e:
            if e.status == 404:
                # 命名空间不存在，忽略
                logger.info(f"命名空间不存在，无需清理: {namespace_name}")
            else:
                logger.error(f"删除命名空间失败: {str(e)}")
                raise
        except Exception as e:
            logger.error(f"清理命名空间异常: {str(e)}")
            # 不抛出异常，避免影响主流程

    async def _grant_project_admins_and_add_members(
        self,
        project_id: int,
        admin_user_ids: List[int],
        current_user: JwtUserInfo,
        auto_commit: bool = True
    ):
        """
        批量授权项目管理员并加入成员列表

        Args:
            project_id: 项目ID
            admin_user_ids: 管理员用户ID列表
            current_user: 当前用户
            auto_commit: 是否自动提交事务，默认为True
        """
        if not admin_user_ids or not self.admin_permission_service:
            return

        # 去重
        unique_user_ids = list(set(admin_user_ids))

        # 批量授权项目管理员
        db = await self.mapper.get_session()
        batch_result = await self.admin_permission_service.batch_grant_project_admin(
            db, project_id, unique_user_ids, current_user
        )

        # 将成功授权的用户加入项目成员列表（如果还没有加入）
        success_user_ids = [item.user_id for item in batch_result.success_items]

        # 查询已经是项目成员的用户
        existing_members = await self.mapper.query(
            select(ProjectUser).where(
                ProjectUser.project_id == project_id,
                ProjectUser.user_id.in_(success_user_ids)
            )
        )
        existing_user_ids = {member.user_id for member in existing_members}

        # 添加新成员
        new_members = []
        for user_id in success_user_ids:
            if user_id not in existing_user_ids:
                project_user = ProjectUser()
                project_user.project_id = project_id
                project_user.user_id = user_id
                project_user.created_id = current_user.userId
                project_user.created_by = current_user.username
                new_members.append(project_user)

        if new_members:
            for member in new_members:
                await self.mapper.insert(member)

            # 根据参数决定是否提交事务
            if auto_commit:
                await self.mapper.commit()

            # 主动失效代理权限缓存，让新成员立刻生效
            for member in new_members:
                await invalidate_project_user_cache(project_id, member.user_id)

    async def get_by_id(self, project_id: int, current_user: Optional[JwtUserInfo] = None) -> ProjectDetailResponse:
        project = await self.mapper.query_by_id(select(Project).filter(Project.id == project_id))
        if not project:
            # 统一错误格式：数据不存在
            raise HTTPException(status_code=500, detail=data_not_found_error())

        project_detail = ProjectDetailResponse.model_validate(project)

        project_kubernetes_list = await self.mapper.query(select(KubernetesResource).filter(KubernetesResource.id ==
                                              (select(ProjectKubernetesRelation.k8s_id)
                                               .where(ProjectKubernetesRelation.project_id == project_id)
                                               .scalar_subquery())))
        if len(project_kubernetes_list) > 0:
            project_kubernetes = project_kubernetes_list[0]
            project_detail.kubernetes_id = project_kubernetes.id
            project_detail.kubernetes_name = project_kubernetes.name

        # 查询项目管理员ID列表
        tenant_id = app_runtime_context.get_tenant_id()
        db = await self.mapper.get_session()
        admin_result = await db.execute(
            select(UserDataRole).where(
                UserDataRole.scope_id == project_id,
                UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                UserDataRole.scope_type == ScopeType.PROJECT,
                UserDataRole.tenant_id == tenant_id
            )
        )
        admin_roles = admin_result.scalars().all()
        project_detail.admin_user_ids = [role.user_id for role in admin_roles]

        # 添加当前用户身份信息
        if current_user:
            # 检查是否是租户管理员
            is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
            project_detail.is_tenant_admin = is_tenant_admin(current_user, is_san_yuan)

            # 检查是否是平台管理员
            project_detail.is_platform_admin = await is_platform_admin(db, current_user.userId)

            # 检查是否是项目管理员
            project_detail.is_project_admin = await is_project_admin(db, project_id, current_user.userId)
        else:
            project_detail.is_tenant_admin = False
            project_detail.is_platform_admin = False
            project_detail.is_project_admin = False

        return project_detail
        pass

    async def is_existed(self, project_id: int) -> bool:
        project = await self.mapper.query_by_id(select(Project).filter(Project.id == project_id))
        if not project:
            return False
        return True
        pass

    async def update_by_id(self, project_id: int, project: ProjectCreate, current_user: JwtUserInfo) -> Project:
        # 校验项目名称重复
        is_exists = await self.exists(name=project.name, tenant_id=current_user.tenantId, project_id= project_id)
        if is_exists:
            raise HTTPException(status_code=400, detail=f"已存在同名项目：{project.name}")

        db_project = await self.mapper.query_one(select(Project).filter(Project.id == project_id))
        if not db_project:
            # 统一错误格式：数据不存在
            raise HTTPException(status_code=500, detail=data_not_found_error())

        for key, value in ProjectInDB(**project.model_dump()).model_dump().items():
            setattr(db_project, key, value)

        if project.kubernetes_id:
            # 生成集群命名规则
            kubernetes_resource = await self.mapper.query_one(
                select(KubernetesResource).filter(KubernetesResource.id == project.kubernetes_id))
            if not kubernetes_resource:
                raise HTTPException(status_code=400, detail="错误的集群ID")

            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{db_project.id}"
            # 查询出关联的集群
            project_kubernetes = await self.mapper.query_one(
                select(ProjectKubernetesRelation).filter(ProjectKubernetesRelation.project_id == project_id))

            # save
            if project_kubernetes:
                if project_kubernetes.k8s_id != project.kubernetes_id:
                    raise HTTPException(status_code=400, detail="集群不允许变更")
            else:
                project_kubernetes = ProjectKubernetesRelation(project_id=db_project.id, k8s_id=project.kubernetes_id,
                                                               namespace=namespace)
                await self.mapper.insert(project_kubernetes)
                await self.mapper.commit()
                await self.mapper.refresh(project_kubernetes)
                # 创建集群的命名空间
                await create_kubernetes_namespace(kubernetes_resource, namespace)
        await self.mapper.commit()
        await self.mapper.refresh(db_project)

        # 更新项目管理员列表
        if project.admin_user_ids:
            await self._update_project_admins_and_add_members(
                db_project.id,
                project.admin_user_ids,
                current_user
            )

        return db_project
        pass

    async def _update_project_admins_and_add_members(
        self,
        project_id: int,
        admin_user_ids: List[int],
        current_user: JwtUserInfo
    ):
        """更新项目管理员列表并加入成员列表"""
        if not self.admin_permission_service:
            return

        tenant_id = app_runtime_context.get_tenant_id()
        db = await self.mapper.get_session()

        # 查询当前的项目管理员
        current_admins_result = await db.execute(
            select(UserDataRole).where(
                UserDataRole.scope_id == project_id,
                UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                UserDataRole.scope_type == ScopeType.PROJECT,
                UserDataRole.tenant_id == tenant_id
            )
        )
        current_admins = current_admins_result.scalars().all()
        current_admin_user_ids = {admin.user_id for admin in current_admins}

        # 去重
        target_admin_user_ids = set(admin_user_ids)

        # 校验：更新后至少保留一个项目管理员
        if len(target_admin_user_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="项目至少需要保留一个项目管理员"
            )

        # 需要新增的管理员
        to_add = target_admin_user_ids - current_admin_user_ids
        # 需要移除的管理员
        to_remove = current_admin_user_ids - target_admin_user_ids

        # 批量授权新管理员
        if to_add:
            await self._grant_project_admins_and_add_members(
                project_id, list(to_add), current_user
            )

        # 批量撤销管理员权限（先增后删；最终管理员集合已保证非空，单笔 revoke 内仍会校验）
        if to_remove:
            for user_id in to_remove:
                await self.admin_permission_service.revoke_project_admin(
                    db, project_id, user_id, current_user
                )
            await db.commit()

    async def _delete_project_admin_roles(self, project_id: int, tenant_id: str) -> List[int]:
        """
        删除项目管理员权限并返回受影响的管理员用户ID列表

        Args:
            project_id: 项目ID
            tenant_id: 租户ID

        Returns:
            受影响的管理员用户ID列表
        """
        db = await self.mapper.get_session()

        # 查询该项目下的所有管理员用户ID（用于清理缓存）
        admin_result = await db.execute(
            select(UserDataRole.user_id).where(
                UserDataRole.scope_id == project_id,
                UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                UserDataRole.scope_type == ScopeType.PROJECT,
                UserDataRole.tenant_id == tenant_id
            )
        )
        admin_user_ids = list(set(admin_result.scalars().all()))

        # 删除项目管理员权限记录
        await self.mapper.delete_condition(
            delete(UserDataRole).filter(
                UserDataRole.scope_id == project_id,
                UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                UserDataRole.scope_type == ScopeType.PROJECT,
                UserDataRole.tenant_id == tenant_id
            )
        )

        # 清除所有相关用户的角色缓存
        from app.services.permission.cache import get_permission_cache
        cache = get_permission_cache()
        for user_id in admin_user_ids:
            cache.invalidate_user_role_cache(tenant_id, user_id)

        return admin_user_ids

    async def _cleanup_project_kubernetes_resources(self, project_id: int) -> None:
        """
        清理项目关联的Kubernetes资源（命名空间等）

        注意：此方法在数据库事务提交前调用，如果清理失败不会阻止项目删除

        Args:
            project_id: 项目ID
        """
        try:
            # 查询项目关联的Kubernetes关系
            relations = await self.mapper.query(
                select(ProjectKubernetesRelation).filter(
                    ProjectKubernetesRelation.project_id == project_id
                )
            )

            if not relations:
                logger.info(f"项目 {project_id} 没有关联的Kubernetes资源，跳过清理")
                return

            # 遍历所有关联关系，清理命名空间
            for relation in relations:
                if not relation.namespace:
                    continue

                # 查询Kubernetes资源配置
                k8s_resources = await self.mapper.query(
                    select(KubernetesResource).filter(
                        KubernetesResource.id == relation.k8s_id
                    )
                )

                if not k8s_resources:
                    logger.warning(f"项目 {project_id} 的Kubernetes资源 {relation.k8s_id} 不存在，跳过清理")
                    continue

                kubernetes_resource = k8s_resources[0]
                namespace_name = relation.namespace

                # 清理命名空间（失败不会抛出异常，只记录日志）
                try:
                    await self._cleanup_kubernetes_namespace(kubernetes_resource, namespace_name)
                    logger.info(f"已清理项目 {project_id} 的命名空间: {namespace_name}")
                except Exception as e:
                    # 命名空间清理失败不应该阻止项目删除
                    logger.warning(f"清理项目 {project_id} 的命名空间 {namespace_name} 失败: {str(e)}")

        except Exception as e:
            # Kubernetes清理失败不应该阻止项目删除，只记录日志
            logger.error(f"清理项目 {project_id} 的Kubernetes资源时出错: {str(e)}", exc_info=True)

    async def delete(self, project_id: int):
        """
        删除项目及其所有关联数据

        流程：
        1. 检查项目是否存在
        2. 删除项目在线notebook
        3. 删除项目管理员权限
        4. 删除项目人员
        5. 清理Kubernetes资源（在删除数据库记录之前，确保能获取命名空间信息）
        6. 删除关联的集群关系
        7. 删除项目本身
        8. 提交事务

        注意：Kubernetes资源清理失败不会阻止数据库删除，但会记录日志

        Args:
            project_id: 项目ID
        """
        # 检查项目是否存在
        project = await self.mapper.query_one(select(Project).filter(Project.id == project_id))
        if not project:
            raise HTTPException(status_code=500, detail=data_not_found_error())

        tenant_id = app_runtime_context.get_tenant_id()

        # 在事务中删除所有关联数据
        try:
            # 删除数据集日志
            # await db.execute(delete(DatasetLog).where(DatasetLog.project_id == project_id))

            # # 删除所有提示词（无论是否在目录中）
            # await db.execute(delete(Prompt).where(Prompt.project_id == project_id))

            # # 删除提示词目录
            # await db.execute(delete(PromptDirectory).where(PromptDirectory.project_id == project_id))

            # # 删除所有数据集（无论是否在目录中）
            # await db.execute(delete(Dataset).where(Dataset.project_id == project_id))

            # # 删除数据集目录
            # await db.execute(delete(DatasetDirectory).where(DatasetDirectory.project_id == project_id))

            # # 删除所有指标（无论是否在目录中）
            # await db.execute(delete(Metric).where(Metric.project_id == project_id))

            # # 删除指标目录
            # await db.execute(delete(MetricDirectory).where(MetricDirectory.project_id == project_id))

            # # 删除任务和测试运行
            # await db.execute(delete(Task).where(Task.project_id == project_id))
            # await db.execute(delete(TestRun).where(TestRun.project_id == project_id))
            # await db.execute(delete(TestCase).where(TestCase.project_id == project_id))

            # 删除项目在线notebook
            await self.notebook_service.batch_stop_release_by_project_id(project_id)

            # 删除项目管理员权限
            await self._delete_project_admin_roles(project_id, tenant_id)

            # 删除项目人员（先取出 user_ids，删除后用于失效代理权限缓存）
            project_user_ids_result = await self.mapper.execute(
                select(ProjectUser.user_id).where(ProjectUser.project_id == project_id)
            )
            project_user_ids = [row[0] for row in project_user_ids_result.fetchall()]
            await self.mapper.delete_condition(
                delete(ProjectUser).filter(ProjectUser.project_id == project_id)
            )

            # 清理Kubernetes资源（在删除数据库记录之前，确保能获取命名空间信息）
            # 注意：清理失败不会抛出异常，不会阻止数据库删除
            await self._cleanup_project_kubernetes_resources(project_id)

            # 删除关联的集群关系（在清理Kubernetes资源之后）
            await self.mapper.delete_condition(
                delete(ProjectKubernetesRelation).filter(
                    ProjectKubernetesRelation.project_id == project_id
                )
            )

            # 最后删除项目本身
            await self.mapper.delete_condition(
                delete(Project).where(Project.id == project_id)
            )

            # 提交数据库事务
            await self.mapper.commit()

            # 主动失效代理权限缓存，避免缓存中残留已被解绑的成员关系
            for uid in project_user_ids:
                await invalidate_project_user_cache(project_id, uid)

            return None
        except HTTPException:
            # HTTPException 直接抛出
            raise
        except Exception as e:
            # 任何异常都回滚数据库事务
            await self.mapper.rollback()
            logger.error(f"删除项目 {project_id} 失败，已回滚数据库事务: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")

    async def project_users_list(self, project_id: int, username: Optional[str], page: int,
                                 size: int) -> UserPagePayload:
        # 构建查询，按创建时间降序排列
        query = select(ProjectUser).where(ProjectUser.project_id == project_id)

        project_user_list = await self.mapper.query(query)

        user_ids = [project_user.user_id for project_user in project_user_list]
        if len(user_ids) == 0:
            payload = UserPagePayload(
                size=0,
                total=0,
                totalPages=1,
                rows=[],
                number=0
            )
            return payload
        infos = await self.user_service.user_infos(ids=user_ids, username=username, page=page, page_size=size)
        # append 加入时间
        append_join_time(infos.rows, project_user_list)
        # append 项目管理员身份
        await self._append_project_admin_status(project_id, infos.rows)
        return infos
        pass

    async def _append_project_admin_status(self, project_id: int, user_list: List[UserExtraItem]):
        """为成员列表添加项目管理员身份标记"""
        if not user_list:
            return

        tenant_id = app_runtime_context.get_tenant_id()
        user_ids = [user.userId for user in user_list]

        # 查询这些用户中哪些是项目管理员
        admin_result = await self.mapper.execute(
            select(UserDataRole).where(
                UserDataRole.scope_id == project_id,
                UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                UserDataRole.scope_type == ScopeType.PROJECT,
                UserDataRole.user_id.in_(user_ids),
                UserDataRole.tenant_id == tenant_id
            )
        )
        admin_roles = admin_result.scalars().all()
        admin_user_ids = {role.user_id for role in admin_roles}

        # 设置is_project_admin字段
        for user in user_list:
            user.is_project_admin = user.userId in admin_user_ids

    async def project_not_associated_users_list(self, project_id: int, username: Optional[str], page: int,
                                                size: int) -> UserBasePagePayload:
        # 构建查询，按创建时间降序排列
        query = select(ProjectUser).where(ProjectUser.project_id == project_id)

        project_user_list = await self.mapper.query(query)
        user_ids = [project_user.user_id for project_user in project_user_list]

        # 获取需要排除的管理员ID（租户管理员）
        admin_user_ids = await self._get_admin_user_ids_to_exclude()

        # 将管理员ID也加入到排除列表中，这样IAM接口返回的分页结果就不包含管理员了
        all_excluded_ids = list(set(user_ids + admin_user_ids))

        # 调用IAM接口，排除已关联用户和管理员，IAM接口会返回完整的分页结果（不包含管理员）
        return await self.user_service.iam_ignore_user_infos(ids=all_excluded_ids, username=username, page=page,
                                                             page_size=size)

    async def _get_admin_user_ids_to_exclude(self) -> List[int]:
        """
        获取需要排除的管理员用户ID列表（租户管理员）

        租户管理员：账号 = 租户code（username == enterpriseCode）

        Returns:
            管理员用户ID列表
        """
        from app.utils.db_session_context import get_db_session
        from app.utils.user_info_context import get_current_user_info
        from app.utils import app_runtime_context
        from app.common.permission_constants import SuperAdminAccount

        db = get_db_session()
        if db is None:
            logger.warning("无法获取数据库连接，跳过管理员ID查询")
            return []

        current_user = get_current_user_info()
        if current_user is None:
            logger.warning("无法获取当前用户信息，跳过管理员ID查询")
            return []

        admin_user_ids = []

        # 1. 查询租户管理员对应的 user_id
        # 租户管理员：账号 = 租户code
        tenant_admin_username = current_user.enterpriseCode

        # 三元模式下还包括超级管理员账号
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False

        # 通过IAM接口查询租户管理员用户名对应的user_id
        # 先查询租户管理员账号（当前租户code）
        logger.info(f"查询租户管理员账号（当前租户code）{tenant_admin_username}")
        if tenant_admin_username:
            tenant_admin_id = await self._get_user_id_by_username(tenant_admin_username)
            if tenant_admin_id:
                admin_user_ids.append(tenant_admin_id)

        # 三元模式下，查询超级管理员账号的 user_id
        if is_san_yuan:
            for super_admin_username in SuperAdminAccount.ALL_ACCOUNTS:
                super_admin_id = await self._get_user_id_by_username(super_admin_username)
                if super_admin_id:
                    admin_user_ids.append(super_admin_id)

        return list(set(admin_user_ids))

    async def _get_user_id_by_username(self, username: str) -> Optional[int]:
        """
        通过用户名查询用户ID（通过IAM接口）

        Args:
            username: 用户名

        Returns:
            用户ID，如果查询不到返回None
        """
        try:
            # IAM 是模糊查询，不能只取 1 条，否则很容易拿到相似账号导致误判。
            # 这里拉取多条并分页，优先精确匹配 username（大小写一致），其次大小写不敏感匹配。
            target_username = (username or "").strip()
            if not target_username:
                return None

            page = 1
            page_size = 50
            max_pages = 5  # 防止异常数据导致无界翻页
            fuzzy_fallback_id: Optional[int] = None

            while page <= max_pages:
                payload = await self.user_service.iam_ignore_user_infos(
                    ids=[],
                    username=target_username,
                    page=page,
                    page_size=page_size
                )
                rows = payload.rows or []
                if not rows:
                    break

                logger.info(
                    "查询用户名 %s 第 %s 页结果，rows=%s, totalPages=%s",
                    target_username,
                    page,
                    len(rows),
                    payload.totalPages
                )

                for user in rows:
                    if user is None or user.id is None or not user.username:
                        continue
                    if user.username == target_username:
                        return user.id
                    if user.username.lower() == target_username.lower() and fuzzy_fallback_id is None:
                        fuzzy_fallback_id = user.id

                total_pages = payload.totalPages or 0
                if total_pages > 0 and page >= total_pages:
                    break
                if len(rows) < page_size:
                    break
                page += 1

            if fuzzy_fallback_id is not None:
                logger.info(
                    "用户名 %s 未找到严格大小写匹配，返回大小写不敏感匹配用户ID: %s",
                    target_username,
                    fuzzy_fallback_id
                )
                return fuzzy_fallback_id

            return None
        except Exception as e:
            logger.warning(f"查询用户名 {username} 对应的用户ID失败: {str(e)}")
            return None

    async def project_user_batch_save(self, project_id: int, request: UserIds, admin_user: JwtUserInfo) -> ProjectUserBatchResponse:
        try:
            # # 使用 ON CONFLICT DO NOTHING 来忽略重复绑定
            # from sqlalchemy.dialects.postgresql import insert
            # stmt = insert(ProjectUser).values([
            #     {"project_id": project_id,
            #      "user_id": uid,
            #      'created_id': admin_user.userId,
            #      'created_by': admin_user.username,
            #      'created_at': datetime.utcnow(),
            #      'updated_at': datetime.utcnow()} for uid in request.user_ids
            # ])
            # # 如果数据库是 PostgreSQL，用 on_conflict_do_nothing
            # stmt = stmt.on_conflict_do_nothing(constraint='uq_project_user')

            # 获取当前已存在的用户ID集合
            existing_user_ids = set()
            result = await self.mapper.execute(
                select(ProjectUser.user_id).where(ProjectUser.project_id == project_id)
            )
            existing_user_ids.update(row[0] for row in result.fetchall())

            # 过滤掉已存在的 user_id
            new_user_ids = [uid for uid in request.user_ids if uid not in existing_user_ids]
            if not new_user_ids:
                return ProjectUserBatchResponse(
                    success=True,
                )

            # 批量插入
            # 1. 创建 insert 语句（不带 values）
            stmt = insert(ProjectUser)
            # 2. 参数列表，传给 executemany
            params = [
                {
                    "project_id": project_id,
                    "user_id": uid,
                    "created_id": admin_user.userId,
                    "created_by": admin_user.username,
                    "created_at": get_current_shanghai_time(),
                    "updated_at": get_current_shanghai_time(),
                    "tenant_id": app_runtime_context.get_tenant_id()
                }
                for uid in new_user_ids
            ]

            # 3. 执行 executemany
            session = await self.mapper.get_session()
            await session.execute(stmt, params)
            await session.commit()

            # 主动失效代理权限缓存，让新成员立刻生效
            for uid in new_user_ids:
                await invalidate_project_user_cache(project_id, uid)

            return ProjectUserBatchResponse(
                success=True,
            )
        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to batch save user to project {project_id}: {str(e)}", e)
            raise HTTPException(status_code=500, detail=f"批量添加用户到项目失败: {str(e)}")
        pass

    async def project_user_batch_remove(self, project_id: int, request: UserIds, current_user: JwtUserInfo) -> ProjectUserBatchResponse:
        try:
            tenant_id = app_runtime_context.get_tenant_id()
            db = await self.mapper.get_session()

            # 检查当前用户是否是平台管理员或租户管理员
            is_current_user_platform_admin = await is_platform_admin(db, current_user.userId)
            is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
            is_current_user_tenant_admin = is_tenant_admin(current_user, is_san_yuan)

            # 检查：不能删除自己（平台管理员和租户管理员除外，他们可以操作任何数据）
            if current_user.userId in request.user_ids:
                if not is_current_user_platform_admin and not is_current_user_tenant_admin:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="不能删除自己，请先退出项目或联系其他管理员"
                    )

            # 查询要删除的用户中哪些是项目管理员
            admin_result = await db.execute(
                select(UserDataRole).where(
                    UserDataRole.scope_id == project_id,
                    UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                    UserDataRole.scope_type == ScopeType.PROJECT,
                    UserDataRole.user_id.in_(request.user_ids),
                    UserDataRole.tenant_id == tenant_id
                )
            )
            admins_to_remove = admin_result.scalars().all()
            admin_user_ids_to_remove = {admin.user_id for admin in admins_to_remove}

            # 检查：项目管理员不能删除项目管理员（只有平台管理员或租户管理员可以删除项目管理员）
            if admin_user_ids_to_remove:
                if not is_current_user_platform_admin and not is_current_user_tenant_admin:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="只有平台管理员或租户管理员可以删除项目管理员"
                    )

            # 如果要删除的用户中包含项目管理员，需要校验删除后至少还有一个管理员
            if admin_user_ids_to_remove:
                await validate_at_least_one_project_admin(db, project_id, list(admin_user_ids_to_remove))

            # 删除项目成员
            await self.mapper.execute(delete(ProjectUser).where(ProjectUser.project_id == project_id,
                                                       ProjectUser.user_id.in_(request.user_ids)))

            # 如果删除的成员中包含项目管理员，同时撤销其管理员权限
            if admin_user_ids_to_remove:
                await self.mapper.execute(
                    delete(UserDataRole).where(
                        UserDataRole.user_id.in_(admin_user_ids_to_remove),
                        UserDataRole.role_type == RoleType.PROJECT_ADMIN,
                        UserDataRole.scope_type == ScopeType.PROJECT,
                        UserDataRole.scope_id == project_id,
                        UserDataRole.tenant_id == tenant_id
                    )
                )
                await self.mapper.commit()
                
                from app.services.permission.cache import get_permission_cache
                cache = get_permission_cache()
                for user_id in admin_user_ids_to_remove:
                    cache.invalidate_user_role_cache(tenant_id, user_id)

            await self.mapper.commit()

            # 主动失效代理权限缓存，让被移除成员立刻失去访问权限
            for uid in request.user_ids:
                await invalidate_project_user_cache(project_id, uid)

            return ProjectUserBatchResponse(
                success=True,
            )
        except HTTPException:
            # 重新抛出HTTPException
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"Failed to batch remove user to project {project_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"批量删除用户到项目失败: {str(e)}")
        pass

    async def exists(
            self,
            name: str,
            tenant_id: str,
            project_id: Optional[int] = None
    ) -> bool:
        """
        判断同租户下是否已存在同名项目

        - name: 项目名称
        - tenant_id: 当前租户 ID（必传）
        - project_id: 修改时传入，用于排除自身
        """
        # 构造基础查询：同租户 + 同名
        query = select(Project.id).where(
            Project.name == name,
            Project.tenant_id == tenant_id,
        )

        # 修改场景：排除自己
        if project_id is not None:
            query = query.where(Project.id != project_id)

        stmt = select(query.exists())
        result = await self.mapper.execute(stmt)

        return result.scalar()

    async def set_sa_permission_all_projects(self):

        query = await self.mapper.execute(
            select(Project.id.label("project_id"),
                   KubernetesResource.id.label("k8s_id"),
                   KubernetesResource.config)
            .select_from(Project)
            .join(
                ProjectKubernetesRelation,
                Project.id == ProjectKubernetesRelation.project_id,
                isouter=True  # left join
            )
            .join(
                KubernetesResource,
                KubernetesResource.id == ProjectKubernetesRelation.k8s_id,
                isouter=True  # left join
            ))
        rows = query.all()
        if not rows:
            return
        grouped = defaultdict(lambda: {"project_ids": [], "config": None})

        for r in rows:
            container = grouped[r.k8s_id]          # 只查一次字典
            container["project_ids"].append(r.project_id)
            if container["config"] is None:        # 第一次遇见该 k8s_id 才写 config
                container["config"] = r.config

        for k8s_id, data in grouped.items():
            # 解析kubeconfig
            config_dict = yaml.safe_load(data['config'])
            # 加载配置并尝试连接
            api_instance = get_k8s_api(config_dict, client.CoreV1Api)
            rbac_v1 = get_k8s_api(config_dict, client.RbacAuthorizationV1Api)
            for project_id in data['project_ids']:
                # 创建sa相关权限
                name = "snapshot-executor"
                namespace_name = f"deepexilab-{project_id}"
                await create_service_account(api_instance, namespace_name, name)
                await create_role(rbac_v1, namespace_name, name)
                await create_role_binding(rbac_v1, namespace_name, name)


    async def set_project_read_only_pvc_all(self):
        query = await self.mapper.execute(
            select(Project.id.label("project_id"),
                   KubernetesResource.id.label("k8s_id"),
                   KubernetesResource.config)
            .select_from(Project)
            .join(
                ProjectKubernetesRelation,
                Project.id == ProjectKubernetesRelation.project_id,
                isouter=True  # left join
            )
            .join(
                KubernetesResource,
                KubernetesResource.id == ProjectKubernetesRelation.k8s_id,
                isouter=True  # left join
            ))
        rows = query.all()
        if not rows:
            return
        grouped = defaultdict(lambda: {"project_ids": [], "config": None})

        for r in rows:
            container = grouped[r.k8s_id]  # 只查一次字典
            container["project_ids"].append(r.project_id)
            if container["config"] is None:  # 第一次遇见该 k8s_id 才写 config
                container["config"] = r.config

        for k8s_id, data in grouped.items():
            # 解析kubeconfig
            config_dict = yaml.safe_load(data['config'])
            # 加载配置并尝试连接
            api_instance = get_k8s_api(config_dict, client.CoreV1Api)
            for project_id in data['project_ids']:
                # 创建sa相关权限
                namespace_name = f"deepexilab-{project_id}"
                # 创建项目对应jfs只读pvc
                await ensure_pvc_exists(
                    api_instance=api_instance,
                    namespace_name=namespace_name,
                    pvc_name=PvcName.PROJECT_READ_ONLY_PVC.value,
                    labels={"path": namespace_name},
                    access_modes=["ReadOnlyMany"],
                    size_gi="1Pi",
                    storage_class="juicefs-sc"
                )

    async def update_project_image_build_namespace(self, project_id: int, namespace: ProjectImageBuildNamespace) -> ProjectImageBuildNamespace:
        project = await self.mapper.query_one(select(Project).filter(Project.id == project_id))
        if not project:
            # 统一错误格式：数据不存在
            raise HTTPException(status_code=500, detail=data_not_found_error())

        if namespace.image_build_namespace:
            project.image_build_namespace = namespace.image_build_namespace

        project.updated_at = get_current_shanghai_time()
        await self.mapper.commit()
        await self.mapper.refresh(project)
        return ProjectImageBuildNamespace.model_validate(project, from_attributes=True)


    async def get_project_image_build_namespace(self, project_id: int):
        project = await self.mapper.query_one(select(Project).filter(Project.id == project_id))
        if not project:
            # 统一错误格式：数据不存在
            raise HTTPException(status_code=500, detail=data_not_found_error())
        return project.image_build_namespace
        pass


def append_join_time(user_list: List[UserExtraItem], project_user_list: List[ProjectUser]):
    for user in user_list:
        for project_user in project_user_list:
            if project_user.user_id == user.userId:
                user.joinTime = project_user.created_at


async def create_kubernetes_namespace(kubernetes_resource: KubernetesResource, namespace_name: str , repository_resource: RepositoryResource = None):
    api_instance = None
    try:
        # 解析kubeconfig
        config_dict = yaml.safe_load(kubernetes_resource.config)
        # 加载配置并尝试连接
        api_instance = get_k8s_api(config_dict, client.CoreV1Api)
        rbac_v1 = get_k8s_api(config_dict, client.RbacAuthorizationV1Api)
        # 创建命名空间的配置,labels方便做监听
        namespace = client.V1Namespace(
            metadata=client.V1ObjectMeta(name=namespace_name,
                                         labels={"app": os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')})
        )
        # 创建命名空间
        await k8s_call(api_instance.create_namespace, namespace)

        harbor_username = repository_resource.auth_config['username']
        harbor_password = repository_resource.auth_config['password']

        # 创建dp-pull-secret Harbor secret
        success = await create_harbor_secret(
            harbor_url=repository_resource.repository_address,
            harbor_user_name=harbor_username,
            harbor_password=harbor_password,
            namespace=namespace_name,
            secret_name="dp-pull-secret",
            kubeconfig_str=kubernetes_resource.config
        )

        if not success:
            raise HTTPException(status_code=500, detail=f"创建dp-pull-secret:Harbor secret失败")

        logger.info(f"命名空间 '{namespace_name}' 创建成功！")

        # 创建public-pvc
        await ensure_pvc_exists(
            api_instance=api_instance,
            namespace_name=namespace_name,
            pvc_name=PvcName.PUBLIC_PVC.value,
            labels={"path": "public"},
            access_modes=["ReadOnlyMany"],
            size_gi="1Pi",
            storage_class="juicefs-sc"
        )
        # 创建notebook-pvc
        await ensure_pvc_exists(
            api_instance=api_instance,
            namespace_name=namespace_name,
            pvc_name=PvcName.NOTEBOOK_PVC.value,
            labels={"path": namespace_name},
            access_modes=["ReadWriteMany"],
            size_gi="1Pi",
            storage_class="juicefs-sc"
        )
        # 创建llm-training-pvc（训练任务和清洗任务共用）
        await ensure_pvc_exists(
            api_instance=api_instance,
            namespace_name=namespace_name,
            pvc_name=PvcName.LLM_TRAINING_PVC.value,
            labels={"path": namespace_name},
            access_modes=["ReadWriteMany"],
            size_gi="1Pi",
            storage_class="juicefs-sc"
        )
    except HTTPException:
        # HTTPException 直接抛出
        raise
    except Exception as e:
        # 创建命名空间或PVC失败
        logger.error(f"创建命名空间或PVC失败 {namespace_name}：{str(e)}")
        raise HTTPException(status_code=500, detail=f"创建命名空间失败: {str(e)}")

    # 创建项目对应jfs只读pvc
    await ensure_pvc_exists(
        api_instance=api_instance,
        namespace_name=namespace_name,
        pvc_name=PvcName.PROJECT_READ_ONLY_PVC.value,
        labels={"path": namespace_name},
        access_modes=["ReadOnlyMany"],
        size_gi="1Pi",
        storage_class="juicefs-sc"
    )

    # 创建sa相关权限
    name = "snapshot-executor"
    await create_service_account(api_instance, namespace_name, name)
    await create_role(rbac_v1, namespace_name, name)
    await create_role_binding(rbac_v1, namespace_name, name)



async def ensure_pvc_exists(api_instance, namespace_name, pvc_name, labels, access_modes, size_gi, storage_class):
    try:
        # 尝试读取 PVC
        await k8s_call(api_instance.read_namespaced_persistent_volume_claim, name=pvc_name, namespace=namespace_name)
        logger.info(f"PersistentVolumeClaim {pvc_name} already exists in namespace {namespace_name}.")
    except ApiException as e:
        if e.status == 404:
            # 不存在时创建
            pvc = client.V1PersistentVolumeClaim(
                metadata=client.V1ObjectMeta(name=pvc_name, namespace=namespace_name, labels=labels),
                spec=client.V1PersistentVolumeClaimSpec(
                    access_modes=access_modes,
                    resources=client.V1ResourceRequirements(requests={"storage": size_gi}),
                    storage_class_name=storage_class,
                )
            )
            await k8s_call(api_instance.create_namespaced_persistent_volume_claim, namespace=namespace_name, body=pvc)
            print(f"PersistentVolumeClaim {pvc_name} created successfully in namespace {namespace_name}.")
        else:
            raise  # 其他错误直接抛出

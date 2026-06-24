import re
import socket
import ssl
import uuid
from datetime import datetime
from enum import Enum
from typing import Dict
from typing import List, Optional, Union, TypeVar, Any

from fastapi import HTTPException, Depends
from fastapi_pagination import Page, Params
from kubernetes import client
from sqlalchemy import select, func, cast, String, delete

from app.models.models import RepositoryImages, RepositoryResource, ProjectKubernetesRelation, \
    KubernetesRepositoryRelation, JwtUserInfo, Notebook, KubernetesResource, ImageBuildLog, Project, TaskExecution, \
    BusinessTagRel
from app.schemas.inference_task import BackendEnum
from app.schemas.repository_image import (
    RepositoryImageResponse, RepositoryImageDetailResponse, RepositoryImageCreate,
    ImageType, CardType, CardModel, CudaVersion, SaveNotebookAsImageRequest, SaveNotebookAsImageResponse, ImageSource,
    ImageBuildTriggerType, ImageParts, ImageBuildLogLogResponse, ImageBuildLogResponse, NotebookBuildingResponse,
    AddImageRequest
)
from app.utils.error_messages import data_not_found_error_by_name, data_exists_error, data_not_found_error
from app.utils.k8s_launcher import K8sLauncher
from app.utils.storage_enum import PvcName, StoragePath
from .interface import RepositoryImageService
from ..tag.interface import TagService
from ...common.status import TaskStatus
from ...common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from ...core import settings
from ...core.logging import logger
from ...repository.image_build_log_mapper import ImageBuildLogMapper
from ...repository.repository_image_mapper import RepositoryImageMapper
from ...repository.task_execution_mapper import TaskExecutionMapper
from ...schemas.notebook import NOTEBOOK_WORK_PATH, NotebookBizType
from ...schemas.repository import RepositoryType
from ...schemas.tag import TagBusinessType
from ...utils.notebook_dockerfile_utils import generate_dockerfile
from ...utils.redis_lock_utils import build_notebook_lock_del
from ...utils.repository_image_factory import RepositoryImageFactory
from ...utils.timezone_utils import get_current_shanghai_time

NOTEBOOK_IMAGE_TYPE_VALUES = {
    ImageType.LLM_NOTEBOOK.value,
    ImageType.ML_NOTEBOOK.value,
    ImageType.CUSTOM_LLM_NOTEBOOK.value,
    ImageType.CUSTOM_ML_NOTEBOOK.value,
}

class DefaultRepositoryImageService(RepositoryImageService):
    """镜像仓库镜像服务实现类"""

    def __init__(
        self,
        mapper: RepositoryImageMapper,
        tag_service: TagService,
        build_log_mapper: ImageBuildLogMapper = None,
        task_execution_mapper: TaskExecutionMapper = None
    ) -> None:
        self.mapper = mapper
        self.build_log_mapper = build_log_mapper
        self.task_execution_mapper = task_execution_mapper
        self.tag_service = tag_service

    async def list_repository_images(
            self,
            page: int,
            page_size: int,
            image_name: Optional[str] = None,
            image_type: Optional[ImageType] = None,
            image_source: Optional[ImageSource] = None
    ) -> Page[RepositoryImageResponse]:
        # 获取允许展示的类型值列表
        visible_types = [item.value for item in ImageType if item.is_show]

        query = (select(RepositoryImages.id,
                        RepositoryImages.image,
                        RepositoryImages.type,
                        RepositoryImages.sub_type,
                        RepositoryImages.repository_id,
                        RepositoryImages.created_at,
                        RepositoryImages.updated_at,
                        RepositoryImages.describe,
                        RepositoryImages.namespace,
                        RepositoryResource.name.label("repository_name"),
                        func.concat(func.concat(func.replace(
                            func.replace(RepositoryResource.repository_address, "https://", ""),
                            "http://", ""
                        ),
                            "/", RepositoryImages.namespace),
                            "/", RepositoryImages.image).label("image_address")
                        )
                 .join(RepositoryResource,
                       RepositoryResource.id == RepositoryImages.repository_id)
                 .where(RepositoryImages.type.in_(visible_types))
                 .order_by(RepositoryImages.created_at.desc()))

        if image_name:
            query = query.where(RepositoryImages.image.like(f"%{image_name}%"))

        if image_type is not None:
            query = query.where(RepositoryImages.type == image_type.value)

        if image_source is not None:
            query = query.where(RepositoryImages.image_source == image_source.value)

        # 使用 fastapi-pagination 进行分页（page、page_size 与 query_page 约定一致）
        return await self.mapper.query_page(query, page, page_size)

    async def list_custom_images(
            self,
            project_id: int,
            business_type: str,
            page: Optional[Page] = None,
            size: Optional[int] = None,
            image_name: Optional[str] = None,
            image_type: Optional[ImageType] = None,
            status: Optional[str] = None,
            tag_element_ids: Optional[List[int]] = None
    ) -> Page[ImageBuildLogResponse]:
        """获取项目下的镜像构建记录列表（分页）"""
        # 构建查询：查询指定项目的镜像构建记录
        query = select(ImageBuildLog).where(ImageBuildLog.project_id == project_id)
        
        # 按镜像名称过滤（模糊搜索 name）
        if image_name:
            query = query.where(ImageBuildLog.name.like(f"%{image_name}%"))
        
        # 按镜像类型过滤
        if image_type is not None:
            query = query.where(ImageBuildLog.image_type == image_type.value)
        
        # 按状态过滤
        if status:
            query = query.where(ImageBuildLog.status == status)

        # 标签过滤：必须包含全部选中的 tag_element_ids
        if tag_element_ids:
            tag_subquery = (
                select(BusinessTagRel.business_id)
                .where(
                    BusinessTagRel.business_type == business_type,
                    BusinessTagRel.tag_element_id.in_(tag_element_ids)
                )
                .group_by(BusinessTagRel.business_id)
                .having(func.count(func.distinct(BusinessTagRel.tag_element_id)) == len(tag_element_ids))
                .subquery()
            )
            query = query.join(
                tag_subquery,
                tag_subquery.c.business_id == cast(ImageBuildLog.output_image_id, String)
            )

        # 按创建时间倒序排列
        query = query.order_by(ImageBuildLog.created_at.desc())
        
        # 使用 fastapi-pagination 进行分页
        page_result = await self.build_log_mapper.query_page(query, page, size)
        if not page_result.items:
            return page_result

        output_image_ids = [
            str(item.output_image_id)
            for item in page_result.items
            if item.output_image_id
        ]
        tags_map = {}
        if output_image_ids and self.tag_service:
            tags_map = await self.tag_service.get_business_tags_batch(business_type, output_image_ids)

        # 重新构造 items
        items = [
            item.copy(update={
                "tags": tags_map.get(str(item.output_image_id), [])
            })
            for item in page_result.items
        ]
        return page_result.copy(update={"items": items})

    async def create_repository_image(
            self,
            repository_image_create: RepositoryImageCreate,
            current_user: JwtUserInfo
    ) -> RepositoryImageResponse:
        repository_exec = await self.mapper.execute(
            select(RepositoryResource.name).filter(RepositoryResource.id == repository_image_create.repository_id))
        repository = repository_exec.scalar_one_or_none()
        if not repository:
            raise HTTPException(status_code=404, detail=data_not_found_error_by_name("镜像仓库"))

        # 校验镜像
        await self.image_verification(repository_image_create, repository)

        image = RepositoryImages(
            **repository_image_create.model_dump(),
            created_at=get_current_shanghai_time(),
            updated_at=get_current_shanghai_time(),
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        await self.mapper.insert(image)
        await self.mapper.commit()
        await self.mapper.refresh(image)

        response = RepositoryImageResponse.model_validate(image)
        response.repository_name = repository
        return response

    async def find_repository_image(
            self,
            image_id: int
    ) -> RepositoryImageDetailResponse:
        query = await self.mapper.execute(select(RepositoryImages,
                                                 RepositoryResource.name.label("repository_name"),
                                                 func.concat(func.concat(func.replace(
                                                     func.replace(RepositoryResource.repository_address, "https://",
                                                                  ""),
                                                     "http://", ""
                                                 ),
                                                     "/", RepositoryImages.namespace),
                                                     "/", RepositoryImages.image).label("image_address")
                                                 ).filter(
            RepositoryImages.id == image_id
        ).join(
            RepositoryResource,
            RepositoryResource.id == RepositoryImages.repository_id
        ).order_by(RepositoryImages.created_at.desc()))

        row = query.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail=data_not_found_error_by_name("镜像"))

        repository_image, repository_name, image_address = row
        return RepositoryImageDetailResponse.model_validate({
            **repository_image.__dict__,
            "repository_name": repository_name,
            "image_address": image_address
        })

    async def update_repository_image(
            self,
            image_id: int,
            repository_image_update: RepositoryImageCreate,
            current_user: JwtUserInfo
    ) -> RepositoryImageResponse:

        repository_exec = await self.mapper.execute(
            select(RepositoryResource.name).filter(RepositoryResource.id == repository_image_update.repository_id))
        repository = repository_exec.scalar_one_or_none()

        if not repository:
            raise HTTPException(status_code=404, detail=data_not_found_error_by_name("镜像仓库"))

        image = await self.mapper.query_one(select(RepositoryImages).filter(RepositoryImages.id == image_id))

        if not image:
            raise HTTPException(status_code=500, detail=data_not_found_error_by_name("镜像仓库的镜像"))

        # 校验镜像
        await self.image_verification(repository_image_update, repository, image_id)

        for field, value in repository_image_update.model_dump(exclude_unset=True).items():
            setattr(image, field, value)
        image.updated_at = get_current_shanghai_time()
        await self.mapper.commit()
        await self.mapper.refresh(image)
        response = RepositoryImageResponse.model_validate(image)
        response.repository_name = repository
        return response

    async def delete_repository_image(
            self,
            image_id: int
    ) -> None:
        """删除镜像（管理员）"""
        image = await self.mapper.query_one(select(RepositoryImages).filter(RepositoryImages.id == image_id))

        if not image:
            raise HTTPException(status_code=500, detail=data_not_found_error_by_name("镜像仓库的镜像"))

        await self.mapper.delete(image)
        await self.mapper.commit()
        return None

    async def find_image_list_by_project_id(
            self,
            project_id: int,
            type: ImageType,
            sub_type: Optional[BackendEnum] = None,
            card_category: Optional[Union[CardType, str]] = None,
            card_model: Optional[Union[CardModel, str]] = None,
            cuda_version: Optional[Union[CudaVersion, str]] = None,
            python_version: Optional[str] = None,
            is_card_model_null: Optional[bool] = False
    ) -> List[RepositoryImageDetailResponse]:
        """根据项目ID和类型获取镜像列表"""
        #处理参数转换
        card_category_str = normalize_enum_value(card_category)
        card_model_str = normalize_enum_value(card_model)
        cuda_version_str = normalize_enum_value(cuda_version)

        query = (select(RepositoryImages,
                                                 RepositoryResource.name.label("repository_name"),
                                                 func.concat(func.concat(func.replace(
                                                     func.replace(RepositoryResource.repository_address, "https://",
                                                                  ""),
                                                     "http://", ""
                                                 ),
                                                     "/", RepositoryImages.namespace),
                                                     "/", RepositoryImages.image).label("image_address")
                                                 )
                                          .join(RepositoryResource,
                                                RepositoryResource.id == RepositoryImages.repository_id)
                                          .join(KubernetesRepositoryRelation,
                                                KubernetesRepositoryRelation.repository_id == RepositoryImages.repository_id)
                                          .join(ProjectKubernetesRelation,
                                                ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
                                          .where(ProjectKubernetesRelation.project_id == project_id,
                                                 RepositoryImages.type == type.value,
                                                 RepositoryImages.tenant_id == ProjectKubernetesRelation.tenant_id)
                                          .order_by(RepositoryImages.created_at.desc()))

        if sub_type:
            query = query.where(RepositoryImages.sub_type == sub_type.value)
        if card_category_str:
            query = query.where(RepositoryImages.card_category == card_category_str)

        if is_card_model_null:
            query = query.where(RepositoryImages.card_model.is_(None))
        else:
            if card_model_str:
                query = query.where(RepositoryImages.card_model == card_model_str)

        if cuda_version_str:
            query = query.where(RepositoryImages.cuda_version == cuda_version_str)

        if python_version:
            query = query.where(RepositoryImages.python_version == python_version)

        image = await self.mapper.execute(query)

        rows = image.all()
        if not rows:
            return []

        return [
            RepositoryImageDetailResponse.model_validate({
                **repo_img.__dict__,
                "repository_name": repo_name,
                "image_address": img_addr,
            })
            for repo_img, repo_name, img_addr in rows
        ]


    async def find_image_list_by_project_id_page(
            self,
            project_id: int,
            type: ImageType,
            sub_type: Optional[BackendEnum] = None,
            card_category: Optional[Union[CardType, str]] = None,
            card_model: Optional[Union[CardModel, str]] = None,
            cuda_version: Optional[Union[CudaVersion, str]] = None,
            python_version: Optional[str] = None,
            is_card_model_null: Optional[bool] = False,
            params: Params = None,
            tag_element_ids: Optional[List[int]] = None
    ) -> Page[RepositoryImageDetailResponse]:
        """根据项目ID和类型获取镜像列表分页"""
        #处理参数转换
        card_category_str = normalize_enum_value(card_category)
        card_model_str = normalize_enum_value(card_model)
        cuda_version_str = normalize_enum_value(cuda_version)

        query = (select(RepositoryImages.id,
                        RepositoryImages.image,
                        RepositoryImages.type,
                        RepositoryImages.sub_type,
                        RepositoryImages.describe,
                        RepositoryImages.repository_id,
                        RepositoryImages.namespace,
                        RepositoryImages.card_category,
                        RepositoryImages.card_model,
                        RepositoryImages.cuda_version,
                        RepositoryImages.python_version,
                        RepositoryImages.image_source,
                        RepositoryImages.created_at,
                        RepositoryImages.updated_at,
                        RepositoryResource.name.label("repository_name"),
                        func.concat(func.concat(func.replace(
                            func.replace(RepositoryResource.repository_address, "https://",
                                         ""),
                            "http://", ""
                        ),
                            "/", RepositoryImages.namespace),
                            "/", RepositoryImages.image).label("image_address")
                        )
                 .join(RepositoryResource,
                       RepositoryResource.id == RepositoryImages.repository_id)
                 .join(KubernetesRepositoryRelation,
                       KubernetesRepositoryRelation.repository_id == RepositoryImages.repository_id)
                 .join(ProjectKubernetesRelation,
                       ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
                 .where(ProjectKubernetesRelation.project_id == project_id,
                        RepositoryImages.type == type.value,
                        RepositoryImages.tenant_id == ProjectKubernetesRelation.tenant_id)
                 .order_by(RepositoryImages.created_at.desc()))
        if sub_type:
            query = query.where(RepositoryImages.sub_type == sub_type.value)
        if card_category_str:
            query = query.where(RepositoryImages.card_category == card_category_str)

        if is_card_model_null:
            query = query.where(RepositoryImages.card_model.is_(None))
        else:
            if card_model_str:
                query = query.where(RepositoryImages.card_model == card_model_str)

        if cuda_version_str:
            query = query.where(RepositoryImages.cuda_version == cuda_version_str)

        if python_version:
            query = query.where(RepositoryImages.python_version == python_version)

        # 标签过滤：必须包含全部选中的 tag_element_ids
        if tag_element_ids:
            tag_subquery = (
                select(BusinessTagRel.business_id)
                .where(
                    BusinessTagRel.business_type == TagBusinessType.IMAGE.value,
                    BusinessTagRel.tag_element_id.in_(tag_element_ids)
                )
                .group_by(BusinessTagRel.business_id)
                .having(func.count(func.distinct(BusinessTagRel.tag_element_id)) == len(tag_element_ids))
                .subquery()
            )
            query = query.join(
                tag_subquery,
                tag_subquery.c.business_id == cast(RepositoryImages.id, String)
            )

        # 使用 fastapi-pagination 进行分页
        if params is None:
            params = Params()
        page_result = await self.mapper.query_page(query, params.page, params.size, unique=False)

        if not page_result.items:
            return page_result

        # 批量查询标签（复用 tag_service）
        image_ids = [str(row.id) for row in page_result.items]
        tags_map = {}
        if image_ids and self.tag_service:
            tags_map = await self.tag_service.get_business_tags_batch(TagBusinessType.IMAGE.value, image_ids)

        # 重新构造 items
        items = [
            item.copy(update={
                "tags": tags_map.get(str(item.id), [])
            })
            for item in page_result.items
        ]
        return page_result.copy(update={"items": items})

    async def image_verification(
            self,
            image_create: RepositoryImageCreate,
            repository_name: str,
            image_id: Optional[int] = None
    ) -> None:
        """校验镜像是否符合创建/更新条件"""
        # 校验镜像是否已存在
        if not image_id:
            # 创建操作：检查同仓库同类型同名称的镜像
            image_exec = await self.mapper.execute(
                select(RepositoryImages.image)
                .filter(
                    RepositoryImages.image == image_create.image,
                    RepositoryImages.type == image_create.type,
                    RepositoryImages.namespace == image_create.namespace,
                    RepositoryImages.repository_id == image_create.repository_id
                )
            )
        else:
            # 更新操作：排除当前镜像ID后检查
            image_exec = await self.mapper.execute(
                select(RepositoryImages)
                .filter(
                    RepositoryImages.id != image_id,
                    RepositoryImages.image == image_create.image,
                    RepositoryImages.type == image_create.type,
                    RepositoryImages.namespace == image_create.namespace,
                    RepositoryImages.repository_id == image_create.repository_id
                )
            )

        existing_image = image_exec.scalar_one_or_none()
        if existing_image:
            raise HTTPException(
                status_code=400,
                detail=data_exists_error(f"镜像仓库：'{repository_name}'的镜像：'{image_create.image}'")
            )

    async def list_namespaces_list(
            self,
            repository_id: int,
            search_type: int,
            namespaces: Optional[str] = None,
            image_name: Optional[str] = None,
            params: Params = Depends()
    ) -> Page[str]:
        """获取镜像列表，使用 fastapi-pagination 进行分页"""
        if search_type == 2 and not namespaces:
            raise HTTPException(status_code=400, detail="请先选择命名空间")

        query = await self.mapper.execute(select(RepositoryResource)
                                          .filter(RepositoryResource.id == repository_id))
        repository_resource = query.scalar_one_or_none()
        if not repository_resource:
            raise HTTPException(status_code=404, detail=data_not_found_error_by_name("镜像仓库"))

        image_factory = None
        config = repository_resource.config
        if repository_resource.type == RepositoryType.VOLCENGINE.value:
            # 火山云
            image_factory = await RepositoryImageFactory.create_checker(
                RepositoryType.VOLCENGINE.value,
                url=repository_resource.repository_address.split("://", 1)[-1],
                access_key=config['access_key'],
                secret_key=config['secret_key'],
                registry=config['registry'],
                region=config['region'],
            )

        if repository_resource.type == RepositoryType.PRIVATE_HARBOR.value:
            # 私有harbor
            image_factory = await RepositoryImageFactory.create_checker(
                RepositoryType.PRIVATE_HARBOR.value,
                harbor_url=repository_resource.repository_address,
                username=config['access_key'],
                password=config['secret_key']
            )
        total = 0
        items = []
        try:
            if image_factory:
                if search_type == 1:
                    page_data = await image_factory.get_projects(namespaces=namespaces, page=params.page,
                                                                 page_size=params.size)
                else:
                    page_data = await image_factory.get_images(namespace=namespaces, name=image_name, page=params.page,
                                                               page_size=params.size)

                # 2. 手动切片
                total = page_data['total']
                items = page_data['data']
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"镜像仓库异常: {e}")

        return Page.create(items=items, total=total, params=params)

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(RepositoryImages).where(RepositoryImages.id == id_field_value))
        pass


    async def find_image_list_by_k8s_id(
            self,
            k8s_id: int,
            type: ImageType,
            card_category: Optional[Union[CardType, str]] = None,
            card_model: Optional[Union[CardModel, str]] = None,
            cuda_version: Optional[Union[CudaVersion, str]] = None,
            python_version: Optional[str] = None,
            is_card_model_null: Optional[bool] = False
    ) -> List[RepositoryImageDetailResponse]:
        """根据类型获取非项目关联的镜像列表-如基础模型下载镜像无法获取项目id"""
        #处理参数转换
        card_category_str = normalize_enum_value(card_category)
        card_model_str = normalize_enum_value(card_model)
        cuda_version_str = normalize_enum_value(cuda_version)

        query = (select(RepositoryImages,
                                                 RepositoryResource.name.label("repository_name"),
                                                 func.concat(func.concat(func.replace(
                                                     func.replace(RepositoryResource.repository_address, "https://",
                                                                  ""),
                                                     "http://", ""
                                                 ),
                                                     "/", RepositoryImages.namespace),
                                                     "/", RepositoryImages.image).label("image_address")
                                                 )
                                          .join(RepositoryResource,
                                                RepositoryResource.id == RepositoryImages.repository_id)
                                          .join(KubernetesRepositoryRelation,
                                                KubernetesRepositoryRelation.repository_id == RepositoryImages.repository_id)
                                          .where(KubernetesRepositoryRelation.k8s_id == k8s_id,
                                                 RepositoryImages.type == type.value)
                                          .order_by(RepositoryImages.created_at.desc()))

        if card_category_str:
            query = query.where(RepositoryImages.card_category == card_category_str)

        if is_card_model_null:
            query = query.where(RepositoryImages.card_model.is_(None))
        else:
            if card_model_str:
                query = query.where(RepositoryImages.card_model == card_model_str)

        if cuda_version_str:
            query = query.where(RepositoryImages.cuda_version == cuda_version_str)

        if python_version:
            query = query.where(RepositoryImages.python_version == python_version)

        image = await self.mapper.execute(query)

        rows = image.all()
        if not rows:
            return []

        return [
            RepositoryImageDetailResponse.model_validate({
                **repo_img.__dict__,
                "repository_name": repo_name,
                "image_address": img_addr,
            })
            for repo_img, repo_name, img_addr in rows
        ]

    async def save_notebook_as_image(
        self,
        project_id: int,
        notebook_id: int,
        notebook_as_image_request: SaveNotebookAsImageRequest,
        current_user: JwtUserInfo
    ) -> SaveNotebookAsImageResponse:
        """保存 notebook 环境为自定义镜像"""
        project_query = await self.mapper.execute(select(Project).filter(Project.id == project_id))
        project = project_query.scalar_one_or_none()
        if not project or not project.image_build_namespace:
            # 统一错误格式：数据不存在
            raise HTTPException(status_code=500, detail=data_not_found_error())

        # 1. 获取 notebook 信息
        notebook_query = await self.mapper.execute(
            select(Notebook).filter(Notebook.id == notebook_id, Notebook.project_id == project_id)
        )
        notebook = notebook_query.scalar_one_or_none()
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # 2. 获取仓库信息,校验镜像是否存在，存在就不允许创建
        repository_query = await self.mapper.execute(
            select(RepositoryResource)
            .join(KubernetesRepositoryRelation, KubernetesRepositoryRelation.repository_id == RepositoryResource.id)
            .join(ProjectKubernetesRelation,
                  ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        repository = repository_query.scalar_one_or_none()
        if not repository:
            raise HTTPException(status_code=404, detail="项目未绑定镜像仓库")

        # 检查镜像是否已存在
        await self._check_image_exists_in_repository(
            repository=repository,
            namespace=project.image_build_namespace,
            image_name_with_tag=notebook_as_image_request.name
        )

        # 校验构建任务
        instance_name = f"notebook-{notebook_id}"
        app_name = f"jupyter-{instance_name}"
        # 查询构建记录
        redis_client = settings.REDIS_CLIENT
        try:
            # 写入构建记录
            redis_key = f"build-image:{app_name}-deployment"
            is_exists = await redis_client.get(redis_key)
            if is_exists:
                raise HTTPException(status_code=500, detail="镜像构建中")
        except Exception as e:
            raise

        # 3. 获取 k8s 配置和命名空间
        config_result = await self.mapper.execute(
            select(KubernetesResource.config, ProjectKubernetesRelation.namespace, KubernetesResource.id)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        config_row = config_result.one_or_none()
        if not config_row:
            raise HTTPException(status_code=404, detail="项目未绑定K8s集群")
        kubeconfig_str, k8s_namespace, k8s_id = config_row
        
        # 4. 初始化 K8s 启动器
        launcher = K8sLauncher(config_str=kubeconfig_str)
        
        # 5. 获取 notebook pod 名称
        pods = await launcher.list_deployment_pods(k8s_namespace, app_name)
        if not pods or len(pods) == 0:
            raise HTTPException(status_code=400, detail="Notebook pod 未运行，请先启动 notebook")

        running_pods = [p for p in pods if p.get("phase") == TaskStatus.RUNNING.value]
        if not running_pods:
            raise HTTPException(status_code=400, detail="Notebook pod 未运行，请先启动 notebook")

        pod_name = running_pods[0].get("pod_name")
        if not pod_name:
            raise HTTPException(status_code=400, detail="无法获取 notebook pod 名称")
        
        # 6. 生成 snapshot ID
        snapshot_date = datetime.now().strftime('%Y%m%d-%H%M%S')
        snapshot_id = f"env-{snapshot_date}"
        
        # 7. 构建完整镜像地址,使用项目上的设置的自定义镜像命名空间
        harbor_url = repository.repository_address.split("://", 1)[-1]
        full_image_name = f"{harbor_url}/{project.image_build_namespace}/{notebook_as_image_request.name}"


        k8s_uuid = str(uuid.uuid4())
        build_log = ImageBuildLog(
            name=notebook_as_image_request.name,
            project_id=project_id,
            business_id=notebook_id,
            business_name=notebook.instance_name,
            base_image=notebook.image,
            output_image=full_image_name,
            image_type=ImageType.CUSTOM_LLM_NOTEBOOK.value if notebook.biz_type == NotebookBizType.LLM.value else ImageType.CUSTOM_ML_NOTEBOOK.value,
            trigger_type=notebook_as_image_request.trigger_type,
            status=TaskStatus.SCHEDULED_PENDING.value if notebook_as_image_request.schedule_at else TaskStatus.CREATED.value,
            lab_k8s_uuid=k8s_uuid,
            snapshot_id=snapshot_id,
            describe=notebook_as_image_request.describe,
            created_id=current_user.userId,
            created_by=current_user.username
        )
        await self.build_log_mapper.insert(build_log)
        await self.build_log_mapper.commit()
        await self.build_log_mapper.refresh(build_log)

        # 8. 创建执行任务（可定时 / 立即执行）
        job_name = f"build-notebook-image-{build_log.id}"
        schedule_at = notebook_as_image_request.schedule_at
        if schedule_at:
            execution_kwargs = {
                "k8s_id": k8s_id,
                "k8s_namespace": k8s_namespace,
                "pod_name": pod_name,
                "instance_name": instance_name,
                "app_name": app_name,
                "snapshot_id": snapshot_id,
                "image_name": full_image_name,
                "cache_image": notebook.image,
                "k8s_uuid": k8s_uuid,
                "include_lab_work": notebook_as_image_request.include_lab_work,
            }
            execution = TaskExecution(
                business_type=TaskExecutionBusinessType.IMAGE_BUILD_LOG.value,
                business_id=build_log.id,
                schedule_at=schedule_at,
                status=TaskExecutionStatus.PENDING.value,
                executor=TaskExecutionExecutor.NOTEBOOK_IMAGE.value,
                method=TaskExecutionMethod.START.value,
                kwargs=execution_kwargs
            )
            await self.task_execution_mapper.insert(execution)
            await self.task_execution_mapper.commit()
        else:
            # 立即执行走原来的构建逻辑
            try:
                await self._create_build_image_job(
                    launcher=launcher,
                    namespace=k8s_namespace,
                    job_name=job_name,
                    pod_name=pod_name,
                    container_name=app_name,
                    snapshot_id=snapshot_id,
                    instance_name=instance_name,
                    image_name=full_image_name,
                    cache_image=notebook.image,
                    k8s_uuid=k8s_uuid,
                    k8s_id=k8s_id,
                    include_lab_work=notebook_as_image_request.include_lab_work
                )
            except Exception as e:
                # 如果创建 Job 失败，删除已创建的构建记录
                await self.build_log_mapper.delete(build_log)
                await self.build_log_mapper.commit()
                logger.info(f"已删除构建记录 build_log.id={build_log.id}，原因：创建 Job 失败")
                raise

        redis_client = settings.REDIS_CLIENT
        try:
            # 写入
            redis_key = f"build-image:{app_name}-deployment"
            await redis_client.set(redis_key, 1, ex=60 * 60)
        except Exception as e:
            logger.error(f"Error Set build-image:{app_name}-deployment: : {e}")

        return SaveNotebookAsImageResponse(
            snapshot_job_name=job_name,  # 使用同一个 job 名称
            build_job_name=job_name,
            build_log_id=build_log.id,
            image_address=full_image_name
        )

    async def _prepare_volumes_for_build_job(
            self,
            launcher: K8sLauncher,
            instance_name: str,
            snapshot_id: str
    ) -> tuple[List[client.V1VolumeMount], List[client.V1Volume]]:
        """准备构建 Job 所需的卷挂载和卷"""
        # 准备存储卷挂载
        storage_items = [
            {"name": PvcName.NOTEBOOK_PVC.value, "enum": StoragePath.NOTEBOOK_WORK_ENV_SNAPSHOT}
        ]
        volume_mounts, volumes = await launcher.build_storage_volumes(
            storage_items, instance_name=instance_name, snapshot_id=snapshot_id
        )

        # 添加 docker-config 卷挂载
        volume_mounts.append(
            client.V1VolumeMount(
                name="docker-config",
                mount_path="/root/.docker",
                read_only=True,
            )
        )

        # 添加 docker-config 卷
        volumes.append(
            client.V1Volume(
                name="docker-config",
                secret=client.V1SecretVolumeSource(
                    secret_name="dp-pull-secret",
                    items=[
                        client.V1KeyToPath(
                            key=".dockerconfigjson",
                            path="config.json",
                        )
                    ],
                ),
            )
        )

        ## 镜像仓库证书
        volume_mounts.append(
            client.V1VolumeMount(
                name="harbor-ca",
                mount_path="/etc/buildkit/certs/harbor-ca.crt",
                sub_path="harbor-ca.crt"
            )
        )
        volumes.append(
            client.V1Volume(
                name="harbor-ca",
                config_map=client.V1ConfigMapVolumeSource(name=f"harbor-ca")
            )
        )

        return volume_mounts, volumes

    async def _generate_and_upload_dockerfile(
            self,
            namespace: str,
            instance_name: str,
            snapshot_id: str,
            base_image: str,
            tenant_id: Optional[str] = None
    ) -> None:
        """生成并上传 Dockerfile 到 JuiceFS"""
        dockerfile_storage_path = StoragePath.NOTEBOOK_WORK_ENV_SNAPSHOT.storage_path.format(
            project_name=namespace,
            instance_name=instance_name,
            snapshot_id=snapshot_id
        )
        result = await generate_dockerfile(base_image, f'{dockerfile_storage_path}/Dockerfile', tenant_id)
        if not result:
            raise HTTPException(status_code=400, detail="the dockerfile generation failed")

    def _build_snapshot_script(
            self,
            namespace: str,
            pod_name: str,
            container_name: str,
            snapshot_id: str,
            include_lab_work: bool = False
    ) -> str:
        """构建 snapshot 脚本"""
        lab_work_line = f'snapshot_one lab-work {NOTEBOOK_WORK_PATH}' if include_lab_work else ""
        additional_lines = [line.strip() for line in lab_work_line.split('\n') if "snapshot_one" in line]

        return f"""set -e
        echo "== wait pod ready =="
        kubectl wait pod {pod_name} -n {namespace} --for=condition=Ready --timeout=60s

        echo "== exec snapshot =="
        kubectl exec -n {namespace} {pod_name} -c {container_name} -- bash -lc '
        set -euo pipefail

        OUT={NOTEBOOK_WORK_PATH}/.snapshot/{snapshot_id}
        mkdir -p "$OUT"

        # 1. 检测并动态获取核心数
        CPUS=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo || echo 2)

        # 2. 先看有没有 pigz，没有尝试安装
        GZIP_CMD="gzip -1"
        if ! command -v pigz >/dev/null 2>&1; then
            echo "pigz not found, trying to install..."
            (apt-get update -qq && apt-get install -y -qq pigz) >/dev/null 2>&1 || \\
            (yum install -y -q pigz) >/dev/null 2>&1 || true
        fi

        # 再次确认安装结果
        if command -v pigz >/dev/null 2>&1; then
            GZIP_CMD="pigz -p $CPUS -1"
            echo "Using pigz with $CPUS threads."
        else
            echo "Fallback to gzip -1."
        fi

        # 3. 定义标准快照函数（Dockerfile 兼容格式）
        snapshot_one () {{
          NAME="$1"
          SRC="$2"
          [ ! -d "$SRC" ] && return

          echo "== snapshot $NAME start =="
          tar -C / --exclude="${{SRC#/}}/.snapshot" -cf - "${{SRC#/}}" | $GZIP_CMD > "$OUT/$NAME.tar.gz"
          echo "== $NAME done =="
        }}

        # 4. 并行执行：将所有任务放入后台
        snapshot_one conda /opt/conda &
        snapshot_one local-lib /usr/local/lib &
        snapshot_one local-bin /usr/local/bin &

        # 处理动态传入的额外行，确保不报错
        {" ".join([f"{line} &" for line in additional_lines])}

        # 5. 等待所有后台任务完成
        wait

        echo "== all snapshot done =="
        '
        """

    async def _prepare_init_container_config(
            self,
            k8s_id,
            snapshot_script: str
    ) -> dict[str, Any]:
        """准备 init container（snapshot）配置"""
        image_list = await self.find_image_list_by_k8s_id(
            k8s_id=k8s_id,
            type=ImageType.KUBECTL_IMAGE
        )
        kubectl_image = image_list[0].image_address
        return {
            "name": "snapshot",
            "image": kubectl_image,
            "command": ["/bin/sh", "-c"],
            "args": [snapshot_script],
            "cpu_request": "1",
            "memory_request": "2Gi",
            "cpu_limit": "2",
            "memory_limit": "4Gi",
        }

    async def _prepare_main_container_config(
            self,
            k8s_id: int,
            image_name: str,
            cache_image: str,
            volume_mounts: List[client.V1VolumeMount]
    ) -> dict[str, Any]:
        """准备 main container（buildkit）配置"""
        image_list = await self.find_image_list_by_k8s_id(
            k8s_id=k8s_id,
            type=ImageType.BUILDKIT_IMAGE
        )
        buildkit_image = image_list[0].image_address
        return {
            "name": "buildkit",
            "image": buildkit_image,
            "command": ["/bin/sh", "-c"],
            "args": [f"""set -e
            echo "== Installing CA certificate =="
            cp /etc/buildkit/certs/harbor-ca.crt /usr/local/share/ca-certificates/harbor-ca.crt
            update-ca-certificates 2>/dev/null || true
            echo "== CA cert installed, starting build =="
            buildctl-daemonless.sh build \
            --frontend=dockerfile.v0 \
            --local=context=/context \
            --local=dockerfile=/context \
            --import-cache=type=registry,ref={cache_image} \
            --output=type=image,name={image_name},push=true
            """
            ],
            "env_vars": {
                "DOCKER_CONFIG": "/root/.docker",
            },
            "security_context": client.V1SecurityContext(privileged=True),
            "volume_mounts": volume_mounts,
            "cpu_request": "1",
            "memory_request": "2Gi",
            "cpu_limit": "2",
            "memory_limit": "4Gi",
        }

    async def _create_build_image_job(
            self,
            launcher: K8sLauncher,
            namespace: str,
            job_name: str,
            pod_name: str,
            container_name: str,
            snapshot_id: str,
            instance_name: str,
            image_name: str,
            cache_image: str,
            k8s_uuid: str,
            k8s_id:int,
            include_lab_work: bool = False,
            tenant_id: Optional[str] = None
    ) -> None:
        """创建包含 init container（snapshot）和 main container（buildkit）的 Job"""
        # 1. 准备卷挂载
        volume_mounts, volumes = await self._prepare_volumes_for_build_job(
            launcher, instance_name, snapshot_id
        )

        # 2. 生成并上传 Dockerfile
        await self._generate_and_upload_dockerfile(
            namespace, instance_name, snapshot_id, cache_image, tenant_id
        )

        # 3. 构建 snapshot 脚本
        snapshot_script = self._build_snapshot_script(
            namespace, pod_name, container_name, snapshot_id, include_lab_work
        )

        # 4. 准备容器配置
        init_container_config = await self._prepare_init_container_config(k8s_id, snapshot_script)
        main_container_config = await self._prepare_main_container_config(
            k8s_id, image_name, cache_image, volume_mounts
        )

        # 5. 创建 Job
        await launcher.create_job_with_init_container(
            namespace=namespace,
            job_name=job_name,
            init_container_config=init_container_config,
            main_container_config=main_container_config,
            service_type="build-notebook-image",
            volumes=volumes,
            service_account_name="snapshot-executor",
            backoff_limit=0,
            ttl_seconds_after_finished=3600,
            k8s_uuid=k8s_uuid,
            config_maps={f"harbor-ca": await get_harbor_ca_crt(cache_image)},
        )
        logger.info(f"Build image job {job_name} 创建成功（包含 snapshot init container 和 buildkit main container）")

    async def build_image_completed(
            self,
            id: int
    ) -> RepositoryImageResponse:
        # 1. 获取构建记录
        image_build_log_query = await self.mapper.execute(select(ImageBuildLog).filter(ImageBuildLog.id == id))
        image_build_log = image_build_log_query.scalar_one_or_none()
        if not image_build_log:
            raise HTTPException(status_code=404, detail="构建记录不存在")
        app_name = ""
        try:
            # 2. 获取仓库信息和集群配置（通过 project_id 查找）
            repository_query = await self.mapper.execute(
                select(
                    RepositoryResource.id,
                    KubernetesResource.config,
                    ProjectKubernetesRelation.namespace
                )
                .join(KubernetesRepositoryRelation, KubernetesRepositoryRelation.repository_id == RepositoryResource.id)
                .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
                .join(KubernetesResource, KubernetesResource.id == ProjectKubernetesRelation.k8s_id)
                .where(ProjectKubernetesRelation.project_id == image_build_log.project_id)
            )
            repository_row = repository_query.one_or_none()
            if not repository_row:
                raise HTTPException(status_code=404, detail="项目未绑定镜像仓库")
            repository_id, kubeconfig_str, namespace = repository_row

            # 3. 解析镜像地址，获取 namespace 和 image name
            # output_image 格式: harbor_url/namespace/image:tag
            output_image = image_build_log.output_image
            parts = parse_image(output_image)
            image_name_with_tag = f"{parts.image}:{parts.tag}"

            # 4. 从基础镜像获取配置信息（sub_type、card_category、card_model、cuda_version、python_version）
            base_image_config = None
            try:
                # 解析基础镜像地址
                base_image_parts = parse_image(image_build_log.base_image)
                base_image_name_with_tag = f"{base_image_parts.image}:{base_image_parts.tag}"
                
                # 查找基础镜像记录（可能在不同的仓库中，需要跨仓库查找）
                base_image_query = await self.mapper.execute(
                    select(RepositoryImages)
                    .where(
                        RepositoryImages.image == base_image_name_with_tag,
                        RepositoryImages.namespace == base_image_parts.namespace,
                        RepositoryImages.repository_id == repository_id,
                        RepositoryImages.tenant_id == image_build_log.tenant_id
                    )
                    .order_by(RepositoryImages.created_at.desc())
                    .limit(1)
                )
                base_image_config = base_image_query.scalar_one_or_none()
                
                if base_image_config:
                    logger.info(f"找到基础镜像配置: {base_image_name_with_tag}")
                else:
                    logger.warning(f"未找到基础镜像配置: {base_image_name_with_tag}，将使用默认值")
            except Exception as e:
                logger.warning(f"解析基础镜像配置失败: {str(e)}，将使用默认值")


            # 5. 创建仓库镜像记录
            repository_image = RepositoryImages(
                image=image_name_with_tag,
                type=image_build_log.image_type,
                repository_id=repository_id,
                namespace=parts.namespace,
                image_source=ImageSource.CUSTOM.value,
                sub_type=base_image_config.sub_type if base_image_config else None,
                card_category=base_image_config.card_category if base_image_config else None,
                card_model=base_image_config.card_model if base_image_config else None,
                cuda_version=base_image_config.cuda_version if base_image_config else None,
                python_version=base_image_config.python_version if base_image_config else None,
                describe=image_build_log.describe,
                created_id=image_build_log.created_id,
                created_by=image_build_log.created_by,
                created_at=get_current_shanghai_time(),
                updated_at=get_current_shanghai_time(),
                tenant_id=image_build_log.tenant_id
            )
            await self.mapper.insert(repository_image)


            # 6. 如果是 notebook 类型，更新 notebook 的镜像名
            if image_build_log.image_type in NOTEBOOK_IMAGE_TYPE_VALUES:
                app_name = f"jupyter-notebook-{image_build_log.business_id}"

                # 停止notebook，并且更新镜像
                if image_build_log.trigger_type == ImageBuildTriggerType.AUTO.value:
                    # 获取 notebook 信息
                    notebook_query = await self.mapper.execute(
                        select(Notebook).filter(Notebook.id == image_build_log.business_id)
                    )
                    notebook = notebook_query.scalar_one_or_none()
                    # 更新 notebook 的镜像为最新构建的镜像
                    notebook.image = output_image
                    notebook.updated_at = get_current_shanghai_time()
                    notebook.status = TaskStatus.TERMINATED.value

                    #初始化 K8s 启动器
                    launcher = K8sLauncher(config_str=kubeconfig_str)
                    await launcher.stop_patch_app_image_only(namespace,app_name,output_image)
                    logger.info(f"已更新 Notebook {notebook.id} 的镜像为: {output_image}")

                # 清理构建锁
                await build_notebook_lock_del(app_name)

            # 回写 output_image_id（同一事务内）
            session = await self.mapper.get_session()
            await session.flush()  # 获取 repository_image.id
            image_build_log.output_image_id = repository_image.id

            # 7. 返回创建的镜像记录
            await self.mapper.commit()
            await self.mapper.refresh(repository_image)
            response = RepositoryImageResponse.model_validate(repository_image)
            return response

        except Exception as e:
            # 发生异常时回滚事务
            try:
                await self.mapper.rollback()
                if image_build_log.image_type in NOTEBOOK_IMAGE_TYPE_VALUES and app_name:
                    await build_notebook_lock_del(app_name)
                logger.error(f"构建镜像完成处理失败 (build_log_id={id}): {str(e)}", exc_info=True)
            except Exception as rollback_error:
                logger.error(f"回滚事务失败: {str(rollback_error)}")
            # 重新抛出异常
            raise HTTPException(
                status_code=500,
                detail=f"构建镜像完成处理失败: {str(e)}"
            )


    async def build_image_failed(
            self,
            id: int
    ):
        """镜像构建任务失败后处理"""
        # 1. 获取构建记录
        image_build_log_query = await self.mapper.execute(select(ImageBuildLog).filter(ImageBuildLog.id == id))
        image_build_log = image_build_log_query.scalar_one_or_none()
        if not image_build_log:
            raise HTTPException(status_code=404, detail="构建记录不存在")
        app_name = f"jupyter-notebook-{image_build_log.business_id}"
        await build_notebook_lock_del(app_name)

    async def get_image_build_logs(
            self,
            task_id: int,
            end_time: datetime,
            days: Optional[int] = 30
    ) -> ImageBuildLogLogResponse:
        """获取镜像构建任务日志"""
        # 导入公共日志服务
        from app.utils.log_service import log_service
        
        # 验证任务存在
        image_build_log_query = await self.mapper.execute(
            select(ImageBuildLog).filter(ImageBuildLog.id == task_id)
        )
        image_build_log = image_build_log_query.scalar_one_or_none()
        if not image_build_log:
            raise HTTPException(status_code=404, detail="构建记录不存在")

        # 判断日志来源
        if image_build_log.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(image_build_log.log_path)
            return ImageBuildLogLogResponse(archived=True, logs=logs)
        else:
            # 从Loki获取实时日志
            if not image_build_log.lab_k8s_uuid:
                raise HTTPException(
                    status_code=400,
                    detail="任务没有关联的K8S UUID"
                )
            # 使用传入的结束时间和天数参数
            logs = log_service.get_logs_from_loki(
                image_build_log.lab_k8s_uuid,
                end_time=end_time,
                days=days if days else 30
            )
            return ImageBuildLogLogResponse(archived=False, logs=logs)

    async def get_image_build_logs_by_time_range(
            self,
            task_id: int,
            start_time: datetime,
            end_time: datetime
    ) -> ImageBuildLogLogResponse:
        """根据时间范围获取镜像构建任务日志"""
        # 导入公共日志服务
        from app.utils.log_service import log_service
        
        # 验证任务存在
        image_build_log_query = await self.mapper.execute(
            select(ImageBuildLog).filter(ImageBuildLog.id == task_id)
        )
        image_build_log = image_build_log_query.scalar_one_or_none()
        if not image_build_log:
            raise HTTPException(status_code=404, detail="构建记录不存在")
        
        if not image_build_log.lab_k8s_uuid:
            raise HTTPException(
                status_code=400,
                detail="任务没有关联的K8S UUID"
            )
        # 从Loki获取指定时间范围的日志
        logs = log_service.get_logs_from_loki(
            image_build_log.lab_k8s_uuid,
            start_time=start_time,
            end_time=end_time
        )
        return ImageBuildLogLogResponse(archived=False, logs=logs)

    async def delete_image_build_log(
            self,
            build_log_id: int
    ) -> None:
        """删除镜像构建记录（只能删除失败或完成的记录，同时删除repository_images表中的镜像（屏蔽删除仓库镜像））"""
        try:
            # 1. 查询构建记录
            image_build_log_query = await self.build_log_mapper.execute(
                select(ImageBuildLog).filter(ImageBuildLog.id == build_log_id)
            )
            image_build_log = image_build_log_query.scalar_one_or_none()
            if not image_build_log:
                raise HTTPException(status_code=404, detail="构建记录不存在")

            # 2. 校验状态：只能删除失败或完成的记录
            if image_build_log.status not in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value]:
                raise HTTPException(
                    status_code=400,
                    detail=f"只能删除状态为'已完成'或'失败'的构建记录，当前状态为: {image_build_log.status}"
                )

            # 3. 如果状态是已完成，需要删除 repository_images 表中的镜像
            parts = None
            if image_build_log.status == TaskStatus.COMPLETED.value:
                try:
                    # 解析 output_image 获取镜像信息
                    # output_image 格式: harbor_url/namespace/image:tag
                    output_image = image_build_log.output_image
                    parts = parse_image(output_image)
                    image_name_with_tag = f"{parts.image}:{parts.tag}"

                    notebook_biz_type = NotebookBizType.LLM.value
                    if image_build_log.image_type == ImageType.CUSTOM_ML_NOTEBOOK.value:
                        notebook_biz_type = NotebookBizType.MACHINE_LEARNING.value

                    # 3.1 校验镜像是否被 notebook 使用
                    notebook_query = await self.mapper.execute(
                        select(Notebook)
                        .where(Notebook.image == output_image,
                               Notebook.project_id == image_build_log.project_id,
                               Notebook.biz_type == notebook_biz_type)
                    )
                    using_notebooks = notebook_query.scalars().all()
                    
                    if using_notebooks:
                        notebook_names = [nb.instance_name for nb in using_notebooks]
                        raise HTTPException(
                            status_code=400,
                            detail=f"镜像正在被以下 Notebook 使用，无法删除: {', '.join(notebook_names)}"
                        )

                    # 屏蔽删除仓库真实镜像
                    # # 获取项目关联的仓库ID
                    # repository_query = await self.mapper.execute(
                    #     select(RepositoryResource.id)
                    #     .join(KubernetesRepositoryRelation, KubernetesRepositoryRelation.repository_id == RepositoryResource.id)
                    #     .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
                    #     .where(ProjectKubernetesRelation.project_id == image_build_log.project_id)
                    # )
                    # repository_ids = [row[0] for row in repository_query.all()]
                    #
                    # if repository_ids:
                    #     # 获取仓库信息（用于创建镜像工厂）
                    #     repository_resource_query = await self.mapper.execute(
                    #         select(RepositoryResource)
                    #         .where(RepositoryResource.id.in_(repository_ids))
                    #         .limit(1)
                    #     )
                    #     repository_resource = repository_resource_query.scalar_one_or_none()
                    #
                    #     if repository_resource:
                    #         await self._delete_repository_image_and_registry_image(
                    #             repository_resource=repository_resource,
                    #             parts=parts,
                    #             image_name_with_tag=image_name_with_tag,
                    #             repository_ids=repository_ids
                    #         )
                except HTTPException:
                    # 重新抛出 HTTPException（如镜像被使用）
                    raise
                except Exception as e:
                    logger.warning(f"删除 repository_images 记录时出错: {str(e)}，继续删除构建记录")
                    # 即使删除镜像记录失败，也继续删除构建记录

            # 4. 删除构建记录
            if parts:
                await self.mapper.execute(delete(RepositoryImages).where(RepositoryImages.image == image_build_log.name,
                                                                         RepositoryImages.namespace == parts.namespace))
                if image_build_log.output_image_id:
                    await self.mapper.execute(delete(BusinessTagRel).where(BusinessTagRel.business_type == 'custom_image',
                                                                       BusinessTagRel.business_id == str(image_build_log.output_image_id)))
            await self.build_log_mapper.delete(image_build_log)
            await self.build_log_mapper.commit()
            logger.info(f"删除构建记录成功: {build_log_id}")

        except HTTPException:
            raise
        except Exception as e:
            await self.build_log_mapper.rollback()
            logger.error(f"删除构建记录失败 (build_log_id={build_log_id}): {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"删除构建记录失败: {str(e)}"
            )

    async def add_image(
            self,
            project_id: int,
            request: AddImageRequest,
            current_user: JwtUserInfo
    ) -> ImageBuildLogResponse:
        """添加镜像到 image_build_log 表"""
        project_query = await self.mapper.execute(select(Project.id).filter(Project.id == project_id))
        project = project_query.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        repository_query = await self.mapper.execute(
            select(RepositoryResource)
            .join(KubernetesRepositoryRelation, KubernetesRepositoryRelation.repository_id == RepositoryResource.id)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        repository = repository_query.scalar_one_or_none()
        if not repository:
            raise HTTPException(status_code=404, detail="项目未绑定镜像仓库")

        # 重名校验：项目、仓库、命名空间、镜像类型 + 镜像名（repository_images.image）
        dup_log_query = await self.build_log_mapper.execute(
            select(ImageBuildLog.id)
            .join(RepositoryImages, RepositoryImages.id == ImageBuildLog.output_image_id)
            .where(
                ImageBuildLog.project_id == project_id,
                RepositoryImages.repository_id == repository.id,
                RepositoryImages.namespace == request.namespace,
                ImageBuildLog.image_type == request.image_type.value,
                RepositoryImages.image == request.image_name,
            )
            .limit(1)
        )
        if dup_log_query.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"已存在同名镜像：{request.namespace}/{request.image_name}"
                ),
            )

        harbor_url = repository.repository_address.split("://", 1)[-1]
        image_name = request.image_name
        full_image_name = f"{harbor_url}/{request.namespace}/{image_name}"
        try:
            repository_image = RepositoryImages(
                image=request.image_name,
                type=request.image_type.value,
                repository_id=repository.id,
                namespace=request.namespace,
                image_source=ImageSource.CUSTOM.value,
                describe=request.describe,
                created_id=current_user.userId,
                created_by=current_user.username,
                created_at=get_current_shanghai_time(),
                updated_at=get_current_shanghai_time(),
            )
            await self.mapper.insert(repository_image)
            session = await self.mapper.get_session()
            await session.flush()

            build_log = ImageBuildLog(
                name=image_name,
                project_id=project_id,
                business_id=0,
                business_name=request.task or "-",
                base_image=full_image_name,
                output_image=full_image_name,
                output_image_id=repository_image.id,
                image_type=request.image_type.value,
                trigger_type=ImageBuildTriggerType.MANUAL.value,
                status=TaskStatus.COMPLETED.value,
                lab_k8s_uuid=f"manual-{uuid.uuid4()}",
                describe=request.describe,
                created_id=current_user.userId,
                created_by=current_user.username
            )
            await self.build_log_mapper.insert(build_log)

            await self.mapper.commit()
            await self.build_log_mapper.refresh(build_log)
            return ImageBuildLogResponse.model_validate(build_log)
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"添加镜像失败 (project_id={project_id}): {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"添加镜像失败: {str(e)}")

    async def is_notebook_building(
            self,
            notebook_id: int
    ) -> NotebookBuildingResponse:
        """检查 notebook 是否正在构建镜像"""
        instance_name = f"notebook-{notebook_id}"
        app_name = f"jupyter-{instance_name}"
        redis_key = f"build-image:{app_name}-deployment"

        redis_client = settings.REDIS_CLIENT
        is_building = False

        try:
            redis_value = await redis_client.get(redis_key)
            is_building = bool(redis_value)
        except Exception as e:
            logger.warning(f"检查 notebook 构建状态时出错 (notebook_id={notebook_id}): {str(e)}")

        return NotebookBuildingResponse(is_building=is_building)

    async def _check_image_exists_in_repository(
            self,
            repository: RepositoryResource,
            namespace: str,
            image_name_with_tag: str
    ) -> None:
        """
        检查镜像是否已存在于真实镜像仓库中
        
        Args:
            repository: 镜像仓库资源
            namespace: 命名空间
            image_name_with_tag: 镜像名称（包含tag），格式：name:tag 或 path/name:tag
        
        Raises:
            HTTPException: 如果镜像已存在，抛出 400 错误
        """
        # 分离 repository 名称和 tag
        parts = image_name_with_tag.rsplit(":", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="镜像名称格式错误，应为 name:tag")
        repo_name = parts[0]
        tag = parts[1]
        
        # 构建完整镜像地址用于检查
        harbor_url = repository.repository_address.split("://", 1)[-1]
        full_image_name = f"{harbor_url}/{namespace}/{image_name_with_tag}"
        
        try:
            # 创建镜像仓库检查器
            config = repository.config
            image_factory = None
            
            if repository.type == RepositoryType.VOLCENGINE.value:
                # 火山云
                image_factory = await RepositoryImageFactory.create_checker(
                    RepositoryType.VOLCENGINE.value,
                    url=harbor_url,
                    access_key=config['access_key'],
                    secret_key=config['secret_key'],
                    registry=config['registry'],
                    region=config['region'],
                )
            elif repository.type == RepositoryType.PRIVATE_HARBOR.value:
                # 私有Harbor
                image_factory = await RepositoryImageFactory.create_checker(
                    RepositoryType.PRIVATE_HARBOR.value,
                    harbor_url=repository.repository_address,
                    username=config['access_key'],
                    password=config['secret_key']
                )
            else:
                raise HTTPException(status_code=400, detail=f"不支持的仓库类型: {repository.type}")
            
            # 检查镜像是否存在
            if repository.type == RepositoryType.VOLCENGINE.value:
                # 火山云：直接查询指定 tag 是否存在
                try:
                    tag_exists = await image_factory.check_tag_exists(
                        namespace=namespace,
                        repository=repo_name,
                        tag=tag
                    )
                    if tag_exists:
                        raise HTTPException(
                            status_code=400,
                            detail=f"镜像已存在: {full_image_name}，不允许重复创建"
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    raise
            elif repository.type == RepositoryType.PRIVATE_HARBOR.value:
                # Harbor：直接查询指定 tag 是否存在
                try:
                    tag_exists = await image_factory.check_tag_exists(
                        project=namespace,
                        repo_name=repo_name,
                        tag=tag
                    )
                    if tag_exists:
                        raise HTTPException(
                            status_code=400,
                            detail=f"镜像已存在: {full_image_name}，不允许重复创建"
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    raise
        except HTTPException:
            raise
        except Exception as e:
            raise

    async def _delete_repository_image_and_registry_image(
            self,
            repository_resource: RepositoryResource,
            parts: ImageParts,
            image_name_with_tag: str,
            repository_ids: List[int]
    ) -> None:
        """删除 repository_images 表中的镜像记录和镜像仓库中的实际镜像"""
        # 查找并删除 repository_images 表中的镜像记录
        # 需要匹配：image、namespace、repository_id、image_source='custom'
        repository_image_query = await self.mapper.execute(
            select(RepositoryImages)
            .where(
                RepositoryImages.image == image_name_with_tag,
                RepositoryImages.namespace == parts.namespace,
                RepositoryImages.repository_id.in_(repository_ids),
                RepositoryImages.image_source == ImageSource.CUSTOM.value
            )
        )
        repository_images = repository_image_query.scalars().all()
        
        # 删除镜像仓库中的实际镜像
        try:
            config = repository_resource.config
            image_factory = None
            
            if repository_resource.type == RepositoryType.VOLCENGINE.value:
                # 火山云
                image_factory = await RepositoryImageFactory.create_checker(
                    RepositoryType.VOLCENGINE.value,
                    url=repository_resource.repository_address.split("://", 1)[-1],
                    access_key=config['access_key'],
                    secret_key=config['secret_key'],
                    registry=config['registry'],
                    region=config['region'],
                )
                # 删除标签：parts.image 是 repository 名称，parts.tag 是标签
                await image_factory.delete_tags(
                    namespace=parts.namespace,
                    repository=parts.image,
                    tags=[parts.tag]
                )
                logger.info(f"成功删除火山云镜像: {parts.namespace}/{parts.image}:{parts.tag}")
                
            elif repository_resource.type == RepositoryType.PRIVATE_HARBOR.value:
                # 私有Harbor
                image_factory = await RepositoryImageFactory.create_checker(
                    RepositoryType.PRIVATE_HARBOR.value,
                    harbor_url=repository_resource.repository_address,
                    username=config['access_key'],
                    password=config['secret_key']
                )
                # 删除标签：parts.image 是 repository 名称，parts.tag 是标签
                await image_factory.delete_tags(
                    namespace=parts.namespace,
                    repository=parts.image,
                    tags=[parts.tag]
                )
                logger.info(f"成功删除Harbor镜像: {parts.namespace}/{parts.image}:{parts.tag}")
            else:
                logger.warning(f"不支持的仓库类型: {repository_resource.type}，跳过删除镜像仓库中的镜像")
        except Exception as e:
            logger.warning(f"删除镜像仓库中的镜像失败: {str(e)}，继续删除数据库记录")
            # 即使删除镜像仓库中的镜像失败，也继续删除数据库记录
        
        # 删除数据库中的镜像记录
        for repo_image in repository_images:
            await self.mapper.delete(repo_image)
            logger.info(f"删除镜像记录: {repo_image.id} - {image_name_with_tag}")


E = TypeVar("E", bound=Enum)


def normalize_enum_value(value: Optional[Union[E, Any]]) -> Optional[Any]:
    """
    通用枚举转值函数：
    - 传入枚举成员 -> 返回其 .value
    - 传入其他任意类型 -> 原样返回
    - 传入 None -> 返回 None
    不校验、不抛异常。
    """
    if value is None or value == 'None':
        return None
    # 只要是枚举成员就取 value，其余一律直通
    return value.value if isinstance(value, Enum) else value


def parse_image(image: str) -> ImageParts:
    """
    解析 OCI 镜像地址
    格式: registry/namespace/image:tag
    示例: lab-cn-guangzhou.cr.volces.com/fs/jupyter/deepexi-notebook:datascience-cpu-python312-ubuntu24.04
    """
    # registry/namespace/image:tag
    m = re.fullmatch(r"([^/]+)/([^/]+)/(.+):([^:]+)", image.strip())
    if not m:
        raise ValueError(f"Invalid image format: {image!r}")
    return ImageParts(*m.groups())

REGISTRY_CA_REDIS_KEY_PREFIX = "registry_ca:"

async def fetch_registry_ca(registry: str) -> str:
    """
    动态获取 registry CA 证书链
    """

    if ":" in registry:
        host, port = registry.split(":")
        port = int(port)
    else:
        host = registry
        port = 443

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    pem_chain = []

    with socket.create_connection((host, port), timeout=10) as sock:
        with context.wrap_socket(sock, server_hostname=host) as ssock:
            der = ssock.getpeercert(binary_form=True)
            pem_chain.append(ssl.DER_cert_to_PEM_cert(der))

    return "\n".join(pem_chain)


async def get_harbor_ca_crt(image: str) -> Dict[str, str]:
    """
    获取 harbor CA：
    1. Redis 缓存优先
    2. 没有则动态抓取
    """

    registry = image.split("/")[0]
    redis_key = f"{REGISTRY_CA_REDIS_KEY_PREFIX}{registry}"

    redis_client = settings.REDIS_CLIENT
    if redis_client is None:
        raise RuntimeError("redis client is not initialized")
    # 先查缓存
    cached = await redis_client.get(redis_key)
    if cached:
        return {"harbor-ca.crt": cached}

    # 动态抓取
    ca_pem = await fetch_registry_ca(registry)

    # 写入 Redis
    await redis_client.set(redis_key, ca_pem)

    return {"harbor-ca.crt": ca_pem}

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Union

from fastapi import Depends
from fastapi_pagination import Page, Params

from app.models.models import JwtUserInfo
from app.repository.image_build_log_mapper import ImageBuildLogMapper
from app.repository.repository_image_mapper import RepositoryImageMapper
from app.schemas.inference_task import BackendEnum
from app.schemas.repository_image import (
    RepositoryImageResponse, RepositoryImageCreate, RepositoryImageDetailResponse, ImageType, CardType, CardModel,
    CudaVersion, SaveNotebookAsImageRequest, SaveNotebookAsImageResponse, ImageBuildLogLogResponse,
    ImageBuildLogResponse, ImageSource, NotebookBuildingResponse, AddImageRequest
)
from app.services.tag.interface import TagService


class RepositoryImageService(ABC):
    """镜像仓库镜像服务抽象接口类"""

    def __init__(self, mapper: RepositoryImageMapper, build_log_mapper: ImageBuildLogMapper,
                 tag_service: TagService) -> None:
        self.mapper = mapper
        self.build_log_mapper = build_log_mapper
        self.tag_service = tag_service

    @abstractmethod
    async def list_repository_images(
        self,
        page: int,
        page_size: int,
        image_name: Optional[str] = None,
        image_type: Optional[ImageType] = None,
        image_source: Optional[ImageSource] = None
    ) -> Page[RepositoryImageResponse]:
        """获取镜像列表（分页）"""
        pass

    @abstractmethod
    async def create_repository_image(
        self,
        repository_image_create: RepositoryImageCreate,
        current_user: JwtUserInfo
    ) -> RepositoryImageResponse:
        """创建镜像（管理员）"""
        pass

    @abstractmethod
    async def find_repository_image(
        self,
        image_id: int
    ) -> RepositoryImageDetailResponse:
        """获取镜像详情"""
        pass

    @abstractmethod
    async def update_repository_image(
        self,
        image_id: int,
        repository_image_update: RepositoryImageCreate,
        current_user: JwtUserInfo
    ) -> RepositoryImageResponse:
        """修改镜像（管理员）"""
        pass

    @abstractmethod
    async def delete_repository_image(
        self,
        image_id: int
    ) -> None:
        """删除镜像（管理员）"""
        pass

    @abstractmethod
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
        pass

    @abstractmethod
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
        pass

    @abstractmethod
    async def image_verification(
        self,
        image_create: RepositoryImageCreate,
        repository_name: str,
        image_id: Optional[int] = None
    ) -> None:
        """校验镜像是否符合创建/更新条件"""
        pass

    @abstractmethod
    async def get_by_id(self, id_field_value):
        pass


    @abstractmethod
    async def list_namespaces_list(
            self,
            repository_id: int,
            search_type: int,
            namespaces: Optional[str] = None,
            image_name: Optional[str] = None,
            params: Params = Depends()
    ) -> Page[str]:
        """获取镜像列表，使用 fastapi-pagination 进行分页"""
        pass

    @abstractmethod
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
        """根据类型获取集群id关联的镜像列表-如基础模型下载镜像无法获取项目id只能获取到集群id"""
        pass

    @abstractmethod
    async def save_notebook_as_image(
        self,
        project_id: int,
        notebook_id: int,
        notebook_as_image_request: SaveNotebookAsImageRequest,
        current_user: JwtUserInfo
    ) -> SaveNotebookAsImageResponse:
        """保存 notebook 环境为自定义镜像"""
        pass


    @abstractmethod
    async def build_image_completed(
        self,
        id: int
    ) -> RepositoryImageResponse:
        """镜像构建任务完成后处理"""
        pass

    @abstractmethod
    async def build_image_failed(
            self,
            id: int
    ):
        """镜像构建任务失败后处理"""
        pass

    @abstractmethod
    async def get_image_build_logs(
        self,
        task_id: int,
        end_time: datetime,
        days: Optional[int] = 30
    ) -> ImageBuildLogLogResponse:
        """获取镜像构建任务日志"""
        pass

    @abstractmethod
    async def get_image_build_logs_by_time_range(
        self,
        task_id: int,
        start_time: datetime,
        end_time: datetime
    ) -> ImageBuildLogLogResponse:
        """根据时间范围获取镜像构建任务日志"""
        pass

    @abstractmethod
    async def list_custom_images(
        self,
        project_id: int,
        business_type:str,
        page: Optional[Page] = None,
        size: Optional[int] = None,
        image_name: Optional[str] = None,
        image_type: Optional[ImageType] = None,
        status: Optional[str] = None,
        tag_element_ids: Optional[List[int]] = None
    ) -> Page[ImageBuildLogResponse]:
        """获取项目下的镜像构建记录列表（分页）"""
        pass

    @abstractmethod
    async def delete_image_build_log(
        self,
        build_log_id: int
    ) -> None:
        """删除镜像构建记录（只能删除失败或完成的记录，同时删除repository_images表中的镜像）"""
        pass

    @abstractmethod
    async def add_image(
        self,
        project_id: int,
        request: AddImageRequest,
        current_user: JwtUserInfo
    ) -> ImageBuildLogResponse:
        """添加镜像到镜像构建记录"""
        pass

    @abstractmethod
    async def is_notebook_building(
        self,
        notebook_id: int
    ) -> NotebookBuildingResponse:
        """检查 notebook 是否正在构建镜像"""
        pass
from abc import ABC, abstractmethod
from typing import Optional

from fastapi import Depends
from fastapi_pagination import Page, Params

from app.models.models import Project, JwtUserInfo
from app.repository.project_mapper import ProjectMapper
from app.schemas import ProjectResponse, ProjectCreate
from app.schemas.project import ProjectDetailResponse, ProjectImageBuildNamespace
from app.schemas.user import ProjectUserBatchResponse, UserIds
from app.schemas.user_page_payload import UserPagePayload, UserBasePagePayload
from app.services.notebook.interface import NotebookService
from app.services.user.interface import UserService


class ProjectService(ABC):

    def __init__(self, user_service: UserService, notebook_service: NotebookService, mapper: ProjectMapper):
        self.mapper = mapper
        self.user_service = user_service
        self.notebook_service = notebook_service
        pass

    @abstractmethod
    async def list(self, current_user: JwtUserInfo,params: Params = Depends()) -> Page[ProjectResponse]:
        pass

    @abstractmethod
    async def create(self, project: ProjectCreate, current_user: JwtUserInfo) -> Project:
        pass

    @abstractmethod
    async def get_by_id(self, project_id: int, current_user: Optional[JwtUserInfo] = None) -> ProjectDetailResponse:
        pass

    @abstractmethod
    async def is_existed(self, project_id: int) -> bool:
        pass

    @abstractmethod
    async def update_by_id(self, project_id: int, project: ProjectCreate,current_user:JwtUserInfo) -> Project:
        pass

    @abstractmethod
    async def delete(self, project_id: int):
        pass

    @abstractmethod
    async def project_users_list(self, project_id: int,
                                 username: Optional[str],
                                 page: int,
                                 size: int) -> UserPagePayload:
        pass

    @abstractmethod
    async def project_not_associated_users_list(self, project_id: int,
                                                username: Optional[str],
                                                page: int,
                                                size: int) -> UserBasePagePayload:
        pass

    @abstractmethod
    async def project_user_batch_save(self, project_id: int,
                                      request: UserIds,
                                      admin_user: JwtUserInfo) -> ProjectUserBatchResponse:
        pass

    @abstractmethod
    async def project_user_batch_remove(self, project_id: int, request: UserIds, current_user: JwtUserInfo) -> ProjectUserBatchResponse:
        pass

    @abstractmethod
    async def set_sa_permission_all_projects(self):
        pass

    @abstractmethod
    async def set_project_read_only_pvc_all(self):
        pass

    @abstractmethod
    async def update_project_image_build_namespace(self, project_id: int, namespace: ProjectImageBuildNamespace) -> ProjectImageBuildNamespace:
        pass

    @abstractmethod
    async def get_project_image_build_namespace(self, project_id: int):
        pass
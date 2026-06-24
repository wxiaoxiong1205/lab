from abc import ABC, abstractmethod
from typing import Optional

from fastapi_pagination import Page

from app.models.models import JwtUserInfo
from app.repository.base_mapper import BaseMapper
from app.schemas.advanced_template import (
    AdvancedTemplateCreate,
    AdvancedTemplateFieldCreate,
    AdvancedTemplateFieldReorderRequest,
    AdvancedTemplateFieldResponse,
    AdvancedTemplateFieldUpdate,
    AdvancedTemplateResponse,
    AdvancedTemplateUpdate,
    AdvancedTemplateYamlCreate,
    AdvancedTemplateYamlToJsonRequest,
    AdvancedTemplateYamlToJsonResponse,
    AdvancedTemplateYamlUpdate,
)


class AdvancedTemplateService(ABC):
    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper

    @abstractmethod
    async def list_templates(
        self,
        domain: Optional[str] = None,
        template_type: Optional[str] = None,
        status: Optional[str] = None,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[AdvancedTemplateResponse]:
        pass

    @abstractmethod
    async def create_template(
        self,
        payload: AdvancedTemplateCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def create_template_from_yaml(
        self,
        payload: AdvancedTemplateYamlCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def yaml_to_json(
        self,
        payload: AdvancedTemplateYamlToJsonRequest,
    ) -> AdvancedTemplateYamlToJsonResponse:
        pass

    @abstractmethod
    async def get_template(self, template_id: int) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def copy_template(
        self,
        template_id: int,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def delete_template(self, template_id: int) -> None:
        pass

    @abstractmethod
    async def update_template(
        self,
        template_id: int,
        payload: AdvancedTemplateUpdate,
    ) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def update_template_from_yaml(
        self,
        template_id: int,
        payload: AdvancedTemplateYamlUpdate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def create_field(
        self,
        template_id: int,
        payload: AdvancedTemplateFieldCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateFieldResponse:
        pass

    @abstractmethod
    async def update_field(
        self,
        template_id: int,
        field_id: int,
        payload: AdvancedTemplateFieldUpdate,
    ) -> AdvancedTemplateFieldResponse:
        pass

    @abstractmethod
    async def reorder_fields(
        self,
        template_id: int,
        payload: AdvancedTemplateFieldReorderRequest,
    ) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def enable_template(self, template_id: int) -> AdvancedTemplateResponse:
        pass

    @abstractmethod
    async def disable_template(self, template_id: int) -> AdvancedTemplateResponse:
        pass

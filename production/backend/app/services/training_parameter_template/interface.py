from abc import ABC, abstractmethod
from typing import Optional

from fastapi_pagination import Page

from app.models.models import JwtUserInfo
from app.repository.training_parameter_template_mapper import TrainingParameterTemplateMapper
from app.schemas.training_parameter_template import (
    TrainingParameterTemplateCopyRequest,
    TrainingParameterTemplateCreateRequest,
    TrainingParameterTemplateResponse,
    TrainingParameterTemplateUpdateRequest,
    TrainingTemplateMethod,
)


class TrainingParameterTemplateService(ABC):
    def __init__(self, mapper: TrainingParameterTemplateMapper) -> None:
        self.mapper = mapper

    @abstractmethod
    async def list_templates(
        self,
        training_method: Optional[TrainingTemplateMethod],
        enabled: Optional[bool],
        name: Optional[str],
        page: int,
        size: int,
    ) -> Page[TrainingParameterTemplateResponse]:
        pass

    @abstractmethod
    async def create_template(
        self,
        current_user: JwtUserInfo,
        request: TrainingParameterTemplateCreateRequest,
    ) -> TrainingParameterTemplateResponse:
        pass

    @abstractmethod
    async def update_template(
        self,
        template_id: int,
        request: TrainingParameterTemplateUpdateRequest,
    ) -> TrainingParameterTemplateResponse:
        pass

    @abstractmethod
    async def copy_template(
        self,
        template_id: int,
        current_user: JwtUserInfo,
        request: TrainingParameterTemplateCopyRequest,
    ) -> TrainingParameterTemplateResponse:
        pass

    @abstractmethod
    async def delete_template(self, template_id: int) -> None:
        pass

    @abstractmethod
    async def toggle_template(self, template_id: int, enabled: bool) -> TrainingParameterTemplateResponse:
        pass

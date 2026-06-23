from typing import Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, Query, status
from fastapi_pagination import Page

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.training_parameter_template import (
    TrainingParameterTemplateCopyRequest,
    TrainingParameterTemplateCreateRequest,
    TrainingParameterTemplateResponse,
    TrainingParameterTemplateUpdateRequest,
    TrainingTemplateMethod,
)
from app.services.training_parameter_template.interface import TrainingParameterTemplateService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/training-parameter-templates", tags=["training-parameter-templates"])


@router.get("", response_model=Page[TrainingParameterTemplateResponse])
@inject
async def list_training_parameter_templates(
    training_method: Optional[TrainingTemplateMethod] = Query(None, description="训练方法"),
    enabled: Optional[bool] = Query(None, description="是否启用"),
    name: Optional[str] = Query(None, description="模板名称，支持模糊查询"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量"),
    service: TrainingParameterTemplateService = Depends(Provide[AutoContainer.training_parameter_template_service]),
) -> Page[TrainingParameterTemplateResponse]:
    return await service.list_templates(training_method, enabled, name, page, size)


@router.post("", response_model=TrainingParameterTemplateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_training_parameter_template(
    request: TrainingParameterTemplateCreateRequest,
    current_user: JwtUserInfo = Depends(get_current_user),
    service: TrainingParameterTemplateService = Depends(Provide[AutoContainer.training_parameter_template_service]),
) -> TrainingParameterTemplateResponse:
    return await service.create_template(current_user, request)


@router.put("/{template_id}", response_model=TrainingParameterTemplateResponse)
@inject
async def update_training_parameter_template(
    request: TrainingParameterTemplateUpdateRequest,
    template_id: int = Path(..., description="模板ID"),
    service: TrainingParameterTemplateService = Depends(Provide[AutoContainer.training_parameter_template_service]),
) -> TrainingParameterTemplateResponse:
    return await service.update_template(template_id, request)


@router.post("/{template_id}/copy", response_model=TrainingParameterTemplateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def copy_training_parameter_template(
    request: TrainingParameterTemplateCopyRequest,
    template_id: int = Path(..., description="模板ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    service: TrainingParameterTemplateService = Depends(Provide[AutoContainer.training_parameter_template_service]),
) -> TrainingParameterTemplateResponse:
    return await service.copy_template(template_id, current_user, request)


@router.patch("/{template_id}/enabled", response_model=TrainingParameterTemplateResponse)
@inject
async def toggle_training_parameter_template(
    enabled: bool = Query(..., description="是否启用"),
    template_id: int = Path(..., description="模板ID"),
    service: TrainingParameterTemplateService = Depends(Provide[AutoContainer.training_parameter_template_service]),
) -> TrainingParameterTemplateResponse:
    return await service.toggle_template(template_id, enabled)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_training_parameter_template(
    template_id: int = Path(..., description="模板ID"),
    service: TrainingParameterTemplateService = Depends(Provide[AutoContainer.training_parameter_template_service]),
) -> None:
    await service.delete_template(template_id)

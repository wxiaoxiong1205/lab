from typing import Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, status
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
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
from app.services.advanced_template.interface import AdvancedTemplateService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/advanced-templates", tags=["advanced-templates"])


@router.get("", response_model=Page[AdvancedTemplateResponse])
@inject
async def list_templates(
    domain: Optional[str] = Query(None, description="使用领域"),
    template_type: Optional[str] = Query(None, description="模板类型"),
    status: Optional[str] = Query(None, description="状态"),
    name: Optional[str] = Query(None, description="模板名称，支持模糊搜索"),
    page: Optional[int] = Query(None, ge=1, description="页码"),
    size: Optional[int] = Query(None, ge=1, le=1000, description="每页数量"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> Page[AdvancedTemplateResponse]:
    """获取高级模板列表。"""
    db, current_user = deps
    return await advanced_template_service.list_templates(domain, template_type, status, name, page, size)


@router.post("", response_model=AdvancedTemplateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_template(
    payload: AdvancedTemplateCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """新增高级模板。"""
    db, current_user = deps
    return await advanced_template_service.create_template(payload, current_user)


@router.post("/from-yaml", response_model=AdvancedTemplateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_template_from_yaml(
    payload: AdvancedTemplateYamlCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """通过 YAML 内容新增高级模板。"""
    db, current_user = deps
    return await advanced_template_service.create_template_from_yaml(payload, current_user)


@router.post("/yaml-to-json", response_model=AdvancedTemplateYamlToJsonResponse)
@inject
async def yaml_to_json(
    payload: AdvancedTemplateYamlToJsonRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateYamlToJsonResponse:
    """将 YAML 内容转换为模板字段 JSON。"""
    db, current_user = deps
    return await advanced_template_service.yaml_to_json(payload)


@router.get("/{template_id}", response_model=AdvancedTemplateResponse)
@inject
async def get_template(
    template_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """获取高级模板详情。"""
    db, current_user = deps
    return await advanced_template_service.get_template(template_id)


@router.post("/{template_id}/copy", response_model=AdvancedTemplateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def copy_template(
    template_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """复制高级模板。"""
    db, current_user = deps
    return await advanced_template_service.copy_template(template_id, current_user)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_template(
    template_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> None:
    """删除高级模板。"""
    db, current_user = deps
    await advanced_template_service.delete_template(template_id)


@router.put("/{template_id}", response_model=AdvancedTemplateResponse)
@inject
async def update_template(
    template_id: int,
    payload: AdvancedTemplateUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """编辑高级模板主信息。"""
    db, current_user = deps
    return await advanced_template_service.update_template(template_id, payload)


@router.put("/{template_id}/from-yaml", response_model=AdvancedTemplateResponse)
@inject
async def update_template_from_yaml(
    template_id: int,
    payload: AdvancedTemplateYamlUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """通过 YAML 内容编辑高级模板。"""
    db, current_user = deps
    return await advanced_template_service.update_template_from_yaml(template_id, payload, current_user)


@router.post("/{template_id}/fields", response_model=AdvancedTemplateFieldResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_field(
    template_id: int,
    payload: AdvancedTemplateFieldCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateFieldResponse:
    """新增模板字段。"""
    db, current_user = deps
    return await advanced_template_service.create_field(template_id, payload, current_user)


@router.put("/{template_id}/fields/reorder", response_model=AdvancedTemplateResponse)
@inject
async def reorder_fields(
    template_id: int,
    payload: AdvancedTemplateFieldReorderRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """调整模板字段排序。"""
    db, current_user = deps
    return await advanced_template_service.reorder_fields(template_id, payload)


@router.put("/{template_id}/fields/{field_id}", response_model=AdvancedTemplateFieldResponse)
@inject
async def update_field(
    template_id: int,
    field_id: int,
    payload: AdvancedTemplateFieldUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateFieldResponse:
    """编辑模板字段。"""
    db, current_user = deps
    return await advanced_template_service.update_field(template_id, field_id, payload)


@router.post("/{template_id}/enable", response_model=AdvancedTemplateResponse)
@inject
async def enable_template(
    template_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """启用模板。"""
    db, current_user = deps
    return await advanced_template_service.enable_template(template_id)


@router.post("/{template_id}/disable", response_model=AdvancedTemplateResponse)
@inject
async def disable_template(
    template_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    advanced_template_service: AdvancedTemplateService = Depends(Provide[AutoContainer.advanced_template_service]),
) -> AdvancedTemplateResponse:
    """停用模板。"""
    db, current_user = deps
    return await advanced_template_service.disable_template(template_id)

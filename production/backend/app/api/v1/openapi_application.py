import logging
from typing import Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, Query, status
from fastapi_pagination import Page

from app.core.depend_manager import AutoContainer
from app.schemas.openapi_application import (
    OpenAPIApplicationCreateRequest,
    OpenAPIApplicationDeleteRequest,
    OpenAPIApplicationResponse,
    OpenAPIApplicationUpdateRequest,
)
from app.services.openapi_application.interface import OpenAPIApplicationService


router = APIRouter(prefix="/api/v1/openapi-applications", tags=["openapi-applications"])
logger = logging.getLogger(__name__)


@router.post("/create", response_model=bool, status_code=status.HTTP_201_CREATED)
@inject
async def create_openapi_application(
    request: OpenAPIApplicationCreateRequest,
    openapi_application_service: OpenAPIApplicationService = Depends(Provide[AutoContainer.open_apiapplication_service]),
) -> bool:
    return await openapi_application_service.create(request)


@router.put("/{application_id}/update", response_model=bool, status_code=status.HTTP_200_OK)
@inject
async def update_openapi_application(
    request: OpenAPIApplicationUpdateRequest,
    application_id: int = Path(..., description="应用ID"),
    openapi_application_service: OpenAPIApplicationService = Depends(Provide[AutoContainer.open_apiapplication_service]),
) -> bool:
    return await openapi_application_service.update(application_id, request)


@router.get("/list", response_model=Page[OpenAPIApplicationResponse], description="OpenAPI 应用分页查询")
@inject
async def list_openapi_applications(
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, description="每页数量"),
    name: Optional[str] = Query(None, description="应用名称，模糊查询"),
    group_id: Optional[str] = Query(None, description="分组ID"),
    key_id: Optional[str] = Query(None, description="Key ID"),
    openapi_application_service: OpenAPIApplicationService = Depends(Provide[AutoContainer.open_apiapplication_service]),
) -> Page[OpenAPIApplicationResponse]:
    return await openapi_application_service.list_applications(
        page_num=page,
        page_size=size,
        name=name,
        group_id=group_id,
        key_id=key_id,
    )


@router.get("/detail/{application_id}", response_model=OpenAPIApplicationResponse, status_code=status.HTTP_200_OK)
@inject
async def detail_openapi_application(
    application_id: int = Path(..., description="应用ID"),
    openapi_application_service: OpenAPIApplicationService = Depends(Provide[AutoContainer.open_apiapplication_service]),
) -> OpenAPIApplicationResponse:
    return await openapi_application_service.detail(application_id)


@router.delete("/delete", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_openapi_application(
    request: OpenAPIApplicationDeleteRequest,
    openapi_application_service: OpenAPIApplicationService = Depends(Provide[AutoContainer.open_apiapplication_service]),
) -> None:
    await openapi_application_service.delete(request.ids)

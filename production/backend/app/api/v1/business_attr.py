import logging
from typing import List, Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, status, Query
from fastapi_pagination import Page

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.business_attr import (
    BusinessAttrCreateRequest,
    BusinessAttrDeleteRequest,
    BusinessAttrResponse,
    BusinessAttrQueryParams,
    BusinessAttrUpdateRequest,
    GroupedBusinessAttrItem,
)
from app.schemas.menu import MenuItem
from app.services.business_attr.interface import BusinessAttrService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/business-attr", tags=["business-attr"])
logger = logging.getLogger(__name__)


@router.get("/app-menu", response_model=List[MenuItem], description="获取应用菜单，调用外部菜单API")
@inject
async def get_app_menu(
    business_attr_service: BusinessAttrService = Depends(Provide[AutoContainer.business_attr_service]),
) -> List[MenuItem]:
    return await business_attr_service.get_app_menu()


@router.post("/create", response_model=bool, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BUSINESS_ATTR, table_name="business_attr",
                        operator_type=OperatorType.ADD, operator_content_key=["request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_business_attr(
    request: BusinessAttrCreateRequest,
    current_user: JwtUserInfo = Depends(get_current_user),
    business_attr_service: BusinessAttrService = Depends(Provide[AutoContainer.business_attr_service])
) -> bool:
    return await business_attr_service.create(current_user, request)


@router.put("/{attr_id}/update", response_model=bool, status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BUSINESS_ATTR, table_name="business_attr",
                        operator_type=OperatorType.EDIT, operator_content_key=["request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_business_attr(
    request: BusinessAttrUpdateRequest,
    attr_id: int = Path(..., description="属性ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    business_attr_service: BusinessAttrService = Depends(Provide[AutoContainer.business_attr_service])
) -> bool:
    return await business_attr_service.update(attr_id, current_user, request)


@router.get("/list", response_model=Page[BusinessAttrResponse], description="属性查询接口，支持分页和名称模糊查询")
@inject
async def list_business_attrs(
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, description="每页数量"),
    query_params: BusinessAttrQueryParams = Depends(),
    business_attr_service: BusinessAttrService = Depends(Provide[AutoContainer.business_attr_service])
) -> Page[BusinessAttrResponse]:
    return await business_attr_service.list_attrs(
        page_num=page,
        page_size=size,
        query_params=query_params,
    )


@router.get("/list-by-group", response_model=List[GroupedBusinessAttrItem], description="属性查询接口，按 group 分组返回，支持名称模糊查询和业务类型筛选")
@inject
async def list_business_attrs_grouped(
    query_params: BusinessAttrQueryParams = Depends(),
    business_attr_service: BusinessAttrService = Depends(Provide[AutoContainer.business_attr_service])
) -> List[GroupedBusinessAttrItem]:
    return await business_attr_service.list_attrs_grouped(query_params=query_params)


@router.delete("/delete", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BUSINESS_ATTR, table_name="business_attr",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def delete_business_attr(
    request: BusinessAttrDeleteRequest,
    business_attr_service: BusinessAttrService = Depends(Provide[AutoContainer.business_attr_service])
    ):
    await business_attr_service.delete(request.ids)

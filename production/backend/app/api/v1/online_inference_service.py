import logging
from typing import Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, status, Query
from fastapi_pagination import Page

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.common import ResModel
from app.schemas.inference_service import InferenceServiceCreateRequest, \
    InferenceServiceDeleteRequest, InferenceServiceUpdateRequest, InferenceServiceTestRequest, \
    InferenceServiceListItemResponse, InferenceServiceDetailResponse
from app.schemas.workbench_page import WorkbenchPagePayload
from app.services.inference_service.interface import InferenceServiceService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/online_inference_service", tags=["online_inference_service"])
logger = logging.getLogger(__name__)


@router.get("/project/{project_id}/list", response_model=Page[InferenceServiceListItemResponse], description="在线推理服务查询接口，支持分页和状态筛选")
@inject
async def list_inference_services(
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, description="每页数量"),
    name: Optional[str] = Query(None, description="服务名称"),
    status: Optional[str] = Query(None, description="服务连接状态筛选，可选值：未测试、测试通过、测试失败"),
    model_type: Optional[str] = Query(None, description="模型类型筛选"), # 这里前端提供的是模型类型的value，而不是描述，而数据库中保存的是描述
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_service_service: InferenceServiceService = Depends(Provide[AutoContainer.inference_service_service])
) -> Page[InferenceServiceListItemResponse]:
    services = await inference_service_service.list_services(
        project_id=project_id,
        current_user=current_user,
        page_num=page,
        page_size=size,
        name=name,
        status=status,
        model_type=model_type
    )
    return services

@router.get("/project/{project_id}/detail/{service_id}", response_model=InferenceServiceDetailResponse, status_code=status.HTTP_200_OK ,description="获取在线推理服务详情")
@inject
async def get_inference_service_detail(
    project_id: int = Path(..., description="项目ID"),
    service_id: int = Path(..., description="服务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_service_service: InferenceServiceService = Depends(Provide[AutoContainer.inference_service_service])
) -> InferenceServiceDetailResponse:
    service_detail = await inference_service_service.get_service_detail(project_id=project_id, current_user=current_user, service_id=service_id)
    return service_detail



@router.post("/project/{project_id}/create", response_model=bool, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.ONLINE_INFERENCE_SERVICE, table_name="inference_service",
                        operator_type=OperatorType.ADD, operator_content_key=["request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_inference_service(
    request: InferenceServiceCreateRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_service_service: InferenceServiceService = Depends(Provide[AutoContainer.inference_service_service])
) -> bool:
    service = await inference_service_service.create(project_id, current_user, request)
    return service


@router.delete("/project/{project_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.ONLINE_INFERENCE_SERVICE, table_name="inference_service",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_inference_service(
    request: InferenceServiceDeleteRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_service_service: InferenceServiceService = Depends(Provide[AutoContainer.inference_service_service])
    ):
    await inference_service_service.delete(project_id, request.ids)

@router.put("/project/{project_id}/update", response_model=bool, status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.ONLINE_INFERENCE_SERVICE, table_name="inference_service",
                        operator_type=OperatorType.EDIT, operator_content_key=["request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_inference_service(
    request: InferenceServiceUpdateRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_service_service: InferenceServiceService = Depends(Provide[AutoContainer.inference_service_service])
) -> bool:
    result = await inference_service_service.update(project_id, current_user, request)
    return result

@router.post("/project/{project_id}/test_connectivity", response_model=bool, status_code=status.HTTP_200_OK)
@inject
async def test_inference_service_connectivity(
    request: InferenceServiceTestRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_service_service: InferenceServiceService = Depends(Provide[AutoContainer.inference_service_service])
) -> bool:
    result = await inference_service_service.test_connectivity(project_id, current_user, request)
    return result
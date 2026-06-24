import json
import logging
from typing import List, Optional, Any

import requests
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
from app.schemas.third_party_api import ThirdPartyApiCreate, ThirdPartyApiListResponse, ThirdPartyApiDetailResponse, \
    ThirdPartyApiDeleteRequest, ThirdPartyApiUpdateRequest, ThirdPartyApiVerifyConnectRequest, \
    ThirdPartyApiVerifyConnectResponse, ThirdPartyApiBindingFileds
from app.schemas.workbench_page import WorkbenchPagePayload
from app.services.inference_service.interface import InferenceServiceService
from app.services.third_party_api.interface import ThirdPartyApiService
from app.services.training_dataset.interface import TrainingDatasetService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/third_party_api", tags=["third_party_api"])
logger = logging.getLogger(__name__)




@router.post("/project/{project_id}/create", response_model=bool, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.THIRD_PARTY_INTERFACE, table_name="third_party_api",
                        operator_type=OperatorType.ADD, operator_content_key=["request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_third_party_api(
    request: ThirdPartyApiCreate,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> bool:
    """在指定项目下创建第三方 API。

    ## 功能说明
    - 创建第三方 API 基础信息（name、base_url、header、request_param、response_param 等）
    - 可选携带 **attr_values**（关联属性值及属性值选项），业务类型需为 `api_service`

    ### attr_values 说明
    - 不传则仅创建 API 基础信息
    - 必传字段：每项必须传 attr_id、name、input_type、group、data_type、required_tag、business_type（固定为 `api_service`）；
    - 可选传 attr_value、value_order、options；若 input_type 为「下拉选择」则 multi_select 必填。
    - required_tag=1（必填）时：input_type 为「手动输入」则 attr_value 要有值；input_type 为「下拉选择」则 options 要有值

    ## 请求示例

    ### 示例：带属性值的创建
    ```json
    {
      "name": "示例外部API",
      "description": "调用示例服务的接口",
      "base_url": "https://api.example.com/v1/chat",
      "header": [
        {"name": "Content-Type", "value": "application/json"},
        {"name": "Authorization", "value": "Bearer xxx"}
      ],
      "request_param": [
        {"name": "model", "binding": false, "data_type": "string", "default_value": "gpt-3.5"}
      ],
      "response_param": [
        {"name": "choices", "binding": false, "data_type": "array", "child": []}
      ],
      "request_type": "POST",
      "protocol": "application/json",
      "attr_values": [
        {
          "attr_id": 1,
          "name": "环境",
          "attr_value": "生产",
          "input_type": "手动输入",
          "value_order": 0,
          "required_tag": 1,
          "data_type": "string",
          "multi_select": 0,
          "business_type": "api_service",
          "group": "分组1",
          "options": []
        },
        {
          "attr_id": 2,
          "name": "用途",
          "attr_value": null,
          "input_type": "下拉选择",
          "value_order": 0,
          "required_tag": 0,
          "data_type": "string",
          "multi_select": 1,
          "business_type": "api_service",
          "group": "分组2",
          "options": [
            {"option_value": "评测", "option_order": 0},
            {"option_value": "训练", "option_order": 1}
          ]
        }
      ]
    }
    ```
    """
    api = await third_party_api_service.create(project_id, current_user, request)
    return api

@router.get("/project/{project_id}/list", response_model=Page[ThirdPartyApiListResponse], status_code=status.HTTP_200_OK)
@inject
async def list_third_party_api(
    page_num: int=Query(1,description="页码"),
    page_size: int=Query(1,description="每页条数"),
    name: str=Query(None,description="Api名称"),
    status: str = Query(None, description="Api连接状态"),
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> Page[ThirdPartyApiListResponse]:

    api = await third_party_api_service.list_api(project_id, current_user, page_num,page_size,name,status)
    return api


@router.get("/project/{project_id}/detail/{api_id}", response_model=ThirdPartyApiDetailResponse, status_code=status.HTTP_200_OK)
@inject
async def detail_third_party_api(
    api_id: int=Path(description="api主键ID"),
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> ThirdPartyApiDetailResponse:

    api = await third_party_api_service.get_api_detail(project_id, current_user, api_id)
    return api



@router.delete("/project/{project_id}/delete",  status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_third_party_api(
    request: ThirdPartyApiDeleteRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> None:
    await third_party_api_service.delete(project_id, request.ids)

@router.put("/project/{project_id}/update", response_model=bool, status_code=status.HTTP_200_OK)
@inject
async def update_third_party_api(
    request: ThirdPartyApiUpdateRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> bool:
    """更新指定项目下的第三方 API。

    ## 功能说明
    - 根据请求体中的 `id` 更新对应 API 的基础信息（name、description、base_url、header、request_param、response_param 等）
    - 可选携带 **attr_values**（关联属性值及选项），传入则按条更新，不传则不改动已有属性值

    ### attr_values 说明
    - 每项需包含 **id**（属性值 ID，用于定位要更新的记录）
    - 可更新字段：仅 **attr_value** 或 **options**（手动输入类更新 attr_value，下拉选择类更新 options）
    - options 传入则覆盖该属性值下的原选项；不传则保留原选项
    - required_tag=1（必填）时：input_type 为「手动输入」则 attr_value 要有值；input_type 为「下拉选择」则 options 要有值

    ## 请求示例

    ### 示例：更新 API 基础信息并更新部分属性值
    ```json
    {
      "id": 1,
      "name": "示例外部API_更新",
      "description": "更新后的描述",
      "attr_values": [
        {
          "id": 10,
          "attr_value": "预发",
          "data_type": "string",
          "input_type": "手动输入",
          "required_tag": 1
        },
        {
          "id": 11,
          "attr_value": null,
          "input_type": "下拉选择",
          "required_tag": 1,
          "options": [
            {"option_value": "评测", "option_order": 0},
            {"option_value": "训练", "option_order": 1},
            {"option_value": "推理", "option_order": 2}
          ]
        }
      ]
    }
    ```
    """
    api = await third_party_api_service.update(project_id, current_user, request)
    return api


@router.post("/project/{project_id}/verify_connect",response_model=ThirdPartyApiVerifyConnectResponse,   status_code=status.HTTP_200_OK)
@inject
async def verify_connect_third_party_api(
    request: ThirdPartyApiVerifyConnectRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> ThirdPartyApiVerifyConnectResponse:
    data = await third_party_api_service.verify_connect(project_id, current_user, request)
    return data


@router.get("/project/{project_id}/binding_fields/{api_id}", response_model=ThirdPartyApiBindingFileds, status_code=status.HTTP_200_OK)
@inject
async def third_party_api_binding_fields(
    api_id: int=Path(description="api主键ID"),
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> ThirdPartyApiBindingFileds:

    api = await third_party_api_service.get_api_binding_field_info(project_id, current_user, api_id)
    return api


@router.get("/project/{project_id}/business_dataset_matedata/{dataset_id}", response_model=Any, status_code=status.HTTP_200_OK)
@inject
async def third_party_api_binding_fields(
    dataset_id: int=Path(description="api主键ID"),
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
    third_party_api_service: ThirdPartyApiService = Depends(Provide[AutoContainer.third_party_api_service])
) -> Any:


    api = await third_party_api_service.business_dataset_matedata(project_id, current_user, dataset_id,training_dataset_service)
    return api


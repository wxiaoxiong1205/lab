import logging
from typing import Optional

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, Query, status
from starlette.responses import Response
from fastapi_pagination import Page

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.schemas.machine_learning_dataset import MachineLearningDatasetTemplateType
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.online_annotation_service import (
    OnlineAnnotationAiProxyRequest,
    OnlineAnnotationServiceCreateRequest,
    OnlineAnnotationServiceResponse,
    OnlineAnnotationServiceStatus,
    OnlineAnnotationServiceTestRequest,
    OnlineAnnotationServiceUpdateRequest,
)
from app.services.online_annotation_service.interface import OnlineAnnotationService
from app.utils.auth import get_current_user


router = APIRouter(
    prefix="/api/v1/online_annotation_service",
    tags=["online-annotation-service"],
)
logger = logging.getLogger(__name__)


@router.post("/project/{project_id}/create", status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.ONLINE_ANNOTATION_SERVICE,
    table_name="annotation_service",
    operator_type=OperatorType.ADD,
    operator_content_key=["request.name"],
    self_service_field_mapping=None,
    scope_service_field_mapping=None,
)
async def create_online_annotation_service(
    request: OnlineAnnotationServiceCreateRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> bool:
    """
    在线标注服务创建接口。

    参数说明：
    - `project_id`：项目 ID，路径参数。
    - `name`：服务名称，项目内不可重复。
    - `description`：服务描述，可为空。
    - `base_url`：服务基础地址。
    - `category`：服务分类，默认 `machine_learning`。
    - `data_type`：数据类型，可选值参考 `MachineLearningDatasetDataType`，如 `text`、`image`。
    - `annotation_type`：标注类型，可选值：`text_classification`、`entity_recognition`、`image_classification`、`object_detection_bbox`、`image_segmentation`。
    - `template_type`：标注模板，可选值：`text_classification_single_label`、`text_classification_multi_label`、`entity_recognition`、`image_classification_single_label`、`image_classification_multi_label`、`object_detection_bbox`、`image_segmentation_instance`、`semantic_segmentation`。
    - `status`：服务状态，默认 `未测试`。

    请求样例：
    ```json
    {
      "name": "文本实体标注服务",
      "description": "用于文本实体识别标注",
      "base_url": "http://annotation.example.com",
      "category": "machine_learning",
      "data_type": "text",
      "annotation_type": "entity_recognition",
      "template_type": "entity_recognition",
      "status": "未测试"
    }
    ```
    """
    return await online_annotation_service.create(project_id, current_user, request)


@router.delete("/project/{project_id}/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.ONLINE_ANNOTATION_SERVICE,
    table_name="annotation_service",
    operator_type=OperatorType.DELETE,
    operator_content_key=None,
    self_service_field_mapping=None,
    scope_service_field_mapping=None,
)
async def delete_online_annotation_service(
    project_id: int = Path(..., description="项目ID"),
    service_id: int = Path(..., description="在线标注服务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> None:
    """
    在线标注服务删除接口。

    参数说明：
    - `project_id`：项目 ID，路径参数。
    - `service_id`：在线标注服务 ID，路径参数。

    请求样例：
    ```http
    DELETE /api/v1/online_annotation_service/project/1/100
    ```
    """
    _ = current_user
    await online_annotation_service.delete(project_id, service_id)


@router.put("/project/{project_id}/update", status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.ONLINE_ANNOTATION_SERVICE,
    table_name="annotation_service",
    operator_type=OperatorType.EDIT,
    operator_content_key=["request.name"],
    self_service_field_mapping=None,
    scope_service_field_mapping=None,
)
async def update_online_annotation_service(
    request: OnlineAnnotationServiceUpdateRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> bool:
    """
    在线标注服务更新接口。

    参数说明：
    - `project_id`：项目 ID，路径参数。
    - `id`：在线标注服务 ID，请求体参数。
    - `name`：服务名称，可选，项目内不可重复。
    - `description`：服务描述，可选。
    - `base_url`：服务基础地址，可选。
    - `category`：服务分类，可选。
    - `data_type`：数据类型，可选值参考 `MachineLearningDatasetDataType`，如 `text`、`image`。
    - `annotation_type`：标注类型，可选值：`text_classification`、`entity_recognition`、`image_classification`、`object_detection_bbox`、`image_segmentation`。
    - `template_type`：标注模板，可选值：`text_classification_single_label`、`text_classification_multi_label`、`entity_recognition`、`image_classification_single_label`、`image_classification_multi_label`、`object_detection_bbox`、`image_segmentation_instance`、`semantic_segmentation`。

    请求样例：
    ```json
    {
      "id": 100,
      "name": "文本实体标注服务-更新",
      "description": "更新后的服务描述",
      "base_url": "http://annotation.example.com",
      "category": "machine_learning",
      "data_type": "text",
      "annotation_type": "entity_recognition",
      "template_type": "entity_recognition",
    }
    ```
    """
    return await online_annotation_service.update(project_id, current_user, request)


@router.get(
    "/project/{project_id}/list",
    response_model=Page[OnlineAnnotationServiceResponse],
    description="在线标注服务分页查询接口",
)
@inject
async def list_online_annotation_services(
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, description="每页数量"),
    name: Optional[str] = Query(None, description="服务名称"),
    status: Optional[OnlineAnnotationServiceStatus] = Query(None, description="服务状态"),
    template_type: Optional[MachineLearningDatasetTemplateType] = Query(None, description="标注模板筛选"),
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> Page[OnlineAnnotationServiceResponse]:
    """
    在线标注服务分页查询接口。

    参数说明：
    - `project_id`：项目 ID，路径参数。
    - `page`：页码，默认 `1`。
    - `size`：每页数量，默认 `10`。
    - `name`：服务名称，支持模糊查询，可选。
    - `status`：服务状态筛选，可选，取值见 `OnlineAnnotationServiceStatus`（`未测试`、`测试通过`、`测试失败`）。
    - `template_type`：标注模板精确筛选，可选，取值与创建接口一致。

    请求样例：
    ```http
    GET /api/v1/online_annotation_service/project/1/list?page=1&size=10&name=文本&status=未测试&template_type=entity_recognition
    ```
    """
    return await online_annotation_service.list_services(
        project_id=project_id,
        current_user=current_user,
        page_num=page,
        page_size=size,
        name=name,
        status=status,
        template_type=template_type,
    )


@router.get(
    "/project/{project_id}/{service_id}",
    response_model=OnlineAnnotationServiceResponse,
    description="按项目 ID 与在线标注服务 ID 查询详情",
)
@inject
async def get_online_annotation_service_detail(
    project_id: int = Path(..., description="项目ID"),
    service_id: int = Path(..., description="在线标注服务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> OnlineAnnotationServiceResponse:
    """
    在线标注服务详情查询。

    - `project_id`：项目 ID。
    - `service_id`：在线标注服务 ID。

    请求样例：

    ```http
    GET /api/v1/online_annotation_service/project/1/100
    ```
    """
    return await online_annotation_service.get_detail(
        project_id, service_id, current_user
    )


@router.post("/project/{project_id}/test_connectivity", response_model=bool, status_code=status.HTTP_200_OK)
@inject
async def test_online_annotation_service_connectivity(
    request: OnlineAnnotationServiceTestRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> bool:
    """在线标注服务连通性测试：对存储的 base_url 去尾斜杠后拼 /health 发 GET，返回 JSON 中 status 为 UP 则更新为测试通过，否则测试失败。"""
    return await online_annotation_service.test_connectivity(project_id, current_user, request)


@router.post("/project/{project_id}/annotations/ai")
@inject
async def proxy_online_annotation_ai(
    request: OnlineAnnotationAiProxyRequest,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    online_annotation_service: OnlineAnnotationService = Depends(Provide[AutoContainer.online_annotation_service]),
) -> Response:
    """
    将 AI 预标注请求转发至 `predict_base_url` 去掉末尾斜杠后拼接 `/predict`，
    以 POST + JSON 发送 `tasks`、`project`、`label_config`，并将上游 HTTP 状态与响应体返回。
    """
    return await online_annotation_service.proxy_ai_annotation(
        project_id,
        current_user,
        request,
    )


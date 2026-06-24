import json
from typing import List, Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, Form, Path, Query, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi_pagination import Page, Params, pagination_ctx
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.custom_params import CustomParams
from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.machine_learning_dataset import (
    ExportFormat,
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetDataSource,
    MachineLearningDatasetDataType,
    MachineLearningDatasetSampleFileType,
    MachineLearningDatasetTaskType,
    MachineLearningDatasetTemplateType,
    TASK_EXPORT_FORMATS,
)
from app.schemas.openapi.v1.common import OpenApiPageData, OpenApiResponse, openapi_success
from app.schemas.openapi.v1.machine_learning_dataset import (
    OpenMachineLearningDataset,
    OpenMachineLearningDatasetBasicInfoUpdate,
    OpenMachineLearningDatasetCreateResponse,
    OpenMachineLearningDatasetDetail,
    OpenMachineLearningDatasetExportTaskResponse,
    OpenMachineLearningTaskExportFormats,
)
from app.services.machine_learning_dataset.interface import MachineLearningDatasetService
from app.services.openapi.v1.training_dataset_service import to_model, to_model_list, to_page_data
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/machine-learning-datasets", tags=["openapi-machine-learning-datasets"])


@router.post(
    "/dataset/{project_id}/version/upload",
    response_model=OpenApiResponse[OpenMachineLearningDatasetCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="上传机器学习数据集新版本",
    operation_id="openapi_v1_machine_learning_datasets_create_machine_learning_dataset_version",
)
@router.post(
    "/dataset/{project_id}/upload",
    response_model=OpenApiResponse[OpenMachineLearningDatasetCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="上传机器学习数据集",
    operation_id="openapi_v1_machine_learning_datasets_create_machine_learning_dataset_with_file",
)
@inject
async def create_machine_learning_dataset_with_file(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_name: str = Form(..., description="数据集名称。", min_length=1, max_length=100),
    chunk_upload_ids: Optional[str] = Form(None, description="上传文件 ID 列表，多个用英文逗号分隔；继承模式下可传入新增文件进行合并。"),
    data_type: Optional[MachineLearningDatasetDataType] = Form(None, description="数据类型；继承模式下使用源版本类型，可省略。"),
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Form(None, description="标注类型；继承模式下使用源版本类型，可省略。"),
    template_type: Optional[MachineLearningDatasetTemplateType] = Form(None, description="标注模板；继承模式下使用源版本模板，可省略。"),
    is_annotated: bool = Form(True, description="是否有标注数据。"),
    version: str = Form("V1", description="新版本号。", max_length=50),
    inherit_from_version: bool = Form(False, description="是否从已有版本继承数据；用于上传新版本。"),
    source_version: Optional[str] = Form(None, description="被继承的源版本号；继承模式下必填。"),
    description: Optional[str] = Form(None, description="描述。", max_length=1000),
    data_source: Optional[MachineLearningDatasetDataSource] = Form(None, description="数据来源。"),
    notebook_id: Optional[int] = Form(None, description="Notebook ID。"),
    notebook_name: Optional[str] = Form(None, description="Notebook 名称。"),
    notebook_path: Optional[str] = Form(None, description="Notebook 文件来源地址。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[OpenMachineLearningDatasetCreateResponse]:
    _, current_user = deps
    result = await machine_learning_dataset_service.create_dataset_with_file(
        current_user=current_user,
        name=dataset_name,
        project_id=project_id,
        chunk_upload_ids=chunk_upload_ids,
        data_type=data_type,
        annotation_type=annotation_type,
        template_type=template_type,
        is_annotated=is_annotated,
        version=version,
        inherit_from_version=inherit_from_version,
        source_version=source_version,
        description=description,
        data_source=data_source,
        notebook_id=notebook_id,
        notebook_name=notebook_name,
        notebook_path=notebook_path,
    )
    return openapi_success(to_model(OpenMachineLearningDatasetCreateResponse, result))


@router.get(
    "/dataset/{project_id}/sample/download",
    response_class=FileResponse,
    summary="下载机器学习数据集样例",
    operation_id="openapi_v1_machine_learning_datasets_download_machine_learning_sample_dataset",
)
@inject
async def download_machine_learning_sample_dataset(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    data_type: MachineLearningDatasetDataType = Query(..., description="数据类型。"),
    template_type: MachineLearningDatasetTemplateType = Query(..., description="标注模板。"),
    file_type: MachineLearningDatasetSampleFileType = Query(..., description="样例文件格式。"),
    is_annotated: bool = Query(True, description="是否有标注数据。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
):
    _, current_user = deps
    return await machine_learning_dataset_service.download_sample_dataset(
        current_user=current_user,
        project_id=project_id,
        data_type=data_type,
        template_type=template_type,
        file_type=file_type,
        is_annotated=is_annotated,
    )


@router.get(
    "/dataset/{project_id}/{dataset_id}/download",
    summary="下载机器学习数据集",
    operation_id="openapi_v1_machine_learning_datasets_download_machine_learning_dataset",
    responses={
        202: {
            "model": OpenApiResponse[OpenMachineLearningDatasetExportTaskResponse],
            "description": "导出文件未准备好时返回异步导出任务状态，稍后可重试下载。",
        }
    },
)
@inject
async def download_machine_learning_dataset(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_id: int = Path(..., description="数据集 ID。", gt=0),
    export_format: ExportFormat = Query(ExportFormat.PLATFORM, description="导出格式。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
):
    _, current_user = deps
    result = await machine_learning_dataset_service.download_dataset(
        current_user=current_user,
        project_id=project_id,
        dataset_id=dataset_id,
        export_format=export_format,
    )
    if isinstance(result, JSONResponse) and result.status_code == status.HTTP_202_ACCEPTED:
        export_task = OpenMachineLearningDatasetExportTaskResponse.model_validate(json.loads(result.body.decode("utf-8")))
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=openapi_success(export_task).model_dump(mode="json"),
        )
    return result


@router.get(
    "/dataset/{project_id}/{dataset_id}/versions",
    response_model=OpenApiResponse[List[OpenMachineLearningDataset]],
    summary="查询机器学习数据集版本列表",
    operation_id="openapi_v1_machine_learning_datasets_get_machine_learning_dataset_versions",
)
@inject
async def get_machine_learning_dataset_versions(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_id: int = Path(..., description="数据集 ID。", gt=0),
    is_annotated: Optional[bool] = Query(None, description="是否已标注。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[List[OpenMachineLearningDataset]]:
    _ = deps
    result = await machine_learning_dataset_service.get_dataset_versions(
        project_id=project_id,
        dataset_id=dataset_id,
        is_annotated=is_annotated,
    )
    return openapi_success(to_model_list(OpenMachineLearningDataset, result))


@router.get(
    "/dataset/{project_id}/page",
    response_model=OpenApiResponse[OpenApiPageData[OpenMachineLearningDataset]],
    summary="分页查询机器学习数据集",
    operation_id="openapi_v1_machine_learning_datasets_list_machine_learning_datasets",
    dependencies=[Depends(pagination_ctx(Page[OpenMachineLearningDataset], CustomParams))],
)
@inject
async def list_machine_learning_datasets(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_name: Optional[str] = Query(None, description="数据集名称模糊匹配。", max_length=100),
    task_type: Optional[MachineLearningDatasetTaskType] = Query(None, description="任务类型过滤。"),
    template_type: Optional[MachineLearningDatasetTemplateType] = Query(None, description="标注模板筛选。"),
    is_annotated: Optional[bool] = Query(None, description="是否已标注。"),
    params: Params = Depends(),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[OpenApiPageData[OpenMachineLearningDataset]]:
    _ = deps
    result = await machine_learning_dataset_service.list_datasets(
        project_id=project_id,
        params=params,
        name=dataset_name,
        task_type=task_type,
        template_type=template_type,
        is_annotated=is_annotated,
    )
    return openapi_success(to_page_data(OpenMachineLearningDataset, result))


@router.put(
    "/dataset/{project_id}/{dataset_id}/basic-info",
    response_model=OpenApiResponse[bool],
    summary="编辑机器学习数据集基础信息",
    operation_id="openapi_v1_machine_learning_datasets_update_machine_learning_dataset_basic_info",
)
@inject
async def update_machine_learning_dataset_basic_info(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_id: int = Path(..., description="数据集 ID。", gt=0),
    update_data: OpenMachineLearningDatasetBasicInfoUpdate = Body(..., description="机器学习数据集基础信息编辑请求。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[bool]:
    _ = deps
    result = await machine_learning_dataset_service.update_dataset_basic_info(
        project_id=project_id,
        dataset_id=dataset_id,
        update_data=update_data,
    )
    return openapi_success(result)


@router.get(
    "/dataset/{project_id}/{dataset_id}",
    response_model=OpenApiResponse[OpenMachineLearningDatasetDetail],
    summary="查询机器学习数据集详情",
    operation_id="openapi_v1_machine_learning_datasets_get_machine_learning_dataset_detail",
)
@inject
async def get_machine_learning_dataset_detail(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_id: int = Path(..., description="数据集 ID。", gt=0),
    page: int = Query(1, description="页码。", ge=1),
    size: int = Query(20, description="每页大小。", ge=1, le=200),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[OpenMachineLearningDatasetDetail]:
    _ = deps
    result = await machine_learning_dataset_service.get_dataset_detail(
        project_id=project_id,
        dataset_id=dataset_id,
        page=page,
        size=size,
    )
    return openapi_success(to_model(OpenMachineLearningDatasetDetail, result))


@router.delete(
    "/dataset/{project_id}/{dataset_id}",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="删除机器学习数据集版本",
    operation_id="openapi_v1_machine_learning_datasets_delete_machine_learning_dataset",
)
@inject
async def delete_machine_learning_dataset(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_id: int = Path(..., description="数据集 ID。", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[None]:
    _ = deps
    await machine_learning_dataset_service.delete_dataset(project_id=project_id, dataset_id=dataset_id)
    return openapi_success()


@router.delete(
    "/dataset/{project_id}/{dataset_id}/versions",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="删除机器学习数据集全部版本",
    operation_id="openapi_v1_machine_learning_datasets_delete_machine_learning_dataset_all_versions",
)
@inject
async def delete_machine_learning_dataset_all_versions(
    project_id: int = Path(..., description="项目 ID。", gt=0),
    dataset_id: int = Path(..., description="数据集 ID。", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> OpenApiResponse[None]:
    _ = deps
    await machine_learning_dataset_service.delete_dataset_all_versions(project_id=project_id, dataset_id=dataset_id)
    return openapi_success()


@router.get(
    "/dataset/export-formats",
    response_model=OpenApiResponse[OpenMachineLearningTaskExportFormats],
    summary="查询机器学习数据集导出格式",
    operation_id="openapi_v1_machine_learning_datasets_get_machine_learning_task_export_formats",
)
async def get_machine_learning_task_export_formats() -> OpenApiResponse[OpenMachineLearningTaskExportFormats]:
    return openapi_success(OpenMachineLearningTaskExportFormats(TASK_EXPORT_FORMATS))

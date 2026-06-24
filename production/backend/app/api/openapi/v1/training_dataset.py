import json
from typing import List, Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Form, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi_pagination import Page, pagination_ctx
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.training_dataset import parse_attr_values_from_form
from app.common.custom_params import CustomParams
from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.openapi.v1.common import OpenApiPageData, OpenApiResponse, openapi_success
from app.schemas.openapi.v1.training_dataset import (
    OpenDatasetInUse,
    OpenDatasetSamplePage,
    OpenTrainingDataset,
    OpenTrainingDatasetAggregation,
    OpenTrainingDatasetCreateResult,
    OpenTrainingDatasetExportTaskResponse,
    OpenTrainingDatasetSummary,
)
from app.schemas.training_dataset import (
    DatasetFormat,
    DatasetProcessingStatus,
    DatasetUsage,
    TrainingDatasetSummaryResponse,
    TrainingDatasetExportTypeCategory,
    TrainingDatasetUploadTypeCategory,
)
from app.schemas.training_task import TrainingMethodType, TrainingTypeCategory
from app.services.openapi.v1.training_dataset_service import (
    to_dataset_in_use,
    to_dataset_sample_page,
    to_training_dataset,
    to_training_dataset_aggregation,
    to_training_dataset_id,
    to_training_dataset_list,
    to_training_dataset_summary_page,
)
from app.services.training_dataset.interface import TrainingDatasetService
from app.utils.dependencies import get_db_and_user
from app.utils.validators import (
    query_dataset_in_use,
    validate_dataset_export_type,
    validate_dataset_format,
    validate_dataset_processing_status,
    validate_dataset_type_category,
    validate_dataset_usage,
    validate_dataset_usage_for_filtered,
    validate_training_method_type,
)

router = APIRouter(prefix="/training-datasets", tags=["openapi-training-datasets"])


@router.get(
    "/project/{project_id}/sample/download",
    summary="下载训练数据集样例",
    operation_id="openapi_v1_training_datasets_download_sample_dataset",
)
@inject
async def download_sample_dataset(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_type: TrainingTypeCategory = Query(..., description="数据集类型。"),
    training_method_type: TrainingMethodType = Query(TrainingMethodType.BUSINESS, description="训练方法类型。"),
    dataset_format: DatasetFormat = Query(DatasetFormat.BUSINESS, description="数据格式。"),
    file_type: TrainingDatasetUploadTypeCategory = Query(..., description="样例文件类型。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> FileResponse:
    db, current_user = deps
    return await training_dataset_service.download_sample_dataset(
        current_user,
        project_id,
        dataset_type,
        training_method_type,
        dataset_format,
        file_type,
    )


@router.get(
    "/project/{project_id}/dataset/{dataset_name}/version/{version}/download",
    summary="下载训练数据集版本",
    operation_id="openapi_v1_training_datasets_download_dataset",
    responses={
        202: {
            "model": OpenApiResponse[OpenTrainingDatasetExportTaskResponse],
            "description": "导出文件未准备好时返回异步导出任务状态，稍后可重试下载。",
        }
    },
)
@inject
async def download_dataset(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: str = Path(..., description="数据集名称。"),
    version: str = Path(..., description="数据集版本号。"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    file_type: TrainingDatasetExportTypeCategory = Depends(validate_dataset_export_type),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> FileResponse:
    db, current_user = deps
    result = await training_dataset_service.download_dataset(
        current_user,
        project_id,
        dataset_name,
        version,
        usage,
        file_type,
    )
    if isinstance(result, JSONResponse) and result.status_code == status.HTTP_202_ACCEPTED:
        export_task = OpenTrainingDatasetExportTaskResponse.model_validate(json.loads(result.body.decode("utf-8")))
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=openapi_success(export_task).model_dump(mode="json"),
        )
    return result


@router.get(
    "/project/{project_id}",
    response_model=OpenApiResponse[OpenApiPageData[OpenTrainingDatasetSummary]],
    summary="分页查询训练数据集",
    operation_id="openapi_v1_training_datasets_list_training_datasets",
    dependencies=[Depends(pagination_ctx(Page[TrainingDatasetSummaryResponse], CustomParams))],
)
@inject
async def list_training_datasets(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: Optional[str] = Query(None, description="数据集名称或按名称搜索的关键字。"),
    dataset_type: Optional[TrainingTypeCategory] = Depends(validate_dataset_type_category),
    training_method_type: Optional[TrainingMethodType] = Depends(validate_training_method_type),
    page: Optional[int] = None,
    size: Optional[int] = None,
    usage: DatasetUsage = Depends(validate_dataset_usage),
    processing_status: Optional[DatasetProcessingStatus] = Depends(validate_dataset_processing_status),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[OpenApiPageData[OpenTrainingDatasetSummary]]:
    result = await training_dataset_service.list_training_datasets(
        project_id,
        dataset_name,
        dataset_type,
        training_method_type,
        usage,
        page,
        size,
        processing_status,
    )
    return openapi_success(to_training_dataset_summary_page(result))


@router.get(
    "/project/{project_id}/dataset/{dataset_name}",
    response_model=OpenApiResponse[List[OpenTrainingDataset]],
    summary="查询训练数据集版本列表",
    operation_id="openapi_v1_training_datasets_get_training_dataset_versions",
)
@inject
async def get_training_dataset_versions(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: str = Path(..., description="数据集名称。"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    processing_status: Optional[DatasetProcessingStatus] = Depends(validate_dataset_processing_status),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[List[OpenTrainingDataset]]:
    result = await training_dataset_service.get_training_dataset_versions(project_id, dataset_name, usage, processing_status)
    return openapi_success(to_training_dataset_list(result))


@router.get(
    "/project/{project_id}/dataset/{dataset_name}/version/{version}/in-use",
    response_model=OpenApiResponse[OpenDatasetInUse],
    summary="查询训练数据集使用状态",
    operation_id="openapi_v1_training_datasets_check_dataset_in_use_status",
)
async def check_dataset_in_use_status(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: str = Path(..., description="数据集名称。"),
    version: str = Path(..., description="数据集版本号。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> OpenApiResponse[OpenDatasetInUse]:
    db, current_user = deps
    result = await query_dataset_in_use(db, dataset_name, project_id, version)
    return openapi_success(to_dataset_in_use(result))


@router.get(
    "/project/{project_id}/dataset/{dataset_name}/version/{version}/preview",
    response_model=OpenApiResponse[OpenDatasetSamplePage],
    summary="预览训练数据集样本",
    operation_id="openapi_v1_training_datasets_preview_dataset_data",
)
@inject
async def preview_dataset_data(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: str = Path(..., description="数据集名称。"),
    version: str = Path(..., description="数据集版本号。"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    page: int = Query(1, description="页码，从 1 开始。", ge=1),
    size: int = Query(20, description="每页数量。", ge=1, le=100),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[OpenDatasetSamplePage]:
    result = await training_dataset_service.preview_dataset_data_optimized(project_id, dataset_name, version, page, size, usage)
    return openapi_success(to_dataset_sample_page(result))


@router.post(
    "",
    response_model=OpenApiResponse[OpenTrainingDatasetCreateResult],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="上传训练数据集",
    operation_id="openapi_v1_training_datasets_create_training_dataset",
)
@inject
async def create_training_dataset(
    dataset_name: str = Form(..., description="数据集名称。", min_length=1, max_length=100),
    project_id: int = Form(..., description="项目 ID。", gt=0),
    dataset_type: TrainingTypeCategory = Query(..., description="数据集类型。"),
    training_method_type: TrainingMethodType = Query(TrainingMethodType.BUSINESS, description="训练方法类型。"),
    dataset_format: DatasetFormat = Query(DatasetFormat.BUSINESS, description="数据格式。"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    chunk_upload_ids: str = Form(..., description="分片上传 ID 列表，多个 ID 使用英文逗号分隔。"),
    version: str = Form("V1", description="数据集版本号。", max_length=50),
    description: Optional[str] = Form(None, description="数据集描述。", max_length=1000),
    dataset_config: Optional[str] = Form(None, description="数据集配置，JSON 字符串。"),
    attr_values: Optional[str] = Form(None, description="关联属性值和选项，JSON 数组字符串。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[OpenTrainingDatasetCreateResult]:
    db, current_user = deps
    attr_values_list = parse_attr_values_from_form(attr_values, usage)
    result = await training_dataset_service.create_training_dataset_with_file(
        current_user,
        dataset_name,
        project_id,
        dataset_type,
        training_method_type,
        dataset_format,
        usage,
        chunk_upload_ids,
        version,
        description,
        dataset_config,
        attr_values_list,
    )
    return openapi_success(OpenTrainingDatasetCreateResult(id=to_training_dataset_id(result)))


@router.post(
    "/{dataset_name}/versions",
    response_model=OpenApiResponse[OpenTrainingDatasetCreateResult],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="上传训练数据集新版本",
    operation_id="openapi_v1_training_datasets_create_dataset_version",
)
@inject
async def create_dataset_version(
    dataset_name: str = Path(..., min_length=1, max_length=100, description="数据集名称。"),
    project_id: int = Form(..., description="项目 ID。", gt=0),
    new_version: str = Form(..., description="新版本号。", max_length=50),
    inherit_from_version: bool = Form(False, description="是否继承现有版本的数据。"),
    source_version: Optional[str] = Form(None, description="继承的源版本号。"),
    usage: DatasetUsage = Form(..., description="数据集用途。"),
    chunk_upload_ids: Optional[str] = Form(None, description="分片上传 ID 列表，多个 ID 使用英文逗号分隔。"),
    description: Optional[str] = Form(None, description="数据集描述。", max_length=1000),
    dataset_config: Optional[str] = Form(None, description="数据集配置，JSON 字符串。"),
    attr_values: Optional[str] = Form(None, description="关联属性值和选项，JSON 数组字符串。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[OpenTrainingDatasetCreateResult]:
    db, current_user = deps
    attr_values_list = parse_attr_values_from_form(attr_values, usage)
    chunk_upload_ids_list = [value.strip() for value in chunk_upload_ids.split(",") if value.strip()] if chunk_upload_ids else None
    result = await training_dataset_service.create_dataset_version(
        current_user=current_user,
        name=dataset_name,
        project_id=project_id,
        new_version=new_version,
        inherit_from_version=inherit_from_version,
        source_version=source_version,
        chunk_upload_ids=chunk_upload_ids_list,
        description=description,
        dataset_config=dataset_config,
        usage=usage,
        attr_values=attr_values_list,
    )
    return openapi_success(OpenTrainingDatasetCreateResult(id=to_training_dataset_id(result)))


@router.delete(
    "/project/{project_id}/dataset/{dataset_name}",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="删除训练数据集全部版本",
    operation_id="openapi_v1_training_datasets_delete_dataset_all_versions",
)
@inject
async def delete_dataset_all_versions(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: str = Path(..., description="数据集名称。"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[None]:
    await training_dataset_service.delete_dataset_all_versions(project_id, dataset_name, usage)
    return openapi_success()


@router.delete(
    "/project/{project_id}/dataset/{dataset_name}/{version}",
    response_model=OpenApiResponse[None],
    response_model_exclude_none=True,
    summary="删除训练数据集单个版本",
    operation_id="openapi_v1_training_datasets_delete_single_dataset",
)
@inject
async def delete_single_dataset(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: str = Path(..., description="数据集名称。"),
    version: str = Path(..., description="数据集版本号。"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[None]:
    await training_dataset_service.delete_single_dataset(project_id, dataset_name, version, usage)
    return openapi_success()


@router.get(
    "/project/{project_id}/stats",
    response_model=OpenApiResponse[OpenTrainingDatasetAggregation],
    response_model_exclude_none=True,
    summary="查询训练数据集聚合统计",
    operation_id="openapi_v1_training_datasets_get_training_dataset_aggregation_stats",
)
@inject
async def get_training_dataset_aggregation_stats(
    project_id: int = Path(..., description="项目 ID。"),
    processing_status: DatasetProcessingStatus = Query(DatasetProcessingStatus.COMPLETED, description="数据集处理状态。"),
    usage: Optional[List[DatasetUsage]] = Query(None, description="数据集用途，可多选。"),
    dataset_type: Optional[List[TrainingTypeCategory]] = Query(None, description="数据集类型，可多选。"),
    training_method_type: Optional[List[TrainingMethodType]] = Query(None, description="训练方法类型，可多选。"),
    dataset_format: Optional[List[DatasetFormat]] = Query(None, description="数据集格式，可多选。"),
    attr_name: Optional[str] = Query(None, description="按属性名称筛选，需与 option_value 同时传入。"),
    option_value: Optional[str] = Query(None, description="按属性选项值筛选，需与 attr_name 同时传入。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[OpenTrainingDatasetAggregation]:
    if attr_name and not option_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="传入 attr_name 时，option_value 也必须同时传入")
    result = await training_dataset_service.get_aggregation_stats(
        project_id,
        processing_status,
        attr_name=attr_name,
        option_value=option_value,
        usage=usage,
        dataset_type=dataset_type,
        training_method_type=training_method_type,
        dataset_format=dataset_format,
    )
    return openapi_success(to_training_dataset_aggregation(result))


@router.get(
    "/project/{project_id}/filtered",
    response_model=OpenApiResponse[OpenApiPageData[OpenTrainingDatasetSummary]],
    summary="按聚合条件过滤训练数据集",
    operation_id="openapi_v1_training_datasets_list_training_datasets_by_filters",
)
@inject
async def list_training_datasets_by_filters(
    project_id: int = Path(..., description="项目 ID。"),
    dataset_name: Optional[str] = Query(None, description="数据集名称或按名称搜索的关键字。"),
    dataset_type: Optional[TrainingTypeCategory] = Depends(validate_dataset_type_category),
    training_method_type: Optional[TrainingMethodType] = Depends(validate_training_method_type),
    page: int = Query(1, ge=1, description="页码，从 1 开始。"),
    size: int = Query(20, ge=1, le=100, description="每页数量。"),
    usage: Optional[DatasetUsage] = Depends(validate_dataset_usage_for_filtered),
    processing_status: DatasetProcessingStatus = Query(DatasetProcessingStatus.COMPLETED, description="数据集处理状态。"),
    dataset_format: Optional[DatasetFormat] = Depends(validate_dataset_format),
    attr_name: Optional[str] = Query(None, description="按属性名称筛选，需与 option_value 同时传入。"),
    option_value: Optional[str] = Query(None, description="按属性选项值筛选，需与 attr_name 同时传入。"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> OpenApiResponse[OpenApiPageData[OpenTrainingDatasetSummary]]:
    if attr_name and not option_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="传入 attr_name 时，option_value 也必须同时传入")
    result = await training_dataset_service.list_training_datasets_by_filters(
        project_id,
        dataset_name,
        dataset_type,
        training_method_type,
        usage,
        page,
        size,
        processing_status,
        dataset_format=dataset_format,
        attr_name=attr_name,
        option_value=option_value,
    )
    return openapi_success(to_training_dataset_summary_page(result))



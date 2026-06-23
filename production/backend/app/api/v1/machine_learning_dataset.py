from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, Form, HTTPException, Path, Query, status
from fastapi.responses import FileResponse
from fastapi_pagination import Params, Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.machine_learning_dataset import (
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetBasicInfoUpdate,
    MachineLearningDatasetCreateResponse,
    MachineLearningDatasetDataSource,
    MachineLearningDatasetDataType,
    MachineLearningDatasetDetailResponse,
    MachineLearningDatasetResponse,
    MachineLearningDatasetSampleFileType,
    MachineLearningDatasetTaskType,
    MachineLearningDatasetTemplateType, ExportFormat, TASK_EXPORT_FORMATS,
)
from app.services.machine_learning_dataset.interface import MachineLearningDatasetService
from app.utils.dataset_metadata_repair_status import (
    REPAIR_KIND_MACHINE_LEARNING_DATASET,
    get_metadata_fields_repair_status,
    mark_metadata_fields_repair_failed,
    mark_metadata_fields_repair_submitted,
)
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/machine-learning-datasets", tags=["machine-learning-datasets"])


@router.post("/dataset/{project_id}/upload", response_model=MachineLearningDatasetCreateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_machine_learning_dataset_with_file(
    project_id: int = Path(..., description="项目ID", gt=0),
    name: str = Form(..., description="数据集名称", min_length=1, max_length=100),
    chunk_upload_ids: Optional[str] = Form(None, description="上传文件ID列表，多个用逗号分隔；继承模式下可传入新增文件进行合并"),
    data_type: Optional[MachineLearningDatasetDataType] = Form(None, description="数据类型：text/image（继承模式下使用源版本类型，可省略）"),
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Form(None, description="标注类型（继承模式下使用源版本类型，可省略）"),
    template_type: Optional[MachineLearningDatasetTemplateType] = Form(None, description="标注模板（继承模式下使用源版本模板，可省略）"),
    is_annotated: bool = Form(True, description="是否有标注数据：true=有标注，false=无标注"),
    version: str = Form("V1", description="新版本号", max_length=50),
    inherit_from_version: bool = Form(False, description="是否从已有版本继承数据"),
    source_version: Optional[str] = Form(None, description="被继承的源版本号（继承时必填）"),
    description: Optional[str] = Form(None, description="描述", max_length=1000),
    data_source: Optional[MachineLearningDatasetDataSource] = Form(None, description="数据来源：local_upload / notebook_fetch"),
    notebook_id: Optional[int] = Form(None, description="notebook ID（data_source 为 notebook_fetch 时必填）"),
    notebook_name: Optional[str] = Form(None, description="notebook 名称"),
    notebook_path: Optional[str] = Form(None, description="notebook 文件来源地址"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> MachineLearningDatasetCreateResponse:
    _, current_user = deps
    return await machine_learning_dataset_service.create_dataset_with_file(
        current_user=current_user,
        name=name,
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


@router.get("/dataset/{project_id}/sample/download", response_class=FileResponse, status_code=status.HTTP_200_OK)
@inject
async def download_machine_learning_sample_dataset(
    project_id: int = Path(..., description="项目ID", gt=0),
    data_type: MachineLearningDatasetDataType = Query(..., description="数据类型：text 或 image"),
    template_type: MachineLearningDatasetTemplateType = Query(..., description="标注模板（如实体识别、文本/图像分类单/多标签）"),
    file_type: MachineLearningDatasetSampleFileType = Query(..., description="样例文件格式：jsonl 或 zip（图像类型仅支持 zip）"),
    is_annotated: bool = Query(True, description="是否有标注数据：true=有标注，false=无标注"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
):
    """下载机器学习样例数据集。

    根据 data_type、template_type、file_type 返回对应样例文件。

    文本样例（支持 jsonl / zip）：
    - 实体识别：ner_text
    - 文本分类单标签：text_cls_short_single
    - 文本分类多标签：text_cls_short_multi

    图像样例（仅支持 zip）：
    - 单标签图像分类：image_cls_single.zip
    - 多标签图像分类：image_cls_multi.zip
    - 目标检测(边界框)：detection_bbox.zip
    - 图像分割：image_segmentation.zip
    - 图像语义分割：semantic_segmentation.zip
    """
    _, current_user = deps
    return await machine_learning_dataset_service.download_sample_dataset(
        current_user=current_user,
        project_id=project_id,
        data_type=data_type,
        template_type=template_type,
        file_type=file_type,
        is_annotated=is_annotated
    )


@router.get("/dataset/{project_id}/{dataset_id}/download", status_code=status.HTTP_200_OK)
@inject
async def download_machine_learning_dataset(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID", gt=0),
    export_format: ExportFormat = Query(ExportFormat.PLATFORM, description="导出格式"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
):
    """下载机器学习数据集（首次会返回 202，后台异步导出后可直接下载缓存产物）。"""
    _, current_user = deps
    return await machine_learning_dataset_service.download_dataset(
        current_user=current_user,
        project_id=project_id,
        dataset_id=dataset_id,
        export_format=export_format
    )


@router.get("/dataset/{project_id}/{dataset_id}/versions", response_model=List[MachineLearningDatasetResponse], status_code=status.HTTP_200_OK)
@inject
async def get_machine_learning_dataset_versions(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID", gt=0),
    is_annotated: Optional[bool] = Query(None, description="是否已标注"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> List[MachineLearningDatasetResponse]:
    """根据数据集 id 获取该数据集（同名）下的所有版本列表，按创建时间倒序。"""
    _ = deps
    return await machine_learning_dataset_service.get_dataset_versions(
        project_id=project_id,
        dataset_id=dataset_id,
        is_annotated=is_annotated
    )


@router.get("/dataset/{project_id}/page", response_model=Page[MachineLearningDatasetResponse], status_code=status.HTTP_200_OK)
@inject
async def list_machine_learning_datasets(
    project_id: int = Path(..., description="项目ID", gt=0),
    name: Optional[str] = Query(None, description="数据集名称（模糊匹配）", max_length=100),
    task_type: Optional[MachineLearningDatasetTaskType] = Query(None, description="标注类型/任务类型过滤"),
    template_type: Optional[MachineLearningDatasetTemplateType] = Query(None, description="标注模板筛选"),
    is_annotated: Optional[bool] = Query(None, description="是否已标注"),
    params: Params = Depends(),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> Page[MachineLearningDatasetResponse]:
    _ = deps
    return await machine_learning_dataset_service.list_datasets(
        project_id=project_id,
        params=params,
        name=name,
        task_type=task_type,
        template_type=template_type,
        is_annotated=is_annotated
    )


@router.put("/dataset/{project_id}/{dataset_id}/basic-info", response_model=bool, status_code=status.HTTP_200_OK)
@inject
async def update_machine_learning_dataset_basic_info(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID", gt=0),
    update_data: MachineLearningDatasetBasicInfoUpdate = Body(..., description="机器学习数据集基础信息编辑请求"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> bool:
    """编辑机器学习数据集名称和描述。

    通过 project_id、dataset_id 定位数据集；name 同步修改同名数据集的所有版本，
    description 仅修改 dataset_id 对应的数据集描述。

    请求示例：
    ```json
    PUT /api/v1/machine-learning-datasets/dataset/35/1001/basic-info
    {
      "name": "new_ml_dataset_name",
      "description": "新的机器学习数据集描述"
    }
    ```
    """
    _ = deps
    return await machine_learning_dataset_service.update_dataset_basic_info(
        project_id=project_id,
        dataset_id=dataset_id,
        update_data=update_data,
    )


@router.get("/dataset/{project_id}/{dataset_id}", response_model=MachineLearningDatasetDetailResponse, status_code=status.HTTP_200_OK)
@inject
async def get_machine_learning_dataset_detail(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID", gt=0),
    page: int = Query(1, description="页码", ge=1),
    size: int = Query(20, description="每页大小", ge=1, le=200),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> MachineLearningDatasetDetailResponse:
    _ = deps
    return await machine_learning_dataset_service.get_dataset_detail(
        project_id=project_id,
        dataset_id=dataset_id,
        page=page,
        size=size,
    )


@router.get("/dataset/{project_id}/{dataset_id}/metadata-fields", response_model=List[str], status_code=status.HTTP_200_OK)
@inject
async def get_machine_learning_dataset_metadata_fields(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> List[str]:
    """获取机器学习数据集 metadata_fields，不读取或采样 dataset.jsonl。"""
    _ = deps
    return await machine_learning_dataset_service.get_metadata_fields(project_id, dataset_id)


@router.post("/metadata-fields/repair", response_model=Dict[str, Any], status_code=status.HTTP_200_OK)
@inject
async def repair_machine_learning_dataset_metadata_fields() -> Dict[str, Any]:
    """提交或查询历史机器学习数据集 metadata_fields 异步回填任务。"""
    from app.tasks.dataset_processing_tasks import (
        repair_machine_learning_dataset_metadata_fields as repair_metadata_fields_task,
    )

    tenant_id: Optional[str] = None
    existing_status = await get_metadata_fields_repair_status(
        REPAIR_KIND_MACHINE_LEARNING_DATASET,
        tenant_id,
    )
    if existing_status:
        return existing_status

    celery_task_id = str(uuid4())
    claimed = await mark_metadata_fields_repair_submitted(
        REPAIR_KIND_MACHINE_LEARNING_DATASET,
        tenant_id,
        celery_task_id,
        nx=True,
    )
    if not claimed:
        existing_status = await get_metadata_fields_repair_status(
            REPAIR_KIND_MACHINE_LEARNING_DATASET,
            tenant_id,
        )
        if existing_status:
            return existing_status

    try:
        repair_metadata_fields_task.apply_async(
            kwargs={"tenant_id": tenant_id},
            task_id=celery_task_id,
        )
    except Exception as exc:
        await mark_metadata_fields_repair_failed(
            REPAIR_KIND_MACHINE_LEARNING_DATASET,
            tenant_id,
            celery_task_id,
            exc,
        )
        raise HTTPException(status_code=500, detail=f"提交机器学习数据集 metadata_fields 修复任务失败: {exc}") from exc

    return await get_metadata_fields_repair_status(
        REPAIR_KIND_MACHINE_LEARNING_DATASET,
        tenant_id,
    ) or {
        "success": True,
        "status": "submitted",
        "celery_task_id": celery_task_id,
        "message": "机器学习数据集 metadata_fields 修复任务已提交",
    }


@router.delete("/dataset/{project_id}/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_machine_learning_dataset(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> None:
    """根据数据集 id 删除单条记录及其在 JFS 上的存储文件。"""
    _ = deps
    await machine_learning_dataset_service.delete_dataset(project_id=project_id, dataset_id=dataset_id)


@router.delete("/dataset/{project_id}/{dataset_id}/versions", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_machine_learning_dataset_all_versions(
    project_id: int = Path(..., description="项目ID", gt=0),
    dataset_id: int = Path(..., description="数据集ID（用于定位同名数据集）", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    machine_learning_dataset_service: MachineLearningDatasetService = Depends(
        Provide[AutoContainer.machine_learning_dataset_service]
    ),
) -> None:
    """根据数据集 id 查询同名所有版本，依次删除每条记录及对应 JFS 文件。"""
    _ = deps
    await machine_learning_dataset_service.delete_dataset_all_versions(project_id=project_id, dataset_id=dataset_id)


@router.get("/dataset/export-formats", response_model=Dict[MachineLearningDatasetTemplateType, List[ExportFormat]], status_code=status.HTTP_200_OK)
async def get_machine_learning_task_export_formats() -> Dict[MachineLearningDatasetTemplateType, List[ExportFormat]]:
    """返回每个任务模板对应支持的导出格式。"""
    return TASK_EXPORT_FORMATS

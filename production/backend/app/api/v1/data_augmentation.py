from typing import Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_insight_manager import DataAugmentationTask
from app.models.models import JwtUserInfo
from app.models.training_dataset_manager import TrainingDataset
from app.schemas.training_dataset import DatasetPublishStatus
from app.schemas.data_augmentation import (
    DataAugmentationTaskCreate,
    DataAugmentationTaskPage,
    DataAugmentationTaskResponse,
)
from app.utils.dependencies import get_db_and_user
from app.utils.timezone_utils import get_current_shanghai_time

router = APIRouter(prefix="/api/v1/data-augmentations", tags=["data-augmentations"])


def _task_to_response(task: DataAugmentationTask) -> DataAugmentationTaskResponse:
    return DataAugmentationTaskResponse.model_validate(task)


async def _find_dataset(db: AsyncSession, project_id: int, request: DataAugmentationTaskCreate) -> Optional[TrainingDataset]:
    dataset_ref = request.source_dataset
    stmt = select(TrainingDataset).where(
        TrainingDataset.project_id == project_id,
        TrainingDataset.name == dataset_ref.dataset_name,
        TrainingDataset.version == dataset_ref.version,
        TrainingDataset.usage == dataset_ref.usage,
    )
    if dataset_ref.dataset_id:
        stmt = stmt.where(TrainingDataset.id == dataset_ref.dataset_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _validate_dataset_available(dataset: Optional[TrainingDataset], request: DataAugmentationTaskCreate) -> TrainingDataset:
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集版本不存在")
    dataset_ref = request.source_dataset
    if dataset.publish != DatasetPublishStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="V1.15 数据增强仅支持已发布的数据集版本")
    if (
        dataset.dataset_type != dataset_ref.dataset_type
        or dataset.training_method_type != dataset_ref.training_method_type
        or dataset.dataset_format != dataset_ref.dataset_format
    ):
        raise HTTPException(status_code=400, detail="数据集类型、训练方法或格式与所选版本不一致")
    return dataset


def _build_result_summary(request: DataAugmentationTaskCreate, dataset: Optional[TrainingDataset]) -> dict:
    enabled_directions = [item for item in request.prompt_generation.directions if item.enabled]
    prompt_count = sum(item.sample_count for item in enabled_directions) if request.prompt_generation.enabled else 0
    source_count = int(dataset.total_samples or 0) if dataset else 0
    if not request.response_generation.enabled:
        response_count = 0
    elif request.response_generation.target_scope == "all":
        response_count = source_count
    else:
        response_count = max(source_count // 4, 0)
    return {
        "source_samples": source_count,
        "generated_prompt_samples": prompt_count,
        "generated_response_samples": response_count,
        "total_output_samples": source_count + prompt_count,
        "recommended_next_step": "进入数据洞察，筛除语义偏离、格式错误和重复样本后再保存为训练数据集。",
    }


@router.post("/project/{project_id}/tasks", response_model=DataAugmentationTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_data_augmentation_task(
    project_id: int = Path(..., gt=0, description="项目ID"),
    request: DataAugmentationTaskCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataAugmentationTaskResponse:
    db, current_user = deps
    dataset = await _find_dataset(db, project_id, request)
    dataset = _validate_dataset_available(dataset, request)
    dataset_ref = request.source_dataset
    config = {
        "prompt_generation": request.prompt_generation.model_dump(),
        "response_generation": request.response_generation.model_dump(),
    }
    now = get_current_shanghai_time()
    task = DataAugmentationTask(
        name=request.name,
        description=request.description,
        project_id=project_id,
        source_dataset_id=dataset_ref.dataset_id or (dataset.id if dataset else None),
        source_dataset_name=dataset_ref.dataset_name,
        source_dataset_version=dataset_ref.version,
        source_dataset_usage=dataset_ref.usage,
        output_dataset_name=request.output_dataset_name,
        output_dataset_version=request.output_dataset_version,
        dataset_type=dataset_ref.dataset_type,
        training_method_type=dataset_ref.training_method_type,
        dataset_format=dataset_ref.dataset_format,
        status="completed",
        config=config,
        result_summary=_build_result_summary(request, dataset),
        created_id=getattr(current_user, "userId", None),
        created_by=getattr(current_user, "username", None),
        finished_at=now,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.get("/project/{project_id}/tasks", response_model=DataAugmentationTaskPage)
async def list_data_augmentation_tasks(
    project_id: int = Path(..., gt=0, description="项目ID"),
    name: Optional[str] = Query(None, description="任务名称"),
    status_value: Optional[str] = Query(None, alias="status", description="任务状态"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataAugmentationTaskPage:
    db, _ = deps
    filters = [DataAugmentationTask.project_id == project_id]
    if name:
        filters.append(DataAugmentationTask.name.like(f"%{name}%"))
    if status_value:
        filters.append(DataAugmentationTask.status == status_value)
    total_result = await db.execute(select(func.count()).select_from(DataAugmentationTask).where(*filters))
    total = int(total_result.scalar() or 0)
    result = await db.execute(
        select(DataAugmentationTask)
        .where(*filters)
        .order_by(DataAugmentationTask.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return DataAugmentationTaskPage(
        items=[_task_to_response(item) for item in result.scalars().all()],
        total=total,
        page=page,
        size=size,
    )


@router.get("/project/{project_id}/tasks/{task_id}", response_model=DataAugmentationTaskResponse)
async def get_data_augmentation_task(
    project_id: int = Path(..., gt=0),
    task_id: int = Path(..., gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataAugmentationTaskResponse:
    db, _ = deps
    result = await db.execute(select(DataAugmentationTask).where(DataAugmentationTask.project_id == project_id, DataAugmentationTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="数据增强任务不存在")
    return _task_to_response(task)


@router.delete("/project/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_data_augmentation_task(
    project_id: int = Path(..., gt=0),
    task_id: int = Path(..., gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
):
    db, _ = deps
    result = await db.execute(delete(DataAugmentationTask).where(DataAugmentationTask.project_id == project_id, DataAugmentationTask.id == task_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="数据增强任务不存在")
    await db.commit()

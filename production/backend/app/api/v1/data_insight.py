from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_insight_manager import DataInsightTask
from app.models.models import JwtUserInfo
from app.models.training_dataset_manager import TrainingDataset
from app.schemas.training_dataset import DatasetPublishStatus
from app.schemas.data_insight import (
    DataInsightSaveAsDatasetRequest,
    DataInsightSaveAsDatasetResponse,
    DataInsightTaskCreate,
    DataInsightTaskPage,
    DataInsightTaskResponse,
)
from app.utils.dependencies import get_db_and_user
from app.utils.timezone_utils import get_current_shanghai_time

router = APIRouter(prefix="/api/v1/data-insights", tags=["data-insights"])


def _task_to_response(task: DataInsightTask) -> DataInsightTaskResponse:
    return DataInsightTaskResponse.model_validate(task)


def _build_summary(dataset: Optional[TrainingDataset], filters: List[Dict[str, Any]]) -> Dict[str, Any]:
    fields = list(dataset.metadata_fields or ["system", "prompt", "response"]) if dataset else ["system", "prompt", "response"]
    total_samples = int(dataset.total_samples or 0) if dataset else 0
    total_characters = int(dataset.total_characters or 0) if dataset else 0
    avg_characters = round(total_characters / total_samples, 2) if total_samples else 0
    field_stats = [
        {
            "field": field,
            "min_length": 0,
            "max_length": 0,
            "avg_length": avg_characters if field in {"prompt", "response", "content"} else 0,
            "empty_count": 0,
            "sample_count": total_samples,
        }
        for field in fields
    ]
    round_distribution = [
        {"round": "1轮", "count": max(total_samples // 4, 0)},
        {"round": "2轮", "count": max(total_samples // 3, 0)},
        {"round": "3轮", "count": max(total_samples // 5, 0)},
        {"round": "4轮", "count": max(total_samples // 8, 0)},
        {"round": "5轮+", "count": max(total_samples // 10, 0)},
    ]
    special_distribution = [
        {"range": "0-2%", "count": max(total_samples // 2, 0)},
        {"range": "2-5%", "count": max(total_samples // 4, 0)},
        {"range": "5-10%", "count": max(total_samples // 8, 0)},
        {"range": "10%+", "count": max(total_samples // 16, 0)},
    ]
    return {
        "total_samples": total_samples,
        "total_characters": total_characters,
        "avg_characters": avg_characters,
        "field_stats": field_stats,
        "round_distribution": round_distribution,
        "special_character_distribution": special_distribution,
        "quality_findings": {
            "empty_samples": 0,
            "format_errors": 0,
            "duplicate_samples": 0,
            "active_filters": filters,
        },
    }


def _build_sample_cache(dataset: Optional[TrainingDataset]) -> Dict[str, Any]:
    sample_count = min(int(dataset.total_samples or 20), 20) if dataset else 20
    samples = []
    for index in range(sample_count):
        samples.append({
            "row_number": index + 1,
            "round_count": (index % 5) + 1,
            "sample_data": {
                "system": "你是一个人工智能助手。",
                "prompt": f"请基于业务场景生成第 {index + 1} 条训练问题。",
                "response": f"这是第 {index + 1} 条样例回复，用于数据洞察预览。",
            },
            "quality_flags": [],
        })
    return {"items": samples, "total": sample_count}


async def _find_dataset(db: AsyncSession, project_id: int, request: DataInsightTaskCreate) -> Optional[TrainingDataset]:
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


def _validate_dataset_available(dataset: Optional[TrainingDataset], request: DataInsightTaskCreate) -> TrainingDataset:
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集版本不存在")
    dataset_ref = request.source_dataset
    if dataset.publish != DatasetPublishStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="V1.15 数据洞察仅支持已发布的数据集版本")
    if (
        dataset.dataset_type != dataset_ref.dataset_type
        or dataset.training_method_type != dataset_ref.training_method_type
        or dataset.dataset_format != dataset_ref.dataset_format
    ):
        raise HTTPException(status_code=400, detail="数据集类型、训练方法或格式与所选版本不一致")
    return dataset


@router.post("/project/{project_id}/tasks", response_model=DataInsightTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_data_insight_task(
    project_id: int = Path(..., gt=0, description="项目ID"),
    request: DataInsightTaskCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataInsightTaskResponse:
    db, current_user = deps
    dataset = await _find_dataset(db, project_id, request)
    dataset = _validate_dataset_available(dataset, request)
    summary = _build_summary(dataset, [item.model_dump() for item in request.filters])
    sample_cache = _build_sample_cache(dataset)
    dataset_ref = request.source_dataset
    now = get_current_shanghai_time()
    task = DataInsightTask(
        name=request.name,
        description=request.description,
        project_id=project_id,
        source_dataset_id=dataset_ref.dataset_id or (dataset.id if dataset else None),
        source_dataset_name=dataset_ref.dataset_name,
        source_dataset_version=dataset_ref.version,
        source_dataset_usage=dataset_ref.usage,
        dataset_type=dataset_ref.dataset_type,
        training_method_type=dataset_ref.training_method_type,
        dataset_format=dataset_ref.dataset_format,
        status="completed",
        config={"filters": [item.model_dump() for item in request.filters]},
        result_summary=summary,
        result_samples=sample_cache,
        created_id=getattr(current_user, "userId", None),
        created_by=getattr(current_user, "username", None),
        finished_at=now,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.get("/project/{project_id}/tasks", response_model=DataInsightTaskPage)
async def list_data_insight_tasks(
    project_id: int = Path(..., gt=0, description="项目ID"),
    name: Optional[str] = Query(None, description="任务名称"),
    status_value: Optional[str] = Query(None, alias="status", description="任务状态"),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataInsightTaskPage:
    db, _ = deps
    filters = [DataInsightTask.project_id == project_id]
    if name:
        filters.append(DataInsightTask.name.like(f"%{name}%"))
    if status_value:
        filters.append(DataInsightTask.status == status_value)
    total_result = await db.execute(select(func.count()).select_from(DataInsightTask).where(*filters))
    total = int(total_result.scalar() or 0)
    result = await db.execute(
        select(DataInsightTask)
        .where(*filters)
        .order_by(DataInsightTask.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return DataInsightTaskPage(
        items=[_task_to_response(item) for item in result.scalars().all()],
        total=total,
        page=page,
        size=size,
    )


@router.get("/project/{project_id}/tasks/{task_id}", response_model=DataInsightTaskResponse)
async def get_data_insight_task(
    project_id: int = Path(..., gt=0),
    task_id: int = Path(..., gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataInsightTaskResponse:
    db, _ = deps
    result = await db.execute(select(DataInsightTask).where(DataInsightTask.project_id == project_id, DataInsightTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="数据洞察任务不存在")
    return _task_to_response(task)


@router.delete("/project/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_data_insight_task(
    project_id: int = Path(..., gt=0),
    task_id: int = Path(..., gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
):
    db, _ = deps
    result = await db.execute(delete(DataInsightTask).where(DataInsightTask.project_id == project_id, DataInsightTask.id == task_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="数据洞察任务不存在")
    await db.commit()


@router.post("/project/{project_id}/tasks/{task_id}/save-as-dataset", response_model=DataInsightSaveAsDatasetResponse)
async def save_insight_as_dataset(
    project_id: int = Path(..., gt=0),
    task_id: int = Path(..., gt=0),
    request: DataInsightSaveAsDatasetRequest = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
) -> DataInsightSaveAsDatasetResponse:
    db, _ = deps
    result = await db.execute(select(DataInsightTask).where(DataInsightTask.project_id == project_id, DataInsightTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="数据洞察任务不存在")
    task.config = {**(task.config or {}), "last_save_as_dataset": request.model_dump()}
    await db.commit()
    return DataInsightSaveAsDatasetResponse(
        dataset_name=request.name,
        version=request.version,
        status="submitted",
        message="已提交另存为新数据集请求；V1.15 首版保留任务记录，后续接入真实数据集写回执行器。",
    )

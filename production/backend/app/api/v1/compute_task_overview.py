from typing import Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.compute_task_overview import (
    ComputeTaskScope,
    LatestTasksResponse,
    ProjectResourceUsageResponse,
    ResourceUsageResponse,
    StatusStatsResponse,
    TaskTypeStatsResponse,
)
from app.services.compute_task_overview.interface import ComputeTaskOverviewService
from app.utils.dependencies import get_db_and_user

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/compute-task-overview",
    tags=["compute-task-overview"],
)


@router.get("/task-type-stats", response_model=TaskTypeStatsResponse)
@inject
async def get_task_type_stats(
    project_id: int = Path(..., description="项目ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    compute_task_overview_service: ComputeTaskOverviewService = Depends(
        Provide[AutoContainer.compute_task_overview_service]
    ),
) -> TaskTypeStatsResponse:
    """获取任务类型聚合统计。"""
    db, current_user = deps
    return await compute_task_overview_service.get_task_type_stats(project_id)


@router.get("/status-stats", response_model=StatusStatsResponse)
@inject
async def get_status_stats(
    project_id: int = Path(..., description="项目ID"),
    task_scope: ComputeTaskScope = Query(ComputeTaskScope.TOTAL, description="任务范围"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    compute_task_overview_service: ComputeTaskOverviewService = Depends(
        Provide[AutoContainer.compute_task_overview_service]
    ),
) -> StatusStatsResponse:
    """获取当前任务范围下的状态聚合统计。"""
    db, current_user = deps
    return await compute_task_overview_service.get_status_stats(project_id, task_scope)


@router.get("/latest-tasks", response_model=LatestTasksResponse)
@inject
async def get_latest_tasks(
    project_id: int = Path(..., description="项目ID"),
    task_scope: ComputeTaskScope = Query(ComputeTaskScope.TOTAL, description="任务范围"),
    statuses: Optional[str] = Query(
        None,
        description="状态列表，英文逗号分隔；不传默认 scheduled,starting,queued,running,failed",
    ),
    page: int = Query(1, description="页码，从 1 开始"),
    page_size: Optional[int] = Query(None, description="每个状态分组每页条数，不传默认 4"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    compute_task_overview_service: ComputeTaskOverviewService = Depends(
        Provide[AutoContainer.compute_task_overview_service]
    ),
) -> LatestTasksResponse:
    """获取分状态最新任务列表。"""
    db, current_user = deps
    return await compute_task_overview_service.get_latest_tasks(
        project_id=project_id,
        task_scope=task_scope,
        statuses=statuses,
        page=page,
        page_size=page_size,
    )


@router.get("/project-resources", response_model=ProjectResourceUsageResponse)
@inject
async def get_project_resource_usage(
    project_id: int = Path(..., description="项目ID"),
    task_scope: ComputeTaskScope = Query(ComputeTaskScope.TOTAL, description="任务范围"),
    cluster_id: Optional[int] = Query(None, description="集群ID，不传时使用项目绑定集群"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    compute_task_overview_service: ComputeTaskOverviewService = Depends(
        Provide[AutoContainer.compute_task_overview_service]
    ),
) -> ProjectResourceUsageResponse:
    """获取当前项目环境实时资源占用。"""
    db, current_user = deps
    return await compute_task_overview_service.get_project_resource_usage(
        project_id=project_id,
        task_scope=task_scope,
        cluster_id=cluster_id,
    )


@router.get("/cluster-resources", response_model=ResourceUsageResponse)
@inject
async def get_cluster_resource_usage(
    project_id: int = Path(..., description="项目ID"),
    cluster_id: Optional[int] = Query(None, description="集群ID，不传时使用项目绑定集群"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    compute_task_overview_service: ComputeTaskOverviewService = Depends(
        Provide[AutoContainer.compute_task_overview_service]
    ),
) -> ResourceUsageResponse:
    """获取项目绑定集群环境实时资源占用。"""
    db, current_user = deps
    return await compute_task_overview_service.get_cluster_resource_usage(
        project_id=project_id,
        cluster_id=cluster_id,
    )

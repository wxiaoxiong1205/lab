from abc import ABC, abstractmethod
from typing import Optional

from app.repository.base_mapper import BaseMapper
from app.schemas.compute_task_overview import (
    ComputeTaskScope,
    LatestTasksResponse,
    ProjectResourceUsageResponse,
    ResourceUsageResponse,
    StatusStatsResponse,
    TaskTypeStatsResponse,
)
from app.services.k8s.interface import K8sService


class ComputeTaskOverviewService(ABC):
    def __init__(self, mapper: BaseMapper, k8s_service: K8sService) -> None:
        self.mapper = mapper
        self.k8s_service = k8s_service

    @abstractmethod
    async def get_task_type_stats(self, project_id: int) -> TaskTypeStatsResponse:
        pass

    @abstractmethod
    async def get_status_stats(
        self,
        project_id: int,
        task_scope: ComputeTaskScope = ComputeTaskScope.TOTAL,
    ) -> StatusStatsResponse:
        pass

    @abstractmethod
    async def get_latest_tasks(
        self,
        project_id: int,
        task_scope: ComputeTaskScope = ComputeTaskScope.TOTAL,
        statuses: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = None,
    ) -> LatestTasksResponse:
        pass

    @abstractmethod
    async def get_project_resource_usage(
        self,
        project_id: int,
        task_scope: ComputeTaskScope = ComputeTaskScope.TOTAL,
        cluster_id: Optional[int] = None,
    ) -> ProjectResourceUsageResponse:
        pass

    @abstractmethod
    async def get_cluster_resource_usage(
        self,
        project_id: int,
        cluster_id: Optional[int] = None,
    ) -> ResourceUsageResponse:
        pass

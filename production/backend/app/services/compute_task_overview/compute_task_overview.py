import base64
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import yaml
from fastapi import HTTPException
from kubernetes import client
from sqlalchemy import select

from app.common.k8s_labels import K8sLabels
from app.common.status import TaskStatus
from app.core.logging import logger
from app.models.benchmark_task_manager import BenchmarkTask
from app.models.data_cleaning_manager import DataCleaningTask
from app.models.evaluation_task_manager import EvaluationTask
from app.models.inference_result_manager import InferenceResultDataset
from app.models.inference_task_manager import InferenceTask
from app.models.model_manager import MLModel, TrainedModel
from app.models.models import ImageBuildLog, KubernetesResource, Notebook, ProjectKubernetesRelation, baseModel
from app.models.training_task_manager import TrainingTask
from app.schemas.compute_task_overview import (
    ComputeTaskScope,
    ComputeTaskType,
    LatestTaskGroup,
    LatestTaskItem,
    LatestTaskResourceInfo,
    LatestTasksResponse,
    ProjectResourceUsageResponse,
    ResourceCardModelInfo,
    ResourceMetric,
    ResourceTypeInfo,
    ResourceUsageResponse,
    StatusCount,
    StatusStatsResponse,
    TaskResourceAmount,
    TaskSourceRef,
    TaskTypeCount,
    TaskTypeStatsResponse,
)
from app.schemas.k8s import KubeLabelsType
from app.schemas.repository_image import ImageType
from app.services.compute_task_overview.interface import ComputeTaskOverviewService
from app.utils import app_runtime_context
from app.utils.k8s_call import get_k8s_api, k8s_call


STATUS_ORDER: Tuple[str, ...] = (
    "created",
    "scheduled",
    "starting",
    "queued",
    "running",
    "terminated",
    "completed",
    "failed",
)

LATEST_STATUS_ORDER: Tuple[str, ...] = (
    "scheduled",
    "starting",
    "queued",
    "running",
    "failed",
)

STATUS_NAMES: Dict[str, str] = {
    "created": "已创建",
    "scheduled": "定时待启动",
    "starting": "启动中",
    "queued": "排队中",
    "running": "运行中",
    "terminated": "已终止",
    "completed": "已完成",
    "failed": "失败",
}

STATUS_RESOURCE_USAGE_TIPS: Dict[str, str] = {
    "created": "资源尚未被占用",
    "scheduled": "资源即将被占用",
    "starting": "资源即将被占用",
    "queued": "资源即将被占用",
    "running": "资源正在被占用",
    "terminated": "资源已释放",
    "completed": "资源已释放",
    "failed": "资源占用失败",
}

TASK_SCOPE_NAMES: Dict[str, str] = {
    ComputeTaskScope.TOTAL.value: "全部任务",
    ComputeTaskScope.LLM.value: "大模型",
    ComputeTaskScope.MACHINE_LEARNING.value: "机器学习",
}

TERMINAL_POD_PHASES = {"Succeeded", "Failed"}


@dataclass(frozen=True)
class TaskSourceSpec:
    source_type: str
    source_table: str
    model: type[baseModel]
    name_getter: Callable[[Any], str]
    task_type_getter: Callable[[Any, str], ComputeTaskType]
    scope_getter: Callable[[Any], str]
    resource_getter: Callable[[Any], LatestTaskResourceInfo]


@dataclass
class OverviewTaskRecord:
    task_id: int
    task_name: str
    task_scope: str
    task_type: str
    task_type_name: str
    status: str
    status_name: str
    created_at: Optional[datetime]
    status_updated_at: Optional[datetime]
    creator_id: Optional[int]
    created_by: Optional[str]
    resources: LatestTaskResourceInfo
    source_type: str
    source_table: str
    source_id: int
    lab_k8s_uuid: Optional[str] = None


@dataclass(frozen=True)
class TaskResourceMatchCriteria:
    k8s_uuids: frozenset[str]
    workload_names: frozenset[str]
    workload_prefixes: frozenset[str]


class DefaultComputeTaskOverviewService(ComputeTaskOverviewService):
    async def get_task_type_stats(self, project_id: int) -> TaskTypeStatsResponse:
        records = await self._load_task_records(project_id)
        counts = self._count_by_scope(records)

        return TaskTypeStatsResponse(
            project_id=project_id,
            items=[
                TaskTypeCount(
                    task_scope=scope,
                    task_scope_name=TASK_SCOPE_NAMES[scope],
                    count=counts.get(scope, 0),
                )
                for scope in (
                    ComputeTaskScope.TOTAL.value,
                    ComputeTaskScope.LLM.value,
                    ComputeTaskScope.MACHINE_LEARNING.value,
                )
            ],
        )

    async def get_status_stats(
        self,
        project_id: int,
        task_scope: ComputeTaskScope = ComputeTaskScope.TOTAL,
    ) -> StatusStatsResponse:
        records = self._filter_records_by_scope(
            await self._load_task_records(project_id),
            task_scope.value,
        )
        counts = {status: 0 for status in STATUS_ORDER}
        for record in records:
            counts[record.status] = counts.get(record.status, 0) + 1

        return StatusStatsResponse(
            project_id=project_id,
            task_scope=task_scope.value,
            total=len(records),
            statuses=[
                StatusCount(
                    status_code=status,
                    status_name=STATUS_NAMES[status],
                    count=counts.get(status, 0),
                )
                for status in STATUS_ORDER
            ],
        )

    async def get_latest_tasks(
        self,
        project_id: int,
        task_scope: ComputeTaskScope = ComputeTaskScope.TOTAL,
        statuses: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = None,
    ) -> LatestTasksResponse:
        status_codes = self._parse_statuses(statuses)
        if page <= 0:
            raise HTTPException(status_code=400, detail="page 必须大于 0")
        if page_size is not None and page_size <= 0:
            raise HTTPException(status_code=400, detail="page_size 必须大于 0")

        effective_page_size = page_size or 4
        offset = (page - 1) * effective_page_size

        records = self._filter_records_by_scope(
            await self._load_task_records(project_id),
            task_scope.value,
        )
        records = [record for record in records if record.status in set(status_codes)]
        records_by_status: Dict[str, List[OverviewTaskRecord]] = {
            status: [] for status in status_codes
        }
        for record in records:
            records_by_status.setdefault(record.status, []).append(record)

        groups: List[LatestTaskGroup] = []
        for status in status_codes:
            status_records = sorted(
                records_by_status.get(status, []),
                key=lambda item: item.created_at or datetime.min,
                reverse=True,
            )
            total_count = len(status_records)
            limited_records = status_records[offset:offset + effective_page_size]
            total_pages = math.ceil(total_count / effective_page_size) if total_count else 0
            groups.append(
                LatestTaskGroup(
                    status=status,
                    status_name=STATUS_NAMES[status],
                    resource_usage_tip=STATUS_RESOURCE_USAGE_TIPS.get(status, ""),
                    total_count=total_count,
                    page=page,
                    page_size=effective_page_size,
                    total_pages=total_pages,
                    has_more=total_count > offset + len(limited_records),
                    items=[self._to_latest_item(record) for record in limited_records],
                )
            )

        return LatestTasksResponse(
            project_id=project_id,
            task_scope=task_scope.value,
            page=page,
            page_size=effective_page_size,
            groups=groups,
        )

    async def get_project_resource_usage(
        self,
        project_id: int,
        task_scope: ComputeTaskScope = ComputeTaskScope.TOTAL,
        cluster_id: Optional[int] = None,
    ) -> ProjectResourceUsageResponse:
        cluster, namespace = await self._get_project_cluster(project_id, cluster_id)
        records = self._filter_records_by_scope(
            await self._load_task_records(project_id),
            task_scope.value,
        )
        running_records = [record for record in records if record.status == "running"]
        pod_filter = self._build_task_scope_pod_filter(running_records)
        return await self._collect_k8s_resource_usage(
            project_id=project_id,
            cluster=cluster,
            namespace=namespace,
            scope="project",
            task_scope=task_scope.value,
            pod_filter=pod_filter,
        )

    async def get_cluster_resource_usage(
        self,
        project_id: int,
        cluster_id: Optional[int] = None,
    ) -> ResourceUsageResponse:
        cluster, _ = await self._get_project_cluster(project_id, cluster_id)
        return await self._collect_k8s_resource_usage(
            project_id=project_id,
            cluster=cluster,
            namespace=None,
            scope="cluster",
        )

    async def _load_task_records(self, project_id: int) -> List[OverviewTaskRecord]:
        records: List[OverviewTaskRecord] = []
        for spec in self._task_source_specs():
            rows = await self.mapper.query(
                select(spec.model).where(getattr(spec.model, "project_id") == project_id)
            )
            for row in rows:
                status = self._normalize_status(getattr(row, "status", None))
                task_name = spec.name_getter(row) or f"{spec.source_type}-{row.id}"
                task_scope = spec.scope_getter(row)
                task_type = spec.task_type_getter(row, task_scope)
                records.append(
                    OverviewTaskRecord(
                        task_id=int(row.id),
                        task_name=str(task_name),
                        task_scope=task_scope,
                        task_type=task_type.value,
                        task_type_name=task_type.display_name,
                        status=status,
                        status_name=STATUS_NAMES[status],
                        created_at=getattr(row, "created_at", None),
                        status_updated_at=getattr(row, "updated_at", None),
                        creator_id=getattr(row, "created_id", None),
                        created_by=getattr(row, "created_by", None),
                        resources=spec.resource_getter(row),
                        source_type=spec.source_type,
                        source_table=spec.source_table,
                        source_id=int(row.id),
                        lab_k8s_uuid=getattr(row, "lab_k8s_uuid", None),
                    )
                )
        return records

    def _task_source_specs(self) -> List[TaskSourceSpec]:
        return [
            TaskSourceSpec(
                source_type="training_task",
                source_table="training_tasks",
                model=TrainingTask,
                name_getter=lambda row: row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.LLM_TRAINING,
                scope_getter=lambda row: ComputeTaskScope.LLM.value,
                resource_getter=lambda row: self._resource_from_graphics_card(
                    row.graphics_card_resource,
                    fallback_card_count=row.gpu_count,
                ),
            ),
            TaskSourceSpec(
                source_type="trained_model",
                source_table="trained_models",
                model=TrainedModel,
                name_getter=lambda row: row.task_name or row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.LLM_TRAINING,
                scope_getter=lambda row: ComputeTaskScope.LLM.value,
                resource_getter=lambda row: self._resource_from_graphics_card(row.graphics_card_resource),
            ),
            TaskSourceSpec(
                source_type="inference_task",
                source_table="inference_tasks",
                model=InferenceTask,
                name_getter=lambda row: row.server_name,
                task_type_getter=self._inference_task_type,
                scope_getter=self._inference_task_scope,
                resource_getter=self._inference_task_resources,
            ),
            TaskSourceSpec(
                source_type="notebook",
                source_table="notebooks",
                model=Notebook,
                name_getter=lambda row: row.instance_name,
                task_type_getter=self._notebook_task_type,
                scope_getter=self._notebook_scope,
                resource_getter=self._notebook_resources,
            ),
            TaskSourceSpec(
                source_type="inference_result_dataset",
                source_table="inference_result_datasets",
                model=InferenceResultDataset,
                name_getter=lambda row: row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.LLM_INFERENCE_RESULT,
                scope_getter=lambda row: ComputeTaskScope.LLM.value,
                resource_getter=lambda row: self._resource_from_graphics_card(row.graphics_card_resource),
            ),
            TaskSourceSpec(
                source_type="evaluation_task",
                source_table="evaluation_tasks",
                model=EvaluationTask,
                name_getter=lambda row: row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.LLM_EVALUATION,
                scope_getter=lambda row: ComputeTaskScope.LLM.value,
                resource_getter=lambda row: self._resource_from_graphics_card(row.graphics_card_resource),
            ),
            TaskSourceSpec(
                source_type="benchmark_task",
                source_table="benchmark_tasks",
                model=BenchmarkTask,
                name_getter=lambda row: row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.LLM_BENCHMARK,
                scope_getter=lambda row: ComputeTaskScope.LLM.value,
                resource_getter=lambda row: self._resource_from_graphics_card(row.graphics_card_resource),
            ),
            TaskSourceSpec(
                source_type="data_cleaning_task",
                source_table="data_cleaning_tasks",
                model=DataCleaningTask,
                name_getter=lambda row: row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.DATA_CLEANING,
                scope_getter=lambda row: self._scope_by_keywords(row.name, row.source),
                resource_getter=lambda row: self._empty_task_resources(),
            ),
            TaskSourceSpec(
                source_type="ml_model",
                source_table="ml_models",
                model=MLModel,
                name_getter=lambda row: row.name,
                task_type_getter=lambda row, task_scope: ComputeTaskType.MACHINE_LEARNING_MODEL,
                scope_getter=lambda row: ComputeTaskScope.MACHINE_LEARNING.value,
                resource_getter=lambda row: self._empty_task_resources(),
            ),
            TaskSourceSpec(
                source_type="image_build_log",
                source_table="image_build_log",
                model=ImageBuildLog,
                name_getter=lambda row: row.name,
                task_type_getter=self._image_build_task_type,
                scope_getter=self._image_build_scope,
                resource_getter=lambda row: self._empty_task_resources(),
            ),
        ]

    def _inference_task_scope(self, row: InferenceTask) -> str:
        if self._contains_ml(row.model_source, row.model_name, row.server_name):
            return ComputeTaskScope.MACHINE_LEARNING.value
        return ComputeTaskScope.LLM.value

    def _inference_task_type(self, row: InferenceTask, task_scope: str) -> ComputeTaskType:
        if task_scope == ComputeTaskScope.MACHINE_LEARNING.value:
            return ComputeTaskType.MACHINE_LEARNING_MODEL_DEPLOYMENT
        return ComputeTaskType.LLM_DEPLOYMENT

    def _notebook_scope(self, row: Notebook) -> str:
        return self._scope_by_keywords(
            row.biz_type,
            row.usage,
            row.instance_name,
            row.image,
            getattr(row, "gpu_type", None),
        )

    def _notebook_task_type(self, row: Notebook, task_scope: str) -> ComputeTaskType:
        if task_scope == ComputeTaskScope.MACHINE_LEARNING.value:
            return ComputeTaskType.MACHINE_LEARNING_NOTEBOOK
        return ComputeTaskType.LLM_NOTEBOOK

    def _scope_by_keywords(self, *values: Optional[str]) -> str:
        if self._contains_ml(*values):
            return ComputeTaskScope.MACHINE_LEARNING.value
        return ComputeTaskScope.LLM.value

    def _image_build_scope(self, row: ImageBuildLog) -> str:
        if row.image_type in {ImageType.CUSTOM_ML_NOTEBOOK.value, ImageType.ML_NOTEBOOK.value}:
            return ComputeTaskScope.MACHINE_LEARNING.value
        if row.image_type in {ImageType.CUSTOM_LLM_NOTEBOOK.value, ImageType.LLM_NOTEBOOK.value}:
            return ComputeTaskScope.LLM.value
        return self._scope_by_keywords(row.name, row.business_name, row.output_image)

    def _image_build_task_type(self, row: ImageBuildLog, task_scope: str) -> ComputeTaskType:
        if task_scope == ComputeTaskScope.MACHINE_LEARNING.value:
            return ComputeTaskType.MACHINE_LEARNING_IMAGE_BUILD
        return ComputeTaskType.LLM_IMAGE_BUILD

    def _inference_task_resources(self, row: InferenceTask) -> LatestTaskResourceInfo:
        return self._resource_from_graphics_card(
            row.graphics_card_resource,
            cpu_config=row.resource_cpu_config,
            fallback_card_count=row.gpu_count,
            fallback_k8s_resource_type=row.gpu_type,
            replicas=row.desired_replicas,
        )

    def _notebook_resources(self, row: Notebook) -> LatestTaskResourceInfo:
        ext = row.ext if isinstance(row.ext, dict) else {}
        ml_debug = ext.get("ml_debug") if isinstance(ext.get("ml_debug"), dict) else {}
        graphics_card_resource = {
            "card_type": ext.get("category") or ml_debug.get("category") or self._resource_type_from_k8s(row.gpu_type),
            "card_model": ext.get("model") or ml_debug.get("model"),
            "card_memory": ext.get("memory") or ml_debug.get("memory"),
            "count": row.gpu_count,
            "k8s_resource_type": row.gpu_type,
        }
        cpu_config = {
            "resource_cpu_request": row.resource_cpu_request,
            "resource_cpu_limit": row.resource_cpu_limit,
            "resource_memory_request": row.resource_memory_request,
            "resource_memory_limit": row.resource_memory_limit,
        }
        return self._resource_from_graphics_card(
            graphics_card_resource,
            cpu_config=cpu_config,
            fallback_card_count=row.gpu_count,
            fallback_k8s_resource_type=row.gpu_type,
        )

    def _empty_task_resources(self) -> LatestTaskResourceInfo:
        return LatestTaskResourceInfo()

    def _resource_from_graphics_card(
        self,
        graphics_card_resource: Optional[Any],
        cpu_config: Optional[Any] = None,
        fallback_card_count: Optional[Any] = None,
        fallback_k8s_resource_type: Optional[str] = None,
        replicas: Optional[int] = None,
    ) -> LatestTaskResourceInfo:
        graphics = self._plain_dict(graphics_card_resource)
        cpu = self._plain_dict(cpu_config)
        raw: Dict[str, Any] = {}
        if graphics:
            raw["graphics_card_resource"] = graphics
        if cpu:
            raw["resource_cpu_config"] = cpu

        replica_count = self._positive_int(replicas) or 1
        if replicas is not None:
            raw["replicas"] = replica_count

        resource_type = self._optional_str(graphics.get("card_type")) or self._resource_type_from_k8s(
            self._optional_str(graphics.get("k8s_resource_type")) or fallback_k8s_resource_type
        )
        resource_card_model = self._optional_str(graphics.get("card_model"))
        resource_card_memory = self._optional_str(graphics.get("card_memory"))
        k8s_resource_type = self._optional_str(graphics.get("k8s_resource_type")) or fallback_k8s_resource_type

        card_count_value = self._first_number(graphics, ("count", "gpu_count"))
        if card_count_value is None:
            card_count_value = self._optional_number(fallback_card_count)
        has_graphics_card = bool(k8s_resource_type) and (resource_type or "").upper() != "CPU"
        total_card_count = card_count_value * replica_count if has_graphics_card and card_count_value else None

        card_memory_gb = self._parse_card_memory_to_gb(resource_card_memory)
        total_gpu_memory = total_card_count * card_memory_gb if total_card_count and card_memory_gb else None

        cpu_request = self._first_cpu(cpu, ("resource_cpu_request", "cpu_request"))
        cpu_limit = self._first_cpu(cpu, ("resource_cpu_limit", "cpu_limit", "cpu"))
        if cpu_request is None:
            cpu_request = self._first_cpu(graphics, ("resource_cpu_request", "cpu_request"))
        if cpu_limit is None:
            cpu_limit = self._first_cpu(graphics, ("resource_cpu_limit", "cpu_limit", "cpu"))

        memory_request = self._first_memory(cpu, ("resource_memory_request", "memory_request"))
        memory_limit = self._first_memory(cpu, ("resource_memory_limit", "memory_limit", "memory"))
        if memory_request is None:
            memory_request = self._first_memory(graphics, ("resource_memory_request", "memory_request"))
        if memory_limit is None:
            memory_limit = self._first_memory(graphics, ("resource_memory_limit", "memory_limit", "memory"))

        if replica_count > 1:
            cpu_request = cpu_request * replica_count if cpu_request is not None else None
            cpu_limit = cpu_limit * replica_count if cpu_limit is not None else None
            memory_request = memory_request * replica_count if memory_request is not None else None
            memory_limit = memory_limit * replica_count if memory_limit is not None else None

        card_count = self._task_resource_amount(total_card_count, "卡")
        gpu_memory = self._task_resource_amount(total_gpu_memory, "GB")
        cpu_request_amount = self._task_resource_amount(cpu_request, "核")
        cpu_limit_amount = self._task_resource_amount(cpu_limit, "核")
        memory_request_amount = self._task_resource_amount(memory_request, "GB")
        memory_limit_amount = self._task_resource_amount(memory_limit, "GB")

        return LatestTaskResourceInfo(
            resource_type=resource_type,
            resource_card_model=resource_card_model,
            resource_card_memory=resource_card_memory,
            k8s_resource_type=k8s_resource_type,
            replicas=replica_count if replicas is not None else None,
            card_count=card_count,
            gpu_memory=gpu_memory,
            cpu_request=cpu_request_amount,
            cpu_limit=cpu_limit_amount,
            memory_request=memory_request_amount,
            memory_limit=memory_limit_amount,
            summary=self._task_resource_summary(
                resource_type=resource_type,
                resource_card_model=resource_card_model,
                resource_card_memory=resource_card_memory,
                card_count=card_count,
                cpu=cpu_request_amount or cpu_limit_amount,
                memory=memory_request_amount or memory_limit_amount,
            ),
            raw=raw,
        )

    def _task_resource_summary(
        self,
        resource_type: Optional[str],
        resource_card_model: Optional[str],
        resource_card_memory: Optional[str],
        card_count: Optional[TaskResourceAmount],
        cpu: Optional[TaskResourceAmount],
        memory: Optional[TaskResourceAmount],
    ) -> List[str]:
        summary: List[str] = []
        if card_count and card_count.value:
            card_parts = [part for part in (resource_type, resource_card_model, resource_card_memory) if part]
            card_label = " ".join(card_parts) if card_parts else "GPU/NPU"
            summary.append(f"{card_label} {card_count.value:g}{card_count.unit}")
        if cpu and cpu.value:
            summary.append(f"CPU {cpu.value:g}{cpu.unit}")
        if memory and memory.value:
            summary.append(f"内存 {memory.value:g}{memory.unit}")
        return summary

    def _task_resource_amount(self, value: Optional[float], unit: str) -> Optional[TaskResourceAmount]:
        if value is None:
            return None
        return TaskResourceAmount(value=self._round_number(value), unit=unit)

    def _plain_dict(self, value: Optional[Any]) -> Dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return {str(key): self._jsonable_value(item) for key, item in value.items()}
        if hasattr(value, "model_dump"):
            dumped = value.model_dump(mode="json")
            return dumped if isinstance(dumped, dict) else {}
        return {}

    def _jsonable_value(self, value: Any) -> Any:
        if hasattr(value, "value"):
            return value.value
        if isinstance(value, Decimal):
            return float(value)
        return value

    def _resource_type_from_k8s(self, k8s_resource_type: Optional[str]) -> Optional[str]:
        if not k8s_resource_type:
            return None
        normalized = k8s_resource_type.lower()
        if "npu" in normalized:
            return "NPU"
        if "gpu" in normalized:
            return "GPU"
        return None

    def _optional_str(self, value: Optional[Any]) -> Optional[str]:
        if value is None:
            return None
        raw = self._jsonable_value(value)
        text = str(raw).strip()
        return text or None

    def _positive_int(self, value: Optional[Any]) -> Optional[int]:
        number = self._optional_number(value)
        if number is None or number <= 0:
            return None
        return int(number)

    def _first_number(self, values: Dict[str, Any], keys: Sequence[str]) -> Optional[float]:
        for key in keys:
            number = self._optional_number(values.get(key))
            if number is not None:
                return number
        return None

    def _first_cpu(self, values: Dict[str, Any], keys: Sequence[str]) -> Optional[float]:
        for key in keys:
            value = values.get(key)
            if not self._has_value(value):
                continue
            return self._parse_cpu_quantity(value)
        return None

    def _first_memory(self, values: Dict[str, Any], keys: Sequence[str]) -> Optional[float]:
        for key in keys:
            value = values.get(key)
            if not self._has_value(value):
                continue
            return self._parse_memory_quantity_to_gb(value)
        return None

    def _optional_number(self, value: Optional[Any]) -> Optional[float]:
        if not self._has_value(value):
            return None
        return self._parse_numeric_quantity(value)

    def _has_value(self, value: Optional[Any]) -> bool:
        return value is not None and str(value).strip() != ""

    def _contains_ml(self, *values: Optional[str]) -> bool:
        for value in values:
            if value is None:
                continue
            normalized = str(value).lower()
            if "machine" in normalized:
                return True
            if re.search(r"(^|[_\-/\s])ml([_\-/\s]|$)", normalized):
                return True
            if normalized == "ml" or normalized.startswith("ml_") or normalized.endswith("_ml"):
                return True
        return False

    def _normalize_status(self, raw_status: Optional[Any]) -> str:
        if raw_status is None:
            return "created"
        raw = raw_status.value if hasattr(raw_status, "value") else raw_status
        status = str(raw).strip()
        status_lower = status.lower()

        mapping = {
            "created": "created",
            TaskStatus.CREATED.value: "created",
            "scheduled": "scheduled",
            "scheduled_pending": "scheduled",
            TaskStatus.SCHEDULED_PENDING.value: "scheduled",
            "preparing": "starting",
            "starting": "starting",
            "creating": "starting",
            "processing": "running",
            TaskStatus.PREPARING.value: "starting",
            TaskStatus.CREATING.value: "starting",
            "pending": "queued",
            "queued": "queued",
            TaskStatus.PENDING.value: "queued",
            "running": "running",
            "annotating": "running",
            TaskStatus.RUNNING.value: "running",
            "completed": "completed",
            TaskStatus.COMPLETED.value: "completed",
            "terminated": "terminated",
            "cancelled": "terminated",
            "stopped": "terminated",
            TaskStatus.TERMINATED.value: "terminated",
            "failed": "failed",
            "creation_failed": "failed",
            TaskStatus.FAILED.value: "failed",
            TaskStatus.CREATION_FAILED.value: "failed",
            "创建失败": "failed",
        }
        return mapping.get(status_lower) or mapping.get(status) or "created"

    def _count_by_scope(self, records: Sequence[OverviewTaskRecord]) -> Dict[str, int]:
        counts = {
            ComputeTaskScope.TOTAL.value: len(records),
            ComputeTaskScope.LLM.value: 0,
            ComputeTaskScope.MACHINE_LEARNING.value: 0,
        }
        for record in records:
            counts[record.task_scope] = counts.get(record.task_scope, 0) + 1
        return counts

    def _filter_records_by_scope(
        self,
        records: Sequence[OverviewTaskRecord],
        task_scope: str,
    ) -> List[OverviewTaskRecord]:
        if task_scope == ComputeTaskScope.TOTAL.value:
            return list(records)
        return [record for record in records if record.task_scope == task_scope]

    def _parse_statuses(self, statuses: Optional[str]) -> List[str]:
        if not statuses:
            return list(LATEST_STATUS_ORDER)
        parsed = []
        for raw_status in statuses.split(","):
            status = raw_status.strip()
            if not status:
                continue
            if not self._is_known_status_input(status):
                raise HTTPException(status_code=400, detail=f"不支持的任务状态: {status}")
            normalized = self._normalize_status(status)
            parsed.append(normalized)
        return parsed or list(LATEST_STATUS_ORDER)

    def _is_known_status_input(self, status: str) -> bool:
        values = set(STATUS_ORDER) | set(STATUS_NAMES.values()) | {
            "scheduled_pending",
            "preparing",
            "creating",
            "processing",
            "pending",
            "annotating",
            "cancelled",
            "stopped",
            "creation_failed",
            "创建中",
            "创建失败",
        }
        return status in values or status.lower() in values

    def _to_latest_item(self, record: OverviewTaskRecord) -> LatestTaskItem:
        source = TaskSourceRef(
            source_type=record.source_type,
            source_id=record.source_id,
            source_table=record.source_table,
        )
        return LatestTaskItem(
            task_id=record.task_id,
            task_name=record.task_name,
            task_scope=record.task_scope,
            task_scope_name=TASK_SCOPE_NAMES.get(record.task_scope, record.task_scope),
            task_type=record.task_type,
            task_type_name=record.task_type_name,
            status=record.status,
            status_name=record.status_name,
            creator_id=record.creator_id,
            created_by=record.created_by,
            created_at=record.created_at,
            status_updated_at=record.status_updated_at,
            resources=record.resources,
            source=source,
            detail_ref=source,
            list_filter={
                "task_scope": record.task_scope,
                "status": record.status,
                "source_type": record.source_type,
            },
        )

    async def _get_project_cluster(
        self,
        project_id: int,
        cluster_id: Optional[int],
    ) -> Tuple[KubernetesResource, str]:
        tenant_id = app_runtime_context.get_tenant_id()
        stmt = (
            select(KubernetesResource, ProjectKubernetesRelation.namespace)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        if cluster_id is not None:
            stmt = stmt.where(KubernetesResource.id == cluster_id)
        if tenant_id:
            stmt = stmt.where(
                KubernetesResource.tenant_id == tenant_id,
                ProjectKubernetesRelation.tenant_id == tenant_id,
            )

        session = await self.mapper.get_session()
        result = await session.execute(stmt)
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="项目未绑定K8s集群")
        return row[0], row[1]

    def _collect_available_resources(self, nodes: Iterable[Any]) -> List[ResourceTypeInfo]:
        grouped: Dict[str, Dict[Tuple[str, str], Dict[str, Any]]] = {}
        cpu_total = 0.0
        memory_total = 0.0

        for node in nodes:
            node_name = getattr(getattr(node, "metadata", None), "name", None)
            labels = getattr(getattr(node, "metadata", None), "labels", None) or {}
            allocatable = getattr(getattr(node, "status", None), "allocatable", None) or {}
            cpu_total += self._parse_cpu_quantity(allocatable.get("cpu"))
            memory_total += self._parse_memory_quantity_to_gb(allocatable.get("memory"))

            category = (labels.get(KubeLabelsType.DP_GRAPHICS_CARD_CATEGORY.value) or "").strip().upper()
            alloc_key = labels.get(KubeLabelsType.DP_GRAPHICS_CARD_ALLOCATABLE.value)
            alloc_key = self._safe_b64_url_decode(alloc_key) if alloc_key else None

            if not category or category not in {"GPU", "NPU"}:
                category, alloc_key = self._infer_graphics_resource_from_allocatable(allocatable)
            if not category or not alloc_key:
                continue

            card_count = self._parse_numeric_quantity(allocatable.get(alloc_key))
            if card_count <= 0:
                continue

            model = (labels.get(KubeLabelsType.DP_GRAPHICS_CARD_MODEL.value) or "").strip() or None
            memory = (labels.get(KubeLabelsType.DP_GRAPHICS_CARD_MEMORY.value) or "").strip()
            card_memory = self._parse_card_memory_to_gb(memory)
            model_key = model or ""

            category_group = grouped.setdefault(category, {})
            option = category_group.setdefault(
                (model_key, alloc_key),
                {
                    "resource_card_model": model,
                    "resource_card_memories": set(),
                    "k8s_resource_type": alloc_key,
                    "total_cards": 0.0,
                    "total_memory": 0.0,
                    "nodes": set(),
                },
            )
            if memory:
                option["resource_card_memories"].add(memory)
            if node_name:
                option["nodes"].add(node_name)
            option["total_cards"] += card_count
            option["total_memory"] += card_count * card_memory

        items: List[ResourceTypeInfo] = []
        for resource_type in sorted(grouped, key=lambda value: {"GPU": 0, "NPU": 1}.get(value, 99)):
            card_models: List[ResourceCardModelInfo] = []
            for option in sorted(
                grouped[resource_type].values(),
                key=lambda value: (value["resource_card_model"] or "", value["k8s_resource_type"]),
            ):
                memories = sorted(option["resource_card_memories"])
                card_models.append(
                    ResourceCardModelInfo(
                        resource_card_model=option["resource_card_model"],
                        resource_card_memories=memories,
                        k8s_resource_type=option["k8s_resource_type"],
                        description=self._resource_info_description(
                            option["resource_card_model"],
                            memories,
                            option["k8s_resource_type"],
                        ),
                        total_cards=self._round_number(option["total_cards"]),
                        total_memory=self._round_number(option["total_memory"]),
                        node_count=len(option["nodes"]),
                    )
                )
            items.append(
                ResourceTypeInfo(
                    resource_type=resource_type,
                    resource_type_name=resource_type,
                    total=self._round_number(sum(option["total_cards"] for option in grouped[resource_type].values())),
                    unit="卡",
                    card_models=card_models,
                )
            )
        if cpu_total > 0:
            items.append(
                ResourceTypeInfo(
                    resource_type="CPU",
                    resource_type_name="CPU",
                    total=self._round_number(cpu_total),
                    unit="核",
                    card_models=[],
                )
            )
        if memory_total > 0:
            items.append(
                ResourceTypeInfo(
                    resource_type="MEMORY",
                    resource_type_name="内存",
                    total=self._round_number(memory_total),
                    unit="GB",
                    card_models=[],
                )
            )
        return items

    def _infer_graphics_resource_from_allocatable(
        self,
        allocatable: Dict[str, Any],
    ) -> Tuple[Optional[str], Optional[str]]:
        for resource_type, resource_key in (("GPU", "nvidia.com/gpu"), ("NPU", "huawei.com/npu")):
            if self._parse_numeric_quantity(allocatable.get(resource_key)) > 0:
                return resource_type, resource_key
        return None, None

    def _resource_info_description(
        self,
        model: Optional[str],
        memories: Sequence[str],
        resource_key: str,
    ) -> str:
        name = model or resource_key
        return f"{name} ({', '.join(memories)})" if memories else name

    async def _collect_k8s_resource_usage(
        self,
        project_id: int,
        cluster: KubernetesResource,
        namespace: Optional[str],
        scope: str,
        task_scope: Optional[str] = None,
        pod_filter: Optional[Callable[[Any], bool]] = None,
    ) -> ResourceUsageResponse:
        if self._is_local_preview():
            return self._local_preview_resource_usage(
                project_id=project_id,
                cluster=cluster,
                scope=scope,
                task_scope=task_scope,
            )

        if not cluster.config:
            raise HTTPException(status_code=404, detail="K8s集群配置为空")

        try:
            config_dict = yaml.safe_load(cluster.config)
            api_instance = get_k8s_api(config_dict, client.CoreV1Api)
            nodes = await k8s_call(api_instance.list_node)
            pods = (
                await k8s_call(api_instance.list_namespaced_pod, namespace)
                if namespace
                else await k8s_call(api_instance.list_pod_for_all_namespaces)
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("查询K8s实时资源失败: project_id=%s cluster_id=%s error=%s", project_id, cluster.id, exc)
            raise HTTPException(status_code=500, detail=f"查询K8s实时资源失败: {exc}") from exc

        available_resources = self._collect_available_resources(nodes.items)
        node_stats = self._collect_node_totals(nodes.items)
        filtered_pods = [pod for pod in pods.items if pod_filter is None or pod_filter(pod)]
        pod_stats = self._collect_pod_usage(filtered_pods, node_stats)

        response_data = {
            "project_id": project_id,
            "cluster_id": cluster.id,
            "cluster_name": cluster.name,
            "available_resources": available_resources,
            "scope": scope,
            "gpu_cards": ResourceMetric(
                used=self._round_number(pod_stats["gpu_cards"]),
                total=self._round_number(node_stats["gpu_cards"]),
                unit="卡",
            ),
            "gpu_memory": ResourceMetric(
                used=self._round_number(pod_stats["gpu_memory"]),
                total=self._round_number(node_stats["gpu_memory"]),
                unit="GB",
            ),
            "cpu": ResourceMetric(
                used=self._round_number(pod_stats["cpu"]),
                total=self._round_number(node_stats["cpu"]),
                unit="核",
            ),
            "memory": ResourceMetric(
                used=self._round_number(pod_stats["memory"]),
                total=self._round_number(node_stats["memory"]),
                unit="GB",
            ),
        }
        if task_scope is not None:
            return ProjectResourceUsageResponse(task_scope=task_scope, **response_data)
        return ResourceUsageResponse(**response_data)

    def _is_local_preview(self) -> bool:
        return os.getenv("LAB_LOCAL_PREVIEW", "").lower() in {"1", "true", "yes", "on"}

    def _local_preview_resource_usage(
        self,
        project_id: int,
        cluster: KubernetesResource,
        scope: str,
        task_scope: Optional[str] = None,
    ) -> ResourceUsageResponse:
        available_resources = [
            ResourceTypeInfo(
                resource_type="GPU",
                resource_type_name="GPU",
                total=16,
                unit="卡",
                card_models=[
                    ResourceCardModelInfo(
                        resource_card_model="NVIDIA A100",
                        resource_card_memories=["80GB"],
                        k8s_resource_type="nvidia.com/gpu",
                        description="NVIDIA A100 (80GB)",
                        total_cards=8,
                        total_memory=640,
                        node_count=2,
                    ),
                    ResourceCardModelInfo(
                        resource_card_model="NVIDIA L20",
                        resource_card_memories=["48GB"],
                        k8s_resource_type="nvidia.com/gpu",
                        description="NVIDIA L20 (48GB)",
                        total_cards=8,
                        total_memory=384,
                        node_count=2,
                    ),
                ],
            ),
            ResourceTypeInfo(resource_type="CPU", resource_type_name="CPU", total=256, unit="核"),
            ResourceTypeInfo(resource_type="MEMORY", resource_type_name="内存", total=1024, unit="GB"),
        ]
        is_project_scope = scope == "project"
        response_data = {
            "project_id": project_id,
            "cluster_id": getattr(cluster, "id", None),
            "cluster_name": getattr(cluster, "name", None),
            "available_resources": available_resources,
            "scope": scope,
            "gpu_cards": ResourceMetric(used=5 if is_project_scope else 9, total=16, unit="卡"),
            "gpu_memory": ResourceMetric(used=320 if is_project_scope else 568, total=1024, unit="GB"),
            "cpu": ResourceMetric(used=72 if is_project_scope else 148, total=256, unit="核"),
            "memory": ResourceMetric(used=288 if is_project_scope else 604, total=1024, unit="GB"),
        }
        if task_scope is not None:
            return ProjectResourceUsageResponse(task_scope=task_scope, **response_data)
        return ResourceUsageResponse(**response_data)

    def _collect_node_totals(
        self,
        nodes: Iterable[Any],
    ) -> Dict[str, Any]:
        totals = {
            "cpu": 0.0,
            "memory": 0.0,
            "gpu_cards": 0.0,
            "gpu_memory": 0.0,
            "node_resource_keys": {},
            "node_gpu_memory": {},
        }

        for node in nodes:
            node_name = getattr(getattr(node, "metadata", None), "name", None)
            labels = getattr(getattr(node, "metadata", None), "labels", None) or {}
            allocatable = getattr(getattr(node, "status", None), "allocatable", None) or {}

            totals["cpu"] += self._parse_cpu_quantity(allocatable.get("cpu"))
            totals["memory"] += self._parse_memory_quantity_to_gb(allocatable.get("memory"))

            resource_key = self._node_graphics_resource_key(labels)
            card_count = self._parse_numeric_quantity(allocatable.get(resource_key)) if resource_key else 0
            if card_count <= 0:
                _, resource_key = self._infer_graphics_resource_from_allocatable(allocatable)
                card_count = self._parse_numeric_quantity(allocatable.get(resource_key)) if resource_key else 0
            if not resource_key or card_count <= 0:
                continue

            card_memory = self._parse_card_memory_to_gb(
                labels.get(KubeLabelsType.DP_GRAPHICS_CARD_MEMORY.value)
            )
            totals["gpu_cards"] += card_count
            totals["gpu_memory"] += card_count * card_memory
            if node_name:
                totals["node_resource_keys"][node_name] = resource_key
                totals["node_gpu_memory"][node_name] = card_memory

        return totals

    def _collect_pod_usage(self, pods: Iterable[Any], node_stats: Dict[str, Any]) -> Dict[str, float]:
        usage = {
            "cpu": 0.0,
            "memory": 0.0,
            "gpu_cards": 0.0,
            "gpu_memory": 0.0,
        }
        node_resource_keys = node_stats.get("node_resource_keys") or {}
        node_gpu_memory = node_stats.get("node_gpu_memory") or {}

        for pod in pods:
            phase = getattr(getattr(pod, "status", None), "phase", None)
            if phase in TERMINAL_POD_PHASES:
                continue
            spec = getattr(pod, "spec", None)
            if spec is None:
                continue
            node_name = getattr(spec, "node_name", None)
            if not node_name:
                continue
            containers = list(getattr(spec, "containers", None) or [])

            for container in containers:
                resources = getattr(container, "resources", None)
                requests = dict(getattr(resources, "requests", None) or {}) if resources else {}
                limits = dict(getattr(resources, "limits", None) or {}) if resources else {}
                usage["cpu"] += self._parse_cpu_quantity(requests.get("cpu") or limits.get("cpu"))
                usage["memory"] += self._parse_memory_quantity_to_gb(requests.get("memory") or limits.get("memory"))

                graphics_key = node_resource_keys.get(node_name)
                if not graphics_key:
                    continue
                card_count = self._parse_numeric_quantity(requests.get(graphics_key) or limits.get(graphics_key))
                if card_count <= 0:
                    continue
                usage["gpu_cards"] += card_count
                usage["gpu_memory"] += card_count * float(node_gpu_memory.get(node_name) or 0)
        return usage

    def _build_task_scope_pod_filter(
        self,
        records: Sequence[OverviewTaskRecord],
    ) -> Callable[[Any], bool]:
        criteria = self._build_task_resource_match_criteria(records)

        def _matches(pod: Any) -> bool:
            labels = getattr(getattr(pod, "metadata", None), "labels", None) or {}
            pod_uuid = labels.get(K8sLabels.DEEPEXI_K8S_UUID.value)
            if pod_uuid and pod_uuid in criteria.k8s_uuids:
                return True

            workload_names = self._pod_workload_names(pod)
            if any(name in criteria.workload_names for name in workload_names):
                return True
            return any(
                name.startswith(prefix)
                for name in workload_names
                for prefix in criteria.workload_prefixes
            )

        return _matches

    def _build_task_resource_match_criteria(
        self,
        records: Sequence[OverviewTaskRecord],
    ) -> TaskResourceMatchCriteria:
        k8s_uuids: set[str] = set()
        workload_names: set[str] = set()
        workload_prefixes: set[str] = set()

        for record in records:
            if record.lab_k8s_uuid:
                value = str(record.lab_k8s_uuid).strip()
                if value:
                    k8s_uuids.add(value)
                    workload_names.add(value)
            names, prefixes = self._record_workload_patterns(record)
            workload_names.update(names)
            workload_prefixes.update(prefixes)

        return TaskResourceMatchCriteria(
            k8s_uuids=frozenset(k8s_uuids),
            workload_names=frozenset(name for name in workload_names if name),
            workload_prefixes=frozenset(prefix for prefix in workload_prefixes if prefix),
        )

    def _record_workload_patterns(self, record: OverviewTaskRecord) -> Tuple[set[str], set[str]]:
        source_id = record.source_id
        names: set[str] = set()
        prefixes: set[str] = set()

        if record.source_type == "training_task":
            names.add(f"training-{source_id}")
        elif record.source_type == "trained_model":
            names.add(f"loramerge-{source_id}")
        elif record.source_type == "inference_task":
            names.add(f"model-deploy-{source_id}")
        elif record.source_type == "notebook":
            names.add(f"jupyter-notebook-{source_id}")
            names.add(f"notebook-{source_id}")
        elif record.source_type == "inference_result_dataset":
            names.add(f"offline-inference-{source_id}")
            names.add(f"online-inference-{source_id}")
        elif record.source_type == "evaluation_task":
            names.add(f"offline-evaluation-{source_id}")
            names.add(f"offline-evaluation-{source_id}-all")
            names.add(f"online-evaluation-{source_id}")
            names.add(f"online-evaluation-{source_id}-all")
        elif record.source_type == "benchmark_task":
            names.add(f"benchmark-task-{source_id}")
        elif record.source_type == "data_cleaning_task":
            prefixes.add(f"data-cleaning-{source_id}-")
            prefixes.add(f"data_cleaning-job-{source_id}-")
        elif record.source_type == "image_build_log":
            names.add(f"build-notebook-image-{source_id}")

        return names, prefixes

    def _pod_workload_names(self, pod: Any) -> set[str]:
        names: set[str] = set()
        metadata = getattr(pod, "metadata", None)
        if metadata is None:
            return names

        pod_name = getattr(metadata, "name", None)
        if pod_name:
            names.add(pod_name)

        labels = getattr(metadata, "labels", None) or {}
        for key in ("app", "job-name", "batch.kubernetes.io/job-name", "service"):
            value = labels.get(key)
            if value:
                names.add(value)
        uuid = labels.get(K8sLabels.DEEPEXI_K8S_UUID.value)
        if uuid:
            names.add(uuid)

        for owner in getattr(metadata, "owner_references", None) or []:
            owner_name = getattr(owner, "name", None)
            if not owner_name:
                continue
            names.add(owner_name)
            if getattr(owner, "kind", None) == "ReplicaSet":
                deployment_name = self._deployment_name_from_replicaset(owner_name)
                if deployment_name:
                    names.add(deployment_name)

        return names

    def _deployment_name_from_replicaset(self, name: str) -> Optional[str]:
        prefix, separator, suffix = name.rpartition("-")
        if separator and prefix and re.fullmatch(r"[a-z0-9]{8,12}", suffix or ""):
            return prefix
        return None

    def _node_graphics_resource_key(
        self,
        labels: Dict[str, str],
    ) -> Optional[str]:
        alloc_key = labels.get(KubeLabelsType.DP_GRAPHICS_CARD_ALLOCATABLE.value)
        if alloc_key:
            return self._safe_b64_url_decode(alloc_key)
        return self._default_graphics_resource_key()

    def _default_graphics_resource_key(self) -> str:
        return "nvidia.com/gpu"

    def _safe_b64_url_decode(self, value: str) -> str:
        try:
            padded = value + "=" * (-len(value) % 4)
            decoded = base64.urlsafe_b64decode(padded).decode()
            return decoded or value
        except Exception:
            return value

    def _parse_cpu_quantity(self, value: Optional[Any]) -> float:
        if value is None:
            return 0.0
        raw = str(value).strip()
        if raw.endswith("m"):
            return self._parse_numeric_quantity(raw[:-1]) / 1000
        return self._parse_numeric_quantity(raw)

    def _parse_memory_quantity_to_gb(self, value: Optional[Any]) -> float:
        if value is None:
            return 0.0
        raw = str(value).strip()
        match = re.match(r"^([0-9.]+)([a-zA-Z]+)?$", raw)
        if not match:
            return 0.0
        number = self._parse_numeric_quantity(match.group(1))
        unit = (match.group(2) or "").lower()
        multipliers = {
            "ki": 1 / (1024 * 1024),
            "mi": 1 / 1024,
            "gi": 1,
            "ti": 1024,
            "k": 1 / 1_000_000,
            "m": 1 / 1000,
            "g": 1,
            "t": 1000,
        }
        if not unit:
            return number / (1024 ** 3)
        return number * multipliers.get(unit, 0.0)

    def _parse_card_memory_to_gb(self, value: Optional[Any]) -> float:
        if value is None:
            return 0.0
        raw = str(value).strip().upper().replace(" ", "")
        match = re.match(r"^([0-9.]+)(GIB|GB|GI|MIB|MB|MI)?$", raw)
        if not match:
            return 0.0
        number = self._parse_numeric_quantity(match.group(1))
        unit = match.group(2) or "GB"
        if unit in {"MIB", "MB", "MI"}:
            return number / 1024
        return number

    def _parse_numeric_quantity(self, value: Optional[Any]) -> float:
        if value is None:
            return 0.0
        if isinstance(value, Decimal):
            return float(value)
        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            return 0.0

    def _round_number(self, value: Optional[float]) -> float:
        if value is None or not math.isfinite(value):
            return 0.0
        rounded = round(value, 2)
        return int(rounded) if float(rounded).is_integer() else rounded

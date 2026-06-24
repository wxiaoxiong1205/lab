#!/usr/bin/env python3
"""
任务进度更新器

支持评估任务和推理结果集的进度更新。
"""

import json
import os
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional, Dict, Any, List

from kubernetes import client as k8s_client

from app.common.status import TaskStatus
from app.core.logging import logger
from app.managers.k8s_task_status import map_job_terminal_status
from app.models.benchmark_task_manager import BenchmarkTask
from app.models.evaluation_task_manager import EvaluationTask
from app.models.inference_result_manager import InferenceResultDataset
from app.services.benchmark_task.interface import BenchmarkTaskService
from app.services.benchmark_task.log_progress import (
    get_progress_from_predictions,
)
from app.services.benchmark_task.result_processor import process_benchmark_task_results
from app.services.evaluation_task.interface import EvaluationTaskService
from app.services.inference_result.interface import InferenceResultDatasetService
from app.services.storage.interface import StorageService
from app.utils import app_runtime_context
from app.utils.storage_enum import StoragePath


class TaskProgressUpdater(ABC):
    """任务进度更新器基类"""

    def __init__(self, tenant_id: str, task_id: int, storage_service: StorageService):
        self.tenant_id = tenant_id
        self.id = task_id
        self.storage_service = storage_service

    @abstractmethod
    async def update_task_in_db(self) -> None:
        """更新任务到数据库"""
        pass

    @abstractmethod
    async def commit(self) -> None:
        # 事务提交
        pass

    @abstractmethod
    async def rollback(self) -> None:
        # 事务回滚
        pass

    @abstractmethod
    async def handle_completion(self) -> None:
        """处理任务完成后的逻辑"""
        pass

    @abstractmethod
    def get_progress_file_paths(self, namespace: str, task_id: int) -> List[str]:
        pass

    async def update_progress(self) -> None:
        """更新任务进度"""
        try:
            db_task = await self.get_db_task()
            if not db_task or db_task.progress == 100:
                return

            # 获取 JuiceFS 客户端
            jfs = await self.storage_service.JUICEFS_CLIENT(self.tenant_id)
            if not jfs:
                logger.warning(f"租户 {self.tenant_id} 的 JuiceFS 客户端不可用")
                return

            # 检查进度文件
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{db_task.project_id}"

            # 对于评估任务，需要根据 evaluation_method 获取进度文件列表
            progress_files = self.get_progress_file_paths(namespace, db_task.id)

            if not progress_files:
                return

            # 解析所有进度文件并综合计算进度
            progress_info = self._parse_multiple_progress_files(jfs, progress_files)
            if not progress_info:
                return

            # 更新进度和状态
            self._update_task_progress(db_task, progress_info)

            # 保存到数据库
            await self.update_task_in_db()

        except Exception as e:
            logger.error(f"更新任务 {self.id} [租户: {self.tenant_id}] 进度失败: {e}")

    def _update_task_progress(self, db_task, progress_info: Dict[str, Any]) -> None:
        """更新任务进度和状态"""
        processed_lines = progress_info.get("processed_lines", 0)
        total_lines = progress_info.get("total_lines", 0)
        status = progress_info.get("status", "")

        # 计算进度（如果 progress_info 中已经有综合计算的 progress，直接使用）
        if "progress" in progress_info:
            new_progress = progress_info["progress"]
        else:
            # 否则根据 processed_lines 和 total_lines 计算
            new_progress = min(int((processed_lines / total_lines) * 100), 100) if total_lines > 0 else 0

        if new_progress != db_task.progress:
            logger.info(
                f"任务 {db_task.id} [租户: {self.tenant_id}] 进度更新: "
                f"{db_task.progress}% -> {new_progress}% ({processed_lines}/{total_lines})"
            )
            db_task.progress = new_progress

        # 更新状态（正常情况下状态应该由 K8s 状态管理器更新，这里是兜底逻辑）
        if status == "completed" and db_task.status != TaskStatus.COMPLETED.value:
            logger.warning(
                f"⚠️ 进度文件显示任务已完成，但数据库状态未更新。"
                f"任务 {db_task.id} [租户: {self.tenant_id}] 状态: {db_task.status} -> {TaskStatus.COMPLETED.value}。"
                f"正常情况下应该由 K8s 状态管理器更新状态。"
            )
            db_task.status = TaskStatus.COMPLETED.value
            if not db_task.finished_at:
                db_task.finished_at = datetime.now()
            logger.info(f"任务 {db_task.id} [租户: {self.tenant_id}] 已完成")
        elif status in ["started", "processing"] and db_task.status != TaskStatus.RUNNING.value:
            logger.warning(
                f"⚠️ 进度文件显示任务运行中，但数据库状态未更新。"
                f"任务 {db_task.id} [租户: {self.tenant_id}] 状态: {db_task.status} -> {TaskStatus.RUNNING.value}。"
                f"正常情况下应该由 K8s 状态管理器更新状态。"
            )
            db_task.status = TaskStatus.RUNNING.value
            if not db_task.started_at:
                db_task.started_at = datetime.now()

    def _parse_progress_file(self, jfs, file_path: str) -> Optional[Dict[str, Any]]:
        """解析单个进度文件，返回最新的有效进度信息"""
        try:
            with jfs.open(file_path, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]

            if not lines:
                return None

            # 从后往前找最新的有效 JSON 行
            for i in range(len(lines) - 1, -1, -1):
                try:
                    progress_data = json.loads(lines[i])
                    if all(k in progress_data for k in ["processed_lines", "total_lines", "status"]):
                        return progress_data
                except json.JSONDecodeError:
                    continue

            return None

        except Exception as e:
            logger.error(f"解析进度文件失败 {file_path}: {e}")
            return None

    def _parse_multiple_progress_files(self, jfs, file_paths: List[str]) -> Optional[Dict[str, Any]]:
        """
        解析多个进度文件，综合计算进度
        
        对于评估任务，如果 evaluation_method 是 all，会有两个进度文件：
        - basic-metric-process.jsonl: 基础指标评估进度（占50%）
        - referee-process.jsonl: 裁判员评估进度（占50%）
        
        如果只有一个文件，则按100%计算
        
        Args:
            jfs: JuiceFS 客户端
            file_paths: 进度文件路径列表
        
        Returns:
            Optional[Dict[str, Any]]: 综合后的进度信息
        """
        if not file_paths:
            return None

        # 解析每个进度文件
        progress_list = []
        for file_path in file_paths:
            if not jfs.exists(file_path):
                continue

            progress_info = self._parse_progress_file(jfs, file_path)
            if progress_info:
                progress_list.append(progress_info)

        if not progress_list:
            return None

        # 如果只有一个进度文件，直接返回
        if len(progress_list) == 1:
            return progress_list[0]

        # 多个进度文件：综合计算
        # 每个文件占 50% 的权重（如果有两个文件）
        total_weight = len(progress_list)
        weight_per_file = 100.0 / total_weight  # 每个文件占的百分比（例如：两个文件时，每个占50%）

        total_processed = 0
        total_total = 0
        overall_progress = 0.0
        all_completed = True
        all_started = True
        any_processing = False

        for progress_info in progress_list:
            processed = progress_info.get("processed_lines", 0)
            total = progress_info.get("total_lines", 0)
            status = progress_info.get("status", "")

            # 计算当前文件的进度（0-100）
            file_progress = (processed / total * 100) if total > 0 else 0

            # 加权累加（每个文件的进度乘以权重）
            overall_progress += file_progress * (weight_per_file / 100.0)

            total_processed += processed
            total_total += total

            # 状态判断
            if status != "completed":
                all_completed = False
            if status not in ["started", "processing", "completed"]:
                all_started = False
            if status == "processing":
                any_processing = True

        # 确定综合状态
        if all_completed:
            final_status = "completed"
        elif any_processing:
            final_status = "processing"
        elif all_started:
            final_status = "started"
        else:
            final_status = progress_list[-1].get("status", "started")

        # 综合进度：每个文件按权重计算，例如两个文件时，每个文件50%，综合后最大100%
        final_progress = min(int(overall_progress), 100)

        return {
            "processed_lines": total_processed,
            "total_lines": total_total,
            "status": final_status,
            "progress": final_progress  # 综合进度（0-100）
        }

    async def handle(self) -> None:
        """处理任务进度更新（假设已设置 session 上下文）"""
        app_runtime_context.set_tenant_id(tenant_id=self.tenant_id)
        await self.update_progress()

        # 如果任务已完成，执行完成后的处理
        try:
            db_task = await self.get_db_task()
            if db_task and db_task.status == TaskStatus.COMPLETED.value:
                await self.handle_completion()

            # 提交进度更新的事务
            await self.commit()
        except Exception as e:
            logger.error(f"执行评估报告处理报错，{e}", exc_info=True)
            await self.rollback()


    @abstractmethod
    async def get_db_task(self):
        """获取数据库任务对象"""
        pass


class EvaluationTaskProgressUpdater(TaskProgressUpdater):
    """评估任务进度更新器"""

    def __init__(
            self,
            tenant_id: str,
            task_id: int,
            db_task: EvaluationTask,
            evaluation_task_service: EvaluationTaskService,
            storage_service: StorageService
    ):
        super().__init__(tenant_id, task_id, storage_service)
        self.db_task = db_task
        self.evaluation_task_service = evaluation_task_service

    async def get_db_task(self) -> EvaluationTask:
        """获取评估任务"""
        return self.db_task

    def get_progress_file_paths(self, namespace: str, task_id: int) -> List[str]:
        """
        获取评估任务的进度文件路径列表
        
        Args:
            namespace: 命名空间
            task_id: 任务ID
        
        Returns:
            List[str]: 进度文件路径列表
            - referee: 返回 [referee-process.jsonl]
            - basic_metric: 返回 [basic-metric-process.jsonl]
            - all: 返回 [basic-metric-process.jsonl, referee-process.jsonl]
        """

        evaluation_method = self.db_task.evaluation_method

        # 使用新枚举获取进度文件路径
        progress_files = []
        if evaluation_method in ["basic_metric", "all"]:
            # 基础指标评估的进度文件
            basic_metric_path = StoragePath.EVALUATION_BASIC_METRIC_PROCESS_RES.format_storage_path(
                namespace=namespace,
                task_id=task_id
            )
            progress_files.append(basic_metric_path)

        if evaluation_method in ["referee", "all"]:
            # 裁判员评估的进度文件
            referee_path = StoragePath.EVALUATION_REFEREE_PROCESS_RES.format_storage_path(
                namespace=namespace,
                task_id=task_id
            )
            progress_files.append(referee_path)

        return progress_files

    async def update_task_in_db(self) -> None:
        """更新评估任务到数据库"""
        await self.evaluation_task_service.task_mapper.update_by_id(self.id, self.db_task)

    async def commit(self) -> None:
        await self.evaluation_task_service.task_mapper.commit()

    async def rollback(self) -> None:
        await self.evaluation_task_service.task_mapper.rollback()

    async def handle_completion(self) -> None:
        """生成评估报告"""
        from app.managers.evaluation_progress_and_report import EvaluationReportGenerator

        report_generator = EvaluationReportGenerator(
            tenant_id=self.tenant_id,
            task_id=self.id,
            task=self.db_task,
            evaluation_task_service=self.evaluation_task_service,
            storage_service=self.storage_service
        )
        await report_generator.update_report()


class InferenceResultDatasetProgressUpdater(TaskProgressUpdater):
    """推理结果集进度更新器"""

    def __init__(
            self,
            tenant_id: str,
            task_id: int,
            db_task: InferenceResultDataset,
            inference_result_service: InferenceResultDatasetService,
            storage_service: StorageService
    ):
        super().__init__(tenant_id, task_id, storage_service)
        self.db_task = db_task
        self.inference_result_service = inference_result_service

    async def get_db_task(self) -> InferenceResultDataset:
        """获取推理结果集"""
        return self.db_task

    def get_progress_file_paths(self, namespace: str, task_id: int) -> List[str]:
        """获取推理结果集的进度文件路径列表（推理任务只有一个进度文件）"""
        return [StoragePath.INFERENCE_PROCESS_RES.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )]

    async def update_task_in_db(self) -> None:
        """更新推理结果集到数据库"""
        await self.inference_result_service.dataset_mapper.update_by_id(self.id, self.db_task)

    async def commit(self) -> None:
        await self.inference_result_service.dataset_mapper.commit()

    async def rollback(self) -> None:
        await self.inference_result_service.dataset_mapper.rollback()

    async def handle_completion(self) -> None:
        """推理结果集完成后无需额外处理"""
        pass


class BenchmarkTaskProgressUpdater(TaskProgressUpdater):
    """基准评估任务进度更新器：从 JFS predictions 下 JSON 的 key 数量 + benchmark_datasets.original_sample_count 计算进度。"""

    def __init__(
        self,
        tenant_id: str,
        task_id: int,
        db_task: BenchmarkTask,
        benchmark_task_service: BenchmarkTaskService,
        storage_service: StorageService,
    ):
        super().__init__(tenant_id, task_id, storage_service)
        self.db_task = db_task
        self.benchmark_task_service = benchmark_task_service

    async def get_db_task(self) -> BenchmarkTask:
        return self.db_task

    def get_progress_file_paths(self, namespace: str, task_id: int) -> List[str]:
        """基准任务无 JSONL 进度文件，进度从 predictions JSON 计算，返回空列表。"""
        return []

    async def _get_k8s_job_terminal_status(self, db_task: BenchmarkTask) -> Optional[TaskStatus]:
        """查询基准评估 Job 终态，用于避免仅凭 predictions 满量就判定完成。"""
        if not db_task.lab_k8s_uuid:
            return None
        try:
            from sqlalchemy import select
            from app.models.models import KubernetesResource, ProjectKubernetesRelation
            from app.utils.k8s_call import k8s_call
            from app.utils.k8s_launcher import K8sLauncher

            result = await self.benchmark_task_service.task_mapper.execute(
                select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
                .join(
                    ProjectKubernetesRelation,
                    ProjectKubernetesRelation.k8s_id == KubernetesResource.id,
                )
                .where(ProjectKubernetesRelation.project_id == db_task.project_id)
                .limit(1)
            )
            row = result.first()
            if not row:
                logger.warning(f"基准评估任务 {db_task.id} 未找到绑定的 K8s 集群，无法确认 Job 终态")
                return None

            launcher = K8sLauncher(config_str=row[0])
            job = await k8s_call(
                launcher.batch_v1.read_namespaced_job,
                name=db_task.lab_k8s_uuid,
                namespace=row[1],
            )
            return map_job_terminal_status(job.status)
        except k8s_client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(
                    f"基准评估任务 {db_task.id} 的 K8s Job 不存在，无法确认完成状态: "
                    f"job={db_task.lab_k8s_uuid}"
                )
                return None
            logger.warning(f"查询基准评估任务 {db_task.id} 的 K8s Job 状态失败: {e}")
            return None
        except Exception as e:
            logger.warning(f"查询基准评估任务 {db_task.id} 的 K8s Job 状态失败: {e}")
            return None

    async def update_progress(self) -> None:
        """从 JFS results/{timestamp}/predictions/{model}/*.json 的 key 数量与 original_sample_count 计算进度。"""
        try:
            db_task = await self.get_db_task()
            if not db_task:
                return
            if db_task.status == TaskStatus.COMPLETED.value:
                if db_task.progress != 100:
                    db_task.progress = 100
                    await self.update_task_in_db()
                    logger.info(f"基准评估任务 {db_task.id} [租户: {self.tenant_id}] 已完成，兜底设置 progress=100")
                return
            if db_task.status == TaskStatus.FAILED.value:
                return
            if db_task.progress == 100:
                return
            jfs = await self.storage_service.JUICEFS_CLIENT(self.tenant_id)
            if not jfs:
                logger.warning(f"租户 {self.tenant_id} 的 JuiceFS 客户端不可用")
                return
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{db_task.project_id}"
            dataset_code_to_total = await self.benchmark_task_service.get_benchmark_task_dataset_totals(
                db_task.id, db_task.tenant_id
            )
            new_progress = get_progress_from_predictions(
                jfs, namespace, db_task.id, dataset_code_to_total
            )
            if new_progress is None:
                return
            if new_progress == 100:
                job_status = await self._get_k8s_job_terminal_status(db_task)
                if job_status == TaskStatus.FAILED:
                    logger.debug(
                        f"基准评估任务 {db_task.id} predictions 已完成，但 K8s Job 已失败，等待状态管理器处理失败状态"
                    )
                    return
                if job_status != TaskStatus.COMPLETED:
                    if db_task.progress != 99:
                        logger.info(
                            f"基准评估任务 {db_task.id} predictions 已完成，但 K8s Job 尚未完成，"
                            f"进度保持为 99: job_status={job_status}"
                        )
                    new_progress = 99
            if new_progress != db_task.progress:
                logger.info(
                    f"基准评估任务 {db_task.id} [租户: {self.tenant_id}] 进度更新: "
                    f"{db_task.progress}% -> {new_progress}%"
                )
                if new_progress == 100:
                    # 进度 100 时先执行结果处理（读分数、写 BenchmarkResult），再标为已完成，与 K8s 路径一致
                    try:
                        app_runtime_context.set_tenant_id(self.tenant_id)
                        await process_benchmark_task_results(
                            task_id=db_task.id,
                            jfs=jfs,
                            task_mapper=self.benchmark_task_service.task_mapper,
                            result_mapper=self.benchmark_task_service.result_mapper,
                            model_relation_mapper=self.benchmark_task_service.model_relation_mapper,
                            dataset_relation_mapper=self.benchmark_task_service.dataset_relation_mapper,
                            leaderboard_mapper=self.benchmark_task_service.leaderboard_mapper,
                        )
                        logger.info(f"基准评估任务 {db_task.id} [租户: {self.tenant_id}] 进度 100，已执行结果处理并置为已完成")
                    except Exception as err:
                        logger.error(f"基准评估任务 {db_task.id} 结果处理失败（进度仍更新为 100）: {err}", exc_info=True)
                        db_task.progress = 100
                        await self.update_task_in_db()
                else:
                    db_task.progress = new_progress
                    await self.update_task_in_db()
        except Exception as e:
            logger.error(f"更新基准评估任务 {self.id} [租户: {self.tenant_id}] 进度失败: {e}")

    async def update_task_in_db(self) -> None:
        await self.benchmark_task_service.task_mapper.update_by_id(self.id, self.db_task)

    async def commit(self) -> None:
        await self.benchmark_task_service.task_mapper.commit()

    async def rollback(self) -> None:
        await self.benchmark_task_service.task_mapper.rollback()

    async def handle_completion(self) -> None:
        """基准任务完成后由 K8s 状态管理器与 result_processor 处理，此处不处理。"""
        pass

#!/usr/bin/env python3
"""
定时任务定义模块 - 简化版

包含所有定时任务的具体实现。
"""

import asyncio
import yaml
from datetime import timedelta
from sqlalchemy import select, and_, or_, update, not_

from app.core.logging import logger
from app.core.config import settings
from app.database.base import SessionLocal
from app.managers.task_progress_updater import (
    BenchmarkTaskProgressUpdater,
    EvaluationTaskProgressUpdater,
    InferenceResultDatasetProgressUpdater,
)
from app.models import TrainedModel, BaseModel
from kubernetes import client

from app.models.models import ImageBuildLog, KubernetesResource, TaskExecution
from app.models.training_task_manager import TrainingTask
from app.models.data_cleaning_manager import DataCleaningTask
from app.models.benchmark_task_manager import BenchmarkTask
from app.models.evaluation_task_manager import EvaluationTask, EvaluationReport
from app.models.inference_result_manager import InferenceResultDataset
from app.common.status import TaskStatus, AnnotationStatus
from app.common.task_execution import TaskExecutionStatus
from app.schemas.model import ModelStatus
from app.services.k8s.k8s import sync_kubernetes_labels
from app.schemas.common import ConnectionStatus
from app.utils.k8s_call import get_k8s_api, k8s_call
from app.services.notebook.notebook import stop_overdue_notebooks
from app.repository.base_mapper import BaseMapper
from app.utils import app_runtime_context
from app.utils.timezone_utils import get_current_shanghai_time
from app.executors.registry import create_executor
from app.utils.log_service import log_service
from app.utils.redis_lock_utils import try_acquire_lock, release_lock_if_owner
from app.services.storage.storage import DefaultStorageService
from app.repository.storage import StorageMapper
from app.core.depend_manager import AutoContainer
from app.schemas.evaluation_task import (
    EvaluationMethod, CalculationMethod, AggregativeMetric,
    EvaluationReportCreate, ModelMetricSummary
)
from collections import defaultdict


class ScheduledTasks:
    """定时任务定义类"""
    
    def __init__(self, loop: asyncio.AbstractEventLoop):
        """初始化定时任务"""
        # 使用公共日志服务
        self.log_service = log_service
        self.loop = loop

    def _create_lock_wrapper(self, lock_key: str, ttl: int, task_func, release_lock: bool = False):
        """创建带分布式锁的任务包装器，供 schedule 调度使用

        Args:
            lock_key: Redis 锁 key
            ttl: 锁超时时间（秒）
            task_func: 任务函数
            release_lock: 是否执行完后主动释放锁，默认 False（依赖 TTL 过期，避免多实例启动时差导致重复执行）
        """

        def wrapper():
            async def _do():
                token = await try_acquire_lock(lock_key, ttl)
                if not token:
                    logger.info(f"未获得锁 {lock_key}，跳过本次执行")
                    return
                try:
                    logger.info(f"获得锁 {lock_key}，开始执行任务")
                    if asyncio.iscoroutinefunction(task_func):
                        await task_func()
                    else:
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, task_func)
                finally:
                    if release_lock and token:
                        await release_lock_if_owner(lock_key, token)

            try:
                asyncio.run_coroutine_threadsafe(_do(), self.loop).result()
            except Exception as e:
                logger.error(f"定时任务执行异常 [{lock_key}]: {e}")

        return wrapper

    async def _execute_task_execution(self, execution_id: int) -> None:
        """执行 task_execution 中的一条任务"""
        with SessionLocal() as db:
            execution = db.execute(
                select(TaskExecution).where(TaskExecution.id == execution_id)
            ).scalar_one_or_none()
            if not execution:
                return

            try:
                executor = create_executor(execution.executor)
                if not executor:
                    raise ValueError(f"执行器未注册: {execution.executor}")
                method = getattr(executor, execution.method, None)
                if not method:
                    raise ValueError(f"执行器方法不存在: {execution.executor}.{execution.method}")

                await method(execution.business_id, **(execution.kwargs or {}))
                execution.status = TaskExecutionStatus.DONE.value
            except Exception as e:
                execution.retry_count = (execution.retry_count or 0) + 1
                execution.last_error = str(e)
                if execution.retry_count <= execution.max_retry:
                    execution.status = TaskExecutionStatus.PENDING.value
                else:
                    execution.status = TaskExecutionStatus.FAILED.value
                logger.error(f"执行任务失败 execution_id={execution_id}: {e}", exc_info=True)
            finally:
                execution.updated_at = get_current_shanghai_time()
                execution.locked_at = None
                execution.locked_by = None
                db.commit()

    def query_pending_task_executions(self) -> None:
        """拉取待执行任务并触发执行器"""
        if not self.loop:
            return
        now = get_current_shanghai_time()
        lock_timeout = now - timedelta(minutes=10)
        try:
            with SessionLocal() as db:
                # 回收超时锁
                db.execute(
                    update(TaskExecution)
                    .where(
                        and_(
                            TaskExecution.status == TaskExecutionStatus.RUNNING.value,
                            TaskExecution.locked_at.is_not(None),
                            TaskExecution.locked_at < lock_timeout
                        )
                    )
                    .values(
                        status=TaskExecutionStatus.PENDING.value,
                        locked_at=None,
                        locked_by=None,
                        updated_at=now
                    )
                )
                db.commit()

                stmt = (
                    select(TaskExecution)
                    .where(
                        and_(
                            TaskExecution.status == TaskExecutionStatus.PENDING.value,
                            TaskExecution.locked_at.is_(None),
                            TaskExecution.schedule_at <= now
                        )
                    )
                    .with_for_update()
                    .order_by(TaskExecution.created_at.asc())
                    .limit(10)
                )
                executions = db.execute(stmt).scalars().all()
                if not executions:
                    return

                for execution in executions:
                    execution.status = TaskExecutionStatus.RUNNING.value
                    execution.locked_at = now
                    execution.locked_by = "scheduler"
                    execution.updated_at = now
                db.commit()

                for execution in executions:
                    asyncio.run_coroutine_threadsafe(
                        self._execute_task_execution(execution.id),
                        self.loop
                    )
        except Exception as e:
            logger.error(f"任务调度轮询失败: {e}", exc_info=True)

    def query_completed_training_tasks(self) -> None:
        """查询已完成的训练任务并处理日志"""
        if settings.PROVIDER_TYPE != 'default':
            return
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的任务
                stmt = select(TrainingTask).where(
                    and_(
                        TrainingTask.status == TaskStatus.COMPLETED,
                        TrainingTask.log_path.is_(None),
                        TrainingTask.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()
                
                if not completed_tasks:
                    return
                
                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成训练任务")
                
                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"训练任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理训练任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"训练任务定时任务执行失败: {e}")

    def query_completed_data_cleaning_tasks(self) -> None:
        """查询已完成的数据清洗任务并处理日志"""
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的数据清洗任务
                stmt = select(DataCleaningTask).where(
                    and_(
                        DataCleaningTask.status == TaskStatus.COMPLETED,
                        DataCleaningTask.log_path.is_(None),
                        DataCleaningTask.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()

                if not completed_tasks:
                    return

                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成清洗任务")

                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"清洗任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理清洗任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"清洗任务定时任务执行失败: {e}")

    def query_completed_trained_model_tasks(self) -> None:
        """查询已完成的训练合并任务并处理日志"""
        if settings.PROVIDER_TYPE != 'default':
            return
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的任务
                stmt = select(TrainedModel).where(
                    and_(
                        TrainedModel.status == TaskStatus.COMPLETED,
                        TrainedModel.log_path.is_(None),
                        TrainedModel.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()

                if not completed_tasks:
                    return

                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成训练任务")

                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"定时任务执行失败: {e}")

    def stop_overdue_notebooks_job(self):
        """
        schedule 调用的同步入口
        """
        try:
            asyncio.run_coroutine_threadsafe(
                stop_overdue_notebooks(),
                self.loop
            )
        except Exception as e:
            logger.error(f"投递 stop_overdue_notebooks 失败: {e}")

    def sync_kubernetes_labels_job(self):
        """
        schedule 调用的同步入口
        """
        try:
            asyncio.run_coroutine_threadsafe(
                sync_kubernetes_labels(),
                self.loop
            )
        except Exception as e:
            logger.error(f"投递 sync_kubernetes_labels 失败: {e}")

    def sync_belle_base_model_job(self):
        """
        schedule 调用的同步入口
        """
        if settings.PROVIDER_TYPE != 'belle':
            return
        try:
            from app.services.model.belle_model import sync_belle_base_model
            asyncio.run_coroutine_threadsafe(
                sync_belle_base_model(),
                self.loop
            ).result()
        except Exception as e:
            logger.error(f"投递 sync_belle_base_model 失败: {e}")

    def sync_belle_trained_models_task_job(self):
        """
        schedule 调用的同步入口
        """
        if settings.PROVIDER_TYPE != 'belle':
            return
        try:
            from app.services.training_task.belle_training_task import sync_belle_trained_models_task
            asyncio.run_coroutine_threadsafe(
                sync_belle_trained_models_task(),
                self.loop
            ).result()
        except Exception as e:
            logger.error(f"投递 sync_belle_trained_models_task 失败: {e}")

    def sync_belle_training_task_job(self):
        """
        schedule 调用的同步入口
        """
        if settings.PROVIDER_TYPE != 'belle':
            return
        try:
            from app.services.training_task.belle_training_task import sync_belle_training_task
            asyncio.run_coroutine_threadsafe(
                sync_belle_training_task(),
                self.loop
            ).result()
        except Exception as e:
            logger.error(f"投递 sync_belle_training_task 失败: {e}")

    def query_completed_model_download_tasks(self) -> None:
        """查询已完成的模型下载任务并处理日志"""
        if settings.PROVIDER_TYPE != 'default':
            return
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的任务
                stmt = select(BaseModel).where(
                    and_(
                        # BaseModel.status == ModelStatus.SUCCESS,
                        BaseModel.status == TaskStatus.COMPLETED,
                        BaseModel.log_path.is_(None),
                        BaseModel.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()

                if not completed_tasks:
                    return

                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成模型下载任务")

                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"定时任务执行失败: {e}")

    def query_completed_evaluation_tasks(self) -> None:
        """查询已完成的评估任务并处理日志"""
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的任务
                stmt = select(EvaluationTask).where(
                    and_(
                        EvaluationTask.status == TaskStatus.COMPLETED,
                        EvaluationTask.log_path.is_(None),
                        EvaluationTask.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()

                if not completed_tasks:
                    return

                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成评估任务")

                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"定时任务执行失败: {e}")

    async def update_evaluation_progress_and_report(self) -> None:
        """更新评估任务进度 - 每10秒执行一次

        通过解析评估结果文件（存储在JuiceFS中）来更新评估任务的进度。
        第一步：获取所有处理中的评估任务
        第二步：根据租户分类处理，为每个租户获取对应的JuiceFS客户端

        注意：此方法在主线程的事件循环中运行，可以直接使用 await。
        """
        from app.core.depend_manager import AutoContainer
        from app.database.base import async_session
        from app.utils.db_session_context import db_session_with_context

        auto_container = AutoContainer()

        try:
            # 第一步：获取所有处理中的评估任务（排除已完成100%的任务）
            async with async_session() as session:
                async with db_session_with_context(session):
                    base_mapper: BaseMapper = auto_container.base_mapper()
                    app_runtime_context.set_tenant_id(None)
                    stmt = select(EvaluationTask).where(
                        EvaluationTask.status.in_([TaskStatus.RUNNING.value, TaskStatus.COMPLETED.value]),
                        EvaluationTask.progress != 100
                    )
                    processing_tasks = await base_mapper.query(stmt)

                    # 在会话关闭前提取任务ID列表（避免会话绑定问题）
                    task_ids = [task.id for task in processing_tasks]
                    tenant_ids_map = {task.id: task.tenant_id for task in processing_tasks}

                    # 将状态为已完成且进度100但评估报告不存在的任务也加入，用于重入生成报告
                    task_ids_with_report = select(EvaluationReport.evaluation_task_id)
                    stmt_no_report = select(EvaluationTask).where(
                        EvaluationTask.status == TaskStatus.COMPLETED.value,
                        EvaluationTask.progress == 100,
                        not_(EvaluationTask.id.in_(task_ids_with_report))
                    )
                    completed_no_report_tasks = await base_mapper.query(stmt_no_report)
                    for task in completed_no_report_tasks:
                        if task.id not in tenant_ids_map:
                            task_ids.append(task.id)
                            logger.info(f"将状态为已完成且进度100但评估报告不存在的任务也加入，用于重入生成报告 {task.id}")
                            tenant_ids_map[task.id] = task.tenant_id

            if not task_ids:
                logger.info(f"当前没有待处理的评估任务")
                return

            logger.info(f"找到 {len(task_ids)} 个处理中的评估任务，开始处理")

            # 获取 StorageService 实例
            storage_service = auto_container.storage_service()

            # 第二步：为每个任务创建处理对象并执行
            for task_id in task_ids:
                tenant_id = tenant_ids_map.get(task_id)
                if not tenant_id:
                    logger.warning(f"评估任务 {task_id} 没有租户ID，跳过")
                    continue

                try:
                    # 为每个任务创建新的会话
                    async with async_session() as session:
                        async with db_session_with_context(session):
                            base_mapper: BaseMapper = auto_container.base_mapper()
                            stmt = select(EvaluationTask).where(EvaluationTask.id == task_id)
                            task = await base_mapper.query_one(stmt)

                            if not task:
                                logger.warning(f"评估任务 {task_id} 不存在，跳过")
                                continue

                            progress_updater = EvaluationTaskProgressUpdater(
                                tenant_id=tenant_id,
                                task_id=task.id,
                                db_task=task,
                                evaluation_task_service=auto_container.evaluation_task_service(),
                                storage_service=storage_service,
                            )
                            # 直接 await，因为已经在异步上下文中
                            await progress_updater.handle()
                except Exception as e:
                    logger.error(f"处理评估任务 {task_id} [租户: {tenant_id}] 失败: {e}")
                    continue

            logger.info(f"共处理 {len(task_ids)} 个评估任务")

        except Exception as e:
            logger.error(f"更新评估进度任务执行失败: {e}")

    async def update_inference_result_dataset_progress(self) -> None:
        """更新推理结果集进度 - 每10秒执行一次

        通过解析推理结果文件（存储在JuiceFS中）来更新推理结果集的进度。
        """
        from app.core.depend_manager import AutoContainer
        from app.database.base import async_session
        from app.utils.db_session_context import db_session_with_context

        auto_container = AutoContainer()

        try:
            # 第一步：获取所有处理中的推理结果集任务（排除已完成100%的任务）
            async with async_session() as session:
                async with db_session_with_context(session):
                    base_mapper: BaseMapper = auto_container.base_mapper()
                    app_runtime_context.set_tenant_id(None)
                    stmt = select(InferenceResultDataset).where(
                        InferenceResultDataset.status.in_([TaskStatus.RUNNING.value, TaskStatus.COMPLETED.value]),
                        InferenceResultDataset.progress != 100
                    )
                    processing_tasks = await base_mapper.query(stmt)

                    # 在会话关闭前提取任务ID列表
                    task_ids = [task.id for task in processing_tasks]
                    tenant_ids_map = {task.id: task.tenant_id for task in processing_tasks}

            if not task_ids:
                logger.info(f"当前没有待处理的推理结果集任务")
                return

            logger.info(f"找到 {len(task_ids)} 个处理中的推理结果集任务，开始处理")

            # 获取 StorageService 实例
            storage_service = auto_container.storage_service()

            # 第二步：为每个任务创建处理对象并执行
            for task_id in task_ids:
                tenant_id = tenant_ids_map.get(task_id)
                if not tenant_id:
                    logger.warning(f"推理结果集任务 {task_id} 没有租户ID，跳过")
                    continue

                try:
                    # 为每个任务创建新的会话
                    async with async_session() as session:
                        async with db_session_with_context(session):
                            base_mapper: BaseMapper = auto_container.base_mapper()
                            stmt = select(InferenceResultDataset).where(InferenceResultDataset.id == task_id)
                            task = await base_mapper.query_one(stmt)

                            if not task:
                                logger.warning(f"推理结果集任务 {task_id} 不存在，跳过")
                                continue

                            progress_updater = InferenceResultDatasetProgressUpdater(
                                tenant_id=tenant_id,
                                task_id=task.id,
                                db_task=task,
                                inference_result_service=auto_container.inference_result_dataset_service(),
                                storage_service=storage_service,
                            )
                            # 直接 await，因为已经在异步上下文中
                            await progress_updater.handle()
                except Exception as e:
                    logger.error(f"处理推理结果集任务 {task_id} [租户: {tenant_id}] 失败: {e}")
                    continue

            logger.info(f"共处理 {len(task_ids)} 个推理结果集任务")

        except Exception as e:
            logger.error(f"更新推理结果集进度任务执行失败: {e}")

    async def update_benchmark_task_progress(self) -> None:
        """
            更新基准评估任务进度 - 定时执行
            1) 已终态（已完成/失败）但 progress != 100 的兜底同步为 100
            2) 运行中任务从 JFS predictions 计算进度
        """
        from app.database.base import async_session
        from app.utils.db_session_context import db_session_with_context

        auto_container = AutoContainer()

        try:
            async with async_session() as session:
                async with db_session_with_context(session):
                    base_mapper: BaseMapper = auto_container.base_mapper()
                    app_runtime_context.set_tenant_id(None)
                    completed_stmt = select(BenchmarkTask).where(
                        and_(
                            BenchmarkTask.status == TaskStatus.COMPLETED.value,
                            BenchmarkTask.progress != 100,
                        )
                    )
                    completed_tasks = await base_mapper.query(completed_stmt)
                    if completed_tasks:
                        for t in completed_tasks:
                            t.progress = 100
                        await base_mapper.commit()
                        logger.info(
                            f"基准评估任务已完成兜底: 将 {len(completed_tasks)} 个任务 progress 同步为 100, ids={[t.id for t in completed_tasks]}"
                        )
                    # 运行中且 progress != 100 的任务
                    stmt = select(BenchmarkTask).where(
                        BenchmarkTask.status == TaskStatus.RUNNING.value,
                        BenchmarkTask.progress != 100,
                    )
                    processing_tasks = await base_mapper.query(stmt)
                    task_ids = [t.id for t in processing_tasks]
                    tenant_ids_map = {t.id: t.tenant_id for t in processing_tasks}

            if not task_ids:
                return

            storage_service = auto_container.storage_service()
            benchmark_task_service = auto_container.benchmark_task_service()

            for task_id in task_ids:
                tenant_id = tenant_ids_map.get(task_id)
                if not tenant_id:
                    logger.warning(f"基准评估任务 {task_id} 没有租户ID，跳过")
                    continue
                try:
                    async with async_session() as session:
                        async with db_session_with_context(session):
                            base_mapper = auto_container.base_mapper()
                            stmt = select(BenchmarkTask).where(BenchmarkTask.id == task_id)
                            task = await base_mapper.query_one(stmt)
                            if not task:
                                continue
                            progress_updater = BenchmarkTaskProgressUpdater(
                                tenant_id=tenant_id,
                                task_id=task.id,
                                db_task=task,
                                benchmark_task_service=benchmark_task_service,
                                storage_service=storage_service,
                            )
                            await progress_updater.handle()
                except Exception as e:
                    logger.error(f"处理基准评估任务 {task_id} [租户: {tenant_id}] 进度失败: {e}")
        except Exception as e:
            logger.error(f"更新基准评估任务进度执行失败: {e}")

    async def process_new_inference_evaluation_tasks(self) -> None:
        """处理新建推理结果集类型的评估任务 - 每10秒执行一次

        查找 data_source=new、status=created 的评估任务，检查其关联的推理结果集是否全部完成。
        若全部完成则启动评估进程；若存在失败则更新任务状态为失败。
        该逻辑从 Celery 任务中移出，避免轮询阻塞 worker。
        """
        from app.core.depend_manager import AutoContainer
        from app.database.base import async_session
        from app.utils.db_session_context import db_session_with_context
        from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
        from app.models.inference_result_manager import InferenceResultDataset
        from app.tasks.evaluation_tasks import start_evaluation_impl

        auto_container = AutoContainer()

        try:
            async with async_session() as session:
                async with db_session_with_context(session):
                    base_mapper: BaseMapper = auto_container.base_mapper()
                    app_runtime_context.set_tenant_id(None)
                    stmt = select(EvaluationTask).where(
                        EvaluationTask.data_source == "new",
                        EvaluationTask.status == TaskStatus.PREPARING.value,
                    )
                    waiting_tasks = await base_mapper.query(stmt)
                    task_ids = [t.id for t in waiting_tasks]
                    tenant_ids_map = {t.id: t.tenant_id for t in waiting_tasks}

            if not task_ids:
                return

            logger.info(f"找到 {len(task_ids)} 个新建推理结果集类型的待处理评估任务")

            storage_service = auto_container.storage_service()

            for task_id in task_ids:
                tenant_id = tenant_ids_map.get(task_id)
                if not tenant_id:
                    logger.warning(f"评估任务 {task_id} 没有租户ID，跳过")
                    continue

                base_mapper = None
                try:
                    base_mapper = auto_container.base_mapper()
                    app_runtime_context.set_tenant_id(tenant_id)

                    task = await base_mapper.query_one(
                        select(EvaluationTask).filter(EvaluationTask.id == task_id)
                    )
                    if not task or task.data_source != "new" or task.status != TaskStatus.PREPARING.value:
                        continue

                    relations = await base_mapper.query(
                        select(EvaluationTaskDatasetModelRelation).filter(
                            EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
                        )
                    )
                    if not relations:
                        logger.warning(f"评估任务 {task_id} 没有关联的推理结果集，跳过")
                        continue

                    dataset_ids = list({r.inference_result_dataset_id for r in relations})
                    datasets = await base_mapper.query(
                        select(InferenceResultDataset).filter(
                            InferenceResultDataset.id.in_(dataset_ids)
                        )
                    )

                    all_completed = True
                    has_failed = False

                    if not datasets:
                        continue
                    for d in datasets:
                        if d.status == TaskStatus.FAILED.value:
                            has_failed = True
                            all_completed = True
                            break
                        if d.status != TaskStatus.COMPLETED.value:
                            all_completed = False
                            break

                    if has_failed:
                        failed_ds = [d for d in datasets if d.status == TaskStatus.FAILED.value]
                        error_parts = [
                            f"{d.name}(id={d.id})" + f": {d.processing_error} "
                            for d in failed_ds
                        ]
                        error_message = "推理结果集失败，无法继续评估: " + "; ".join(error_parts)
                        task.status = TaskStatus.FAILED.value
                        task.error_message = error_message
                        await base_mapper.commit()
                        logger.info(f"评估任务 {task_id} 因推理结果集失败已标记为失败")
                        continue

                    if not all_completed:
                        continue

                    logger.info(f"评估任务 {task_id} 关联的推理结果集已全部完成，启动评估进程")
                    await start_evaluation_impl(
                        task_id=task_id,
                        base_mapper=base_mapper,
                        storage_service=storage_service,
                    )
                    logger.info(f"评估任务 {task_id} 已启动评估进程")

                except Exception as e:
                    logger.error(f"处理新建推理结果集评估任务 {task_id} 失败: {e}")
                    continue
                finally:
                    if base_mapper is not None:
                        try:
                            await base_mapper.close()
                        except Exception as close_error:
                            logger.warning(
                                f"关闭评估任务 {task_id} 数据库会话失败: {close_error}",
                                exc_info=True,
                            )

        except Exception as e:
            logger.error(f"处理新建推理结果集评估任务执行失败: {e}")

    def query_completed_inference_dataset_tasks(self) -> None:
        """查询已完成的推理结果集任务并处理日志"""
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的任务
                stmt = select(InferenceResultDataset).where(
                    and_(
                        InferenceResultDataset.status == TaskStatus.COMPLETED,
                        InferenceResultDataset.log_path.is_(None),
                        InferenceResultDataset.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()

                if not completed_tasks:
                    return

                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成评估任务")

                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"定时任务执行失败: {e}")

    def write_manual_evaluation_annotations_to_jsonl_job(self) -> None:
        """定时任务包装：将已完成标注的人工评估任务的Redis数据写入JSONL文件"""
        if self.loop:
            asyncio.run_coroutine_threadsafe(
                self.write_manual_evaluation_annotations_to_jsonl(),
                self.loop
            ).result()
        else:
            asyncio.run(self.write_manual_evaluation_annotations_to_jsonl())

    async def write_manual_evaluation_annotations_to_jsonl(self) -> None:
        """将已完成标注的人工评估任务的Redis数据写入JSONL文件"""
        import json
        import os
        from datetime import datetime
        from app.schemas.evaluation_task import EvaluationMethod

        base_mapper = None
        try:
            redis_client = settings.REDIS_CLIENT
            if not redis_client:
                logger.warning("Redis客户端未初始化，跳过写入标注数据")
                return

            # 1. 从Redis获取已完成标注的任务ID列表
            completed_tasks_key = "manual_evaluation:completed_tasks"
            task_ids = await redis_client.smembers(completed_tasks_key)

            if not task_ids:
                return

            logger.info(f"找到 {len(task_ids)} 个需要写入JSONL的已完成标注任务")

            # 2. 处理每个任务
            base_mapper = AutoContainer.base_mapper()

            for task_id_str in task_ids:
                task_id = int(task_id_str)
                try:
                    # 查询任务
                    task = await base_mapper.query_one(
                        select(EvaluationTask).filter(
                            EvaluationTask.id == task_id,
                            EvaluationTask.evaluation_method == EvaluationMethod.MANUAL.value
                        )
                    )

                    if not task:
                        logger.warning(f"任务 {task_id} 不存在或不是人工评估任务，从Redis集合中移除")
                        await redis_client.srem(completed_tasks_key, task_id_str)
                        continue

                    app_runtime_context.set_tenant_id(task.tenant_id)

                    # 验证任务状态和进度
                    if task.completed_items != task.total_items:
                        logger.warning(f"任务 {task_id} 标注未全部完成，跳过写入")
                        continue

                    if not task.result_file_path or len(task.result_file_path) == 0:
                        logger.warning(f"任务 {task_id} 没有结果文件路径，从Redis集合中移除")
                        await redis_client.srem(completed_tasks_key, task_id_str)
                        continue

                    # 3. 获取存储服务
                    storage_service = AutoContainer.storage_service()
                    jfs = await storage_service.JUICEFS_CLIENT()

                    # 4. 获取任务关联关系（用于对比评估时确定模型）
                    from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
                    relations = await base_mapper.query(
                        select(EvaluationTaskDatasetModelRelation).filter(
                            EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
                        )
                    )

                    # 5. 获取评估指标配置（用于转换为evaluations格式）
                    evaluation_prompt_config = task.evaluation_prompt_config
                    metric_config_map = {}
                    if evaluation_prompt_config and isinstance(evaluation_prompt_config, dict):
                        metrics_config = evaluation_prompt_config.get("metrics", [])
                        for metric_config in metrics_config:
                            if isinstance(metric_config, dict):
                                metric_name = metric_config.get("name") or metric_config.get("metric_name")
                                if metric_name:
                                    metric_config_map[metric_name] = {
                                        "description": metric_config.get("description", ""),
                                        "score_min": metric_config.get("score_min", 0),
                                        "score_max": metric_config.get("score_max", 10)
                                    }

                    # 6. 为每个文件写入标注数据（每个文件对应一个模型）
                    all_redis_keys_to_delete = []

                    for file_index, jsonl_file_path in enumerate(task.result_file_path):
                        if not jfs.exists(jsonl_file_path):
                            logger.warning(f"结果文件不存在: {jsonl_file_path}")
                            continue

                        # 获取当前文件对应的模型名称
                        model_name = None
                        if relations and file_index < len(relations):
                            model_name = relations[file_index].evaluated_model_name or f"model_{relations[file_index].evaluated_model_id}"

                        updated_items = []
                        file_redis_keys = []

                        # 读取原始文件，写入annotation（格式：ManualEvaluationItem）
                        with jfs.open(jsonl_file_path, 'r', encoding='utf-8') as f:
                            for idx, line in enumerate(f, start=1):
                                if not line.strip():
                                    continue

                                item = json.loads(line)
                                item_index = item.get("item_index", idx)

                                # 从Redis读取标注数据（使用file_index构建key）
                                redis_key = f"manual_evaluation:annotation:{task_id}:{file_index}:{item_index}"
                                annotation_json = await redis_client.get(redis_key)

                                # 构建ManualEvaluationItem格式（移除item_index，因为JSONL中不需要）
                                manual_item = {
                                    "messages": item.get("messages"),
                                    "images": item.get("images"),
                                    "system": item.get("system"),
                                    "prompt": item.get("prompt", ""),
                                    "response": item.get("response"),
                                    "model_response": item.get("model_response"),  # 单个字符串
                                    "annotation": None
                                }

                                if annotation_json:
                                    # 将annotation写入item（AnnotationInfo格式）
                                    annotation_data = json.loads(annotation_json)
                                    manual_item["annotation"] = annotation_data
                                    file_redis_keys.append(redis_key)
                                else:
                                    # 如果没有annotation，设置默认值
                                    manual_item["annotation"] = {
                                        "status": AnnotationStatus.PENDING.value,
                                        "metrics": None,
                                        "annotated_at": None,
                                        "annotated_by": None
                                    }

                                updated_items.append(manual_item)

                        all_redis_keys_to_delete.extend(file_redis_keys)

                        # 写入更新后的文件
                        import tempfile
                        import shutil

                        try:
                            # 创建临时文件
                            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', delete=False, suffix='.jsonl') as temp_file:
                                for item in updated_items:
                                    temp_file.write(json.dumps(item, ensure_ascii=False) + '\n')
                                temp_file_path = temp_file.name

                            # 将临时文件内容写入JuiceFS
                            with open(temp_file_path, 'rb') as temp_file:
                                with jfs.open(jsonl_file_path, 'wb') as jfs_file:
                                    shutil.copyfileobj(temp_file, jfs_file)

                            # 删除临时文件
                            os.unlink(temp_file_path)

                            all_redis_keys_to_delete.extend(file_redis_keys)
                            logger.info(f"任务 {task_id} 文件 {file_index} 标注数据写入成功: {jsonl_file_path}")
                        except Exception as e:
                            logger.error(f"写入文件失败 {jsonl_file_path}: {e}")
                            continue

                    # 8. 删除Redis中的标注数据（不再使用completed_items集合）
                    if all_redis_keys_to_delete:
                        await redis_client.delete(*all_redis_keys_to_delete)
                        logger.info(f"任务 {task_id} 已删除 {len(all_redis_keys_to_delete)} 个Redis标注数据键")

                    # 6. 从已完成任务集合中移除
                    await redis_client.srem(completed_tasks_key, task_id_str)

                    # 7. 更新任务状态为completed（如果还没有）
                    if task.status != TaskStatus.COMPLETED.value:
                        task.status = TaskStatus.COMPLETED.value
                        task.finished_at = datetime.now()
                        await base_mapper.update_by_id(task_id, task)
                        await base_mapper.commit()

                    # 8. 计算平均分数并生成评估报告
                    try:
                        await self._generate_manual_evaluation_report(
                            task, base_mapper, jfs, storage_service
                        )
                    except Exception as e:
                        logger.error(f"任务 {task_id} 生成评估报告失败: {e}", exc_info=True)

                    logger.info(f"任务 {task_id} 标注数据写入JSONL完成")

                except Exception as e:
                    logger.error(f"处理任务 {task_id} 失败: {e}", exc_info=True)
                    continue

        except Exception as e:
            logger.error(f"写入人工评估标注数据任务执行失败: {e}", exc_info=True)
        finally:
            if base_mapper is not None:
                try:
                    await base_mapper.close()
                except Exception as close_error:
                    logger.warning(f"关闭人工评估写入任务数据库会话失败: {close_error}", exc_info=True)

    async def _generate_manual_evaluation_report(
        self,
        task: EvaluationTask,
        base_mapper: BaseMapper,
        jfs,
        storage_service: DefaultStorageService
    ) -> None:
        """生成人工评估报告

        从JSONL文件中读取所有已完成的标注数据，计算平均分数，并生成评估报告。
        """
        import json
        from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation

        try:
            # 1. 获取任务关联关系
            relations = await base_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == task.id
                )
            )

            if not relations:
                logger.warning(f"任务 {task.id} 没有关联的模型和数据集，跳过报告生成")
                return

            # 2. 获取评估指标配置（从 evaluation_prompt_config）
            evaluation_prompt_config = task.evaluation_prompt_config
            if not evaluation_prompt_config or not isinstance(evaluation_prompt_config, dict):
                logger.warning(f"任务 {task.id} 没有评估指标配置，跳过报告生成")
                return

            metrics_config = evaluation_prompt_config.get("metrics", [])
            if not metrics_config:
                logger.warning(f"任务 {task.id} 没有评估指标，跳过报告生成")
                return

            # 构建指标配置映射（用于获取 score_min 和 score_max）
            metric_config_map = {}
            for metric_config in metrics_config:
                if isinstance(metric_config, dict):
                    metric_name = metric_config.get("name") or metric_config.get("metric_name")
                    if metric_name:
                        metric_config_map[metric_name] = {
                            "score_min": metric_config.get("score_min"),
                            "score_max": metric_config.get("score_max")
                        }

            # 3. 从JSONL文件中读取所有已完成的标注数据
            # 按模型分组收集分数（以 model_name 为 key）
            model_scores_map = defaultdict(lambda: defaultdict(list))  # {model_name: {metric_name: [scores]}}
            model_info_map = {}  # {model_name: {model_id, model_name}}

            for file_index, relation in enumerate(relations):
                model_id = relation.evaluated_model_id
                model_name = relation.evaluated_model_name or f"model_{model_id}"
                model_info_map[model_name] = {
                    "model_id": model_id,
                    "model_name": model_name,
                    "model_source": getattr(relation, "evaluated_model_source", None) or "base_model"
                }

            # 读取所有JSONL文件（每个文件对应一个模型）
            for file_index, jsonl_file_path in enumerate(task.result_file_path):
                if not jfs.exists(jsonl_file_path):
                    continue

                # 获取当前文件对应的模型名称
                if file_index >= len(relations):
                    continue

                relation = relations[file_index]
                model_name = relation.evaluated_model_name or f"model_{relation.evaluated_model_id}"

                with jfs.open(jsonl_file_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue

                        # JSONL格式：ManualEvaluationItem
                        manual_item = json.loads(line)
                        annotation = manual_item.get("annotation")

                        if not annotation:
                            continue

                        # 检查annotation状态
                        annotation_status = annotation.get("status")
                        if annotation_status != TaskStatus.COMPLETED.value:
                            continue

                        # 读取 metrics（List[ModelMetricSummary]）
                        metrics = annotation.get("metrics")
                        if not metrics or not isinstance(metrics, list):
                            continue

                        # 处理多个指标（List[ModelMetricSummary]）
                        for metric_summary in metrics:
                            if isinstance(metric_summary, dict):
                                metric_name = metric_summary.get("metric_name")
                                score = metric_summary.get("score")
                                if metric_name and isinstance(score, (int, float)):
                                    model_scores_map[model_name][metric_name].append(score)

            # 4. 为每个模型生成报告
            auto_container = AutoContainer()
            evaluation_task_service = auto_container.evaluation_task_service()

            for model_name, model_info in model_info_map.items():
                model_id = model_info["model_id"]
                metric_scores = model_scores_map[model_name]

                if not metric_scores:
                    logger.warning(f"任务 {task.id} 模型 {model_name} 没有标注数据，跳过报告生成")
                    continue

                # 计算每个指标的平均分数
                metrics_collection = {}  # {metric_name: [scores]}
                for metric_name, scores in metric_scores.items():
                    if scores:
                        metrics_collection[metric_name] = scores

                if not metrics_collection:
                    continue

                # 获取指标的 score_min 和 score_max
                metric_min_scores = {}
                metric_max_scores = {}
                for metric_name in metrics_collection.keys():
                    metric_config = metric_config_map.get(metric_name, {})
                    metric_min_scores[metric_name] = metric_config.get("score_min", 0)
                    metric_max_scores[metric_name] = metric_config.get("score_max", 10)

                # 计算聚合指标（average, max, min）
                metrics_by_method = defaultdict(dict)

                for metric_name, scores in metrics_collection.items():
                    if not scores:
                        continue

                    # 计算 average, max, min
                    metrics_by_method[CalculationMethod.AVERAGE.value][metric_name] = sum(scores) / len(scores)
                    metrics_by_method[CalculationMethod.MAX.value][metric_name] = max(scores)
                    metrics_by_method[CalculationMethod.MIN.value][metric_name] = min(scores)

                # 将 Dict[str, float] 转换为 Dict[str, ModelMetricSummary]
                def extend_metric_summary(metric_summary: dict) -> dict:
                    """将 Dict[str, float] 格式转换为 Dict[str, ModelMetricSummary] 格式"""
                    extended_summary = {}
                    for metric_name, score in metric_summary.items():
                        score_min = metric_min_scores.get(metric_name, 0)
                        score_max = metric_max_scores.get(metric_name, 10)

                        # 计算百分比分数
                        if score_max and score_max > 0:
                            percentage_score = round((score / score_max) * 100, 2)
                        else:
                            percentage_score = 0.0

                        extended_summary[metric_name] = ModelMetricSummary(
                            metric_name=metric_name,
                            score=round(score, 4),
                            score_min=int(score_min) if score_min is not None else 0,
                            score_max=int(score_max) if score_max is not None else 10,
                            percentage_score=percentage_score
                        )
                    return extended_summary

                # 构建 AggregativeMetric 列表
                aggregative_metrics = [
                    AggregativeMetric(
                        calculation_method=CalculationMethod(method),
                        metric_summary=extend_metric_summary(metric_summary)
                    )
                    for method, metric_summary in metrics_by_method.items()
                    if metric_summary
                ]

                if not aggregative_metrics:
                    continue

                # 5. 创建评估报告
                report = EvaluationReportCreate(
                    evaluation_task_id=task.id,
                    evaluated_model_id=model_id,
                    evaluated_model_name=model_name,
                    evaluated_model_source=model_info.get("model_source"),
                    evaluation_method=EvaluationMethod.MANUAL,
                    aggregative_metrics=aggregative_metrics,
                    comparison_data=None  # 人工评估暂不支持对比数据
                )

                await evaluation_task_service.create_or_update_evaluation_report(report)
                logger.info(f"任务 {task.id} 模型 {model_name} 的评估报告生成成功")

        except Exception as e:
            logger.error(f"生成人工评估报告失败 [任务: {task.id}]: {e}", exc_info=True)
            raise

    def query_completed_build_image_tasks(self) -> None:
        """查询已完成的镜像构建任务并处理日志"""
        try:
            with SessionLocal() as db:
                # 查询已完成但未处理日志的任务
                stmt = select(ImageBuildLog).where(
                    and_(
                        ImageBuildLog.status == TaskStatus.COMPLETED,
                        ImageBuildLog.log_path.is_(None),
                        ImageBuildLog.lab_k8s_uuid.is_not(None)
                    )
                )
                result = db.execute(stmt)
                completed_tasks = result.scalars().all()

                if not completed_tasks:
                    return

                logger.info(f"找到 {len(completed_tasks)} 个需要处理日志的已完成镜像构建任务")

                # 处理每个任务
                for task in completed_tasks:
                    try:
                        # 1. 从Loki获取日志
                        logs = self.log_service.get_logs_from_loki(task.lab_k8s_uuid)
                        if not logs:
                            continue

                        # 2. 上传到MinIO
                        minio_path = self.log_service.upload_logs_to_minio(logs, task.lab_k8s_uuid)
                        if not minio_path:
                            continue

                        # 3. 更新数据库
                        task.log_path = minio_path
                        logger.info(f"任务 {task.id} 日志处理完成: {minio_path}")

                    except Exception as e:
                        logger.error(f"处理任务 {task.id} 失败: {e}")
                        continue

                # 提交更改
                db.commit()

        except Exception as e:
            logger.error(f"定时任务执行失败: {e}")

    async def test_k8s_cluster_connectivity_all(self) -> None:
        """遍历所有集群，执行连通性检测"""
        base_mapper = AutoContainer.base_mapper()
        original_tenant = app_runtime_context.get_tenant_id()

        try:
            app_runtime_context.set_tenant_id(None)
            clusters = await base_mapper.query(select(KubernetesResource))
            if not clusters:
                return

            for cluster in clusters:
                try:
                    config_dict = yaml.safe_load(cluster.config)
                    api_instance = get_k8s_api(config_dict, client.CoreV1Api)
                    api_response = await k8s_call(api_instance.list_node)
                    node_number = len(api_response.items)
                    cluster.node_number = node_number
                    cluster.status = ConnectionStatus.CONNECTED.value
                    await base_mapper.commit()
                    logger.info(f"K8s 集群连通性检测成功: {cluster.name} (ID: {cluster.id})")
                except Exception as e:
                    try:
                        cluster.status = ConnectionStatus.FAILED.value
                        await base_mapper.commit()
                    except Exception as db_error:
                        await base_mapper.rollback()
                        logger.error(f"更新集群状态失败: {db_error}")
                    logger.error(f"K8s 集群连通性检测失败: {cluster.id}: 连接失败: {e}")
        finally:
            try:
                await base_mapper.close()
            except Exception as close_error:
                logger.warning(f"关闭集群连通性检测数据库会话失败: {close_error}", exc_info=True)
            app_runtime_context.set_tenant_id(original_tenant)
        try:
            await sync_kubernetes_labels()
        except Exception as e:
            logger.error(f"同步集群 labels 失败: {e}")

#!/usr/bin/env python3
"""
统一状态管理器

将所有Kubernetes资源监听、Redis操作、集群管理功能整合到一个类中，
消除不必要的抽象层，提供更简洁高效的状态监听架构。
"""

import asyncio
from datetime import datetime
import yaml
import redis
from typing import Dict, Set, Optional, List, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from kubernetes_asyncio import client, config, watch

from app.core.logging import logger
from app.core.config import settings
from app.database.base import get_db_session
from app.models.inference_task_manager import InferenceTask
from app.models.models import ImageBuildLog, KubernetesResource, Notebook
from app.models.training_task_manager import TrainingTask
from app.models.data_cleaning_manager import DataCleaningTask
from app.models.inference_result_manager import InferenceResultDataset
from .k8s_task_status import TaskStatus, map_job_status_async, map_deployment_status
from ..models import TrainedModel, BaseModel
from ..schemas.model import ModelStatus
from ..models import EvaluationTask
from app.models.benchmark_task_manager import BenchmarkTask


class K8sStatusManager:
    """
    Kubernetes状态管理器
    
    负责：
    - Kubernetes资源监听
    - Redis资源版本管理
    - 集群配置管理
    - 状态映射和缓存
    """

    # 终态状态集合
    TERMINAL_STATUSES: Set[TaskStatus] = {
        TaskStatus.COMPLETED, 
        TaskStatus.FAILED
     
    }

    def __init__(self):
        """初始化状态管理器"""
        
        # 当前活跃的集群ID集合
        self.active_cluster_ids: Set[str] = set()
        
        # 监听任务管理 - 扁平化结构
        # key格式: "cluster_id:namespace:resource_type" 或 "cluster_id:namespace_watcher"
        self.watcher_tasks: Dict[str, asyncio.Task] = {}
        self.stop_events: Dict[str, asyncio.Event] = {}
        
        # 集群命名空间缓存
        # key: cluster_id, value: Set[namespace_name]
        self.cluster_namespaces: Dict[str, Set[str]] = {}
        
        # 任务状态缓存 - 用于状态转换验证
        # key: lab_k8s_uuid, value: TaskStatus
        self.task_status_cache: Dict[str, TaskStatus] = {}

        # 数据清洗完成后处理去重，避免同一个任务在状态事件抖动时重复生成训练数据集版本。
        self.cleaning_completion_in_progress: Set[int] = set()
        
        # 表名到模型类的映射
        self.table_model_mapping = {
            "training_tasks": TrainingTask,
            "notebooks": Notebook,
            "inference_tasks": InferenceTask,
            "trained_models": TrainedModel,
            "data_cleaning_tasks": DataCleaningTask,
            "base_models": BaseModel,
            "inference_result_datasets": InferenceResultDataset,
            "evaluation_tasks": EvaluationTask,
            "benchmark_tasks": BenchmarkTask,
            "image_build_log": ImageBuildLog,
        }
        
        # Redis客户端
        self.redis_client: Optional[redis.Redis] = None
        
        # 运行控制
        self.running = True
        self.sync_task: Optional[asyncio.Task] = None

        # 配置参数
        self.timeout_seconds = 300  # 5分钟超时，减少重连频率
        self.label_selector = "deepexilab_status_auto_update=true"
        self.namespace_label_selector = "app=deepexilab"
        self.redis_key_prefix = "k8s:rv"
        
        # 日志控制
        self._logged_watchers = set()  # 记录已记录日志的监听器
        
        logger.info("状态管理器初始化完成")

    async def _init_redis(self) -> None:
        """初始化Redis客户端（支持 Sentinel）"""
        try:
            # 使用配置中的异步 Redis 客户端，自动支持 Sentinel
            self.redis_client = settings.REDIS_CLIENT
            await self.redis_client.ping()
            logger.info("Redis连接初始化成功")
        except Exception as e:
            logger.error(f"Redis连接失败: {e}")
            self.redis_client = None

    def _get_redis_key(self, cluster_id: str, namespace: str, resource_type: str) -> str:
        """生成Redis key"""
        return f"{self.redis_key_prefix}:{cluster_id}:{namespace}:{resource_type}"

    def _get_watcher_key(self, cluster_id: str, namespace: str, resource_type: str) -> str:
        """生成监听器唯一标识符"""
        return f"{cluster_id}:{namespace}:{resource_type}"
    
    def _get_namespace_watcher_key(self, cluster_id: str) -> str:
        """生成命名空间监听器唯一标识符"""
        return f"{cluster_id}:namespace_watcher"

    async def _redis_get(self, key: str) -> Optional[str]:
        """获取Redis值"""
        if not self.redis_client:
            return None
        try:
            return await self.redis_client.get(key)
        except Exception as e:
            logger.error(f"获取Redis值失败 {key}: {e}")
            return None

    async def _redis_set(self, key: str, value: str) -> bool:
        """设置Redis值"""
        if not self.redis_client:
            return False
        try:
            await self.redis_client.set(key, value)
            return True
        except Exception as e:
            logger.error(f"设置Redis值失败 {key}: {e}")
            return False

    async def _redis_delete(self, key: str) -> bool:
        """删除Redis key"""
        if not self.redis_client:
            return False
        try:
            await self.redis_client.delete(key)
            return True
        except Exception as e:
            logger.error(f"删除Redis key失败 {key}: {e}")
            return False

    async def _redis_delete_pattern(self, pattern: str) -> int:
        """根据模式批量删除Redis key"""
        if not self.redis_client:
            return 0
        try:
            keys_to_delete = []
            async for key in self.redis_client.scan_iter(match=pattern):
                keys_to_delete.append(key)
            if keys_to_delete:
                return await self.redis_client.delete(*keys_to_delete)
            return 0
        except Exception as e:
            logger.error(f"批量删除Redis key失败 {pattern}: {e}")
            return 0


    async def _get_current_task_status(self, lab_k8s_uuid: str, status_update_relevant_table: str) -> Optional[TaskStatus]:
        """获取任务的当前状态"""
        try:
            # 优先从缓存获取
            if lab_k8s_uuid in self.task_status_cache:
                return self.task_status_cache[lab_k8s_uuid]
            
            # 根据表名获取对应的模型类
            model_class = self.table_model_mapping.get(status_update_relevant_table)
            if not model_class:
                logger.error(f"未找到表 {status_update_relevant_table} 对应的模型类")
                return None
            
            async with get_db_session() as db:
                stmt = select(model_class).where(model_class.lab_k8s_uuid == lab_k8s_uuid)
                result = await db.execute(stmt)
                record = result.scalar_one_or_none()
                if record:
                    status = TaskStatus(record.status)
                    # 终态不缓存，避免终态任务删除后遗留脏缓存
                    if status in self.TERMINAL_STATUSES:
                        self.task_status_cache.pop(lab_k8s_uuid, None)
                    else:
                        self.task_status_cache[lab_k8s_uuid] = status
                    return status
            # 记录不存在（可能已删除）时，清理缓存
            self.task_status_cache.pop(lab_k8s_uuid, None)
            return None
        except Exception as e:
            logger.error(f"获取任务当前状态失败: {e}")
            return None

    async def _update_task_state(self, lab_k8s_uuid: str, new_status: TaskStatus, status_update_relevant_table: str,
                                 available_replicas: int = 0) -> None:
        """更新任务状态"""
        # 获取当前状态进行比较
        current_status = self.task_status_cache.get(lab_k8s_uuid)

        try:
            # 根据表名获取对应的模型类
            model_class = self.table_model_mapping.get(status_update_relevant_table)
            if not model_class:
                logger.error(f"未找到表 {status_update_relevant_table} 对应的模型类")
                return
            
            # 如果状态没有变化，跳过更新
            if current_status == new_status and model_class != InferenceTask:
                return

            async with get_db_session() as db:
                stmt = select(model_class).where(model_class.lab_k8s_uuid == lab_k8s_uuid)
                result = await db.execute(stmt)
                record = result.scalar_one_or_none()
                
            
                if record:
                    # 首先检查数据库中的状态是否为终态，如果是终态，则不允许更新
                    try:
                        current_db_status = TaskStatus(record.status)
                        if current_db_status in self.TERMINAL_STATUSES:
                            # 已是终态时不再保留缓存，防止删除后脏数据
                            self.task_status_cache.pop(lab_k8s_uuid, None)
                            logger.warning(f"拒绝更新终态任务状态: {lab_k8s_uuid} - 数据库状态: {current_db_status} - 尝试更新为: {new_status}")
                            return
                    except ValueError:
                        # 如果状态值无法转换为枚举，记录警告但继续更新
                        logger.warning(f"未知的状态值: {record.status}")
                    
                    # 如果是训练任务或清洗任务，需要更新时间
                    if model_class == TrainingTask or model_class == TrainedModel:
                        if new_status == TaskStatus.RUNNING:
                            record.started_at = datetime.now()
                        elif (new_status == TaskStatus.COMPLETED or new_status == TaskStatus.FAILED) and not record.finished_at:
                            record.finished_at = datetime.now()
                            if not record.started_at:
                                record.started_at = record.created_at
                            estimated_duration = record.finished_at - record.started_at
                            record.estimated_duration = estimated_duration.total_seconds()
                    # 评估任务：开始运行时记录开始时间started_at，结束运行（失败或者成功）记录结束时间finished_at
                    elif model_class == EvaluationTask:
                        if new_status == TaskStatus.RUNNING:
                            record.started_at = datetime.now()
                        elif new_status == TaskStatus.COMPLETED or new_status == TaskStatus.FAILED:
                            # 失败与否都记录结束时间
                            # 终止状态包含：终止、停止、成功、失败
                            # 其中终止和停止无法与k8s的pod的状态进行映射，所以这里只处理成功和失败
                            record.finished_at = datetime.now()
                            # 兜底逻辑：如果任务已经终止且开始时间为空，使用创建时间或当前时间
                            if not record.started_at:
                                # 优先使用 created_at
                                record.started_at = record.created_at
                                logger.warning(
                                    f"评估任务 {record.id} 在终态时 started_at 为空，"
                                    f"使用 created_at ({record.started_at}) 作为兜底值"
                                )
                    elif model_class == DataCleaningTask:
                        if new_status == TaskStatus.RUNNING:
                            record.started_at = datetime.now()
                        elif new_status == TaskStatus.COMPLETED:
                            record.completed_at = datetime.now()
                            # 数据清洗任务完成时，异步创建新版本
                            try:
                                if record.output_dataset_id:
                                    logger.info(
                                        f"数据清洗任务已生成输出数据集，跳过重复完成处理: "
                                        f"task_id={record.id}, output_dataset_id={record.output_dataset_id}"
                                    )
                                elif record.id in self.cleaning_completion_in_progress:
                                    logger.info(f"数据清洗任务完成处理已在执行中，跳过重复触发: task_id={record.id}")
                                else:
                                    self.cleaning_completion_in_progress.add(record.id)
                                    # 异步调用创建新版本的方法（避免阻塞状态更新）
                                    asyncio.create_task(self._handle_cleaning_task_completion(record.id))
                            except Exception as e:
                                self.cleaning_completion_in_progress.discard(record.id)
                                logger.error(f"触发数据清洗任务完成处理失败: {str(e)}", exc_info=True)
                    elif model_class == BenchmarkTask:
                        if new_status == TaskStatus.RUNNING:
                            record.started_at = datetime.now()
                        elif new_status == TaskStatus.COMPLETED or new_status == TaskStatus.FAILED:
                            record.finished_at = datetime.now()
                            if not record.started_at:
                                record.started_at = record.created_at
                            if new_status == TaskStatus.COMPLETED:
                                # 先同步执行结果处理（读分数、写 BenchmarkResult），再标为已完成，避免「已完成但分数未写入」
                                try:
                                    await self._handle_benchmark_task_completion(record.id)
                                except Exception as e:
                                    logger.error(f"基准评估任务结果处理失败: task_id={record.id}, error={str(e)}", exc_info=True)
                                self.task_status_cache.pop(lab_k8s_uuid, None)
                                try:
                                    asyncio.create_task(
                                        self._delete_benchmark_k8s_job(record.id, record.project_id)
                                    )
                                except Exception as e:
                                    logger.warning(f"触发基准评估 Job 删除失败: task_id={record.id}, error={e}")
                                return
                            # 失败时照常走下方 record.status + commit；完成后已在上方 return，不再写 status
                            # 任务进入终态后立即删除 K8s Job
                            if new_status == TaskStatus.FAILED:
                                try:
                                    asyncio.create_task(
                                        self._delete_benchmark_k8s_job(record.id, record.project_id)
                                    )
                                except Exception as e:
                                    logger.warning(f"触发基准评估 Job 删除失败: task_id={record.id}, error={e}")
                    elif model_class == ImageBuildLog:
                        if new_status == TaskStatus.COMPLETED:
                            # 镜像构建任务完成时，异步创建新镜像
                            try:
                                asyncio.create_task(self._handle_image_build_task_completion(record.id))
                            except Exception as e:
                                logger.error(f"触发镜像构建任务完成处理失败: {str(e)}", exc_info=True)
                        if new_status == TaskStatus.FAILED:
                            # 镜像构建任务失败时，删除锁
                            try:
                                asyncio.create_task(self._handle_image_build_task_failed(record.id))
                            except Exception as e:
                                logger.error(f"触发镜像构建任务失败处理失败: {str(e)}", exc_info=True)
                    # 其他模型直接使用TaskStatus的值
                    new_status_value = new_status.value
                            
                    # 只有在通过终态检查后才执行状态更新
                    logger.info(f"更新任务状态: {lab_k8s_uuid} - {current_status} → {new_status} - {status_update_relevant_table}")
                    
                    if model_class == InferenceTask:
                        if available_replicas:
                            record.ready_replicas = available_replicas
                            new_status_value = TaskStatus.RUNNING.value
                        elif new_status == TaskStatus.PENDING and not available_replicas:
                            record.ready_replicas = 0
                            new_status_value = TaskStatus.PENDING.value
                        else:
                            record.ready_replicas = 0
                            new_status_value = TaskStatus.TERMINATED.value
                    record.status = new_status_value
                    await db.commit()
                    
                    # 只有在数据库更新成功后才更新缓存
                    if new_status in self.TERMINAL_STATUSES:
                        self.task_status_cache.pop(lab_k8s_uuid, None)
                    else:
                        self.task_status_cache[lab_k8s_uuid] = new_status
                else:
                    # 记录不存在（可能已删除）时，清理缓存
                    self.task_status_cache.pop(lab_k8s_uuid, None)
                    
        except Exception as e:
            logger.error(f"更新任务状态失败: {e}")
            # 如果更新失败，确保缓存不被污染，恢复原状态
            if current_status is not None and current_status not in self.TERMINAL_STATUSES:
                self.task_status_cache[lab_k8s_uuid] = current_status
            else:
                self.task_status_cache.pop(lab_k8s_uuid, None)

    async def _handle_cleaning_task_completion(self, task_id: int) -> None:
        """
        处理数据清洗任务完成后的逻辑（创建新版本）

        Args:
            task_id: 数据清洗任务ID
        """
        logger.info(f"开始处理数据清洗任务完成逻辑: task_id={task_id}")
        try:
            # 通过依赖注入获取数据清洗服务（避免循环依赖）
            from app.core.depend_manager import AutoContainer

            # 获取数据清洗服务
            logger.info(f"获取数据清洗服务实例: task_id={task_id}")
            cleaning_service = AutoContainer.cleaning_service()

            if not cleaning_service:
                logger.error(f"无法获取数据清洗服务实例: task_id={task_id}")
                return

            logger.info(f"数据清洗服务实例获取成功: task_id={task_id}, service_type={type(cleaning_service).__name__}")

            # 调用创建新版本的方法
            logger.info(f"调用生成新版本方法: task_id={task_id}")
            new_dataset_id = await cleaning_service.generate_training_dataset_on_completion(task_id)

            if new_dataset_id:
                logger.info(f"数据清洗任务 {task_id} 完成，已生成新版本数据集: {new_dataset_id}")
            else:
                logger.warning(f"数据清洗任务 {task_id} 完成，但未生成新版本（可能不满足条件或覆盖模式）")

        except Exception as e:
            logger.error(f"处理数据清洗任务完成逻辑失败: task_id={task_id}, error={str(e)}", exc_info=True)
        finally:
            self.cleaning_completion_in_progress.discard(task_id)

    async def _handle_benchmark_task_completion(self, task_id: int) -> None:
        """基准评估任务完成后：从 JFS 解析 OpenCompass 结果并写入 BenchmarkResult；若评估失败则拼接错误日志并标记任务失败。"""
        try:
            import asyncio
            from app.core.depend_manager import AutoContainer
            from app.utils import app_runtime_context
            from app.utils.log_service import log_service
            from app.services.benchmark_task.result_processor import (
                process_benchmark_task_results,
                summary_has_eval_failure,
                parse_error_log_paths_from_run_log,
            )

            container = AutoContainer()
            benchmark_service = container.benchmark_task_service()
            storage_service = container.storage_service()
            task = await benchmark_service.task_mapper.query_one(
                select(BenchmarkTask).where(BenchmarkTask.id == task_id)
            )
            if not task:
                logger.warning(f"基准评估任务不存在，跳过结果处理: task_id={task_id}")
                return
            app_runtime_context.set_tenant_id(task.tenant_id or None)
            jfs = await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            if not jfs:
                logger.warning(f"无法获取 JFS 客户端，跳过基准评估结果处理: task_id={task_id}")
                return
            await process_benchmark_task_results(
                task_id=task_id,
                jfs=jfs,
                task_mapper=benchmark_service.task_mapper,
                result_mapper=benchmark_service.result_mapper,
                model_relation_mapper=benchmark_service.model_relation_mapper,
                dataset_relation_mapper=benchmark_service.dataset_relation_mapper,
                leaderboard_mapper=benchmark_service.leaderboard_mapper,
            )
            # 重新加载任务以获取 result_path
            task = await benchmark_service.task_mapper.query_one(
                select(BenchmarkTask).where(BenchmarkTask.id == task_id)
            )
            if not task or not task.result_path:
                return
            result_path = task.result_path.rstrip("/")
            subdir = result_path.split("/")[-1]
            # 读取 summary 判断是否有评估失败（分数为 "-"）
            summary_content = None
            try:
                summary_dir = result_path + "/summary/"
                for name in jfs.listdir(summary_dir):
                    if name.endswith(".csv"):
                        with jfs.open(summary_dir + name, "r", encoding="utf-8") as f:
                            summary_content = f.read()
                        break
            except Exception as e:
                logger.debug(f"读取基准 summary 失败: task_id={task_id}, e={e}")
            if not summary_content or not summary_has_eval_failure(summary_content):
                return
            logger.warning(
                f"检测到基准评估结果存在失败项（summary 含 '-'），将任务标记为失败: task_id={task_id}, result_path={result_path}"
            )
            # 评估失败：拉取运行日志，解析错误文件路径，拼接内容后上传并标记失败
            if not task.lab_k8s_uuid:
                logger.warning(f"基准任务无 lab_k8s_uuid，无法拉取日志: task_id={task_id}")
                await self._set_benchmark_task_failed(benchmark_service, task_id)
                return
            run_log_lines = await asyncio.to_thread(
                log_service.get_logs_from_loki,
                task.lab_k8s_uuid,
                end_time=task.finished_at,
                days=7,
            )
            if not run_log_lines:
                await self._set_benchmark_task_failed(benchmark_service, task_id)
                return
            error_paths = parse_error_log_paths_from_run_log(run_log_lines)
            combined = list(run_log_lines)
            sep = "\n======== 以下为 OpenCompass 报错中提到的错误日志文件内容，便于排查 =========\n"
            for abs_path in error_paths:
                rel = None
                if subdir in abs_path and "results/" in abs_path:
                    idx = abs_path.find("results/") + len("results/") + len(subdir) + 1
                    if idx <= len(abs_path):
                        rel = abs_path[idx:]
                if not rel:
                    rel = abs_path
                jfs_path = result_path + "/" + rel
                try:
                    with jfs.open(jfs_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                except Exception as e:
                    content = f"[无法读取文件: {e}]\n"
                combined.append(sep)
                combined.append(f"---------- 以下内容来自: {abs_path} ----------")
                combined.extend(content.strip().splitlines())
            minio_path = await asyncio.to_thread(
                log_service.upload_logs_to_minio,
                combined,
                task.lab_k8s_uuid,
            )
            if minio_path:
                task = await benchmark_service.task_mapper.query_one(
                    select(BenchmarkTask).where(BenchmarkTask.id == task_id)
                )
                if task:
                    task.log_path = minio_path
                    task.status = TaskStatus.FAILED.value
                    task.error_message = "OpenCompass 评估失败：summary 存在 '-'，请下载任务日志查看具体错误。"
                    await benchmark_service.task_mapper.commit()
                    logger.info(f"基准评估任务已标记为失败并写入拼接日志: task_id={task_id}, log_path={minio_path}")
            else:
                await self._set_benchmark_task_failed(
                    benchmark_service,
                    task_id,
                    error_message="OpenCompass 评估失败：summary 存在 '-'，且日志归档失败。",
                )
        except Exception as e:
            logger.error(f"处理基准评估任务结果失败: task_id={task_id}, error={str(e)}", exc_info=True)

    async def _delete_benchmark_k8s_job(self, task_id: int, project_id: int) -> None:
        """基准评估任务终态后立即删除 K8s Job，避免定时任务下次运行时同名 Job 残留导致 409。"""
        import os
        try:
            from app.utils.k8s_launcher import K8sLauncher
            from app.models.models import KubernetesResource, ProjectKubernetesRelation
            async with get_db_session() as session:
                k8s_result = await session.execute(
                    select(KubernetesResource.config).join(
                        ProjectKubernetesRelation,
                        ProjectKubernetesRelation.k8s_id == KubernetesResource.id
                    ).where(ProjectKubernetesRelation.project_id == project_id)
                )
                k8s_config = k8s_result.scalar()
            if not k8s_config:
                logger.warning(f"未找到 K8s 配置，跳过删除 benchmark Job: task_id={task_id}")
                return
            launcher = K8sLauncher(config_str=k8s_config)
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            job_name = f"benchmark-task-{task_id}"
            success = await launcher.delete_job(namespace=namespace, job_name=job_name)
            if success:
                logger.info(f"基准评估 Job 已删除: {job_name}")
            else:
                logger.debug(f"基准评估 Job 不存在或已删除: {job_name}")
        except Exception as e:
            logger.warning(f"删除基准评估 K8s Job 失败（不影响任务状态）: task_id={task_id}, error={e}")

    async def _set_benchmark_task_failed(self, benchmark_service, task_id: int, error_message: str = None) -> None:
        """仅将基准任务状态置为 FAILED（无日志时使用）。"""
        try:
            task = await benchmark_service.task_mapper.query_one(
                select(BenchmarkTask).where(BenchmarkTask.id == task_id)
            )
            if task:
                task.status = TaskStatus.FAILED.value
                if error_message:
                    task.error_message = error_message
                await benchmark_service.task_mapper.commit()
                logger.info(f"基准评估任务已标记为失败: task_id={task_id}")
        except Exception as e:
            logger.error(f"更新基准任务为失败状态异常: task_id={task_id}, error={e}", exc_info=True)

    async def _handle_image_build_task_completion(self, task_id: int) -> None:
        """
        处理镜像构建任务完成后的逻辑（创建新版本）

        Args:
            task_id: 镜像构建任务ID
        """
        logger.info(f"开始处理镜像构建任务完成逻辑: task_id={task_id}")
        try:
            # 通过依赖注入获取镜像构建服务（避免循环依赖）
            from app.core.depend_manager import AutoContainer

            # 获取镜像构建服务
            logger.info(f"获取镜像构建服务实例: task_id={task_id}")
            image_build_service = AutoContainer.repository_image_service()

            if not image_build_service:
                logger.error(f"无法获取镜像构建服务实例: task_id={task_id}")
                return

            logger.info(f"镜像构建服务实例获取成功: task_id={task_id}, service_type={type(image_build_service).__name__}")

            # 调用构建镜像的方法
            logger.info(f"调用构建镜像方法: task_id={task_id}")
            await image_build_service.build_image_completed(task_id)

            logger.info(f"镜像构建任务 {task_id} 完成")
        except Exception as e:
            logger.error(f"处理镜像构建任务完成逻辑失败: task_id={task_id}, error={str(e)}", exc_info=True)

    async def _handle_image_build_task_failed(self, task_id: int) -> None:
        """
        处理镜像构建任务失败后的逻辑（释放构建记录锁）

        Args:
            task_id: 镜像构建任务ID
        """
        logger.info(f"开始处理镜像构建任务失败后逻辑: task_id={task_id}")
        try:
            # 通过依赖注入获取镜像构建服务（避免循环依赖）
            from app.core.depend_manager import AutoContainer

            # 获取镜像构建服务
            logger.info(f"获取镜像构建服务实例: task_id={task_id}")
            image_build_service = AutoContainer.repository_image_service()

            if not image_build_service:
                logger.error(f"无法获取镜像构建服务实例: task_id={task_id}")
                return

            logger.info(f"镜像构建服务实例获取成功: task_id={task_id}, service_type={type(image_build_service).__name__}")

            # 调用构建镜像失败的方法
            logger.info(f"调用构建镜像失败方法: task_id={task_id}")
            await image_build_service.build_image_failed(task_id)

            logger.info(f"镜像构建任务失败处理 {task_id} 完成")
        except Exception as e:
            logger.error(f"处理镜像构建任务失败逻辑失败: task_id={task_id}, error={str(e)}", exc_info=True)

    async def _get_cluster_namespaces(self, cluster_id: str, kubeconfig_content: str) -> List[str]:
        """获取集群中带有特定标签的命名空间列表"""
        api_client = None
        try:
            kubeconfig_dict = yaml.safe_load(kubeconfig_content)
            # 使用独立配置，避免多集群并发冲突
            conf = client.Configuration()
            await config.load_kube_config_from_dict(config_dict=kubeconfig_dict, client_configuration=conf)
            
            api_client = client.ApiClient(configuration=conf)
            core_v1 = client.CoreV1Api(api_client=api_client)
            namespaces = await core_v1.list_namespace(label_selector="app=deepexilab")
            
            namespace_names = [ns.metadata.name for ns in namespaces.items]

            logger.info(f"集群 {cluster_id} 当前已存在 {len(namespace_names)} 个命名空间")
            
            return namespace_names
            
        except Exception as e:
            logger.error(f"获取集群 {cluster_id} 命名空间失败: {e}")
            return []
        finally:
            # 确保客户端会话正确关闭
            if api_client:
                await api_client.close()


    async def _handle_resource_event(
        self, 
        event: Dict[str, Any], 
        cluster_id: str, 
        namespace: str, 
        resource_type: str,
        core_v1: client.CoreV1Api
    ) -> None:
        """处理资源事件"""
        try:
            resource = event['object']
            event_type = event['type']
            resource_name = resource.metadata.name
            resource_version = resource.metadata.resource_version
            
            # 首先更新resource_version到Redis（所有情况都需要）
            redis_key = self._get_redis_key(cluster_id, namespace, resource_type)
            await self._redis_set(redis_key, resource_version)
            
            # 检查必要标签
            labels = resource.metadata.labels
            if not labels:
                logger.warning(f"资源{resource_name}没有标签")
                return
            status_update_relevant_table = labels.get("deepexilab_status_update_relevant_table")
            lab_k8s_uuid = labels.get("deepexilab_k8s_uuid")

            
            logger.info(f"处理资源事件: {event_type} - {resource_name} - {resource.status}")
            # 处理状态更新
            if event_type == 'DELETED':
                if lab_k8s_uuid:
                    self.task_status_cache.pop(lab_k8s_uuid, None)
                    logger.debug(f"资源删除事件触发缓存清理: {lab_k8s_uuid}")
                #await self._delete_task(lab_k8s_uuid, status_update_relevant_table)
            else:
                # 获取当前任务状态
                current_task_status = await self._get_current_task_status(lab_k8s_uuid, status_update_relevant_table)
                
                # 根据资源类型映射状态
                new_status = None
                available_replicas = 0
                if hasattr(resource.status, 'active'):  # Job状态
                    new_status = await map_job_status_async(
                        resource.status, 
                        core_v1, 
                        namespace, 
                        resource_name, 
                        current_task_status
                    )
                elif hasattr(resource.status, 'available_replicas'):  # Deployment状态
                    new_status, available_replicas = map_deployment_status(resource.status, event_type, current_task_status)

                if new_status:
                    await self._update_task_state(lab_k8s_uuid, new_status, status_update_relevant_table, available_replicas)
                
            
        except Exception as e:
            logger.error(f"处理资源事件失败: {e}")

    async def _handle_namespace_event(
        self, 
        event: Dict[str, Any], 
        cluster_id: str,
        kubeconfig_content: str
    ) -> None:
        """处理命名空间事件"""
        try:
            namespace_obj = event['object']
            event_type = event['type']
            namespace_name = namespace_obj.metadata.name
            
            # 检查命名空间标签
            labels = namespace_obj.metadata.labels or {}
            if labels.get("app") != "deepexilab":
                return
            
            logger.info(f"处理命名空间事件: {event_type} - {cluster_id}/{namespace_name}")
            
            if event_type == 'ADDED':
                await self._handle_namespace_added(cluster_id, namespace_name, kubeconfig_content)
            elif event_type == 'DELETED':
                await self._handle_namespace_deleted(cluster_id, namespace_name)
                
        except Exception as e:
            logger.error(f"处理命名空间事件失败: {e}")

    async def _handle_namespace_added(self, cluster_id: str, namespace_name: str, kubeconfig_content: str) -> None:
        """处理命名空间新增事件"""
        try:
            # 更新命名空间缓存
            if cluster_id not in self.cluster_namespaces:
                self.cluster_namespaces[cluster_id] = set()
            
            if namespace_name in self.cluster_namespaces[cluster_id]:
                logger.debug(f"命名空间已存在，跳过: {cluster_id}/{namespace_name}")
                return
                
            self.cluster_namespaces[cluster_id].add(namespace_name)
            logger.info(f"新增命名空间: {cluster_id}/{namespace_name}")
            
            # 为新命名空间创建Job和Deployment监听器
            for resource_type in ["job", "deployment"]:
                watcher_key = self._get_watcher_key(cluster_id, namespace_name, resource_type)
                
                if watcher_key not in self.watcher_tasks:
                    # 创建停止事件
                    stop_event = asyncio.Event()
                    self.stop_events[watcher_key] = stop_event
                    
                    # 创建监听任务
                    task = asyncio.create_task(
                        self._watch_resources(cluster_id, namespace_name, resource_type, kubeconfig_content),
                        name=f"watcher-{watcher_key}"
                    )
                    self.watcher_tasks[watcher_key] = task
                    
                    logger.info(f"为新命名空间启动{resource_type}监听器: {watcher_key}")
                    
        except Exception as e:
            logger.error(f"处理命名空间新增失败 {cluster_id}/{namespace_name}: {e}")

    async def _handle_namespace_deleted(self, cluster_id: str, namespace_name: str) -> None:
        """处理命名空间删除事件"""
        try:
            # 更新命名空间缓存
            if cluster_id in self.cluster_namespaces:
                self.cluster_namespaces[cluster_id].discard(namespace_name)
            
            logger.info(f"删除命名空间: {cluster_id}/{namespace_name}")
            
            # 停止该命名空间的所有监听器
            namespace_watchers = [
                key for key in self.watcher_tasks.keys() 
                if key.startswith(f"{cluster_id}:{namespace_name}:")
            ]
            
            if namespace_watchers:
                logger.info(f"停止命名空间 {cluster_id}/{namespace_name} 的 {len(namespace_watchers)} 个监听器")
                
                # 设置停止事件
                for watcher_key in namespace_watchers:
                    if watcher_key in self.stop_events:
                        self.stop_events[watcher_key].set()
                
                # 取消并等待任务完成
                stop_tasks = []
                for watcher_key in namespace_watchers:
                    if watcher_key in self.watcher_tasks:
                        task = self.watcher_tasks.pop(watcher_key)
                        if not task.done():
                            task.cancel()
                        stop_tasks.append(task)
                        
                        # 清理停止事件
                        self.stop_events.pop(watcher_key, None)
                
                if stop_tasks:
                    try:
                        await asyncio.gather(*stop_tasks, return_exceptions=True)
                        logger.info(f"已停止命名空间 {cluster_id}/{namespace_name} 的所有监听器")
                    except Exception as e:
                        logger.error(f"停止命名空间 {cluster_id}/{namespace_name} 监听器时出错: {e}")
                
                # 清理Redis中的resource_version数据
                for resource_type in ["job", "deployment"]:
                    redis_key = self._get_redis_key(cluster_id, namespace_name, resource_type)
                    await self._redis_delete(redis_key)
                    
        except Exception as e:
            logger.error(f"处理命名空间删除失败 {cluster_id}/{namespace_name}: {e}")

    async def _watch_resources(self, cluster_id: str, namespace: str, resource_type: str, kubeconfig_content: str) -> None:
        """监听资源变化的主循环"""
        watcher_key = self._get_watcher_key(cluster_id, namespace, resource_type)
        stop_event = self.stop_events.get(watcher_key)
        
        if not stop_event:
            logger.error(f"未找到停止事件: {watcher_key}")
            return

        # 初始化Kubernetes客户端配置
        conf = client.Configuration()
        try:
            kubeconfig_dict = yaml.safe_load(kubeconfig_content)
            # 使用独立配置，避免并发冲突
            await config.load_kube_config_from_dict(config_dict=kubeconfig_dict, client_configuration=conf)
        except Exception as e:
            logger.error(f"Kubernetes配置加载失败 {watcher_key}: {e}")
            return

        while not stop_event.is_set() and self.running:
            # 创建独立的ApiClient（使用上下文管理器确保正确关闭）
            api_client_instance = client.ApiClient(configuration=conf)
            core_v1 = client.CoreV1Api(api_client=api_client_instance)
            
            resource_api = None
            if resource_type == "job":
                resource_api = client.BatchV1Api(api_client=api_client_instance)
                list_method = resource_api.list_namespaced_job
            else:  # deployment
                resource_api = client.AppsV1Api(api_client=api_client_instance)
                list_method = resource_api.list_namespaced_deployment
            
            w = watch.Watch()
            try:
                current_resource_version = None

                # 1. 先从 K8s 获取当前最新的 resource_version
                try:
                    initial_list = await list_method(
                        namespace=namespace,
                        label_selector=self.label_selector,
                        limit=1  # 只需获取元数据，不需要全部列表
                    )
                    k8s_resource_version = initial_list.metadata.resource_version
                except Exception as e:
                    logger.warning(f"获取K8s初始版本失败 {watcher_key}: {e}")
                    await asyncio.sleep(5)
                    continue

                # 2. 从 Redis 获取缓存的 resource_version
                redis_key = self._get_redis_key(cluster_id, namespace, resource_type)
                redis_resource_version = await self._redis_get(redis_key)
                

                if redis_resource_version:
                    # 检查 Redis 版本是否合法（不应大于 K8s 当前版本太多，防止脏数据）
                    try:
                        rv_redis = int(redis_resource_version)
                        rv_k8s = int(k8s_resource_version)

                        # 判定脏数据逻辑：
                        # 1. Redis 版本 > K8s 版本：绝对不可能（除非 API Server 重置），必然是脏数据
                        # 2. Redis 版本 < K8s 版本 - 100000：版本落后太多，可能是因为使用了其他集群的小版本号，或者是停机太久。
                        #    为了安全起见，如果落后太多也重置，避免 replay 大量历史事件导致压力过大（可选）。
                        # 这里主要修复串台导致的“大版本号”问题。

                        if rv_redis > rv_k8s:
                            logger.warning(f"检测到 Redis resource_version ({rv_redis}) 大于 K8s 当前版本 ({rv_k8s})，可能是脏数据，重置为 K8s 版本: {watcher_key}")
                            current_resource_version = k8s_resource_version
                            await self._redis_set(redis_key, current_resource_version)
                        else:
                            current_resource_version = redis_resource_version
                            logger.info(f"从Redis获取resource_version {watcher_key}: {current_resource_version}")
                    except ValueError:
                        # 非数字版本号，无法比较，保守策略：优先使用 Redis
                        current_resource_version = redis_resource_version
                        logger.info(f"从Redis获取非数字resource_version {watcher_key}: {current_resource_version}")
                else:
                    # Redis 中没有，使用 K8s 最新版本
                    current_resource_version = k8s_resource_version
                    await self._redis_set(redis_key, current_resource_version)
                    logger.info(f"初始化resource_version {watcher_key}: {current_resource_version}")

                # 只在首次启动时记录日志，避免超时重连时的冗余日志
                if watcher_key not in self._logged_watchers:
                    logger.info(f"开始监听{resource_type}: {watcher_key}")
                    self._logged_watchers.add(watcher_key)
                
                # 构建watch参数
                watch_kwargs = {
                    'namespace': namespace,
                    'label_selector': self.label_selector,
                    'timeout_seconds': self.timeout_seconds,
                    'resource_version': current_resource_version
                }
                
                stream = w.stream(list_method, **watch_kwargs)
                
                # 监听事件流
                async for event in stream:
                    if stop_event.is_set() or not self.running:
                        break
                    await self._handle_resource_event(event, cluster_id, namespace, resource_type, core_v1)
            

            except asyncio.CancelledError:
                logger.info(f"资源监听器被取消: {watcher_key}")
                break
            except Exception as e:
                if stop_event.is_set() or not self.running:
                    break
                    
                if "410" in str(e) or "Gone" in str(e):
                    # resource_version过期是正常情况，只在debug级别记录
                    logger.info (f"resource_version过期，重置 {watcher_key}")
                    # 清理Redis中的过期版本（向后兼容）
                    redis_key = self._get_redis_key(cluster_id, namespace, resource_type)
                    await self._redis_delete(redis_key)
                    # TODO: 考虑是否需要清理数据库中的resource_version（暂时保留）
                elif "timeout" in str(e).lower():
                    # 超时也是正常情况，不需要警告
                    logger.info(f"监听器超时，重新连接 {watcher_key}")
                else:
                    # 只有真正的错误才记录警告
                    logger.warning(f"监听器连接异常 {watcher_key}: {e}, 5秒后重试")
                await asyncio.sleep(5)
            finally:
                try:
                    w.stop()
                except Exception as e:
                    logger.error(f"关闭watch对象失败 {watcher_key}: {e}")
                
                # 确保客户端会话正确关闭
                try:
                    await api_client_instance.close()
                except Exception as e:
                    logger.error(f"关闭客户端会话时出现异常 {watcher_key}: {e}")
                    
        logger.info(f"资源监听器已停止: {watcher_key}")

    async def _watch_namespaces(self, cluster_id: str, kubeconfig_content: str) -> None:
        """监听命名空间变化的主循环"""
        namespace_watcher_key = self._get_namespace_watcher_key(cluster_id)
        stop_event = self.stop_events.get(namespace_watcher_key)
        
        if not stop_event:
            logger.error(f"未找到命名空间监听器停止事件: {namespace_watcher_key}")
            return

        # 初始化Kubernetes客户端配置
        conf = client.Configuration()
        try:
            kubeconfig_dict = yaml.safe_load(kubeconfig_content)
            # 使用独立配置，避免并发冲突
            await config.load_kube_config_from_dict(config_dict=kubeconfig_dict, client_configuration=conf)
        except Exception as e:
            logger.error(f"命名空间监听器Kubernetes配置加载失败 {namespace_watcher_key}: {e}")
            return

        while not stop_event.is_set() and self.running:
            # 创建独立的ApiClient（使用上下文管理器确保正确关闭）
            api_client_instance = client.ApiClient(configuration=conf)
            core_v1 = client.CoreV1Api(api_client=api_client_instance)
            
            w = watch.Watch()
            try:
                # 只在首次启动时记录日志，避免超时重连时的冗余日志
                if namespace_watcher_key not in self._logged_watchers:
                    logger.info(f"开始监听集群的命名空间事件: {namespace_watcher_key}")
                    self._logged_watchers.add(namespace_watcher_key)
                
                # 构建watch参数
                watch_kwargs = {
                    'label_selector': self.namespace_label_selector,
                    'timeout_seconds': self.timeout_seconds
                }
                
                stream = w.stream(core_v1.list_namespace, **watch_kwargs)
                
                # 监听事件流
                async for event in stream:
                    if stop_event.is_set() or not self.running:
                        break
                    await self._handle_namespace_event(event, cluster_id, kubeconfig_content)
            except asyncio.CancelledError:
                logger.info(f"命名空间监听器被取消: {namespace_watcher_key}")
                break
            except Exception as e:
                if stop_event.is_set() or not self.running:
                    break
                    
                if "timeout" in str(e).lower():
                    # 超时是正常情况，不需要警告
                    logger.debug(f"命名空间监听器超时，重新连接 {namespace_watcher_key}")
                else:
                    # 只有真正的错误才记录警告
                    logger.warning(f"命名空间监听器连接异常 {namespace_watcher_key}: {e}, 5秒后重试")
                await asyncio.sleep(5)
            finally:
                try:
                    w.stop()
                except Exception as e:
                    logger.error(f"关闭命名空间watch对象失败 {namespace_watcher_key}: {e}")
                
                # 确保客户端会话正确关闭
                try:
                    await api_client_instance.close()
                except Exception as e:
                    logger.debug(f"关闭命名空间监听器客户端会话时出现异常 {namespace_watcher_key}: {e}")
                    
        logger.info(f"命名空间监听器已停止: {namespace_watcher_key}")

    async def _start_cluster_watchers(self, cluster_id: str, kubeconfig_content: str) -> None:
        """为指定集群启动所有资源监听器"""
        try:
            # 1. 启动命名空间监听器
            namespace_watcher_key = self._get_namespace_watcher_key(cluster_id)
            if namespace_watcher_key not in self.watcher_tasks:
                # 创建停止事件
                stop_event = asyncio.Event()
                self.stop_events[namespace_watcher_key] = stop_event
                
                # 创建命名空间监听任务
                task = asyncio.create_task(
                    self._watch_namespaces(cluster_id, kubeconfig_content),
                    name=f"namespace-watcher-{cluster_id}"
                )
                self.watcher_tasks[namespace_watcher_key] = task
                
                logger.info(f"集群{cluster_id} 开启集群命名空间事件监听, key: {namespace_watcher_key}")
            
            # 2. 获取集群中的现有命名空间
            namespaces = await self._get_cluster_namespaces(cluster_id, kubeconfig_content)
            
            # 3. 初始化集群命名空间缓存
            self.cluster_namespaces[cluster_id] = set(namespaces)
            
            # 4. 为每个现有命名空间创建Job和Deployment监听器
            for namespace in namespaces:
                for resource_type in ["job", "deployment"]:
                    watcher_key = self._get_watcher_key(cluster_id, namespace, resource_type)
                    
                    if watcher_key not in self.watcher_tasks:
                        # 创建停止事件
                        stop_event = asyncio.Event()
                        self.stop_events[watcher_key] = stop_event
                        
                        # 创建监听任务
                        task = asyncio.create_task(
                            self._watch_resources(cluster_id, namespace, resource_type, kubeconfig_content),
                            name=f"watcher-{watcher_key}"
                        )
                        self.watcher_tasks[watcher_key] = task
                        
                        logger.info(f"集群{cluster_id} 开启命名空间{namespace}的{resource_type}事件监听, key: {watcher_key}")
                        
        except Exception as e:
            logger.error(f"集群 {cluster_id} 启动监听器失败: {e}")

    async def _stop_cluster_watchers(self, cluster_id: str) -> None:
        """停止指定集群的所有监听器"""
        # 找到该集群的所有监听器（包括命名空间监听器和资源监听器）
        cluster_watchers = [
            key for key in self.watcher_tasks.keys() 
            if key.startswith(f"{cluster_id}:")
        ]
        
        if not cluster_watchers:
            return
            
        logger.info(f"集群{cluster_id} 停止 {len(cluster_watchers)} 个监听器")
        
        # 设置停止事件
        for watcher_key in cluster_watchers:
            if watcher_key in self.stop_events:
                self.stop_events[watcher_key].set()
        
        # 取消并等待任务完成
        stop_tasks = []
        for watcher_key in cluster_watchers:
            if watcher_key in self.watcher_tasks:
                task = self.watcher_tasks.pop(watcher_key)
                if not task.done():
                    task.cancel()
                stop_tasks.append(task)
                
                # 清理停止事件
                self.stop_events.pop(watcher_key, None)
        
        if stop_tasks:
            try:
                await asyncio.gather(*stop_tasks, return_exceptions=True)
                logger.info(f"集群{cluster_id} 已停止所有监听器")
            except Exception as e:
                logger.error(f"集群{cluster_id} 停止监听器时出错: {e}")
        
        # 清理集群命名空间缓存
        self.cluster_namespaces.pop(cluster_id, None)
        
        # 清理Redis中的resource_version数据
        pattern = f"{self.redis_key_prefix}:{cluster_id}:*"
        deleted_count = await self._redis_delete_pattern(pattern)
        if deleted_count > 0:
            logger.info(f"集群{cluster_id} 清理 {deleted_count} 个Redis key")

    async def _get_all_clusters(self) -> List[KubernetesResource]:
        """获取所有Kubernetes集群配置"""
        try:
            async with get_db_session() as db:
                stmt = select(KubernetesResource)
                result = await db.execute(stmt)
                clusters = list(result.scalars().all())
                
                logger.info(f"成功获取 {len(clusters)} 个集群配置")
                return clusters
                
        except Exception as e:
            logger.error(f"获取集群配置失败: {e}")
            return []

    async def _sync_clusters_from_db(self) -> None:
        """从数据库同步集群配置 - 只处理添加和删除"""
        try:
            all_clusters = await self._get_all_clusters()
            
            # 获取当前数据库中的活跃集群
            db_active_cluster_ids = {
                str(c.id) for c in all_clusters 
                if c.status == '连接正常'
            }
            
            # 计算需要添加和删除的集群
            clusters_to_add = db_active_cluster_ids - self.active_cluster_ids
            clusters_to_remove = self.active_cluster_ids - db_active_cluster_ids
            
            # 删除不再活跃的集群监听器
            for cluster_id in clusters_to_remove:
                await self._stop_cluster_watchers(cluster_id)
                self.active_cluster_ids.discard(cluster_id)
                logger.info(f"移除集群: {cluster_id}")
            
            # 添加新的集群监听器
            for cluster_id in clusters_to_add:
                # 找到对应的集群配置
                cluster = next((c for c in all_clusters if str(c.id) == cluster_id), None)
                if cluster and cluster.config:
                    try:
                        await self._start_cluster_watchers(cluster_id, cluster.config)
                        self.active_cluster_ids.add(cluster_id)
                    except Exception as e:
                        logger.error(f"启动集群 {cluster_id} 监听器失败: {e}")

        except Exception as e:
            logger.error(f"同步集群配置异常: {e}")

    async def _watch_database_changes(self) -> None:
        """监听数据库配置变化"""
        logger.info("开启数据库配置同步任务")

        while self.running:
            try:
                await self._sync_clusters_from_db()
            except Exception as e:
                logger.error(f"数据库配置同步失败: {e}")
            await asyncio.sleep(30)  # 每30秒同步一次

    async def start(self) -> None:
        """启动状态管理器"""
        logger.info("启动状态管理器")

        # 初始化Redis连接
        await self._init_redis()

        # 启动数据库同步任务
        self.sync_task = asyncio.create_task(
            self._watch_database_changes(),
            name="database-sync-watcher"
        )

        logger.info("状态管理器启动完成")

    async def stop(self) -> None:
        """停止状态管理器"""
        logger.info("正在停止状态管理器...")
        self.running = False

        # 取消数据库同步任务
        if self.sync_task and not self.sync_task.done():
            self.sync_task.cancel()
            try:
                await self.sync_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.warning(f"停止数据库同步任务时出错: {e}")

        # 停止所有监听器
        if self.watcher_tasks:
            logger.info(f"停止 {len(self.watcher_tasks)} 个监听器")
            
            # 设置所有停止事件
            for stop_event in self.stop_events.values():
                stop_event.set()
            
            # 取消所有任务
            for task in self.watcher_tasks.values():
                if not task.done():
                    task.cancel()
            
            # 等待所有任务完成
            if self.watcher_tasks:
                try:
                    await asyncio.wait_for(
                        asyncio.gather(*self.watcher_tasks.values(), return_exceptions=True),
                        timeout=30.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("停止监听器超时，强制终止")
                except Exception as e:
                    logger.error(f"停止监听器时出现异常: {e}")
            
            # 清空字典
            self.watcher_tasks.clear()
            self.stop_events.clear()
        
        # 清理任务状态缓存，防止重启后带入脏状态
        self.task_status_cache.clear()

        logger.info("🛑 状态管理器已停止")

    def get_watcher_status(self) -> Dict[str, bool]:
        """获取所有监听器的运行状态"""
        return {
            watcher_key: not task.done() 
            for watcher_key, task in self.watcher_tasks.items()
        }

    def get_cluster_summary(self) -> Dict[str, Any]:
        """获取集群监听器摘要信息"""
        cluster_summary = {}
        
        for watcher_key in self.watcher_tasks.keys():
            parts = watcher_key.split(':', 2)
            cluster_id = parts[0]
            
            if cluster_id not in cluster_summary:
                cluster_summary[cluster_id] = {
                    'namespaces': set(),
                    'job_watchers': 0,
                    'deployment_watchers': 0,
                    'namespace_watcher': False
                }
            
            # 检查是否为命名空间监听器
            if len(parts) == 2 and parts[1] == 'namespace_watcher':
                cluster_summary[cluster_id]['namespace_watcher'] = True
            elif len(parts) == 3:
                # 资源监听器
                namespace, resource_type = parts[1], parts[2]
                cluster_summary[cluster_id]['namespaces'].add(namespace)
                
                if resource_type == 'job':
                    cluster_summary[cluster_id]['job_watchers'] += 1
                elif resource_type == 'deployment':
                    cluster_summary[cluster_id]['deployment_watchers'] += 1
        
        # 转换set为list以便序列化
        for cluster_info in cluster_summary.values():
            cluster_info['namespaces'] = list(cluster_info['namespaces'])
            
        return cluster_summary

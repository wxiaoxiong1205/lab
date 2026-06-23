#!/usr/bin/env python3
"""
定时任务管理器 - 简化版

负责管理和调度定时任务的执行。
"""
import asyncio
import time
import threading
from typing import Optional
import schedule

from app.core.logging import logger
from app.managers.scheduled_tasks import ScheduledTasks


class ScheduledLockKeys:
    """定时任务分布式锁 key，统一维护避免重复"""
    QUERY_COMPLETED_TRAINING_TASKS = "scheduled:query_completed_training_tasks"
    QUERY_COMPLETED_TRAINED_MODEL_TASKS = "scheduled:query_completed_trained_model_tasks"
    QUERY_COMPLETED_MODEL_DOWNLOAD_TASKS = "scheduled:query_completed_model_download_tasks"
    SYNC_BELLE_BASE_MODEL = "scheduled:sync_belle_base_model"
    SYNC_BELLE_TRAINED_MODELS_TASK = "scheduled:sync_belle_trained_models_task"
    SYNC_BELLE_TRAINING_TASK = "scheduled:sync_belle_training_task"
    QUERY_COMPLETED_DATA_CLEANING_TASKS = "scheduled:query_completed_data_cleaning_tasks"
    QUERY_COMPLETED_BUILD_IMAGE_TASKS = "scheduled:query_completed_build_image_tasks"
    UPDATE_EVALUATION_PROGRESS_AND_REPORT = "scheduled:update_evaluation_progress_and_report"
    UPDATE_INFERENCE_RESULT_DATASET_PROGRESS = "scheduled:update_inference_result_dataset_progress"
    UPDATE_BENCHMARK_TASK_PROGRESS = "scheduled:update_benchmark_task_progress"
    QUERY_COMPLETED_EVALUATION_TASKS = "scheduled:query_completed_evaluation_tasks"
    QUERY_COMPLETED_INFERENCE_DATASET_TASKS = "scheduled:query_completed_inference_dataset_tasks"
    PROCESS_NEW_INFERENCE_EVALUATION_TASKS = "scheduled:process_new_inference_evaluation_tasks"
    QUERY_PENDING_TASK_EXECUTIONS = "scheduled:query_pending_task_executions"
    TEST_K8S_CLUSTER_CONNECTIVITY = "scheduled:test_k8s_cluster_connectivity"
    # K8s 状态管理器
    K8S_SYNC_CLUSTERS = "unified:k8s_sync_clusters"


class ScheduledTasksManager:
    """简化的定时任务管理器"""
    
    def __init__(self):
        """初始化定时任务管理器"""
        self.running = False
        self.scheduler_thread: Optional[threading.Thread] = None
        self.tasks: Optional[ScheduledTasks] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    LOCK_TTL = 8  # 分布式锁超时时间（秒）

    def setup_tasks(self) -> None:
        """设置定时任务（全部带分布式锁）

        lock 参数说明：
            lock(lock_key, ttl, task_func)
            - lock_key: Redis 锁 key，需唯一
            - ttl: 锁超时时间（秒）
            - task_func: 任务函数，自动检测协程函数并在事件循环直接执行，同步函数在线程池执行
            - release_lock: 是否执行完后主动释放锁，默认 False（依赖 TTL 过期，避免多实例启动时差导致重复执行）
        """
        lock = self.tasks._create_lock_wrapper
        K = ScheduledLockKeys

        # 查询已完成训练任务 - 每10秒执行一次
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_TRAINING_TASKS, self.LOCK_TTL, self.tasks.query_completed_training_tasks)
        )
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_TRAINED_MODEL_TASKS, self.LOCK_TTL, self.tasks.query_completed_trained_model_tasks)
        )
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_MODEL_DOWNLOAD_TASKS, self.LOCK_TTL, self.tasks.query_completed_model_download_tasks)
        )
        # schedule.every(1).minutes.do(self.tasks.stop_overdue_notebooks_job)
        # schedule.every(1).hours.do(self.tasks.sync_kubernetes_labels_job)
        schedule.every(10).seconds.do(
            lock(K.SYNC_BELLE_BASE_MODEL, self.LOCK_TTL, self.tasks.sync_belle_base_model_job)
        )
        schedule.every(10).seconds.do(
            lock(K.SYNC_BELLE_TRAINED_MODELS_TASK, self.LOCK_TTL, self.tasks.sync_belle_trained_models_task_job)
        )
        schedule.every(10).seconds.do(
            lock(K.SYNC_BELLE_TRAINING_TASK, self.LOCK_TTL, self.tasks.sync_belle_training_task_job)
        )

        # 查询已完成清洗任务 - 每10秒执行一次
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_DATA_CLEANING_TASKS, self.LOCK_TTL, self.tasks.query_completed_data_cleaning_tasks)
        )

        # 查询已完成的镜像构建任务 - 每10秒执行一次
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_BUILD_IMAGE_TASKS, self.LOCK_TTL, self.tasks.query_completed_build_image_tasks)
        )

        # 评估与推理相关任务（从 AsyncScheduledTasksManager 迁移）
        schedule.every(3).seconds.do(
            lock(K.UPDATE_EVALUATION_PROGRESS_AND_REPORT, 2, self.tasks.update_evaluation_progress_and_report)
        )
        schedule.every(10).seconds.do(
            lock(K.UPDATE_INFERENCE_RESULT_DATASET_PROGRESS, self.LOCK_TTL, self.tasks.update_inference_result_dataset_progress)
        )
        schedule.every(10).seconds.do(
            lock(K.UPDATE_BENCHMARK_TASK_PROGRESS, self.LOCK_TTL, self.tasks.update_benchmark_task_progress)
        )
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_EVALUATION_TASKS, self.LOCK_TTL, self.tasks.query_completed_evaluation_tasks)
        )
        schedule.every(10).seconds.do(
            lock(K.QUERY_COMPLETED_INFERENCE_DATASET_TASKS, self.LOCK_TTL, self.tasks.query_completed_inference_dataset_tasks)
        )
        schedule.every(10).seconds.do(
            lock(K.PROCESS_NEW_INFERENCE_EVALUATION_TASKS, self.LOCK_TTL, self.tasks.process_new_inference_evaluation_tasks)
        )
        # 执行任务调度 - 每5秒执行一次
        schedule.every(5).seconds.do(
            lock(K.QUERY_PENDING_TASK_EXECUTIONS, 4, self.tasks.query_pending_task_executions)
        )

        # 每分钟执行一次测试K8s集群连通性
        schedule.every(60).seconds.do(
            lock(K.TEST_K8S_CLUSTER_CONNECTIVITY, 50, self.tasks.test_k8s_cluster_connectivity_all)
        )

        jobs_count = len(schedule.get_jobs())
        logger.info(f"定时任务设置完成，共注册 {jobs_count} 个任务（含分布式锁）")
    
    def start(self) -> None:
        """启动定时任务管理器"""
        if self.running:
            logger.warning("定时任务管理器已在运行中")
            return
            
        logger.info("启动定时任务管理器")
        
        try:
            self.loop = asyncio.get_running_loop()
            # 注入
            self.tasks = ScheduledTasks(loop=self.loop)
            # 设置任务
            self.setup_tasks()
            
            # 启动调度器线程
            self.running = True
            self.scheduler_thread = threading.Thread(
                target=self._run_scheduler,
                name="SchedulerThread",
                daemon=True
            )
            self.scheduler_thread.start()
            
            logger.info("✅ 定时任务管理器启动成功")
            
        except Exception as e:
            logger.error(f"定时任务管理器启动失败: {e}")
            self.running = False
            raise
    
    def _run_scheduler(self) -> None:
        """运行定时任务调度器"""
        logger.info("定时任务调度器开始运行")
        
        while self.running:
            try:
                schedule.run_pending()
                time.sleep(1)  # 每秒检查一次
            except Exception as e:
                logger.error(f"定时任务调度器运行异常: {e}")
                time.sleep(5)  # 出错后等待5秒再继续
        
        logger.info("定时任务调度器已停止")
    
    def stop(self) -> None:
        """停止定时任务管理器"""
        if not self.running:
            return
            
        logger.info("正在停止定时任务管理器...")
        
        # 停止调度器
        self.running = False
        
        # 清除所有定时任务
        schedule.clear()
        logger.info("已清除所有定时任务")
        
        # 等待调度器线程结束
        if self.scheduler_thread and self.scheduler_thread.is_alive():
            self.scheduler_thread.join(timeout=10)
            if self.scheduler_thread.is_alive():
                logger.warning("定时任务调度器线程未能在超时时间内结束")
            else:
                logger.info("✅ 定时任务调度器已停止")
        
        logger.info("🛑 定时任务管理器已完全停止")
    
    def run_all_tasks_now(self) -> None:
        """立即运行所有任务"""
        logger.info("立即执行所有定时任务...")
        schedule.run_all()
    
    def get_status(self) -> dict:
        """获取任务状态"""
        jobs = schedule.get_jobs()
        return {
            "running": self.running,
            "total_jobs": len(jobs),
            "jobs": [
                {
                    "job": str(job),
                    "next_run": str(job.next_run) if job.next_run else "未知"
                }
                for job in jobs
            ]
        }
"""
基准评估任务相关的Celery任务
"""

import logging
from datetime import datetime
from typing import Optional, List

from celery.exceptions import TaskRevokedError
from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.depend_manager import AutoContainer
from app.repository.base_mapper import BaseMapper
from app.services.storage.interface import StorageService
from app.utils import app_runtime_context

logger = logging.getLogger(__name__)

from app.database.database_depends import run_async_in_celery
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.models.benchmark_task_manager import (
    BenchmarkTask,
    BenchmarkTaskModelRelation,
    BenchmarkTaskDatasetRelation
)
from app.models.models import KubernetesResource, ProjectKubernetesRelation
from app.utils.k8s_launcher import K8sLauncher
from app.schemas.benchmark_task import BenchmarkModelType


# ========== 模块级辅助函数 ==========

def init_task_logger(task: TaskBase) -> None:
    try:
        from app.tasks.logger import TaskLogger
        task.task_logger = TaskLogger(task.task_id, task.task_name)
    except Exception as e:
        task._log_warning(f"初始化任务日志记录器失败: {e}")


def cleanup_task_logger(task: TaskBase) -> None:
    if task.task_logger and hasattr(task.task_logger, "cleanup"):
        try:
            task.task_logger.cleanup()
        except Exception as e:
            task._log_warning(f"清理任务日志记录器失败: {e}")


async def update_benchmark_task_status(task: TaskBase, *, task_id: int, status: TaskStatus,
                                       base_mapper: BaseMapper) -> None:
    """更新基准评估任务状态到数据库；启动（PREPARING）时清空结束时间，便于再次运行后开始时间晚于结束时间。"""
    try:
        benchmark_task = await base_mapper.query_one(
            select(BenchmarkTask).filter(BenchmarkTask.id == task_id)
        )
        if benchmark_task:
            benchmark_task.status = status.value
            # 新一轮启动前，清空上一轮的开始/结束时间，避免排队中误显示运行时长
            if status == TaskStatus.PREPARING:
                benchmark_task.started_at = None
                benchmark_task.finished_at = None
            if status == TaskStatus.RUNNING:
                benchmark_task.started_at = datetime.now()
            # SQLAlchemy 自动跟踪对象变化，直接 commit 即可
            await base_mapper.commit()
            task._log_info(f"基准评估任务状态已更新为: {status.value}")
        else:
            task._log_warning(f"未找到基准评估任务: {task_id}")
    except Exception as e:
        task._log_error(f"更新基准评估任务状态失败: {str(e)}", error=e)


@celery_app.task(base=TaskBase, bind=True)
def create_benchmark_task_async(self: TaskBase, task_id: int, namespace: str, task_data: dict,
                                 tenant_id: str = None):
    """
    异步启动基准评估任务（Celery 同步入口，内部通过 run_async_in_celery 执行异步逻辑并释放连接池）
    
    Args:
        task_id: 基准评估任务ID
        namespace: 项目命名空间
        task_data: 基准评估任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    return run_async_in_celery(
        _create_benchmark_task_async_impl(self, task_id, namespace, task_data, tenant_id)
    )


async def _create_benchmark_task_async_impl(self: TaskBase, task_id: int, namespace: str,
                                            task_data: dict, tenant_id: str = None):
    """
    异步启动基准评估任务的实现函数
    
    Args:
        task_id: 基准评估任务ID
        namespace: 项目命名空间
        task_data: 基准评估任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    base_mapper: Optional[BaseMapper] = None
    try:
        # 设置租户ID到上下文（Celery worker 进程需要）
        if tenant_id:
            app_runtime_context.set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")

        # 设置任务信息
        self.task_id = task_id
        # 动态任务名：包含任务名称与任务ID
        task_name = (task_data.get('name') if isinstance(task_data, dict) else None) or str(task_id)
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"create_benchmark_task:{task_name}:{task_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "benchmark"

        # 初始化任务日志
        init_task_logger(self)

        self._log_start("开始异步启动基准评估任务")
        self._log_info(f"任务ID: {task_id}, 命名空间: {namespace}, 任务名称: {task_name}")

        container = AutoContainer()
        base_mapper = container.base_mapper()
        storage_service: StorageService = container.storage_service()
        
        benchmark_task: Optional[BenchmarkTask] = await base_mapper.query_one(
            select(BenchmarkTask).filter(BenchmarkTask.id == task_id)
        )
        if benchmark_task is None:
            raise RuntimeError(f"基准评估任务不存在: {task_id}")

        # 更新任务状态为准备中
        await update_benchmark_task_status(self, task_id=task_id, status=TaskStatus.PREPARING,
                                          base_mapper=base_mapper)

        # 启动基准评估进程（使用K8s Job）
        self._log_info("准备启动基准评估进程...")
        job_name = await start_benchmark_impl(
            task_id=task_id,
            base_mapper=base_mapper,
            storage_service=storage_service
        )
        self._log_info(f"基准评估进程已启动，job_name={job_name}")

        # 更新任务状态为运行中
        await update_benchmark_task_status(self, task_id=task_id, status=TaskStatus.RUNNING,
                                          base_mapper=base_mapper)

        self._log_info("基准评估任务启动完成")
        return {
            "status": "success",
            "task_id": task_id,
            "job_name": job_name
        }

    except TaskRevokedError:
        self._log_warning("基准评估任务启动被取消")
        if base_mapper is not None:
            await update_benchmark_task_status(
                self, task_id=task_id, status=TaskStatus.FAILED, base_mapper=base_mapper
            )
        raise

    except Exception as e:
        self._log_error(f"基准评估任务启动失败: {str(e)}", error=e)
        if base_mapper is not None:
            await update_benchmark_task_status(
                self, task_id=task_id, status=TaskStatus.FAILED, base_mapper=base_mapper
            )
        raise

    finally:
        cleanup_task_logger(self)
        if base_mapper is not None:
            await base_mapper.close()


async def start_benchmark_impl(*, task_id: int, base_mapper: BaseMapper, storage_service: StorageService) -> str:
    """
    启动基准评估任务，创建相应的K8s Job。
    
    参数:
        task_id: 基准评估任务ID
        base_mapper: 数据库映射器
        storage_service: 存储服务
    
    返回:
        Job名称
    """
    benchmark_task: Optional[BenchmarkTask] = await base_mapper.query_one(
        select(BenchmarkTask).filter(BenchmarkTask.id == task_id)
    )
    if benchmark_task is None:
        raise RuntimeError(f"基准评估任务不存在: {task_id}")

    project_id = benchmark_task.project_id
    job_name = f"benchmark-task-{task_id}"
    benchmark_task.lab_k8s_uuid = job_name
    await base_mapper.commit()
    lab_k8s_uuid = job_name
    model_type = benchmark_task.model_type  # model 或 service

    # 查询集群 kubeconfig 与命名空间
    stmt = (
        select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
        .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
        .where(ProjectKubernetesRelation.project_id == project_id)
    )
    res = await base_mapper.execute(stmt)
    row = res.first()
    if not row:
        raise RuntimeError(f"未绑定K8s集群或命名空间: project_id={project_id}")
    kubeconfig_str, k8s_namespace = row[0], row[1]

    # 查询任务关联的模型和数据集
    model_relations = await base_mapper.query(
        select(BenchmarkTaskModelRelation).filter(
            BenchmarkTaskModelRelation.benchmark_task_id == task_id
        ).order_by(BenchmarkTaskModelRelation.sort_order)
    )
    
    dataset_relations = await base_mapper.query(
        select(BenchmarkTaskDatasetRelation).filter(
            BenchmarkTaskDatasetRelation.benchmark_task_id == task_id
        )
    )

    if not model_relations:
        raise RuntimeError(f"基准评估任务没有关联的模型: task_id={task_id}")
    
    if not dataset_relations:
        raise RuntimeError(f"基准评估任务没有关联的数据集: task_id={task_id}")

    # 判断是离线评估还是在线评估
    # 根据 model_type 判断：model=离线模型=离线评估, service=在线服务=在线评估
    if model_type == BenchmarkModelType.MODEL.value:
        is_offline_benchmark = True  # model = 离线模型 = 离线评估
    elif model_type == BenchmarkModelType.SERVICE.value:
        is_offline_benchmark = False  # service = 在线服务 = 在线评估
    else:
        raise RuntimeError(f"未知的模型类型: {model_type}")

    # 初始化 K8s 启动器
    launcher = K8sLauncher(config_str=kubeconfig_str)

    # 根据评估方式创建相应的Job
    if is_offline_benchmark:
        # 离线基准评估：需要先启动模型服务（vLLM等），然后启动 OpenCompass 评估
        try:
            from app.tasks.service.benchmark.offline_benchmark_task import OfflineBenchmarkTaskK8s
            
            offline_task = OfflineBenchmarkTaskK8s(
                project_id=project_id,
                namespace=k8s_namespace,
                k8s_uuid=lab_k8s_uuid,
                launcher=launcher,
                db=base_mapper,
                task_id=task_id,
                benchmark_task=benchmark_task,
                model_relations=model_relations,
                dataset_relations=dataset_relations,
                jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            )
            job_name = await offline_task.submit()
            return job_name
        except ImportError:
            raise NotImplementedError(
                "离线基准评估任务的 K8s Job 创建逻辑尚未实现。"
                "需要创建 app.tasks.service.benchmark.offline_benchmark_task.OfflineBenchmarkTaskK8s 类。"
            )
    else:
        # 在线基准评估：直接启动 OpenCompass 评估（调用在线服务）
        try:
            from app.tasks.service.benchmark.online_benchmark_task import OnlineBenchmarkTaskK8s
            
            online_task = OnlineBenchmarkTaskK8s(
                project_id=project_id,
                namespace=k8s_namespace,
                k8s_uuid=lab_k8s_uuid,
                launcher=launcher,
                db=base_mapper,
                task_id=task_id,
                benchmark_task=benchmark_task,
                model_relations=model_relations,
                dataset_relations=dataset_relations,
                jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            )
            job_name = await online_task.submit()
            return job_name
        except ImportError:
            raise NotImplementedError(
                "在线基准评估任务的 K8s Job 创建逻辑尚未实现。"
                "需要创建 app.tasks.service.benchmark.online_benchmark_task.OnlineBenchmarkTaskK8s 类。"
            )

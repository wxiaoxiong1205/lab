"""
业务推理结果数据集相关的Celery任务
"""

from typing import Optional
from celery.exceptions import TaskRevokedError
import logging

from sqlalchemy import select

from app.core.depend_manager import AutoContainer
from app.database.database_depends import run_async_in_celery
from app.repository.base_mapper import BaseMapper
from app.utils import app_runtime_context

logger = logging.getLogger(__name__)

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.models.inference_result_manager import InferenceResultDataset
from app.models.models import KubernetesResource, ProjectKubernetesRelation
from app.utils.k8s_launcher import K8sLauncher
from app.common.status import TaskStatus
from app.services.storage.interface import StorageService


def init_task_logger(task: TaskBase) -> None:
    try:
        from app.tasks.logger import TaskLogger
        task.task_logger = TaskLogger(task.task_id, task.task_name)
    except Exception as e:
        task._log_warning(f"初始化任务日志记录器失败: {e}")


def cleanup_task_logger(task: TaskBase) -> None:
    """清理任务日志记录器（TaskLogger 已简化，无需清理）"""
    if hasattr(task, 'task_logger') and task.task_logger:
        try:
            # TaskLogger 已简化，不再需要 cleanup 方法
            # 如果将来需要清理，可以在这里添加
            pass
        except Exception as e:
            task._log_warning(f"清理任务日志记录器失败: {e}")


async def update_inference_dataset_status(task: TaskBase, *, dataset_id: int, status: TaskStatus, base_mapper: BaseMapper) -> None:
    """更新推理结果数据集状态到数据库（仅更新状态）"""
    try:
        dataset = await base_mapper.query_one(select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id))
        if dataset:
            dataset.status = status.value
            await base_mapper.commit()
            task._log_info(f"推理结果数据集状态已更新为: {status.value}")
        else:
            task._log_warning(f"未找到推理结果数据集: {dataset_id}")
    except Exception as e:
        task._log_error(f"更新推理结果数据集状态失败: {str(e)}", error=e)


@celery_app.task(base=TaskBase, bind=True)
def create_business_inference_result_dataset_async(self: TaskBase, dataset_id: int, namespace: str, dataset_data: dict,
                                          tenant_id: str = None):
    """
    异步创建业务推理结果数据集（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        dataset_id: 推理结果数据集ID
        namespace: 项目命名空间
        dataset_data: 推理结果数据集数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    return run_async_in_celery(
        _create_business_inference_result_dataset_async_impl(
            self, dataset_id, namespace, dataset_data, tenant_id
        )
    )


async def _create_business_inference_result_dataset_async_impl(self: TaskBase, inference_dataset_id: int, namespace: str,
                                                      inference_dataset_data: dict, tenant_id: str = None):
    """
    异步创建业务推理结果数据集的实现函数
    
    Args:
        inference_dataset_id: 推理结果数据集ID
        namespace: 项目命名空间
        inference_dataset_data: 推理结果数据集数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    base_mapper = None
    try:
        # 设置租户ID到上下文（Celery worker 进程需要）
        if tenant_id:
            app_runtime_context.set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")

        # 设置任务信息
        self.task_id = inference_dataset_id
        # 动态任务名：包含数据集名称与数据集ID
        dataset_name = (inference_dataset_data.get('name') if isinstance(inference_dataset_data, dict) else None) or str(inference_dataset_id)
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"create_business_inference_result_dataset:{dataset_name}:{inference_dataset_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "business_inference"

        # 初始化任务日志
        init_task_logger(self)

        self._log_start("开始异步创建业务推理结果数据集")
        self._log_info(f"数据集ID: {inference_dataset_id}, 命名空间: {namespace}, 数据集名称: {dataset_name}")
        
        container = AutoContainer()
        base_mapper: BaseMapper = container.base_mapper()
        storage_service: StorageService = container.storage_service()

        dataset: Optional[InferenceResultDataset] = await base_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == inference_dataset_id))
        if dataset is None:
            raise RuntimeError(f"推理结果数据集不存在: {inference_dataset_id}")

        project_id = dataset.project_id
        lab_k8s_uuid = dataset.lab_k8s_uuid

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

        # 初始化 K8s 启动器
        launcher = K8sLauncher(config_str=kubeconfig_str)

        # 1.5. 如果是 role-based 格式，需要复制源数据集的图片文件夹到推理结果集目录
        from app.schemas import DatasetFormat
        if dataset.dataset_format == DatasetFormat.ROLE_BASED.value and dataset.source_dataset_id:
            try:
                from app.tasks.inference_result_tasks import _copy_role_based_dataset_files
                await _copy_role_based_dataset_files(
                    self=self,
                    base_mapper=base_mapper,
                    storage_service=storage_service,
                    dataset=dataset,
                    inference_dataset_id=inference_dataset_id
                )
            except Exception as e:
                self._log_error(f"复制 role-based 格式数据集文件失败: {str(e)}", error=e)
                # 不抛出异常，继续执行推理任务

        # 2. 启动业务推理进程（提交到K8s）
        self._log_info("准备启动业务推理进程...")
        from app.tasks.service.inference.business_inference_task import BusinessInferenceTaskK8s
        business_task = BusinessInferenceTaskK8s(
            project_id=project_id,
            namespace=k8s_namespace,
            k8s_uuid=lab_k8s_uuid,
            launcher=launcher,
            db=base_mapper,
            dataset_id=inference_dataset_id,
            dataset=dataset,
            jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
        )
        job_name = await business_task.submit()
        self._log_info(f"业务推理进程已启动，job_name={job_name}")

        self._log_info("业务推理结果数据集创建完成")
        return {
            "status": "success",
            "dataset_id": inference_dataset_id,
        }

    except TaskRevokedError:
        self._log_warning("业务推理结果数据集创建被取消")
        if base_mapper:
            await update_inference_dataset_status(self, dataset_id=inference_dataset_id, status=TaskStatus.FAILED,
                                                  base_mapper=base_mapper)
        raise

    except Exception as e:
        self._log_error(f"业务推理结果数据集创建失败: {str(e)}", error=e)
        if base_mapper:
            await update_inference_dataset_status(self, dataset_id=inference_dataset_id, status=TaskStatus.FAILED,
                                                  base_mapper=base_mapper)
        raise

    finally:
        # 清理资源
        cleanup_task_logger(self)
        if base_mapper is not None:
            await base_mapper.close()


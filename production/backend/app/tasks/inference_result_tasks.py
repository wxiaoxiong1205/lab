"""
推理结果数据集相关的Celery任务
"""

from typing import Optional, List, Dict, Any
from celery.exceptions import TaskRevokedError
import os
import asyncio
import uuid
import logging
import shutil
import json
import tempfile
import zipfile
from io import BytesIO
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd

from app.models import TrainingDataset
from app.repository.base_mapper import BaseMapper
from app.schemas import DatasetFormat
from app.schemas.repository_image import CardType
from app.services.storage.interface import StorageService
from app.services.chunk_upload.interface import ChunkUploadService
from app.utils import app_runtime_context
from app.utils.timezone_utils import get_current_shanghai_time
from app.utils.inference_result_file_parser import analyze_save_inference_result_files, analyze_export_inference_result_file_single
from app.schemas.training_task import TrainingTypeCategory
from app.schemas.inference_result import InferenceDatasetUsage, InferenceResultDatasetExportType
from app.utils.jfs_utils import JFSUtils

logger = logging.getLogger(__name__)

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.schemas.inference_result import InferenceResultDatasetCreate, InferenceMethod
from app.utils.storage_enum import StoragePath
from app.database.base import SessionLocal
from app.models.inference_result_manager import InferenceResultDataset
from app.repository.inference_result_mapper import InferenceResultDatasetMapper
from app.models.models import KubernetesResource, ProjectKubernetesRelation, Project
from app.utils.k8s_launcher import K8sLauncher
from app.utils.k8s_utils import build_node_affinity
from app.common.status import TaskStatus
from app.services.storage.storage import DefaultStorageService
from app.repository.storage import StorageMapper
from app.database.database_depends import Database, run_async_in_celery


# ========== 模块级辅助函数 ==========

def get_storage_service() -> DefaultStorageService:
    """在 Celery worker 中获取 StorageService 实例"""
    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


def init_task_logger(task: TaskBase) -> None:
    try:
        from app.tasks.logger import TaskLogger
        task.task_logger = TaskLogger(task.task_id, task.task_name)
    except Exception as e:
        task._log_warning(f"初始化任务日志记录器失败: {e}")


def cleanup_task_logger(task: TaskBase) -> None:
    if task.task_logger:
        try:
            task.task_logger.cleanup()
        except Exception as e:
            task._log_warning(f"清理任务日志记录器失败: {e}")


def _get_inference_result_export_paths(file_path: str, dataset_id: int, export_file_type: str) -> tuple[str, str, str]:
    dataset_dir = os.path.dirname(file_path.rstrip("/")).replace("\\", "/")
    export_root = f"{dataset_dir}/exports/inference_result_dataset_{dataset_id}/{export_file_type}/"
    return export_root, f"{export_root}meta.json", f"{export_root}export.{export_file_type}"


@celery_app.task(base=TaskBase, bind=True)
def build_inference_result_export_cache(
    self: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    export_file_type: str,
) -> Dict:
    """异步构建推理结果集下载缓存，产物写入 JFS exports 目录。"""
    return run_async_in_celery(
        _build_inference_result_export_cache_async(
            self,
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            project_id=project_id,
            export_file_type=export_file_type,
        )
    )


async def _build_inference_result_export_cache_async(
    task: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    export_file_type: str,
) -> Dict:
    from app.core.depend_manager import AutoContainer

    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    container = AutoContainer()
    storage_service: StorageService = container.storage_service()
    inference_result_mapper: InferenceResultDatasetMapper = container.inference_result_dataset_mapper()
    jfs = await storage_service.JUICEFS_CLIENT(tenant_id)
    temp_dir = None

    try:
        dataset = await inference_result_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"推理结果集不存在: dataset_id={dataset_id}")
        if dataset.project_id != project_id:
            raise ValueError(f"推理结果集项目不匹配: dataset_id={dataset_id}, project_id={project_id}")
        if not dataset.file_path or not jfs.exists(dataset.file_path):
            raise ValueError(f"推理结果集文件不存在: {dataset.file_path}")
        if dataset.dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value and export_file_type != InferenceResultDatasetExportType.ZIP_TYPE.value:
            raise ValueError(f"当前导出格式不支持：{export_file_type}")

        export_root, meta_path, artifact_path = _get_inference_result_export_paths(
            dataset.file_path, dataset_id, export_file_type
        )
        now = get_current_shanghai_time().isoformat()
        JFSUtils.write_json(
            jfs,
            meta_path,
            {
                "status": "processing",
                "task_id": task.request.id,
                "dataset_id": dataset_id,
                "project_id": project_id,
                "export_format": export_file_type,
                "updated_at": now,
            },
        )

        if dataset.dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value:
            temp_dir = tempfile.mkdtemp()
            local_data_path = os.path.join(temp_dir, os.path.basename(dataset.file_path))
            local_images_dir = os.path.join(temp_dir, "images")
            local_artifact = os.path.join(temp_dir, "export.zip")
            JFSUtils.copy_file_to_local(jfs, dataset.file_path, local_data_path)
            images_folder_path = os.path.join(os.path.dirname(dataset.file_path), "images").replace("\\", "/")
            if jfs.exists(images_folder_path):
                JFSUtils.copy_dir_to_local(jfs, images_folder_path, local_images_dir)

            with zipfile.ZipFile(local_artifact, "w", zipfile.ZIP_DEFLATED) as zip_file:
                zip_file.write(local_data_path, os.path.basename(dataset.file_path))
                if os.path.exists(local_images_dir):
                    for root, _dirs, files in os.walk(local_images_dir):
                        for filename in files:
                            abs_path = os.path.join(root, filename)
                            rel_path = os.path.relpath(abs_path, temp_dir).replace("\\", "/")
                            zip_file.write(abs_path, rel_path)
            JFSUtils.upload_local_file(jfs, local_artifact, artifact_path)
        elif export_file_type == InferenceResultDatasetExportType.JSONL_TYPE.value:
            JFSUtils.copy_file(jfs, dataset.file_path, artifact_path)
        else:
            content = await analyze_export_inference_result_file_single(
                db_dataset=dataset,
                export_file_type=InferenceResultDatasetExportType(export_file_type),
                storage_service=storage_service,
            )
            JFSUtils.write_bytes(jfs, artifact_path, content)

        success_meta = {
            "status": "success",
            "task_id": task.request.id,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "export_format": export_file_type,
            "artifact_path": artifact_path,
            "updated_at": get_current_shanghai_time().isoformat(),
        }
        JFSUtils.write_json(jfs, meta_path, success_meta)
        task._log_complete(
            f"推理结果集导出缓存构建完成: dataset_id={dataset_id}, format={export_file_type}, path={artifact_path}"
        )
        return success_meta
    except Exception as exc:
        task._log_error(
            f"推理结果集导出缓存构建失败: dataset_id={dataset_id}, format={export_file_type}, err={exc}"
        )
        try:
            dataset = await inference_result_mapper.query_one(
                select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
            )
            if dataset and dataset.file_path:
                _export_root, meta_path, _artifact_path = _get_inference_result_export_paths(
                    dataset.file_path, dataset_id, export_file_type
                )
                JFSUtils.write_json(
                    jfs,
                    meta_path,
                    {
                        "status": "failed",
                        "task_id": task.request.id,
                        "dataset_id": dataset_id,
                        "project_id": project_id,
                        "export_format": export_file_type,
                        "error": str(exc),
                        "updated_at": get_current_shanghai_time().isoformat(),
                    },
                )
        except Exception as meta_err:
            logger.warning(f"写推理结果集导出失败元信息异常: {meta_err}")
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        try:
            await inference_result_mapper.close()
        except Exception as close_error:
            logger.warning(f"关闭推理结果集 mapper 失败: {close_error}")


async def update_inference_dataset_status(task: TaskBase, *, dataset_id: int, status: TaskStatus, base_mapper: BaseMapper, msg: str) -> None:
    """更新推理结果数据集状态到数据库（仅更新状态）"""
    try:

        dataset = await base_mapper.query_one(select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id))
        if dataset:
            dataset.status = status.value
            dataset.processing_error = msg
            # SQLAlchemy 自动跟踪对象变化，直接 commit 即可
            await base_mapper.commit()
            task._log_info(f"推理结果数据集状态已更新为: {status.value}")
        else:
            task._log_warning(f"未找到推理结果数据集: {dataset_id}")
    except Exception as e:
        task._log_error(f"更新推理结果数据集状态失败: {str(e)}", error=e)


@celery_app.task(base=TaskBase, bind=True)
def create_inference_result_dataset_async(self: TaskBase, dataset_id: int, namespace: str, dataset_data: dict,
                                          tenant_id: str = None):
    """
    异步创建推理结果数据集（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        dataset_id: 推理结果数据集ID
        namespace: 项目命名空间
        dataset_data: 推理结果数据集数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    return run_async_in_celery(
        _create_inference_result_dataset_async_impl(self, dataset_id, namespace, dataset_data, tenant_id)
    )


async def _create_inference_result_dataset_async_impl(self: TaskBase, inference_dataset_id: int, namespace: str,
                                                      inference_dataset_data: dict, tenant_id: str = None):
    """
    异步创建推理结果数据集的实现函数
    
    Args:
        inference_dataset_id: 推理结果数据集ID
        namespace: 项目命名空间
        inference_dataset_data: 推理结果数据集数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
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
        self.task_name = f"create_inference_result_dataset:{dataset_name}:{inference_dataset_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "inference"

        # 初始化任务日志
        init_task_logger(self)

        self._log_start("开始异步创建推理结果数据集")
        self._log_info(f"数据集ID: {inference_dataset_id}, 命名空间: {namespace}, 数据集名称: {dataset_name}")
        from app.core.depend_manager import AutoContainer
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
        if dataset.dataset_format == DatasetFormat.ROLE_BASED.value and dataset.source_dataset_id:
            try:
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

        # 2. 根据推理方式启动推理进程
        inference_method = inference_dataset_data.get('inference_method')
        if inference_method == InferenceMethod.OFFLINE.value:
            # 离线推理：启动K8s Job
            self._log_info("准备启动离线推理进程...")
            from app.tasks.service.inference.offline_inference_task import OfflineInferenceTaskK8s
            offline_task = OfflineInferenceTaskK8s(
                project_id=project_id,
                namespace=k8s_namespace,
                k8s_uuid=lab_k8s_uuid,
                launcher=launcher,
                db=base_mapper,
                dataset_id=inference_dataset_id,
                dataset=dataset,
                jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            )
            job_name = await offline_task.submit()
            self._log_info(f"离线推理进程已启动，job_name={job_name}")
        elif inference_method == InferenceMethod.ONLINE.value:
            # 在线推理：调用在线服务API（这里可以根据实际需求实现）
            self._log_info("准备启动在线推理进程...")
            from app.tasks.service.inference.online_inference_task import OnlineInferenceTaskK8s
            online_task = OnlineInferenceTaskK8s(
                project_id=project_id,
                namespace=k8s_namespace,
                k8s_uuid=lab_k8s_uuid,
                launcher=launcher,
                db=base_mapper,
                dataset_id=inference_dataset_id,
                dataset=dataset,
                jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            )
            job_name = await online_task.submit()
        else:
            # 导入推理结果集：已经在服务层处理完成，这里不需要额外操作
            self._log_info("导入推理结果集已在服务层处理完成")
            await update_inference_dataset_status(self, dataset_id=inference_dataset_id,
                                                  status=TaskStatus.COMPLETED, base_mapper=base_mapper, msg='')

        self._log_info("推理结果数据集创建完成")
        return {
            "status": "success",
            "dataset_id": inference_dataset_id,
        }

    except TaskRevokedError as e:
        self._log_warning("推理结果数据集创建被取消")
        await update_inference_dataset_status(self, dataset_id=inference_dataset_id, status=TaskStatus.FAILED,
                                              base_mapper=base_mapper, msg=str(e))
        raise

    except Exception as e:
        self._log_error(f"推理结果数据集创建失败: {str(e)}", error=e)
        await update_inference_dataset_status(self, dataset_id=inference_dataset_id, status=TaskStatus.FAILED,
                                              base_mapper=base_mapper, msg=str(e))
        raise

    finally:
        # 清理资源
        cleanup_task_logger(self)
        if base_mapper is not None:
            await base_mapper.close()


async def _copy_role_based_dataset_files(
    self: TaskBase,
    base_mapper: BaseMapper,
    storage_service: StorageService,
    dataset: InferenceResultDataset,
    inference_dataset_id: int
) -> None:
    """
    复制 role-based 格式的数据集文件（全量复制源数据集目录内容）
    
    Args:
        self: TaskBase 实例（用于日志记录）
        base_mapper: 数据库映射器
        storage_service: 存储服务
        dataset: 推理结果数据集对象
        inference_dataset_id: 推理结果数据集ID
    """
    self._log_info(f"检测到 role-based 格式，准备全量复制源数据集的文件...")

    # 查询源数据集
    source_dataset = await base_mapper.query_one(
        select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
    )
    if not source_dataset:
        self._log_warning(f"源数据集不存在: {dataset.source_dataset_id}")
        return

    # 获取 JuiceFS 客户端
    jfs = await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())

    # 获取源数据集目录（dataset_path 的父目录）
    source_dataset_dir = os.path.dirname(source_dataset.dataset_path)

    # 目标目录是 file_path 的目录部分（同一级目录）
    target_dir = os.path.dirname(dataset.file_path)

    # 检查源数据集目录是否存在
    if not jfs.exists(source_dataset_dir):
        self._log_warning(f"源数据集目录不存在: {source_dataset_dir}")
        return

    self._log_info(f"开始全量复制源数据集目录: {source_dataset_dir} -> {target_dir}")

    # 确保目标目录存在
    if not jfs.exists(target_dir):
        jfs.makedirs(target_dir, exist_ok=True)

    # 全量复制源数据集目录下的所有内容到目标目录（同一级目录）
    await _copy_directory_contents(
        self=self,
        jfs=jfs,
        source_dir=source_dataset_dir,
        target_dir=target_dir,
        source_dataset=source_dataset
    )

    self._log_info(f"源数据集文件复制完成: {dataset.file_path}")


async def _copy_directory_contents(
    self: TaskBase,
    jfs,
    source_dir: str,
    target_dir: str,
    source_dataset: TrainingDataset
) -> None:
    """
    原封不动地复制源目录下的所有内容到目标目录
    
    Args:
        self: TaskBase 实例（用于日志记录）
        jfs: JuiceFS 客户端
        source_dir: 源数据集目录路径
        target_dir: 目标目录路径
        source_dataset: 源数据集对象（未使用，保留以兼容接口）
    """
    async def copy_recursive(source: str, target: str):
        """递归复制目录的内部异步函数"""
        try:
            # 使用线程池执行同步的 listdir 操作，避免阻塞事件循环
            items = jfs.listdir(source)
        except Exception as e:
            self._log_error(f"无法列出目录内容: {source}, 错误: {str(e)}")
            return

        # 创建目标目录（使用线程池执行同步操作）
        try:
            loop = asyncio.get_event_loop()
            if not jfs.exists(target):
                await loop.run_in_executor(None, jfs.makedirs, target, True)
        except Exception as e:
            self._log_error(f"创建目标目录失败: {target}, 错误: {str(e)}")
            return

        # 让出控制权，避免阻塞事件循环
        await asyncio.sleep(0)

        for item in items:
            # 在每次循环迭代前让出控制权
            await asyncio.sleep(0)

            try:
                source_path = os.path.join(source, item).replace('\\', '/')
                target_path = os.path.join(target, item).replace('\\', '/')

                # 判断是文件还是目录（使用线程池执行同步操作）
                try:
                    stat = jfs.stat(source_path)
                    is_directory = (stat.st_mode & 0o40000) != 0
                except Exception as e:
                    is_directory = False

                if is_directory:
                    # 递归复制目录
                    await copy_recursive(source_path, target_path)
                else:
                    # 复制文件（使用线程池执行同步文件操作）
                    def copy_file_sync():
                        """同步文件复制函数（在线程池中执行）"""
                        try:
                            buffer_size = 512 * 1024  # 512KB 缓冲区
                            src_file = None
                            dst_file = None
                            try:
                                src_file = jfs.open(source_path, 'rb')
                                dst_file = jfs.open(target_path, 'wb')

                                while True:
                                    chunk = src_file.read(buffer_size)
                                    if not chunk:
                                        break
                                    dst_file.write(chunk)
                            finally:
                                # 确保文件句柄正确关闭
                                if dst_file:
                                    try:
                                        dst_file.close()
                                    except:
                                        pass
                                if src_file:
                                    try:
                                        src_file.close()
                                    except:
                                        pass
                        except Exception as e:
                            raise Exception(f"复制文件失败: {source_path} -> {target_path}, 错误: {str(e)}")

                    try:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, copy_file_sync)
                    except Exception as e:
                        self._log_error(str(e))
            except Exception as e:
                self._log_error(f"处理项目失败: {item}, 错误: {str(e)}")
                continue

    # 执行递归复制
    await copy_recursive(source_dir, target_dir)


# ========== 导入推理结果集文件处理任务 ==========

@celery_app.task(base=TaskBase, bind=True)
def process_inference_result_import_file(
    self: TaskBase,
    dataset_id: int,
    file_path: str,
    dataset_format: Optional[str],
    dataset_type: Optional[str],
    usage: Optional[str],
    upload_ids: Optional[List[str]] = None
) -> Dict:
    """
    异步处理导入推理结果集文件（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        dataset_id: 推理结果数据集ID
        file_path: 文件保存路径
        dataset_format: 数据格式
        dataset_type: 数据集类型
        usage: 数据集用途
        upload_ids: 分片上传ID列表
    
    Returns:
        Dict: 处理结果
    """
    return run_async_in_celery(
        _process_inference_result_import_file_async_impl(
            self,
            dataset_id=dataset_id,
            file_path=file_path,
            dataset_format=dataset_format,
            dataset_type=dataset_type,
            usage=usage,
            upload_ids=upload_ids,
        )
    )


async def _process_inference_result_import_file_async_impl(
    self: TaskBase,
    dataset_id: int,
    file_path: str,
    dataset_format: Optional[str],
    dataset_type: Optional[str],
    usage: Optional[str],
    upload_ids: Optional[List[str]]
) -> Dict:
    """异步处理导入推理结果集文件的完整实现（所有异步操作都在这里）"""
    
    # 使用 AutoContainer 获取依赖
    from app.core.depend_manager import AutoContainer
    container = AutoContainer()
    base_mapper: BaseMapper = container.base_mapper()
    storage_service: StorageService = container.storage_service()
    chunk_upload_service: ChunkUploadService = container.chunk_upload_service()
    inference_result_mapper: InferenceResultDatasetMapper = container.inference_result_dataset_mapper()
    
    # 初始化 tenant_id（用于异常处理中的清理操作）
    tenant_id = None
    
    try:
        # 首先获取数据集记录以获取 tenant_id
        dataset = await inference_result_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"推理结果数据集不存在: dataset_id={dataset_id}")
        
        # 获取 tenant_id
        tenant_id = dataset.tenant_id
        if not tenant_id:
            raise ValueError(f"推理结果数据集没有租户ID: dataset_id={dataset_id}")
        
        # 设置租户上下文
        app_runtime_context.set_tenant_id(tenant_id)
        self._log_info(f"已设置租户ID: {tenant_id}")
        
        # 设置任务信息
        self.task_id = dataset_id
        dataset_name = dataset.name or str(dataset_id)
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"process_inference_result_import_file:{dataset_name}:{dataset_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "inference_import"
        
        # 初始化任务日志
        init_task_logger(self)
        
        self._log_start("开始处理导入推理结果集文件")
        self._log_info(f"数据集ID: {dataset_id}, 文件路径: {file_path}, 数据集类型: {dataset_type}, 数据格式: {dataset_format}")
        
        # 更新状态为"处理中"
        await update_inference_dataset_status(self, dataset_id=dataset_id, status=TaskStatus.RUNNING, base_mapper=base_mapper, msg='')
        
        # 记录开始时间
        dataset.started_at = get_current_shanghai_time()
        await inference_result_mapper.commit()
        
        # 获取文件列表
        if upload_ids is None or len(upload_ids) == 0:
            raise ValueError("upload_ids 不能为空")

        # 分片上传：从分片上传服务获取文件
        upload_files = []
        for upload_id in upload_ids:
            file = await chunk_upload_service.get_file_by_upload_id(upload_id)
            upload_files.append(file)
        self._log_info(f"使用分片上传方式，upload_ids数量: {len(upload_ids)}, 获取文件数量: {len(upload_files)}")
        
        # 处理文件
        total_items = await analyze_save_inference_result_files(
            upload_files=upload_files,
            file_path=file_path,
            dataset_format=dataset_format,
            usage=usage,
            dataset_type=dataset_type,
            storage_service=storage_service,
            task=self
        )
        
        # 更新数据集记录
        dataset = await inference_result_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        if dataset:
            dataset.file_path = file_path
            dataset.total_items = total_items
            dataset.status = TaskStatus.COMPLETED.value
            dataset.progress = 100
            dataset.finished_at = get_current_shanghai_time()
            
            # 导入推理结果集：使用传入的 dataset_type 和 dataset_format
            if dataset_type:
                dataset.dataset_type = dataset_type
            if dataset_format:
                dataset.dataset_format = dataset_format
            
            await inference_result_mapper.commit()
        
        # 清理分片上传的文件
        for upload_id in upload_ids:
            try:
                await chunk_upload_service.cleanup_upload_data(upload_id)
                self._log_info(f"已清理分片上传数据: {upload_id}")
            except Exception as e:
                self._log_warning(f"清理分片上传数据失败: {upload_id}, 错误: {str(e)}")
        
        self._log_info(f"导入推理结果集处理完成: dataset_id={dataset_id}, total_items={total_items}")
        
        return {
            "success": True,
            "dataset_id": dataset_id,
            "total_items": total_items
        }
        
    except Exception as e:
        self._log_error(f"处理导入推理结果集文件失败: dataset_id={dataset_id}, error={str(e)}", error=e, exc_info=True)
        
        # 更新状态为"处理失败"
        try:
            await update_inference_dataset_status(self, dataset_id=dataset_id, status=TaskStatus.FAILED, base_mapper=base_mapper, msg=str(e))
        except Exception as update_error:
            self._log_error(f"更新失败状态失败: {str(update_error)}")

        # 清理临时文件和分片上传数据
        try:
            if tenant_id:
                app_runtime_context.set_tenant_id(tenant_id)
                jfs = await storage_service.JUICEFS_CLIENT()

                # 清理分片上传数据
                if upload_ids:
                    for upload_id in upload_ids:
                        await chunk_upload_service.cleanup_upload_data(upload_id)

                # 清理已创建的文件和目录
                if file_path:
                    if jfs.exists(file_path):
                        jfs.remove(file_path)
                    # 如果是图像理解数据集，还需要删除images目录
                    if dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value:
                        file_dir = os.path.dirname(file_path)
                        images_dir = os.path.join(file_dir, "images").replace('\\', '/')
                        if jfs.exists(images_dir):
                            jfs.rmr(images_dir)
                        # 尝试删除父目录（如果为空）
                        if file_dir and jfs.exists(file_dir):
                            items = list(jfs.listdir(file_dir))
                            if not items:
                                jfs.rmdir(file_dir)

        except Exception as cleanup_error:
            self._log_error(f"清理临时文件失败: {str(cleanup_error)}")
        
        raise  # 重新抛出异常，让Celery记录失败
        
    finally:
        # 清理资源
        try:
            if base_mapper is not None:
                await base_mapper.close()
            if inference_result_mapper is not None:
                await inference_result_mapper.close()
        except Exception as close_error:
            self._log_error(f"关闭数据库会话失败: {str(close_error)}")





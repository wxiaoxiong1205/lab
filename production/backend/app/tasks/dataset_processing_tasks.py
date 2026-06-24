"""
数据集文件处理相关的Celery任务
"""
import asyncio
import os
import shutil
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional, List

from sqlalchemy import select

from app.core.logging import logger
from app.database.database_depends import run_async_in_celery
from app.models.training_dataset_manager import TrainingDataset
from app.schemas.training_dataset import DatasetProcessingStatus, TrainingDatasetExportTypeCategory, DatasetUsage, DatasetPublishStatus
from app.repository.base_mapper import BaseMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.services.storage.interface import StorageService
from app.services.chunk_upload.interface import ChunkUploadService
from app.services.storage.interface import StorageService
from app.tasks import TaskBase
from app.tasks.celery_app import celery_app
from app.utils import app_runtime_context
from app.utils.dataset_file_parser import (
    analyze_export_dataset_file_single,
    analyze_save_dataset_file_multi,
    generate_image_folder_path,
    get_index_cache_path,
)
from app.utils.dataset_metadata_repair_status import (
    REPAIR_KIND_MACHINE_LEARNING_DATASET,
    REPAIR_KIND_TRAINING_DATASET,
    mark_metadata_fields_repair_completed,
    mark_metadata_fields_repair_failed,
    mark_metadata_fields_repair_running,
)
from app.utils.jfs_utils import JFSUtils
from app.utils.timezone_utils import get_current_shanghai_time


# ========== 辅助函数 ==========

async def update_status_async(training_dataset_mapper: TrainingDatasetMapper, dataset_id: int, status: str, error: Optional[str] = None):
    """更新数据集处理状态（异步版本）"""
    try:
        dataset = await training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )
        if dataset:
            dataset.processing_status = status
            if status == DatasetProcessingStatus.COMPLETED.value:
                dataset.publish = DatasetPublishStatus.UNPUBLISHED.value
            elif status == DatasetProcessingStatus.PENDING.value:
                dataset.publish = DatasetPublishStatus.PROCESSING.value
            elif status == DatasetProcessingStatus.FAILED.value:
                dataset.publish = DatasetPublishStatus.FAILED.value
            if error:
                dataset.processing_error = error[:1000]  # 限制错误信息长度
            await training_dataset_mapper.commit()
    except Exception as e:
        logger.error(f"更新数据集状态失败: dataset_id={dataset_id}, error={str(e)}")
        await training_dataset_mapper.rollback()

async def cleanup_temp_files_async(jfs, chunk_upload_ids: Optional[List[str]], chunk_upload_service: Optional[ChunkUploadService]):
    """清理临时文件（异步版本，支持多文件）"""
    try:
        # 清理分片上传数据
        if chunk_upload_ids and chunk_upload_service:
            for chunk_upload_id in chunk_upload_ids:
                logger.info(f"开始清理分片上传数据: chunk_upload_ids={chunk_upload_id}")
                await chunk_upload_service.cleanup_upload_data(chunk_upload_id)
    except Exception as e:
        logger.error(f"清理临时文件失败: {str(e)}")

async def _cleanup_temp_files_wrapper(chunk_upload_ids: Optional[List[str]], storage_service: StorageService, chunk_upload_service: ChunkUploadService, tenant_id: Optional[str] = None):
    """清理临时文件的包装函数（支持多文件）"""
    # 设置租户上下文（如果提供了 tenant_id）
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)
    jfs = await storage_service.JUICEFS_CLIENT()
    await cleanup_temp_files_async(jfs, chunk_upload_ids, chunk_upload_service)

# ========== Celery 任务 ==========


def _get_training_export_paths(dataset_path: str, dataset_id: int, export_file_type: str) -> tuple[str, str, str]:
    dataset_dir = os.path.dirname(dataset_path.rstrip("/")).replace("\\", "/")
    export_root = f"{dataset_dir}/exports/dataset_{dataset_id}/{export_file_type}/"
    return export_root, f"{export_root}meta.json", f"{export_root}export.{export_file_type}"


@celery_app.task(base=TaskBase, bind=True)
def build_training_dataset_export_cache(
    self: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    dataset_name: str,
    version: str,
    usage: str,
    dataset_type: str,
    export_file_type: str,
    dataset_path: str,
    namespace: str,
) -> Dict:
    """异步构建训练数据集下载缓存，产物写入 JFS exports 目录。"""
    return run_async_in_celery(
        _build_training_dataset_export_cache_async(
            self,
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            project_id=project_id,
            dataset_name=dataset_name,
            version=version,
            usage=usage,
            dataset_type=dataset_type,
            export_file_type=export_file_type,
            dataset_path=dataset_path,
            namespace=namespace,
        )
    )


async def _build_training_dataset_export_cache_async(
    task: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    dataset_name: str,
    version: str,
    usage: str,
    dataset_type: str,
    export_file_type: str,
    dataset_path: str,
    namespace: str,
) -> Dict:
    from app.core.depend_manager import AutoContainer
    from app.schemas.training_task import TrainingTypeCategory

    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    container = AutoContainer()
    storage_service: StorageService = container.storage_service()
    training_dataset_mapper: TrainingDatasetMapper = container.training_dataset_mapper()
    jfs = await storage_service.JUICEFS_CLIENT(tenant_id)
    export_root, meta_path, artifact_path = _get_training_export_paths(dataset_path, dataset_id, export_file_type)
    now = get_current_shanghai_time().isoformat()
    temp_dir = None

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

    try:
        dataset = await training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"数据集不存在: dataset_id={dataset_id}")
        if not dataset.dataset_path or not jfs.exists(dataset.dataset_path):
            raise ValueError(f"数据集文件不存在: {dataset.dataset_path}")

        if dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value:
            if export_file_type != TrainingDatasetExportTypeCategory.ZIP_TYPE.value:
                raise ValueError(f"图像理解数据集只支持 zip 导出，当前格式: {export_file_type}")

            temp_dir = tempfile.mkdtemp(prefix=f"training_export_{dataset_id}_{export_file_type}_")
            local_data_path = os.path.join(temp_dir, "data.jsonl")
            local_images_dir = os.path.join(temp_dir, "images")
            local_artifact = os.path.join(temp_dir, "export.zip")

            JFSUtils.copy_file_to_local(jfs, dataset.dataset_path, local_data_path)
            images_folder_path = generate_image_folder_path(
                namespace,
                dataset_name,
                version,
                DatasetUsage(usage).value,
            )
            if jfs.exists(images_folder_path):
                JFSUtils.copy_dir_to_local(jfs, images_folder_path, local_images_dir)

            with zipfile.ZipFile(local_artifact, "w", zipfile.ZIP_DEFLATED) as zip_file:
                zip_file.write(local_data_path, "data.jsonl")
                if os.path.exists(local_images_dir):
                    for root, _dirs, files in os.walk(local_images_dir):
                        for filename in files:
                            abs_path = os.path.join(root, filename)
                            rel_path = os.path.relpath(abs_path, temp_dir).replace("\\", "/")
                            zip_file.write(abs_path, rel_path)
            JFSUtils.upload_local_file(jfs, local_artifact, artifact_path)
        elif export_file_type == TrainingDatasetExportTypeCategory.JSONL_TYPE.value:
            JFSUtils.copy_file(jfs, dataset.dataset_path, artifact_path)
        else:
            content = await analyze_export_dataset_file_single(
                db_dataset=dataset,
                export_file_type=TrainingDatasetExportTypeCategory(export_file_type),
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
            f"训练数据集导出缓存构建完成: dataset_id={dataset_id}, format={export_file_type}, path={artifact_path}"
        )
        return success_meta
    except Exception as exc:
        err_meta = {
            "status": "failed",
            "task_id": task.request.id,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "export_format": export_file_type,
            "error": str(exc),
            "updated_at": get_current_shanghai_time().isoformat(),
        }
        try:
            JFSUtils.write_json(jfs, meta_path, err_meta)
        except Exception as meta_err:
            logger.warning(f"写训练数据集导出失败元信息异常: {meta_err}")
        task._log_error(
            f"训练数据集导出缓存构建失败: dataset_id={dataset_id}, format={export_file_type}, err={exc}"
        )
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        try:
            await training_dataset_mapper.close()
        except Exception as close_error:
            logger.error(f"关闭数据库会话失败: {str(close_error)}")


@celery_app.task(base=TaskBase, bind=True)
def process_dataset_version_inheritance(
    self: TaskBase,
    dataset_id: int,
    dataset_type: str,
    training_method_type: str,
    dataset_format: str,
    namespace: str,
    name: str,
    version: str,
    usage: str,
    source_dataset_path: str,
    target_dataset_path: str,
    source_total_samples: int = 0,
    source_total_characters: int = 0,
    source_file_size: Optional[float] = None,
    source_index_path: Optional[str] = None,
    target_index_path: Optional[str] = None,
    source_dataset_dir_path: Optional[str] = None,
    target_dataset_dir_path: Optional[str] = None,
    chunk_upload_ids: Optional[List[str]] = None,
) -> Dict:
    """异步创建继承版本：复制源文件/目录，并可合并新上传文件。"""
    return run_async_in_celery(
        _process_dataset_version_inheritance_async_impl(
            self,
            dataset_id=dataset_id,
            dataset_type=dataset_type,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
            namespace=namespace,
            name=name,
            version=version,
            usage=usage,
            source_dataset_path=source_dataset_path,
            target_dataset_path=target_dataset_path,
            source_total_samples=source_total_samples,
            source_total_characters=source_total_characters,
            source_file_size=source_file_size,
            source_index_path=source_index_path,
            target_index_path=target_index_path,
            source_dataset_dir_path=source_dataset_dir_path,
            target_dataset_dir_path=target_dataset_dir_path,
            chunk_upload_ids=chunk_upload_ids,
        )
    )


async def _process_dataset_version_inheritance_async_impl(
    self: TaskBase,
    dataset_id: int,
    dataset_type: str,
    training_method_type: str,
    dataset_format: str,
    namespace: str,
    name: str,
    version: str,
    usage: str,
    source_dataset_path: str,
    target_dataset_path: str,
    source_total_samples: int,
    source_total_characters: int,
    source_file_size: Optional[float],
    source_index_path: Optional[str],
    target_index_path: Optional[str],
    source_dataset_dir_path: Optional[str],
    target_dataset_dir_path: Optional[str],
    chunk_upload_ids: Optional[List[str]],
) -> Dict:
    from app.core.depend_manager import AutoContainer
    from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
    from app.schemas.training_dataset import DatasetUsage

    container = AutoContainer()
    storage_service: StorageService = container.storage_service()
    chunk_upload_service: ChunkUploadService = container.chunk_upload_service()
    training_dataset_mapper: TrainingDatasetMapper = container.training_dataset_mapper()
    base_mapper: Optional[BaseMapper] = None
    executor: Optional[ThreadPoolExecutor] = None
    tenant_id = None
    jfs = None

    try:
        dataset = await training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"数据集不存在: dataset_id={dataset_id}")

        tenant_id = dataset.tenant_id
        if not tenant_id:
            raise ValueError(f"数据集没有租户ID: dataset_id={dataset_id}")

        app_runtime_context.set_tenant_id(tenant_id)
        if dataset.processing_status != DatasetProcessingStatus.PENDING.value:
            raise ValueError(f"数据集当前状态不允许处理: dataset_id={dataset_id}, status={dataset.processing_status}")

        jfs = await storage_service.JUICEFS_CLIENT()
        executor = ThreadPoolExecutor(max_workers=2)
        has_uploaded_files = bool(chunk_upload_ids)
        is_image_understanding = dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING.value

        if has_uploaded_files:
            base_dataset_path = source_dataset_path
            if is_image_understanding:
                if not source_dataset_dir_path or not target_dataset_dir_path:
                    raise ValueError("图像理解继承版本缺少源目录或目标目录")
                await asyncio.to_thread(JFSUtils.copy_directory, jfs, source_dataset_dir_path, target_dataset_dir_path)
                base_dataset_path = target_dataset_path

            files = []
            for upload_id in chunk_upload_ids or []:
                file = await chunk_upload_service.get_file_by_upload_id(upload_id)
                files.append(file)

            result = await analyze_save_dataset_file_multi(
                files=files,
                dataset_type=TrainingTypeCategory(dataset_type),
                dataset_format=dataset_format,
                training_method_type=TrainingMethodType(training_method_type),
                namespace=namespace,
                name=name,
                version=version,
                usage=DatasetUsage(usage),
                storage_service=storage_service,
                executor=executor,
                base_dataset_path=base_dataset_path,
            )

            dataset.total_samples = result["total_samples"]
            dataset.total_characters = result["total_characters"]
            dataset.file_size = result["file_size_bytes"] / (1024 * 1024)
            dataset.dataset_path = result["dataset_path"]
            dataset.metadata_fields = result.get("metadata_fields") or []
            await cleanup_temp_files_async(jfs, chunk_upload_ids, chunk_upload_service)
        else:
            if is_image_understanding:
                if not source_dataset_dir_path or not target_dataset_dir_path:
                    raise ValueError("图像理解继承版本缺少源目录或目标目录")
                await asyncio.to_thread(JFSUtils.copy_directory, jfs, source_dataset_dir_path, target_dataset_dir_path)
            else:
                await asyncio.to_thread(JFSUtils.copy_file, jfs, source_dataset_path, target_dataset_path)
                if source_index_path and target_index_path and jfs.exists(source_index_path):
                    await asyncio.to_thread(JFSUtils.copy_file, jfs, source_index_path, target_index_path)

            dataset.total_samples = source_total_samples
            dataset.total_characters = source_total_characters
            dataset.file_size = source_file_size
            dataset.dataset_path = target_dataset_path

        dataset.processing_status = DatasetProcessingStatus.COMPLETED.value
        dataset.publish = DatasetPublishStatus.UNPUBLISHED.value
        dataset.processing_error = None
        dataset.temp_file_path = None
        await training_dataset_mapper.commit()

        logger.info(f"继承版本异步处理完成: dataset_id={dataset_id}, name={name}, version={version}")
        return {"success": True, "dataset_id": dataset_id}

    except Exception as e:
        logger.error(f"继承版本异步处理失败: dataset_id={dataset_id}, error={str(e)}", exc_info=True)
        try:
            await update_status_async(training_dataset_mapper, dataset_id, DatasetProcessingStatus.FAILED.value, str(e))
        except Exception as update_error:
            logger.error(f"更新继承版本失败状态失败: {str(update_error)}")

        try:
            if tenant_id and chunk_upload_ids:
                await _cleanup_temp_files_wrapper(chunk_upload_ids, storage_service, chunk_upload_service, tenant_id)
        except Exception as cleanup_error:
            logger.error(f"清理继承版本上传临时文件失败: {str(cleanup_error)}")

        if jfs is not None:
            cleanup_path = target_dataset_dir_path if dataset_type == "image-understanding" else target_dataset_path
            await asyncio.to_thread(JFSUtils.cleanup_path, jfs, cleanup_path)

        raise
    finally:
        if executor is not None:
            executor.shutdown(wait=False)
        try:
            if base_mapper is not None:
                await base_mapper.close()
            if training_dataset_mapper is not None:
                await training_dataset_mapper.close()
        except Exception as close_error:
            logger.error(f"关闭数据库会话失败: {str(close_error)}")

@celery_app.task(base=TaskBase, bind=True)
def process_dataset_file(
    self: TaskBase,
    dataset_id: int,
    dataset_type: str,
    training_method_type: str,
    dataset_format: str,
    namespace: str,
    name: str,
    version: str,
    usage: str,
    chunk_upload_ids: Optional[List[str]] = None,  # chunk_upload_ids 列表（多文件分片上传时使用）
    base_dataset_path: Optional[str] = None,
) -> Dict:
    """
    异步处理数据集文件（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        dataset_id: 数据集ID
        dataset_type: 数据集类型
        namespace: 命名空间
        name: 数据集名称
        version: 数据集版本
        usage: 数据集用途
        chunk_upload_ids: 分片上传文件id列表
    
    Returns:
        Dict: 处理结果
    """
    return run_async_in_celery(
        _process_dataset_file_async_impl(
            self,
            dataset_id=dataset_id,
            dataset_type=dataset_type,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
            namespace=namespace,
            name=name,
            version=version,
            usage=usage,
            chunk_upload_ids=chunk_upload_ids,
            base_dataset_path=base_dataset_path,
        )
    )


async def _process_dataset_file_async_impl(
    self: TaskBase,
    dataset_id: int,
    dataset_type: str,
    training_method_type: str,
    dataset_format: str,
    namespace: str,
    name: str,
    version: str,
    usage: str,
    chunk_upload_ids: Optional[List[str]],  # chunk_upload_ids 列表（多文件分片上传时使用）
    base_dataset_path: Optional[str] = None,
) -> Dict:
    """异步处理数据集文件的完整实现（所有异步操作都在这里）"""
    
    # 使用 AutoContainer 获取依赖（与 evaluation_tasks.py 保持一致）
    from app.core.depend_manager import AutoContainer
    container = AutoContainer()
    base_mapper: BaseMapper = container.base_mapper()
    storage_service: StorageService = container.storage_service()
    chunk_upload_service: ChunkUploadService = container.chunk_upload_service()
    training_dataset_mapper: TrainingDatasetMapper = container.training_dataset_mapper()
    
    # 初始化 tenant_id（用于异常处理中的清理操作）
    tenant_id = None
    
    try:
        # 首先获取数据集记录以获取 tenant_id
        dataset = await training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"数据集不存在: dataset_id={dataset_id}")
        
        # 获取 tenant_id
        tenant_id = dataset.tenant_id
        if not tenant_id:
            raise ValueError(f"数据集没有租户ID: dataset_id={dataset_id}")
        
        # 设置租户上下文
        app_runtime_context.set_tenant_id(tenant_id)
        logger.info(f"已设置租户ID: {tenant_id}")
        
        if dataset.processing_status != DatasetProcessingStatus.PENDING.value:
            raise ValueError(f"数据集当前状态不允许处理: dataset_id={dataset_id}, status={dataset.processing_status}")
        
        # 创建线程池执行器（用于索引构建）
        executor = ThreadPoolExecutor(max_workers=2)
        
        try:
            # 执行异步处理（传递 tenant_id）
            result = await _process_dataset_file_async(
                dataset_id=dataset_id,
                dataset_type=dataset_type,
                training_method_type=training_method_type,
                dataset_format=dataset_format,
                namespace=namespace,
                name=name,
                version=version,
                usage=usage,
                chunk_upload_ids=chunk_upload_ids,  # chunk_upload_ids 列表（多文件分片上传时使用）
                base_dataset_path=base_dataset_path,
                tenant_id=tenant_id,
                storage_service=storage_service,
                chunk_upload_service=chunk_upload_service,
                training_dataset_mapper=training_dataset_mapper,
                executor=executor
            )
        finally:
            # 关闭线程池执行器
            executor.shutdown(wait=False)
        
        logger.info(f"数据集文件处理完成: dataset_id={dataset_id}, name={name}, version={version}")
        
        return result
        
    except Exception as e:
        logger.error(f"数据集文件处理失败: dataset_id={dataset_id}, error={str(e)}", exc_info=True)
        
        # 更新状态为"处理失败"
        try:
            await update_status_async(training_dataset_mapper, dataset_id, DatasetProcessingStatus.FAILED.value, str(e))
        except Exception as update_error:
            logger.error(f"更新失败状态失败: {str(update_error)}")
        
        # 清理临时文件（使用已获取的服务实例）
        try:
            if tenant_id:  # 只有在 tenant_id 存在时才尝试清理
                # 清理上传成功的分片文件
                await _cleanup_temp_files_wrapper(chunk_upload_ids, storage_service, chunk_upload_service, tenant_id)
            else:
                logger.warning(f"无法清理临时文件：tenant_id 不存在，dataset_id={dataset_id}")
        except Exception as cleanup_error:
            logger.error(f"清理临时文件失败: {str(cleanup_error)}")
        
        raise  # 重新抛出异常，让Celery记录失败
        
    finally:
        # 关闭数据库会话（与 evaluation_tasks.py 保持一致）
        try:
            if base_mapper is not None:
                await base_mapper.close()
            if training_dataset_mapper is not None:
                await training_dataset_mapper.close()
        except Exception as close_error:
            logger.error(f"关闭数据库会话失败: {str(close_error)}")


async def _process_dataset_file_async(
    dataset_id: int,
    dataset_type: str,
    training_method_type: str,
    dataset_format: str,
    namespace: str,
    name: str,
    version: str,
    usage: str,
    chunk_upload_ids: Optional[List[str]],
    base_dataset_path: Optional[str],
    tenant_id: str,
    storage_service: StorageService,
    chunk_upload_service: ChunkUploadService,
    training_dataset_mapper: TrainingDatasetMapper,
    executor: ThreadPoolExecutor
) -> Dict:
    """异步处理数据集文件的核心逻辑（支持单文或多文件分片上传）"""
    
    # 设置租户上下文（在同一个事件循环中设置，确保 ContextVar 生效）
    app_runtime_context.set_tenant_id(tenant_id)
    logger.info(f"已设置租户ID: {tenant_id}")
    
    # 从JuiceFS读取临时文件或通过分片上传获取文件
    jfs = await storage_service.JUICEFS_CLIENT()
    
    files = []
    # 多文件分片上传：从分片上传服务获取文件列表
    for upload_id in chunk_upload_ids:
        file = await chunk_upload_service.get_file_by_upload_id(upload_id)
        files.append(file)
    
    # 导入枚举类型
    from app.schemas.training_task import TrainingTypeCategory
    from app.schemas.training_dataset import DatasetUsage
    from app.schemas.training_task import TrainingMethodType
    
    # 执行文件解析和保存（使用工具函数，支持多文件合并）
    result = await analyze_save_dataset_file_multi(
        files=files,
        dataset_type=TrainingTypeCategory(dataset_type),
        dataset_format=dataset_format,
        training_method_type=TrainingMethodType(training_method_type),
        namespace=namespace,
        name=name,
        version=version,
        usage=DatasetUsage(usage),
        storage_service=storage_service,
        executor=executor,
        base_dataset_path=base_dataset_path,
    )
    
    # 更新数据集记录（使用 mapper 的异步方法）
    dataset = await training_dataset_mapper.query_one(
        select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
    )
    if dataset:
        dataset.total_samples = result["total_samples"]
        dataset.total_characters = result["total_characters"]
        dataset.file_size = result["file_size_bytes"] / (1024 * 1024)  # 转换为MB
        dataset.dataset_path = result["dataset_path"]
        dataset.metadata_fields = result.get("metadata_fields") or []
        dataset.processing_status = DatasetProcessingStatus.COMPLETED.value
        dataset.publish = DatasetPublishStatus.UNPUBLISHED.value
        dataset.processing_error = None
        dataset.temp_file_path = None  # 清空临时文件路径
        
        await training_dataset_mapper.commit()
    
    # 清理临时文件
    await cleanup_temp_files_async(jfs, chunk_upload_ids, chunk_upload_service)
    
    return {
        "success": True,
        "dataset_id": dataset_id,
        "total_samples": result["total_samples"],
        "total_characters": result["total_characters"],
        "file_size_bytes": result["file_size_bytes"],
        "metadata_fields": result.get("metadata_fields") or []
    }


@celery_app.task(base=TaskBase, bind=True)
def repair_training_dataset_metadata_fields(
    self: TaskBase,
    tenant_id: Optional[str] = None,
    force: bool = False,
) -> Dict:
    """异步回填历史训练数据集 metadata_fields，避免在 API 服务进程内长时间扫描文件。"""
    return run_async_in_celery(
        _repair_training_dataset_metadata_fields_async(self, tenant_id, force)
    )


async def _repair_training_dataset_metadata_fields_async(
    task: TaskBase,
    tenant_id: Optional[str],
    force: bool,
) -> Dict:
    from app.core.depend_manager import AutoContainer

    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    celery_task_id = str(task.request.id)
    await mark_metadata_fields_repair_running(
        REPAIR_KIND_TRAINING_DATASET,
        tenant_id,
        celery_task_id,
    )

    container = AutoContainer()
    service = container.training_dataset_service()
    try:
        result = await service.repair_metadata_fields(force=force)
        result.update({
            "success": True,
            "celery_task_id": celery_task_id,
            "force": force,
        })
        await mark_metadata_fields_repair_completed(
            REPAIR_KIND_TRAINING_DATASET,
            tenant_id,
            celery_task_id,
            result,
        )
        return result
    except Exception as exc:
        await mark_metadata_fields_repair_failed(
            REPAIR_KIND_TRAINING_DATASET,
            tenant_id,
            celery_task_id,
            exc,
        )
        raise
    finally:
        mapper = getattr(service, "training_dataset_mapper", None)
        if mapper:
            await mapper.close()


@celery_app.task(base=TaskBase, bind=True)
def repair_machine_learning_dataset_metadata_fields(
    self: TaskBase,
    tenant_id: Optional[str] = None,
    force: bool = False,
) -> Dict:
    """异步回填历史机器学习数据集 metadata_fields，避免在 API 服务进程内长时间扫描文件。"""
    return run_async_in_celery(
        _repair_machine_learning_dataset_metadata_fields_async(self, tenant_id, force)
    )


async def _repair_machine_learning_dataset_metadata_fields_async(
    task: TaskBase,
    tenant_id: Optional[str],
    force: bool,
) -> Dict:
    from app.core.depend_manager import AutoContainer

    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    celery_task_id = str(task.request.id)
    await mark_metadata_fields_repair_running(
        REPAIR_KIND_MACHINE_LEARNING_DATASET,
        tenant_id,
        celery_task_id,
    )

    container = AutoContainer()
    service = container.machine_learning_dataset_service()
    try:
        result = await service.repair_metadata_fields(force=force)
        result.update({
            "success": True,
            "celery_task_id": celery_task_id,
            "force": force,
        })
        await mark_metadata_fields_repair_completed(
            REPAIR_KIND_MACHINE_LEARNING_DATASET,
            tenant_id,
            celery_task_id,
            result,
        )
        return result
    except Exception as exc:
        await mark_metadata_fields_repair_failed(
            REPAIR_KIND_MACHINE_LEARNING_DATASET,
            tenant_id,
            celery_task_id,
            exc,
        )
        raise
    finally:
        mapper = getattr(service, "machine_learning_dataset_mapper", None)
        if mapper:
            await mapper.close()


@celery_app.task(base=TaskBase, bind=True)
def delete_training_dataset_rows(
    self: TaskBase,
    dataset_id: int,
    row_numbers: List[int],
) -> Dict:
    """异步删除训练数据集文件中的指定行。"""
    return run_async_in_celery(
        _delete_training_dataset_rows_async(
            self,
            dataset_id=dataset_id,
            row_numbers=row_numbers,
        )
    )


async def _delete_training_dataset_rows_async(
    task: TaskBase,
    dataset_id: int,
    row_numbers: List[int],
) -> Dict:
    from app.core.depend_manager import AutoContainer

    container = AutoContainer()
    storage_service: StorageService = container.storage_service()
    training_dataset_mapper: TrainingDatasetMapper = container.training_dataset_mapper()
    row_number_set = set(row_numbers or [])
    temp_path = None
    backup_path = None
    jfs = None

    try:
        if not row_number_set:
            raise ValueError("删除行号不能为空")
        if any(row_number < 1 for row_number in row_number_set):
            raise ValueError("删除行号必须大于等于 1")

        dataset = await training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"数据集不存在: dataset_id={dataset_id}")
        if not dataset.tenant_id:
            raise ValueError(f"数据集没有租户ID: dataset_id={dataset_id}")

        app_runtime_context.set_tenant_id(dataset.tenant_id)
        if dataset.processing_status != DatasetProcessingStatus.PENDING.value:
            raise ValueError(f"数据集当前状态不允许删除行: dataset_id={dataset_id}, status={dataset.processing_status}")
        if not dataset.dataset_path:
            raise ValueError("数据集文件路径为空")

        sample_count = int(dataset.total_samples or 0)
        if max(row_number_set) > sample_count:
            raise ValueError(f"删除行号超出数据集范围: {max(row_number_set)}")
        if len(row_number_set) >= sample_count:
            raise ValueError("删除后数据集至少需要保留一行数据")

        jfs = await storage_service.JUICEFS_CLIENT()
        if not jfs.exists(dataset.dataset_path):
            raise FileNotFoundError(f"数据集文件不存在: {dataset.dataset_path}")

        temp_path = f"{dataset.dataset_path}.delete_rows_{task.request.id}.tmp"
        backup_path = f"{dataset.dataset_path}.delete_rows_{task.request.id}.bak"
        total_valid_rows = 0
        removed_count = 0
        matched_rows = set()
        kept_samples = 0
        total_characters = 0
        file_size_bytes = 0

        with jfs.open(dataset.dataset_path, "rb") as source_file:
            with jfs.open(temp_path, "wb") as target_file:
                while True:
                    line_bytes = source_file.readline()
                    if not line_bytes:
                        break

                    line_text = line_bytes.decode("utf-8", errors="ignore")
                    stripped = line_text.strip()
                    if not stripped or stripped.startswith("#"):
                        target_file.write(line_bytes)
                        file_size_bytes += len(line_bytes)
                        continue

                    total_valid_rows += 1
                    if total_valid_rows in row_number_set:
                        matched_rows.add(total_valid_rows)
                        removed_count += 1
                        continue

                    target_file.write(line_bytes)
                    kept_samples += 1
                    total_characters += len(stripped)
                    file_size_bytes += len(line_bytes)

        missing_rows = sorted(row_number_set - matched_rows)
        if missing_rows:
            raise ValueError(f"删除行号超出数据集范围: {missing_rows}")
        if removed_count == 0:
            raise ValueError("未匹配到需要删除的行")
        if kept_samples < 1:
            raise ValueError("删除后数据集至少需要保留一行数据")

        jfs.rename(dataset.dataset_path, backup_path)
        try:
            jfs.rename(temp_path, dataset.dataset_path)
        except Exception:
            if jfs.exists(backup_path):
                jfs.rename(backup_path, dataset.dataset_path)
            raise

        JFSUtils.cleanup_path(jfs, backup_path)
        temp_path = None
        backup_path = None

        JFSUtils.cleanup_path(jfs, get_index_cache_path(dataset.dataset_path))
        dataset_dir = os.path.dirname(dataset.dataset_path.rstrip("/")).replace("\\", "/")
        JFSUtils.cleanup_path(jfs, f"{dataset_dir}/exports/dataset_{dataset.id}")

        latest_dataset = await training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )
        if latest_dataset:
            latest_dataset.total_samples = kept_samples
            latest_dataset.total_characters = total_characters
            latest_dataset.file_size = file_size_bytes / (1024 * 1024)
            latest_dataset.processing_status = DatasetProcessingStatus.COMPLETED.value
            latest_dataset.publish = DatasetPublishStatus.UNPUBLISHED.value
            latest_dataset.processing_error = None
            await training_dataset_mapper.commit()

        task._log_complete(f"训练数据集删除行完成: dataset_id={dataset_id}, removed={removed_count}")
        return {
            "success": True,
            "dataset_id": dataset_id,
            "removed_count": removed_count,
            "total_samples": kept_samples,
        }
    except Exception as exc:
        logger.error(f"训练数据集删除行失败: dataset_id={dataset_id}, error={str(exc)}", exc_info=True)
        try:
            if jfs is not None:
                if temp_path:
                    JFSUtils.cleanup_path(jfs, temp_path)
                if backup_path and jfs.exists(backup_path):
                    original_dataset = await training_dataset_mapper.query_one(
                        select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
                    )
                    if original_dataset and not jfs.exists(original_dataset.dataset_path):
                        jfs.rename(backup_path, original_dataset.dataset_path)
                    else:
                        JFSUtils.cleanup_path(jfs, backup_path)
        except Exception as cleanup_error:
            logger.warning(f"清理删除行临时文件失败: dataset_id={dataset_id}, error={str(cleanup_error)}")

        try:
            await update_status_async(
                training_dataset_mapper,
                dataset_id,
                DatasetProcessingStatus.FAILED.value,
                str(exc),
            )
        except Exception as update_error:
            logger.error(f"更新删除行失败状态失败: dataset_id={dataset_id}, error={str(update_error)}")
        raise
    finally:
        try:
            await training_dataset_mapper.close()
        except Exception as close_error:
            logger.error(f"关闭数据库会话失败: {str(close_error)}")

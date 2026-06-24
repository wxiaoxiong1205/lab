"""
机器学习数据集导出任务（Celery）
所有导出格式均走异步转换，产物缓存到 JFS，后续直接复用下载。
"""
import json
import os
import shutil
import tempfile
import zipfile
from typing import Optional, List, Dict, Any

from app.core.logging import logger
from app.database.base import get_db_session
from app.database.database_depends import run_async_in_celery
from app.models.models import Notebook
from app.common.status import TaskStatus
from app.schemas.machine_learning_dataset import ExportFormat, MachineLearningDatasetTemplateType
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.utils import app_runtime_context
from app.utils.machine_learning_dataset_exporter import export_samples_to_dir, read_label_schema_from_jfs
from app.utils.timezone_utils import get_current_shanghai_time
from app.utils.jfs_utils import JFSUtils


def _get_storage_service():
    from app.database.database_depends import Database
    from app.repository.storage import StorageMapper
    from app.services.storage.storage import DefaultStorageService

    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


def _copy_file_chunks_from_jfs(jfs, src_path: str, dst_path: str, chunk_size: int = 1024 * 1024) -> None:
    with jfs.open(src_path, "rb") as src:
        with open(dst_path, "wb") as dst:
            while True:
                chunk = src.read(chunk_size)
                if not chunk:
                    break
                dst.write(chunk)


def _copy_dir_from_jfs(jfs, src_dir: str, dst_dir: str) -> None:
    try:
        items = jfs.listdir(src_dir)
    except Exception:
        return
    os.makedirs(dst_dir, exist_ok=True)
    for item in items:
        src_item = (src_dir.rstrip("/") + "/" + item).replace("\\", "/")
        dst_item = os.path.join(dst_dir, item)
        try:
            jfs.listdir(src_item)
            _copy_dir_from_jfs(jfs, src_item, dst_item)
        except Exception:
            _copy_file_chunks_from_jfs(jfs, src_item, dst_item)


def _upload_local_file_to_jfs(jfs, local_path: str, jfs_path: str, chunk_size: int = 1024 * 1024) -> None:
    parent = os.path.dirname(jfs_path.rstrip("/")).replace("\\", "/")
    if parent and not jfs.exists(parent):
        jfs.makedirs(parent, exist_ok=True)
    with open(local_path, "rb") as src:
        with jfs.open(jfs_path, "wb") as dst:
            while True:
                chunk = src.read(chunk_size)
                if not chunk:
                    break
                dst.write(chunk)


def _write_meta(jfs, meta_path: str, payload: dict) -> None:
    parent = os.path.dirname(meta_path.rstrip("/")).replace("\\", "/")
    if parent and not jfs.exists(parent):
        jfs.makedirs(parent, exist_ok=True)
    with jfs.open(meta_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False, indent=2))


def _should_skip_images_dir(
    template_enum: MachineLearningDatasetTemplateType,
    export_enum: ExportFormat,
    primary_exists: bool,
) -> bool:
    """打 zip 时是否跳过临时目录下的 images/ 目录。

    图片类导出中，图片要么进了类别子目录，要么（未标注时）被导出器直接拷到了压缩包根目录，
    此时再带上从 JFS assets 拷来的原始 images/ 目录就是冗余，应跳过：
    - 单/多标签分类 platform、单标签 image_folder：图片已落到根目录或类别目录，恒跳过；
    - 目标检测 / 实例分割（标准）/ 实例分割（孔洞）/ 语义分割 platform：仅当未标注
      （primary_exists 为 False，即 dataset.jsonl 未生成、图片被拷到根目录）时跳过。
    """
    if (
        template_enum == MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_SINGLE_LABEL
        and export_enum == ExportFormat.IMAGE_FOLDER
    ):
        return True
    if export_enum == ExportFormat.PLATFORM:
        if template_enum in (
            MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_SINGLE_LABEL,
            MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_MULTI_LABEL,
        ):
            return True
        if template_enum in (
            MachineLearningDatasetTemplateType.OBJECT_DETECTION_BBOX,
            MachineLearningDatasetTemplateType.IMAGE_SEGMENTATION_INSTANCE,
            MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK,
            MachineLearningDatasetTemplateType.SEMANTIC_SEGMENTATION,
        ):
            return not primary_exists
    return False


async def _build_ml_dataset_export_cache_impl_async(
    task: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    template_type: str,
    export_format: str,
    dataset_path: str,
    storage_path: str,
    label_schema_path: Optional[str] = None,
) -> dict:
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    storage = _get_storage_service()
    jfs = await storage.JUICEFS_CLIENT(tenant_id)
    export_root = f"{storage_path.rstrip('/')}/exports/{export_format}/"
    meta_path = f"{export_root}meta.json"
    artifact_ext = "zip"
    artifact_path = f"{export_root}export.{artifact_ext}"
    now = get_current_shanghai_time().isoformat()

    task._log_start(
        f"开始构建机器学习导出缓存: dataset_id={dataset_id}, project_id={project_id}, format={export_format}"
    )
    _write_meta(
        jfs,
        meta_path,
        {
            "status": "processing",
            "task_id": task.request.id,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "export_format": export_format,
            "updated_at": now,
        },
    )

    temp_dir = None
    try:
        template_enum = MachineLearningDatasetTemplateType(template_type)
        export_enum = ExportFormat(export_format)

        temp_dir = tempfile.mkdtemp(prefix=f"ml_export_{dataset_id}_{export_format}_")
        assets_path = f"{storage_path.rstrip('/')}/assets/"
        if jfs.exists(assets_path):
            temp_images = os.path.join(temp_dir, "images")
            _copy_dir_from_jfs(jfs, assets_path, temp_images)

        label_schema = read_label_schema_from_jfs(jfs, label_schema_path)
        primary_name = export_samples_to_dir(
            jfs=jfs,
            dataset_path=dataset_path,
            template_type=template_enum,
            export_format=export_enum,
            output_dir=temp_dir,
            label_schema=label_schema,
        )
        primary_exists = bool(primary_name) and os.path.exists(os.path.join(temp_dir, primary_name))

        is_unannotated_text_platform = (
            export_enum == ExportFormat.PLATFORM
            and template_enum in (
                MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_SINGLE_LABEL,
                MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_MULTI_LABEL,
                MachineLearningDatasetTemplateType.ENTITY_RECOGNITION,
            )
            and not label_schema
            and primary_exists
            and primary_name == "dataset.jsonl"
        )

        if is_unannotated_text_platform:
            artifact_ext = "jsonl"
            artifact_path = f"{export_root}export.{artifact_ext}"
            local_artifact = os.path.join(temp_dir, primary_name)
        else:
            local_artifact = os.path.join(temp_dir, "export.zip")
            with zipfile.ZipFile(local_artifact, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _dirs, files in os.walk(temp_dir):
                    for filename in files:
                        abs_path = os.path.join(root, filename)
                        if abs_path == local_artifact:
                            continue
                        rel_path = os.path.relpath(abs_path, temp_dir).replace("\\", "/")
                        if rel_path == "images" or rel_path.startswith("images/"):
                            if _should_skip_images_dir(template_enum, export_enum, primary_exists):
                                continue
                        zf.write(abs_path, rel_path)

        if not jfs.exists(export_root):
            jfs.makedirs(export_root, exist_ok=True)
        _upload_local_file_to_jfs(jfs, local_artifact, artifact_path)

        success_meta = {
            "status": "success",
            "task_id": task.request.id,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "export_format": export_format,
            "artifact_path": artifact_path,
            "primary_name": primary_name,
            "updated_at": get_current_shanghai_time().isoformat(),
        }
        _write_meta(jfs, meta_path, success_meta)
        task._log_complete(
            f"机器学习导出缓存构建完成: dataset_id={dataset_id}, format={export_format}, path={artifact_path}"
        )
        return success_meta
    except Exception as exc:
        err_meta = {
            "status": "failed",
            "task_id": task.request.id,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "export_format": export_format,
            "error": str(exc),
            "updated_at": get_current_shanghai_time().isoformat(),
        }
        try:
            _write_meta(jfs, meta_path, err_meta)
        except Exception as meta_err:
            logger.warning("写机器学习导出缓存失败元信息异常: %s", meta_err)
        task._log_error(
            f"机器学习导出缓存构建失败: dataset_id={dataset_id}, format={export_format}, err={exc}"
        )
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def _build_ml_dataset_export_cache_impl(
    task: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    template_type: str,
    export_format: str,
    dataset_path: str,
    storage_path: str,
    label_schema_path: Optional[str] = None,
) -> dict:
    return run_async_in_celery(
        _build_ml_dataset_export_cache_impl_async(
            task,
            tenant_id,
            dataset_id,
            project_id,
            template_type,
            export_format,
            dataset_path,
            storage_path,
            label_schema_path,
        )
    )


@celery_app.task(base=TaskBase, bind=True)
def build_ml_dataset_export_cache(
    self: TaskBase,
    tenant_id: Optional[str],
    dataset_id: int,
    project_id: int,
    template_type: str,
    export_format: str,
    dataset_path: str,
    storage_path: str,
    label_schema_path: Optional[str] = None,
) -> dict:
    """
    异步导出机器学习数据集到缓存目录：
    - 所有导出格式都会走这个任务
    - 产物写到 {storage_path}/exports/{format}/export.{ext}
    - 元信息写到 {storage_path}/exports/{format}/meta.json
    """
    return _build_ml_dataset_export_cache_impl(
        self,
        tenant_id,
        dataset_id,
        project_id,
        template_type,
        export_format,
        dataset_path,
        storage_path,
        label_schema_path,
    )


@celery_app.task(base=TaskBase, bind=True)
def build_ml_dataset_export_cache_batch_for_notebook(
    self: TaskBase,
    tenant_id: Optional[str],
    notebook_id: int,
    project_id: int,
    dataset_items: List[Dict[str, Any]],
    target_status: Optional[str] = None,
) -> dict:
    return run_async_in_celery(
        _build_ml_dataset_export_cache_batch_for_notebook_impl(
            self,
            tenant_id,
            notebook_id,
            project_id,
            dataset_items,
            target_status,
        )
    )


async def _build_ml_dataset_export_cache_batch_for_notebook_impl(
    self: TaskBase,
    tenant_id: Optional[str],
    notebook_id: int,
    project_id: int,
    dataset_items: List[Dict[str, Any]],
    target_status: Optional[str] = None,
) -> dict:
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    from app.models.models import MachineLearningDataset
    from sqlalchemy import select

    self._log_start(
        f"开始批量构建机器学习导出缓存: notebook_id={notebook_id}, project_id={project_id}"
    )
    mapper = None

    try:
        ml_dataset_ids = [int(item["dataset_id"]) for item in dataset_items]
        async with get_db_session() as db:
            ml_datasets_result = await db.execute(
                select(MachineLearningDataset).filter(
                    MachineLearningDataset.id.in_(ml_dataset_ids),
                    MachineLearningDataset.project_id == project_id,
                )
            )
            ml_datasets = ml_datasets_result.scalars().all()
        dataset_map = {dataset.id: dataset for dataset in ml_datasets}

        storage = _get_storage_service()
        jfs = await storage.JUICEFS_CLIENT(tenant_id)
        processed = []

        for item in dataset_items:
            dataset_id = int(item["dataset_id"])
            export_format = str(item["format"]).strip().lower()
            dataset = dataset_map.get(dataset_id)
            if not dataset:
                raise ValueError(f"机器学习数据集不存在: {dataset_id}")

            export_root = f"{dataset.storage_path.rstrip('/')}/exports/{export_format}/"
            meta_path = f"{export_root}meta.json"

            if jfs.exists(meta_path):
                try:
                    with jfs.open(meta_path, "r", encoding="utf-8") as f:
                        meta = json.loads(f.read() or "{}")
                    artifact_path = str(meta.get("artifact_path") or f"{export_root}export.zip")
                    if meta.get("status") == "success" and jfs.exists(artifact_path):
                        processed.append({
                            "dataset_id": dataset_id,
                            "format": export_format,
                            "status": "skipped",
                        })
                        continue
                except Exception:
                    pass

            await _build_ml_dataset_export_cache_impl_async(
                self,
                tenant_id,
                dataset.id,
                project_id,
                dataset.template_type,
                export_format,
                dataset.dataset_path,
                dataset.storage_path,
                dataset.label_schema_path,
            )
            processed.append({
                "dataset_id": dataset_id,
                "format": export_format,
                "status": "generated",
            })

        async with get_db_session() as db:
            notebook_result = await db.execute(select(Notebook).filter(Notebook.id == notebook_id))
            notebook = notebook_result.scalar_one_or_none()
            if not notebook:
                raise ValueError(f"Notebook 不存在: {notebook_id}")
            # 默认走创建流程（CREATED），编辑流程会显式传入 target_status
            # 把 notebook 还原到编辑前的状态（CREATED / TERMINATED / FAILED）。
            notebook.status = target_status or TaskStatus.CREATED.value
            notebook.updated_at = get_current_shanghai_time()
            await db.commit()

        self._log_complete(
            f"批量构建机器学习导出缓存完成: notebook_id={notebook_id}, processed={processed}"
        )
        return {
            "status": "success",
            "notebook_id": notebook_id,
            "processed": processed,
        }
    except Exception as exc:
        try:
            async with get_db_session() as db:
                notebook_result = await db.execute(select(Notebook).filter(Notebook.id == notebook_id))
                notebook = notebook_result.scalar_one_or_none()
                if notebook:
                    notebook.status = TaskStatus.CREATION_FAILED.value
                    notebook.updated_at = get_current_shanghai_time()
                    await db.commit()
        except Exception as update_error:
            logger.warning("更新 Notebook 失败状态失败: %s", update_error)

        self._log_error(
            f"批量构建机器学习导出缓存失败: notebook_id={notebook_id}, err={exc}"
        )
        raise
    finally:
        if mapper is not None:
            try:
                await mapper.close()
            except Exception as close_error:
                logger.warning("关闭 NotebookMapper 数据库会话失败: %s", close_error)


@celery_app.task(base=TaskBase, bind=True)
def delete_machine_learning_dataset_rows(
    self: TaskBase,
    dataset_id: int,
    row_numbers: List[int],
) -> Dict:
    """异步删除机器学习数据集 dataset.jsonl 中的指定行。"""
    return run_async_in_celery(
        _delete_machine_learning_dataset_rows_async(
            self,
            dataset_id=dataset_id,
            row_numbers=row_numbers,
        )
    )


async def _delete_machine_learning_dataset_rows_async(
    task: TaskBase,
    dataset_id: int,
    row_numbers: List[int],
) -> Dict:
    from sqlalchemy import select
    from app.core.depend_manager import AutoContainer
    from app.models.models import MachineLearningDataset
    from app.schemas.machine_learning_dataset import DatasetPublishStatus, MachineLearningDatasetProcessingStatus

    container = AutoContainer()
    storage_service = container.storage_service()
    machine_learning_dataset_mapper = container.machine_learning_dataset_mapper()
    row_number_set = set(row_numbers or [])
    temp_path = None
    backup_path = None
    jfs = None

    try:
        if not row_number_set:
            raise ValueError("删除行号不能为空")
        if any(row_number < 1 for row_number in row_number_set):
            raise ValueError("删除行号必须大于等于 1")

        dataset = await machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(MachineLearningDataset.id == dataset_id)
        )
        if not dataset:
            raise ValueError(f"机器学习数据集不存在: dataset_id={dataset_id}")
        if not dataset.tenant_id:
            raise ValueError(f"机器学习数据集没有租户ID: dataset_id={dataset_id}")
        if getattr(dataset, "processing_status", MachineLearningDatasetProcessingStatus.COMPLETED.value) == MachineLearningDatasetProcessingStatus.PENDING.value:
            raise ValueError("Machine learning dataset has a task processing, please refresh and retry")
        if dataset.publish != DatasetPublishStatus.UNPUBLISHED.value:
            raise ValueError("只有未发布状态的机器学习数据集才能删除指定行")
        if not dataset.dataset_path:
            raise ValueError("dataset.jsonl 文件路径为空")

        sample_count = int(dataset.sample_count or 0)
        if max(row_number_set) > sample_count:
            raise ValueError(f"删除行号超出数据集范围: {max(row_number_set)}")
        if len(row_number_set) >= sample_count:
            raise ValueError("删除后数据集至少需要保留一行数据")

        app_runtime_context.set_tenant_id(dataset.tenant_id)
        jfs = await storage_service.JUICEFS_CLIENT()
        if not jfs.exists(dataset.dataset_path):
            raise FileNotFoundError(f"dataset.jsonl 文件不存在: {dataset.dataset_path}")

        storage_path = (dataset.storage_path or os.path.dirname(dataset.dataset_path)).rstrip("/") + "/"
        dataset.processing_status = MachineLearningDatasetProcessingStatus.PENDING.value
        dataset.publish = DatasetPublishStatus.PROCESSING.value
        await machine_learning_dataset_mapper.commit()

        temp_path = f"{dataset.dataset_path}.delete_rows_{task.request.id}.tmp"
        backup_path = f"{dataset.dataset_path}.delete_rows_{task.request.id}.bak"

        total_rows = 0
        removed_count = 0
        matched_rows = set()
        kept_samples = 0
        file_size_bytes = 0

        with jfs.open(dataset.dataset_path, "rb") as source_file:
            with jfs.open(temp_path, "wb") as target_file:
                while True:
                    line_bytes = source_file.readline()
                    if not line_bytes:
                        break

                    line_text = line_bytes.decode("utf-8", errors="ignore")
                    stripped = line_text.strip()
                    if not stripped:
                        target_file.write(line_bytes)
                        file_size_bytes += len(line_bytes)
                        continue

                    total_rows += 1
                    if total_rows in row_number_set:
                        matched_rows.add(total_rows)
                        removed_count += 1
                        continue

                    target_file.write(line_bytes)
                    kept_samples += 1
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
        JFSUtils.cleanup_path(jfs, f"{storage_path}exports")

        latest_dataset = await machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(MachineLearningDataset.id == dataset_id)
        )
        if latest_dataset:
            latest_dataset.sample_count = kept_samples
            latest_dataset.file_size = file_size_bytes / (1024 * 1024)
            latest_dataset.processing_status = MachineLearningDatasetProcessingStatus.COMPLETED.value
            latest_dataset.publish = DatasetPublishStatus.UNPUBLISHED.value
            await machine_learning_dataset_mapper.commit()

        task._log_complete(f"机器学习数据集删除行完成: dataset_id={dataset_id}, removed={removed_count}")
        return {
            "success": True,
            "dataset_id": dataset_id,
            "removed_count": removed_count,
            "sample_count": kept_samples,
        }
    except Exception as exc:
        logger.error(f"机器学习数据集删除行失败: dataset_id={dataset_id}, error={str(exc)}", exc_info=True)
        try:
            if jfs is not None:
                if temp_path:
                    JFSUtils.cleanup_path(jfs, temp_path)
                if backup_path and jfs.exists(backup_path):
                    original_dataset = await machine_learning_dataset_mapper.query_one(
                        select(MachineLearningDataset).filter(MachineLearningDataset.id == dataset_id)
                    )
                    if original_dataset and not jfs.exists(original_dataset.dataset_path):
                        jfs.rename(backup_path, original_dataset.dataset_path)
                    else:
                        JFSUtils.cleanup_path(jfs, backup_path)
        except Exception as cleanup_error:
            logger.warning(f"清理机器学习删除行临时文件失败: dataset_id={dataset_id}, error={str(cleanup_error)}")
        try:
            failed_dataset = await machine_learning_dataset_mapper.query_one(
                select(MachineLearningDataset).filter(MachineLearningDataset.id == dataset_id)
            )
            if failed_dataset:
                failed_dataset.processing_status = MachineLearningDatasetProcessingStatus.FAILED.value
                failed_dataset.publish = DatasetPublishStatus.FAILED.value
                await machine_learning_dataset_mapper.commit()
        except Exception as update_error:
            logger.error(f"Update machine learning delete rows failed status failed: dataset_id={dataset_id}, error={str(update_error)}")
        raise
    finally:
        try:
            await machine_learning_dataset_mapper.close()
        except Exception as close_error:
            logger.error(f"关闭数据库会话失败: {str(close_error)}")

"""
训练任务相关的Celery任务
"""
from enum import Enum
from typing import Any, Optional
from celery.exceptions import TaskRevokedError
import json
import os
import re
import time
import asyncio
import uuid
import yaml
import logging
import tempfile
import shutil
from sqlalchemy import select, update
from urllib.parse import urlparse

from app.core import settings
from app.models import BaseModel
from app.schemas.model import BelleModelType
from app.utils.belle_util import BelleUtil

logger = logging.getLogger(__name__)

from app.services.repository_image.interface import RepositoryImageService
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.schemas.training_task import TrainingTaskCreate
from app.utils.dataset_mixer import create_mixed_dataset, append_json_str_to_tmp_zip, append_jfs_dir_to_tmp_zip
from app.utils.training_config_storage import store_training_config
from app.utils.storage_enum import LlamaFactoryDatasetName, StoragePath, TrainingDatasetMountArtifact
from app.database.base import SessionLocal
from app.models.training_task_manager import TrainingTask  # 修正导入
from app.models.training_dataset_manager import TrainingDataset
from app.models.models import KubernetesResource, ProjectKubernetesRelation, Project
from app.utils.k8s_launcher import K8sLauncher
from app.utils.k8s_utils import build_node_affinity
from app.common.status import TaskStatus
from app.services.storage.storage import DefaultStorageService
from app.repository.storage import StorageMapper
from app.database.database_depends import Database, run_async_in_celery
from app.schemas.training_dataset import DatasetFormat

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

def _resolve_training_dataset_format(task: TaskBase, *, project_id: Optional[int], dataset_items: list) -> Optional[str]:
    if not project_id:
        task._log_warning("未传入 project_id，无法根据训练数据集判断 dataset_format")
        return None
    if not dataset_items:
        task._log_warning("训练数据集列表为空，无法判断 dataset_format")
        return None

    formats = []
    with SessionLocal() as db:
        for item in dataset_items:
            if item.get("name") and item.get("version"):
                dataset = db.query(TrainingDataset).filter(
                    TrainingDataset.name == item.get("name"),
                    TrainingDataset.version == item.get("version"),
                    TrainingDataset.project_id == project_id
                ).first()
                formats.append(dataset.dataset_format)
            else:
                # 使用默认的prompt-response格式
                formats.append(DatasetFormat.PROMPT_RESPONSE.value)
                

    if not formats:
        return None

    unique_formats = list(dict.fromkeys(formats))
    if len(unique_formats) > 1:
        task._log_warning(f"训练数据集格式不一致: {unique_formats}，将使用 {unique_formats[0]}")
    return unique_formats[0]


async def _merge_copy_jfs_images_dir(
    jfs,
    source_images_dir: str,
    target_images_dir: str,
    task: TaskBase,
) -> None:
    """将 JuiceFS 上某一数据集的 images 目录合并复制到任务目录下的 images。"""
    if not source_images_dir or not jfs.exists(source_images_dir):
        return

    def _sync_merge() -> None:
        target_parent = os.path.dirname(target_images_dir)
        if target_parent and not jfs.exists(target_parent):
            jfs.makedirs(target_parent, exist_ok=True)
        if not jfs.exists(target_images_dir):
            jfs.makedirs(target_images_dir, exist_ok=True)

        def copy_recursive(src: str, dst: str) -> None:
            try:
                items = jfs.listdir(src)
            except Exception as e:
                task._log_warning(f"无法列出目录: {src}, {e}")
                return
            for item in items:
                src_path = os.path.join(src, item).replace("\\", "/")
                dst_path = os.path.join(dst, item).replace("\\", "/")
                try:
                    jfs.listdir(src_path)
                    is_directory = True
                except Exception:
                    is_directory = False
                if is_directory:
                    jfs.makedirs(dst_path, exist_ok=True)
                    copy_recursive(src_path, dst_path)
                else:
                    with jfs.open(src_path, "rb") as sf:
                        data = sf.read()
                    with jfs.open(dst_path, "wb") as df:
                        df.write(data)

        copy_recursive(source_images_dir, target_images_dir)

    await asyncio.to_thread(_sync_merge)


def _enum_value(value: Any) -> Any:
    return value.value if isinstance(value, Enum) else value


async def _clear_training_dataset_dir(
    task: TaskBase,
    *,
    namespace: str,
    task_id: int,
    storage_service: DefaultStorageService = None,
    jfs=None,
) -> str:
    """清理当前训练任务的 datasets 目录，避免重跑时混用旧产物。"""
    dataset_dir = StoragePath.REAL_TRAINING_DATASETS.format_storage_path(
        namespace=namespace,
        task_id=task_id
    )

    if jfs is None:
        if storage_service is None:
            storage_service = get_storage_service()
        jfs = await storage_service.JUICEFS_CLIENT()

    def _sync_clear() -> None:
        if jfs.exists(dataset_dir):
            task._log_info(f"清理训练任务历史数据集目录: {dataset_dir}")
            jfs.rmr(dataset_dir)
        jfs.makedirs(dataset_dir, exist_ok=True)

    await asyncio.to_thread(_sync_clear)
    return dataset_dir


async def _remove_dataset_artifact_dir(
    *,
    jfs,
    mixed_dataset_root: str,
    artifact: TrainingDatasetMountArtifact,
    task: TaskBase,
) -> None:
    """删除混合完成后不再需要的任务数据集构建中间目录。"""
    artifact_dir = f"{mixed_dataset_root.rstrip('/')}/{artifact.value}"

    def _sync_remove() -> None:
        if jfs.exists(artifact_dir):
            task._log_info(f"清理训练数据集中间目录: {artifact_dir}")
            jfs.rmr(artifact_dir)

    await asyncio.to_thread(_sync_remove)


def _flush_and_truncate(file_obj: Any) -> None:
    if hasattr(file_obj, "truncate"):
        file_obj.truncate()
    file_obj.flush()


def _normalize_image_reference(image_ref: str, images_dir_name: str) -> str:
    """把样本里的相对图片引用改写到 train_images/val_images 目录下。"""
    normalized = str(image_ref).strip().replace("\\", "/")
    if not normalized:
        return normalized

    for artifact in (
        TrainingDatasetMountArtifact.TRAIN_IMAGES_DIR.value,
        TrainingDatasetMountArtifact.EVAL_IMAGES_DIR.value,
    ):
        prefix = f"{artifact}/"
        if normalized.startswith(prefix):
            relative = normalized[len(prefix):]
            return f"{images_dir_name}/{relative}" if artifact != images_dir_name else normalized

    if normalized.startswith("images/"):
        normalized = normalized[len("images/"):]
    elif normalized.startswith("./images/"):
        normalized = normalized[len("./images/"):]
    elif normalized.startswith("./"):
        normalized = normalized[len("./"):]

    return f"{images_dir_name}/{normalized}"


def _rewrite_images_fields(payload: Any, images_dir_name: str) -> bool:
    rewritten = False

    if isinstance(payload, dict):
        for key, value in list(payload.items()):
            if key == "images" and isinstance(value, list):
                payload[key] = [
                    _normalize_image_reference(image_ref, images_dir_name)
                    if isinstance(image_ref, str) else image_ref
                    for image_ref in value
                ]
                rewritten = True
            elif isinstance(value, (dict, list)):
                rewritten = _rewrite_images_fields(value, images_dir_name) or rewritten
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, (dict, list)):
                rewritten = _rewrite_images_fields(item, images_dir_name) or rewritten

    return rewritten


def _parse_dataset_records(content: str) -> list[Any]:
    if not str(content).strip():
        return []
    try:
        payload = json.loads(content)
        return payload if isinstance(payload, list) else [payload]
    except json.JSONDecodeError:
        return [json.loads(line) for line in str(content).splitlines() if line.strip()]


def _dataset_artifact_key(item: dict, index: int) -> str:
    raw_parts = [
        str(item.get("dataset_id") or ""),
        str(item.get("name") or "dataset"),
        str(item.get("version") or ""),
    ]
    raw = "_".join(part for part in raw_parts if part)
    sanitized = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("._-")
    return f"{index + 1:03d}_{sanitized or 'dataset'}"


async def _prepare_role_based_dataset_items_for_mixing(
    *,
    jfs,
    dataset_items: list,
    mixed_dataset_root: str,
    images_artifact: TrainingDatasetMountArtifact,
    source_artifact: TrainingDatasetMountArtifact,
    task: TaskBase,
    dataset_label: str,
) -> tuple[list, bool]:
    """为每个源数据集生成独立代理文件，保留图片来源以支持多数据集横向扩展。"""
    prepared_items = []
    has_images = False

    def _write_proxy_dataset(source_path: str, proxy_path: str, images_dir_name: str) -> bool:
        with jfs.open(source_path, "r", encoding="utf-8") as f:
            records = _parse_dataset_records(f.read())

        rewritten = False
        for record in records:
            if isinstance(record, (dict, list)):
                rewritten = _rewrite_images_fields(record, images_dir_name) or rewritten

        proxy_parent = os.path.dirname(proxy_path)
        if proxy_parent and not jfs.exists(proxy_parent):
            jfs.makedirs(proxy_parent, exist_ok=True)
        with jfs.open(proxy_path, "w", encoding="utf-8") as f:
            for record in records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            _flush_and_truncate(f)
        return rewritten

    for index, item in enumerate(dataset_items):
        ds_path = item.get("dataset_path")
        if not ds_path:
            task._log_warning(f"{dataset_label}数据集项缺少 dataset_path，跳过代理数据集生成: {item.get('name')}")
            prepared_items.append(item)
            continue

        artifact_key = _dataset_artifact_key(item, index)
        images_dir_name = f"{images_artifact.value}/{artifact_key}"
        proxy_dataset_path = f"{mixed_dataset_root}/{source_artifact.value}/{artifact_key}.jsonl"

        src_images = os.path.join(os.path.dirname(ds_path), "images").replace("\\", "/")
        if jfs.exists(src_images):
            target_images_dir = f"{mixed_dataset_root}/{images_dir_name}"
            task._log_info(
                f"复制{dataset_label}数据集 images 目录至任务目录: {src_images} -> {target_images_dir} "
                f"(数据集: {item.get('name')})"
            )
            await _merge_copy_jfs_images_dir(jfs, src_images, target_images_dir, task)
            has_images = True
        else:
            task._log_info(f"{dataset_label}数据集无 images 目录，跳过: {src_images}")

        try:
            images_rewritten = await asyncio.to_thread(
                _write_proxy_dataset,
                ds_path,
                proxy_dataset_path,
                images_dir_name,
            )
            has_images = has_images or images_rewritten
            prepared_item = dict(item)
            prepared_item["dataset_path"] = proxy_dataset_path
            prepared_items.append(prepared_item)
        except Exception as e:
            task._log_warning(f"{dataset_label}数据集代理文件生成失败，使用原始文件: {ds_path}, {e}")
            prepared_items.append(item)

    return prepared_items, has_images


async def _rewrite_jfs_dataset_images(
    jfs,
    dataset_file_path: str,
    images_dir_name: str,
    task: TaskBase,
) -> bool:
    """重写混合后数据集文件里的 images 字段，返回是否发生改写。"""
    if not jfs.exists(dataset_file_path):
        task._log_warning(f"数据集文件不存在，跳过 images 字段改写: {dataset_file_path}")
        return False

    def _sync_rewrite() -> bool:
        with jfs.open(dataset_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        if not str(content).strip():
            return False

        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            payload = [json.loads(line) for line in str(content).splitlines() if line.strip()]

        rewritten = _rewrite_images_fields(payload, images_dir_name)
        if not rewritten:
            return False

        with jfs.open(dataset_file_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(payload, indent=2, ensure_ascii=False))
            _flush_and_truncate(f)
        return True

    return await asyncio.to_thread(_sync_rewrite)


async def _ensure_mixed_dataset_file_exists(
    *,
    jfs,
    dataset_items: list,
    output_path: str,
    task: TaskBase,
    dataset_label: str,
) -> None:
    """单测或异常存储实现未落盘时，用源数据集补齐混合结果文件。"""
    if jfs.exists(output_path):
        return

    def _sync_create() -> None:
        samples = []
        for item in dataset_items:
            dataset_path = item.get("dataset_path")
            if not dataset_path or not jfs.exists(dataset_path):
                task._log_warning(f"{dataset_label}数据集文件不存在，无法补齐混合结果: {dataset_path}")
                continue
            with jfs.open(dataset_path, "r", encoding="utf-8") as f:
                content = f.read()
            if not str(content).strip():
                continue
            try:
                payload = json.loads(content)
                if isinstance(payload, list):
                    samples.extend(payload)
                else:
                    samples.append(payload)
            except json.JSONDecodeError:
                samples.extend(json.loads(line) for line in str(content).splitlines() if line.strip())

        with jfs.open(output_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(samples, indent=2, ensure_ascii=False))
            _flush_and_truncate(f)

    await asyncio.to_thread(_sync_create)


async def _normalize_jfs_dataset_file_to_jsonl(jfs, dataset_file_path: str) -> None:
    """确保 .jsonl 文件内容为一行一个 JSON 样本。"""
    if not jfs.exists(dataset_file_path):
        return

    def _sync_normalize() -> None:
        with jfs.open(dataset_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        records = _parse_dataset_records(content)
        with jfs.open(dataset_file_path, "w", encoding="utf-8") as f:
            for record in records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            _flush_and_truncate(f)

    await asyncio.to_thread(_sync_normalize)


async def _copy_dataset_images_to_artifact_dir(
    *,
    jfs,
    dataset_items: list,
    target_images_dir: str,
    task: TaskBase,
    dataset_label: str,
) -> bool:
    copied = False
    for item in dataset_items:
        ds_path = item.get("dataset_path")
        if not ds_path:
            task._log_warning(f"{dataset_label}数据集项缺少 dataset_path，跳过 images 复制: {item.get('name')}")
            continue
        src_images = os.path.join(os.path.dirname(ds_path), "images").replace("\\", "/")
        if jfs.exists(src_images):
            task._log_info(
                f"复制{dataset_label}数据集 images 目录至任务目录: {src_images} -> {target_images_dir} "
                f"(数据集: {item.get('name')})"
            )
            await _merge_copy_jfs_images_dir(jfs, src_images, target_images_dir, task)
            copied = True
        else:
            task._log_info(f"{dataset_label}数据集无 images 目录，跳过: {src_images}")
    return copied


def _with_images_column(dataset_info_entry: dict) -> dict:
    columns = dataset_info_entry.setdefault("columns", {})
    columns["images"] = "images"
    return dataset_info_entry


async def _update_eval_dataset_info_for_images(
    *,
    jfs,
    dataset_info_path: str,
    has_eval_images: bool,
    task: TaskBase,
) -> None:
    if not jfs.exists(dataset_info_path):
        task._log_warning(f"dataset_info.json 不存在，跳过验证集 images 列更新: {dataset_info_path}")
        return

    def _sync_update() -> None:
        with jfs.open(dataset_info_path, "r", encoding="utf-8") as f:
            dataset_info = json.loads(f.read())
        eval_dataset_name = LlamaFactoryDatasetName.EVAL.value
        if has_eval_images and eval_dataset_name in dataset_info:
            _with_images_column(dataset_info[eval_dataset_name])
        with jfs.open(dataset_info_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(dataset_info, indent=2, ensure_ascii=False))
            _flush_and_truncate(f)

    await asyncio.to_thread(_sync_update)


# def cleanup_task_logger(task: TaskBase) -> None:
#     if task.task_logger:
#         try:
#             task.task_logger.cleanup()
#         except Exception as e:
#             task._log_warning(f"清理任务日志记录器失败: {e}")

async def generate_training_dataset(
    task: TaskBase,
    dataset_items: list,
    namespace: str,
    task_id: int,
    dataset_format: Optional[str] = None,
    training_method_type: Optional[str] = None,
    train_type_category: Optional[str] = None,
    storage_service: DefaultStorageService = None,
) -> str:
    """生成训练数据集并返回路径"""
    try:
        mixed_dataset_path = StoragePath.REAL_TRAINING_DATASETS.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        mixed_dataset_root = mixed_dataset_path.rstrip("/")

        # 获取 JuiceFS 客户端
        if storage_service is None:
            storage_service = get_storage_service()
        jfs = await storage_service.JUICEFS_CLIENT()

        await _clear_training_dataset_dir(
            task,
            namespace=namespace,
            task_id=task_id,
            storage_service=storage_service,
            jfs=jfs,
        )
        mixed_dataset_file_path = f"{mixed_dataset_root}/{TrainingDatasetMountArtifact.TRAIN_DATASET_FILE.value}"
        task._log_info(f"混合数据集存储路径: {mixed_dataset_file_path}")
        
        # 确保目录存在
        import os
        remote_dir = os.path.dirname(mixed_dataset_file_path)
        if remote_dir:
            if not jfs.exists(remote_dir):
                task._log_info(f"远程数据集目录不存在，正在创建: {remote_dir}")
                jfs.makedirs(remote_dir, exist_ok=True)
                task._log_info(f"远程数据集目录创建成功: {remote_dir}")
            else:
                task._log_info(f"远程数据集目录已存在: {remote_dir}")

        dataset_format_value = _enum_value(dataset_format)
        training_method_value = _enum_value(training_method_type)
        train_type_category_value = _enum_value(train_type_category)
        is_dpo = training_method_value == "dpo"
        is_images_exited = False
        dataset_items_for_mixing = dataset_items
        if dataset_format_value == DatasetFormat.ROLE_BASED.value:
            dataset_items_for_mixing, is_images_exited = await _prepare_role_based_dataset_items_for_mixing(
                jfs=jfs,
                dataset_items=dataset_items,
                mixed_dataset_root=mixed_dataset_root,
                images_artifact=TrainingDatasetMountArtifact.TRAIN_IMAGES_DIR,
                source_artifact=TrainingDatasetMountArtifact.TRAIN_SOURCE_DATASETS_DIR,
                task=task,
                dataset_label="训练",
            )

        dataset_items_dict = [
            {
                "name": item["name"],
                "version": item["version"],
                "dataset_path": item["dataset_path"],
                "sample_count": item["sample_count"],
                "sampling_rate": item["sampling_rate"]
            }
            for item in dataset_items_for_mixing
        ]

        training_dataset_path = create_mixed_dataset(
            jfs_client=jfs,
            dataset_items=dataset_items_dict,
            output_path=mixed_dataset_file_path
        )
        await _ensure_mixed_dataset_file_exists(
            jfs=jfs,
            dataset_items=dataset_items_for_mixing,
            output_path=mixed_dataset_file_path,
            task=task,
            dataset_label="训练",
        )
        await _normalize_jfs_dataset_file_to_jsonl(jfs, mixed_dataset_file_path)

        await _remove_dataset_artifact_dir(
            jfs=jfs,
            mixed_dataset_root=mixed_dataset_root,
            artifact=TrainingDatasetMountArtifact.TRAIN_SOURCE_DATASETS_DIR,
            task=task,
        )

        # 创建数据集信息文件
        dataset_info_path = f"{mixed_dataset_root}/dataset_info.json"

        if dataset_format_value == DatasetFormat.ROLE_BASED.value:
            is_images_exited = is_images_exited or train_type_category_value in {
                "image-understanding",
                "multimodal",
            }
            dataset_columns = {
                "messages": "messages"
            }
            if is_dpo:
                dataset_columns["chosen"] = "chosen"
                dataset_columns["rejected"] = "rejected"
            if is_images_exited:
                dataset_columns["images"] = "images"
            dataset_info = {
                LlamaFactoryDatasetName.TRAIN.value: {
                    "file_name": TrainingDatasetMountArtifact.TRAIN_DATASET_FILE.value,
                    "formatting": "openai" if is_dpo else "sharegpt",
                    "columns": dataset_columns,
                    **({"ranking": True} if is_dpo else {}),
                    "tags": {
                        "role_tag": "role",
                        "content_tag": "content",
                        "user_tag": "user",
                        "assistant_tag": "assistant",
                        "system_tag": "system"
                    }
                },
                LlamaFactoryDatasetName.EVAL.value: {
                    "file_name": TrainingDatasetMountArtifact.EVAL_DATASET_FILE.value,
                    "formatting": "openai" if is_dpo else "sharegpt",
                    "columns": dataset_columns,
                    **({"ranking": True} if is_dpo else {}),
                    "tags": {
                        "role_tag": "role",
                        "content_tag": "content",
                        "user_tag": "user",
                        "assistant_tag": "assistant",
                        "system_tag": "system"
                    }
                }
            }
        elif dataset_format_value == DatasetFormat.ALPACA.value:
            dataset_info = {
                LlamaFactoryDatasetName.TRAIN.value: {
                    "file_name": TrainingDatasetMountArtifact.TRAIN_DATASET_FILE.value,
                    "ranking": True,
                    "columns": {
                        "prompt": "instruction",
                        "query": "input",
                        "chosen": "chosen",
                        "rejected": "rejected"
                    }
                },
                LlamaFactoryDatasetName.EVAL.value: {
                    "file_name": TrainingDatasetMountArtifact.EVAL_DATASET_FILE.value,
                    "ranking": True,
                    "columns": {
                        "prompt": "instruction",
                        "query": "input",
                        "chosen": "chosen",
                        "rejected": "rejected"
                    }
                }
            }
        elif dataset_format_value == DatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
            dataset_info = {
                LlamaFactoryDatasetName.TRAIN.value: {
                    "file_name": TrainingDatasetMountArtifact.TRAIN_DATASET_FILE.value,
                    "columns": {
                        "prefix": "prefix",
                        "suffix": "suffix",
                        "middle": "middle"
                    }
                },
                LlamaFactoryDatasetName.EVAL.value: {
                    "file_name": TrainingDatasetMountArtifact.EVAL_DATASET_FILE.value,
                    "columns": {
                        "prefix": "prefix",
                        "suffix": "suffix",
                        "middle": "middle"
                    }
                }
            }
        else:
            if dataset_format_value and dataset_format_value not in (
                DatasetFormat.PROMPT_RESPONSE.value,
                DatasetFormat.ALPACA.value,
                DatasetFormat.BUSINESS.value
            ):
                task._log_warning(f"不支持的数据集格式: {dataset_format_value}，将默认使用 prompt-response")
            dataset_info = {
                LlamaFactoryDatasetName.TRAIN.value: {
                    "file_name": TrainingDatasetMountArtifact.TRAIN_DATASET_FILE.value,
                    "columns": {
                        "prompt": "prompt",
                        "response": "response",
                        "system": "system"
                    },
                },
                LlamaFactoryDatasetName.EVAL.value: {
                    "file_name": TrainingDatasetMountArtifact.EVAL_DATASET_FILE.value,
                    "columns": {
                        "prompt": "prompt",
                        "response": "response",
                        "system": "system"
                    },
                }
            }

        with jfs.open(dataset_info_path, 'w') as f:
            f.write(json.dumps(dataset_info, indent=2, ensure_ascii=False))
            _flush_and_truncate(f)
        task._log_info(f"数据集信息文件已创建（包含验证数据集配置）: {dataset_info_path}")

        # 获取provider_type
        provider_type = settings.PROVIDER_TYPE
        if provider_type == 'belle':
            # 生成本地临时zip文件
            json_filename = os.path.basename(dataset_info_path)
            zip_dir_path = os.path.dirname(dataset_info_path)
            json_content = json.dumps(dataset_info, indent=2, ensure_ascii=False)
            append_json_str_to_tmp_zip(json_content, zip_dir_path, json_filename)
            if dataset_format_value == DatasetFormat.ROLE_BASED.value and is_images_exited:
                task_train_images_dir = f"{mixed_dataset_path}{TrainingDatasetMountArtifact.TRAIN_IMAGES_DIR.value}"
                append_jfs_dir_to_tmp_zip(jfs, task_train_images_dir, zip_dir_path, TrainingDatasetMountArtifact.TRAIN_IMAGES_DIR.value)

        return training_dataset_path
    except Exception as e:
        task._log_error(f"生成训练数据集失败: {str(e)}", error=e)
        raise

async def generate_evaluation_dataset(
    task: TaskBase,
    *,
    eval_dataset_items: list,
    namespace: str,
    task_id: int,
    dataset_format: Optional[str] = None,
    train_type_category: Optional[str] = None,
    storage_service: DefaultStorageService = None,
) -> str:
    """生成验证数据集并返回路径"""
    try:
        mixed_dataset_path = StoragePath.REAL_TRAINING_DATASETS.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        mixed_dataset_root = mixed_dataset_path.rstrip("/")
        mixed_dataset_file_path = f"{mixed_dataset_root}/{TrainingDatasetMountArtifact.EVAL_DATASET_FILE.value}"
        task._log_info(f"混合验证数据集存储路径: {mixed_dataset_file_path}")

        # 获取 JuiceFS 客户端
        if storage_service is None:
            storage_service = get_storage_service()
        jfs = await storage_service.JUICEFS_CLIENT()
        
        # 确保目录存在
        import os
        remote_dir = os.path.dirname(mixed_dataset_file_path)
        if remote_dir:
            if not jfs.exists(remote_dir):
                task._log_info(f"远程验证数据集目录不存在，正在创建: {remote_dir}")
                jfs.makedirs(remote_dir, exist_ok=True)
                task._log_info(f"远程验证数据集目录创建成功: {remote_dir}")
            else:
                task._log_info(f"远程验证数据集目录已存在: {remote_dir}")

        dataset_format_value = _enum_value(dataset_format)
        train_type_category_value = _enum_value(train_type_category)
        has_eval_images = False
        eval_dataset_items_for_mixing = eval_dataset_items
        if dataset_format_value == DatasetFormat.ROLE_BASED.value:
            eval_dataset_items_for_mixing, has_eval_images = await _prepare_role_based_dataset_items_for_mixing(
                jfs=jfs,
                dataset_items=eval_dataset_items,
                mixed_dataset_root=mixed_dataset_root,
                images_artifact=TrainingDatasetMountArtifact.EVAL_IMAGES_DIR,
                source_artifact=TrainingDatasetMountArtifact.EVAL_SOURCE_DATASETS_DIR,
                task=task,
                dataset_label="验证",
            )

        dataset_items_dict = [
            {
                "name": item["name"],
                "version": item["version"],
                "dataset_path": item["dataset_path"],
                "sample_count": item["sample_count"],
                "sampling_rate": item["sampling_rate"]
            }
            for item in eval_dataset_items_for_mixing
        ]

        evaluation_dataset_path = create_mixed_dataset(
            jfs_client=jfs,
            dataset_items=dataset_items_dict,
            output_path=mixed_dataset_file_path
        )
        await _ensure_mixed_dataset_file_exists(
            jfs=jfs,
            dataset_items=eval_dataset_items_for_mixing,
            output_path=mixed_dataset_file_path,
            task=task,
            dataset_label="验证",
        )
        await _normalize_jfs_dataset_file_to_jsonl(jfs, mixed_dataset_file_path)
        await _remove_dataset_artifact_dir(
            jfs=jfs,
            mixed_dataset_root=mixed_dataset_root,
            artifact=TrainingDatasetMountArtifact.EVAL_SOURCE_DATASETS_DIR,
            task=task,
        )

        if dataset_format_value == DatasetFormat.ROLE_BASED.value:
            has_eval_images = has_eval_images or train_type_category_value in {
                "image-understanding",
                "multimodal",
            }

            await _update_eval_dataset_info_for_images(
                jfs=jfs,
                dataset_info_path=f"{mixed_dataset_root}/dataset_info.json",
                has_eval_images=has_eval_images,
                task=task,
            )

        # 获取provider_type
        provider_type = settings.PROVIDER_TYPE
        if provider_type == 'belle':
            # 生成本地临时zip文件
            if dataset_format_value == DatasetFormat.ROLE_BASED.value and has_eval_images:
                task_eval_images_dir = f"{mixed_dataset_path}{TrainingDatasetMountArtifact.EVAL_IMAGES_DIR.value}"
                append_jfs_dir_to_tmp_zip(jfs, task_eval_images_dir, mixed_dataset_root,
                                          TrainingDatasetMountArtifact.EVAL_IMAGES_DIR.value)

        task._log_info(
            f"验证数据集生成成功: {evaluation_dataset_path}, "
            f"逻辑数据集名: {LlamaFactoryDatasetName.EVAL.value}"
        )
        return LlamaFactoryDatasetName.EVAL.value
        
    except Exception as e:
        task._log_error(f"生成验证数据集失败: {str(e)}", error=e)
        raise

async def store_training_config_for_task(task: TaskBase, *, task_data: dict, namespace: str, task_id: int, storage_service: DefaultStorageService) -> str:
    """为训练任务生成并存储训练配置，返回配置路径"""
    try:
        # 获取JuiceFS客户端
        jfs_client = await storage_service.JUICEFS_CLIENT()
        
        config_path = store_training_config(
            task=TrainingTaskCreate(**task_data),
            namespace=namespace,
            task_id=task_id,
            jfs_client=jfs_client
        )
        return config_path
    except Exception as e:
        task._log_error(f"存储训练配置失败: {str(e)}", error=e)
        raise


def _apply_deepspeed_runtime_env(env_vars: dict[str, str], deepspeed_enabled: bool) -> dict[str, str]:
    """开启 DeepSpeed 时补充运行时环境变量。"""
    if deepspeed_enabled:
        env_vars["FORCE_TORCHRUN"] = "1"
    return env_vars


def _append_belle_env_var(env_variables: list[dict[str, str]], *, key: str, value: str) -> None:
    """追加百丽训练环境变量，若已存在则覆盖。"""
    for item in env_variables:
        if item.get("var_key") == key:
            item["var_value"] = value
            return
    env_variables.append({"var_key": key, "var_value": value})

async def update_training_task_status(task: TaskBase, *, task_id: int, status: TaskStatus) -> None:
    """更新训练任务状态到数据库（仅更新状态）"""
    from app.database.base import get_db_session
    try:
        async with get_db_session() as db:
            # 使用异步查询
            result = await db.execute(
                select(TrainingTask).filter(TrainingTask.id == task_id)
            )
            training_task = result.scalar_one_or_none()
            
            if training_task:
                training_task.status = status
                await db.commit()
                task._log_info(f"训练任务状态已更新为: {status}")
            else:
                task._log_warning(f"未找到训练任务: {task_id}")
    except Exception as e:
        task._log_error(f"更新训练任务状态失败: {str(e)}", error=e)

@celery_app.task(base=TaskBase, bind=True)
def create_training_task_async(self: TaskBase, task_id: int, namespace: str, task_data: dict, tenant_id: str = None):
    """
    异步创建训练任务（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        task_id: 训练任务ID
        namespace: 项目命名空间
        task_data: 训练任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    return run_async_in_celery(
        _create_training_task_async_impl(self, task_id, namespace, task_data, tenant_id)
    )


async def _create_training_task_async_impl(self: TaskBase, task_id: int, namespace: str, task_data: dict, tenant_id: str = None):
    """
    异步创建训练任务的实现函数
    
    Args:
        task_id: 训练任务ID
        namespace: 项目命名空间
        task_data: 训练任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    try:
        # 设置租户ID到上下文（Celery worker 进程需要）
        if tenant_id:
            from app.utils.app_runtime_context import set_tenant_id
            set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")
        
        # 设置任务信息
        self.task_id = task_id
        # 动态任务名：包含训练名称、版本号与任务ID，必要时包含Celery任务ID
        training_name = (task_data.get('name') if isinstance(task_data, dict) else None) or str(task_id)
        version = (task_data.get('version') if isinstance(task_data, dict) else None) or "v1"
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"create_training_task:{training_name}:{version}:{task_id}" + (f":{celery_id}" if celery_id else "")
        self.task_type = "training"
        
        # 初始化任务日志
        init_task_logger(self)
        
        self._log_start("开始异步创建训练任务")
        self._log_info(f"任务ID: {task_id}, 命名空间: {namespace}, 版本: {version}", task_name=self.task_name)
        
        # 1. 更新任务状态为PENDING
        await update_training_task_status(self, task_id=task_id, status=TaskStatus.PENDING)
        self._log_info("任务状态已更新为PENDING")
        
        # 获取存储服务实例（在 Celery worker 中使用）
        storage_service = get_storage_service()
        
        # 2. 生成训练数据集
        self._log_info("开始生成训练数据集...")
        dataset_format = _resolve_training_dataset_format(
            self,
            project_id=task_data.get('project_id'),
            dataset_items=task_data.get('dataset_items', [])
        )

        training_dataset_path = await generate_training_dataset(
            self,
            dataset_items=task_data['dataset_items'],
            namespace=namespace,
            task_id=task_id,
            dataset_format=dataset_format,
            training_method_type=task_data.get('training_type', {}).get('train_method_type'),
            train_type_category=task_data.get('training_type', {}).get('train_type_category'),
            storage_service=storage_service
        )
        self._log_info(f"训练数据集生成完成: {training_dataset_path}")
        
        # 2.5. 生成验证数据集（如果需要独立验证数据集）
        evaluation_dataset_path = None
        eval_config = task_data.get('evaluation', {})
        eval_dataset_items = task_data.get('eval_dataset_items', [])
        is_eval = False
        # 检查是否使用独立验证数据集且有验证数据集项目
        if not eval_config.get('eval_use_split', False) and eval_dataset_items:
            self._log_info("开始生成验证数据集...")
            evaluation_dataset_path = await generate_evaluation_dataset(
                self,
                eval_dataset_items=eval_dataset_items,
                namespace=namespace,
                task_id=task_id,
                dataset_format=dataset_format,
                train_type_category=task_data.get('training_type', {}).get('train_type_category'),
                storage_service=storage_service
            )
            is_eval = True
            self._log_info(f"验证数据集生成完成: {evaluation_dataset_path}")
        else:
            self._log_info("使用训练数据集分割方式进行验证，跳过独立验证数据集生成")
        

        # 3. 生成训练配置并存储
        self._log_info("开始生成训练配置...")
        config_path = await store_training_config_for_task(
            self,
            task_data=task_data,
            namespace=namespace,
            task_id=task_id,
            storage_service=storage_service
        )
        self._log_info(f"训练配置已生成并存储: {config_path}")

        # 获取provider_type
        provider_type = settings.PROVIDER_TYPE
        # TODO belle实现，
        if provider_type == 'belle':
            await _create_belle_training_task_async_impl(
                self = self,
                task_id=task_id,
                namespace=namespace,
                task=TrainingTaskCreate(**task_data),
                tenant_id=tenant_id,
                is_eval=is_eval)
        else:
            # 4. 启动训练进程（这里可以扩展）
            self._log_info("准备启动训练进程...")
            # 在当前异步任务内同步启动训练流程
            # 根据task_data中的mock参数选择调用不同的接口
            mock_mode = task_data.get('mock', False)

            training_job_id = await start_training_impl(
                config_path=config_path,
                task_id=task_id,
                namespace=namespace,
                mock=mock_mode,
                storage_service=storage_service
            )
            mode_text = "Mock" if mock_mode else "实际"
            self._log_info(f"{mode_text}训练进程已启动，job_id={training_job_id}")
        
        # 5. 更新任务状态为RUNNING
        # update_training_task_status(self, task_id=task_id, status=TrainingTaskStatus.COMPLETED)
        # self._log_info("任务状态已更新为RUNNING")
        
        self._log_info("训练任务创建完成")
        return {
            "status": "success",
            "task_id": task_id,
            "dataset_path": training_dataset_path,
            "config_path": config_path
        }
        
    except TaskRevokedError:
        self._log_warning("训练任务创建被取消")
        await update_training_task_status(self, task_id=task_id, status=TaskStatus.CANCELLED)
        raise
        
    except Exception as e:
        self._log_error(f"训练任务创建失败: {str(e)}", error=e)
        await update_training_task_status(self, task_id=task_id, status=TaskStatus.FAILED)
        raise
    
    # finally:
    #     # 清理资源
    #     # cleanup_task_logger(self)

async def start_training_job_mock(*, config_path: str, task_id: int, namespace: str, storage_service: DefaultStorageService = None) -> str:
    """
    Mock训练作业，在存储上生成检查点文件夹和文件，不实际调用K8s。
    
    参数:
        config_path: 训练配置在存储中的路径（已由上游生成存储）
        task_id: 训练任务ID
        namespace: 项目命名空间（用于构造挂载子路径）
        storage_service: 存储服务实例（可选，如果不提供则自动创建）
    """
    import time
    from app.core.logging import logger
    
    # 查询训练任务，获取名称
    with SessionLocal() as db:
        training_task: Optional[TrainingTask] = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
        if training_task is None:
            raise RuntimeError(f"训练任务不存在: {task_id}")
        training_name_base = training_task.name or str(task_id)
        version = getattr(training_task, 'version', 'v1') or 'v1'
        training_name = f"{training_name_base}_{version}"
    
    # 获取JuiceFS客户端
    if storage_service is None:
        storage_service = get_storage_service()
    jfs = await storage_service.JUICEFS_CLIENT()
    
    # 使用UNREGISTERED_TRAINED_MODELS路径作为基础路径
    base_model_path = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
        namespace=namespace,
        task_id=task_id
    )
    
    # 模拟训练过程，生成多个检查点
    checkpoint_dirs = ["checkpoint-100", "checkpoint-200", "checkpoint-300", "checkpoint-400", "checkpoint-500"]
    
    for checkpoint_dir in checkpoint_dirs:
        checkpoint_path = f"{base_model_path}/{checkpoint_dir}"
        
        # 创建检查点目录
        jfs.makedirs(checkpoint_path, exist_ok=True)
        
        # 在每个检查点目录中生成一些文件
        files_to_create = [
            ("config.json", '{"model_type": "llama", "vocab_size": 32000}'),
            ("pytorch_model.bin.index.json", '{"weight_map": {"model.embed_tokens.weight": "pytorch_model-00001-of-00002.bin"}}'),
            ("training_args.bin", "mock_training_args_binary_data"),
            ("trainer_state.json", f'{{"epoch": {checkpoint_dir.split("-")[1]}, "global_step": {checkpoint_dir.split("-")[1]}, "log_history": []}}'),
        ]
        
        for filename, content in files_to_create:
            file_path = f"{checkpoint_path}/{filename}"
            with jfs.open(file_path, 'w') as f:
                f.write(content)
    
    # 生成最终模型文件（直接使用base_model_path）
    final_model_path = base_model_path
    jfs.makedirs(final_model_path, exist_ok=True)
    
    final_files = [
        ("config.json", '{"model_type": "llama", "vocab_size": 32000, "fine_tuned": true}'),
        ("pytorch_model.bin", "mock_final_model_binary_data"),
        ("tokenizer.json", '{"version": "1.0", "truncation": null, "padding": null}'),
        ("tokenizer_config.json", '{"tokenizer_class": "LlamaTokenizer"}'),
        ("special_tokens_map.json", '{"bos_token": "<s>", "eos_token": "</s>", "unk_token": "<unk>"}'),
    ]
    
    for filename, content in final_files:
        file_path = f"{final_model_path}/{filename}"
        with jfs.open(file_path, 'w') as f:
            f.write(content)
    
    # 生成训练日志
    log_path = f"{base_model_path}/logs"
    jfs.makedirs(log_path, exist_ok=True)
    
    log_content = f"""训练开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}
命名空间: {namespace}
任务ID: {task_id}
配置文件: {config_path}

Step 100: loss=2.345, lr=1e-4
Step 200: loss=1.987, lr=8e-5
Step 300: loss=1.654, lr=6e-5
Step 400: loss=1.432, lr=4e-5
Step 500: loss=1.287, lr=2e-5

训练完成！最终loss: 1.287
"""
    
    with jfs.open(f"{log_path}/training.log", 'w') as f:
        f.write(log_content)
    
    # 返回mock的job名称
    mock_job_name = f"mock-train-{task_id}"
    return mock_job_name

async def start_training_impl(*, config_path: str, task_id: int, namespace: str, mock: bool = False, storage_service: DefaultStorageService = None) -> str:
    """
    启动训练任务，返回Job名称。

    参数:
        config_path: 训练配置在存储中的路径（已由上游生成存储）
        task_id: 训练任务ID
        namespace: 项目命名空间（用于构造挂载子路径）
        mock: 是否使用Mock模式，True时使用start_training_job_mock，False时使用start_training_job_impl
        storage_service: 存储服务实例（可选，如果不提供则自动创建）
    """
    # 根据mock参数选择调用不同的接口
    if mock:
        return await start_training_job_mock(config_path=config_path, task_id=task_id, namespace=namespace, storage_service=storage_service)
    else:
        # start_training_job_impl 现在是异步函数，使用 await
        return await start_training_job_impl(task_id=task_id, namespace=namespace)


async def start_training_job_impl(*, task_id: int, namespace: str) -> str:
    """
    使用Kubernetes Job启动训练任务，返回Job名称。
    
    参数:
        task_id: 训练任务ID
        namespace: 项目命名空间（用于构造挂载子路径）
    
    返回:
        Job名称
    """
    # from app.utils.k8s_utils import build_secret_storage_url
    from app.core.config import settings
    from app.core.logging import logger
    
    # 查询训练任务，获取GPU资源配置和项目ID
    from app.schemas.resource_config import GraphicsCardResourceConfig
    from app.schemas.repository_image import CardType, CardModel
    
    with SessionLocal() as db:
        training_task: Optional[TrainingTask] = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
        if training_task is None:
            raise RuntimeError(f"训练任务不存在: {task_id}")
        project_id = training_task.project_id
        # 从数据库读取 graphics_card_resource，如果没有则从 gpu_count 构建（向后兼容）
        if training_task.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**training_task.graphics_card_resource)
        else:
            # 向后兼容：从 gpu_count 和环境变量构建
            logger.warning(
                f"训练任务 {training_task.name} (ID: {task_id}) 使用向后兼容逻辑："
                f"从 gpu_count={training_task.gpu_count} 构建 GraphicsCardResourceConfig，"
                f"建议更新数据库中的 graphics_card_resource 字段以包含完整的资源配置信息"
            )
            graphics_card_resource = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=int(getattr(training_task, "gpu_count", 0) or 0),
                card_memory=None,
                k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
            )
        lab_k8s_uuid = training_task.lab_k8s_uuid
        task_name = training_task.name
        tenant_id = training_task.tenant_id  # 获取租户ID
        # 查询项目名称
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise RuntimeError(f"项目不存在: {project_id}")
        project_name = project.former_name
        
        # 查询集群 kubeconfig 与命名空间
        stmt = (
            select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        row = db.execute(stmt).first()
        if not row:
            raise RuntimeError(f"未绑定K8s集群或命名空间: project_id={project_id}")
        kubeconfig_str, namespace = row[0], row[1]
        
        # 查找镜像逻辑
        card_type_str = (
            graphics_card_resource.card_type.value
            if isinstance(graphics_card_resource.card_type, Enum)
            else graphics_card_resource.card_type
        )
        card_model_str = (
            graphics_card_resource.card_model.value
            if isinstance(graphics_card_resource.card_model, Enum)
            else graphics_card_resource.card_model
        )
        image = await find_image(project_id, card_type_str, card_model_str)
    
    # 初始化 K8s 启动器
    launcher = K8sLauncher(config_str=kubeconfig_str)
    
    # 构建卷与挂载（参考notebook的存储配置）
    storage_items = [
        {"name": "llm-training-pvc", "enum": StoragePath.REAL_TRAINING_DATASETS},
        {"name": "public-pvc", "enum": StoragePath.BASE_MODELS},
        {"name": "llm-training-pvc", "enum": StoragePath.UNREGISTERED_TRAINED_MODELS},
        {"name": "llm-training-pvc", "enum": StoragePath.TRAINING_CONFIGS},
    ]
    volume_mounts, volumes = await launcher.build_storage_volumes(
        storage_items,
        namespace=namespace,
        task_id=task_id,
    )
    
    # 环境变量（用于日志记录和调试）
    deepspeed_enabled = isinstance(getattr(training_task, "advanced", None), dict) and bool(training_task.advanced.get("deepspeed"))

    env_vars = {
        "TASK_ID": str(task_id),  # 用于日志记录和调试
        "MLFLOW_TRACKING_URI": settings.MLFLOW_TRACKING_URI,  # MLflow跟踪服务器地址
        "MLFLOW_EXPERIMENT_NAME": settings.get_mlflow_experiment_name(project_name, task_name, tenant_id),  # 实验名称（包含租户ID）
    }
    env_vars = _apply_deepspeed_runtime_env(env_vars, deepspeed_enabled)
    
    # GPU设置（使用新的资源配置模型）
    gpu_type_final = graphics_card_resource.get_k8s_gpu_type()
    gpu_count_str = graphics_card_resource.get_k8s_gpu_count()
    
    # 构建节点亲和性
    affinity = build_node_affinity(
        card_model=graphics_card_resource.card_model,
        card_memory=graphics_card_resource.card_memory
    )
    
    # 创建训练Job
    job_name = f"training-{task_id}"
    result = await launcher.create_job(
        namespace=namespace,
        job_name=job_name,
        image=image,
        service_type="training",
        command=["llamafactory-cli"],  # 启动llamafactory训练
        args=["train", "configs/training_config.yaml"],  # 训练配置文件
        cpu_limit=None,       # 不设置CPU限制，按需使用
        memory_limit=None,    # 不设置内存限制，按需使用
        cpu_request=None,     # 不设置CPU请求
        memory_request=None,  # 不设置内存请求
        gpu_type=gpu_type_final,
        gpu_count=gpu_count_str,
        env_vars=env_vars,
        volume_mounts=volume_mounts,
        volumes=volumes,
        working_dir="/data",  # 训练工作目录
        security_context=None,
        automount_service_account_token=True,
        k8s_uuid=lab_k8s_uuid,
        affinity=affinity
    )
    
    return job_name


async def _create_belle_training_task_async_impl(self: TaskBase, task_id: int, namespace: str, task: TrainingTaskCreate, tenant_id: str = None, is_eval:bool = False, storage_service: DefaultStorageService = None):
    """
        百丽训练实现

        Args:
        task_id: 训练任务ID
        namespace: 项目命名空间
        task_data: 训练任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）

        返回:
            Job名称
        """
    # 1、数据集临时zip上传到jfs，并且生成http访问连接
    mixed_dataset_path = StoragePath.REAL_TRAINING_DATASETS.format_storage_path(
        namespace=namespace,
        task_id=task_id
    )

    # 数据集临时zip上传到jfs
    await belle_dataset_zip_upload(tenant_id, mixed_dataset_path, storage_service)

    download_prefix_path = f'{settings.BACKEND_URL}/api/v1/storage/download/{tenant_id}'
    dataset = {
        "dataset_type": "train",
        "datasets_url": f"{download_prefix_path}{mixed_dataset_path}dataset.zip",
        "file_name": "dataset.zip",  # 打包好的zip
        "file_format": "zip",
        "pod_path": os.path.dirname(StoragePath.REAL_TRAINING_DATASETS.mount_path),
        "type": "dir"
    }
    datasets = [dataset]


    # 2、把jfs上config_files文件config_path，生成http访问连接
    config_path = StoragePath.TRAINING_CONFIGS.format_storage_path(
        namespace=namespace,
        task_id=task_id
    )
    config_files = [
        {
            "config_url": f"{download_prefix_path}{config_path}",
            "file_name": os.path.basename(StoragePath.TRAINING_CONFIGS.mount_path),
            "file_format": "yml",
            "pod_path": os.path.dirname(StoragePath.TRAINING_CONFIGS.mount_path)
        }
    ]
    # 3、base_models
    base_model_path = await find_base_model_path(task.base_model.base_model_id)
    base_models = [
        {
            "model_path": base_model_path,
            "pod_path": f"{StoragePath.BASE_MODELS.mount_path}{task.base_model.model_provider.value}/{task.base_model.base_model_name}",
            "type": "dir"
        }
    ]
    # 4、env_variables
    project_info = await find_project_by_id(task.project_id)
    env_variables= [
        {
            "var_key": "TASK_ID",
            "var_value": str(task_id)
        },
        {
            "var_key": "MLFLOW_TRACKING_URI",
            "var_value": settings.MLFLOW_TRACKING_URI  # MLflow跟踪服务器地址
        },
        {
            "var_key": "MLFLOW_EXPERIMENT_NAME",
            "var_value": settings.get_mlflow_experiment_name(project_info.former_name, task.name, tenant_id)  # 实验名称（包含租户ID）
        }
    ]
    if task.deepspeed is not None:
        _append_belle_env_var(env_variables, key="FORCE_TORCHRUN", value="1")
    # 百丽模型训练env补充配置
    if settings.BELLE_TRAINING_ENV_VARIABLES:
        env_variables.extend(settings.BELLE_TRAINING_ENV_VARIABLES)
    # 5、resource_requirement组装
    resource_requirement = {
        "cpu": task.graphics_card_resource.cpu,
        "gpu_brand": task.graphics_card_resource.card_type,
        "gpu_count": task.graphics_card_resource.count,
        "gpu_memory_per_card": int(re.match(r"\d+", task.graphics_card_resource.card_memory).group()),
        "gpu_model": task.graphics_card_resource.card_model,
        "gpu_usage": "multi_card_single_node" if task.graphics_card_resource.count > 1 else "single_card",  # 如果gpu_count>1，参数gpu_usage=multi_card_single_node
        "memory": task.graphics_card_resource.memory
    }
    # 6、根据选择的resource_requirement，中获取group_id，组装queue_config
    queue_config = {
        "group_id": task.graphics_card_resource.queue_group_id
    }
    # 6、固定的output_config
    output_config={
        "output_dir": os.path.dirname(StoragePath.UNREGISTERED_TRAINED_MODELS.mount_path)  # 固定的
    }
    # 7、总体整理参数
    data = {
        "name": task.name,
        "model_name": f"{task.base_model.base_model_name}_{int(time.time())}",
        "model_type": BelleModelType.TEXT_GENERATION.value,
        "model_version": task.version,
        "docker_image": await find_image(task.project_id, task.graphics_card_resource.card_type,
                                         task.graphics_card_resource.card_model),
        "description": task.description if task.description else task.name,
        "run_command": "llamafactory-cli train /data/configs/training_config.yaml",

        "datasets":datasets,
        "config_files":config_files,
        "base_models":base_models,
        "env_variables":env_variables,
        "output_config": output_config,
        "resource_requirement":resource_requirement,
        "queue_config":queue_config,
        "callback": {},
        "train_script": {},
        "create_user": "system",
    }
    self._log_info(f"belle训练请求参数：{data}")
    # 获取百丽api客户端
    belle_client = await BelleUtil.get_instance_with_token()
    result = await belle_client.create_train_task(data)
    self._log_info(f"百丽创建完成{result}")

    if result:
        await save_belle_training_task_id(self, task_id, str(result.get("id")))

    pass


async def find_base_model_path(base_model_id: int) -> str:
    """获取基础模型path"""
    from app.database.base import get_db_session
    async with get_db_session() as db:
        # 使用异步查询
        result = await db.execute(
            select(BaseModel).filter(BaseModel.id == base_model_id)
        )
        base_model = result.scalar_one_or_none()

        if base_model:
            return base_model.model_path
        else:
            return ""


async def find_project_by_id(project_id: int) -> Project | None:
    """更新训练任务状态到数据库（仅更新状态）"""
    from app.database.base import get_db_session
    async with get_db_session() as db:
        # 使用异步查询
        result = await db.execute(select(Project).filter(Project.id == project_id))
        return result.scalar_one_or_none()


async def find_image(project_id: int, card_type: str, card_model: str) -> str:
    """
    获取训练镜像地址（根据项目ID和资源配置查找）
    
    使用公共的 image_utils 模块，避免代码重复
    """
    from app.schemas.repository_image import ImageType
    from app.tasks.image_utils import find_image_with_fallback
    
    return await find_image_with_fallback(
        project_id=project_id,
        image_type=ImageType.TEXT_GENERATION_SFT.value,
        card_category=card_type,
        card_model=card_model,
        error_message_prefix="未找到匹配的训练镜像"
    )

async def belle_dataset_zip_upload(tenant_id: str, mixed_dataset_path: str, storage_service: DefaultStorageService = None):
    # 获取 JuiceFS 客户端
    if storage_service is None:
        storage_service = get_storage_service()
    jfs = await storage_service.JUICEFS_CLIENT(tenant_id)

    # 临时 zip 文件名（不带目录结构）
    zip_dir_path = f'{mixed_dataset_path}dataset.zip'
    sanitized_dir = f'/tmp/{os.path.dirname(mixed_dataset_path).strip("/").replace("/", "-")}'
    tmp_zip_path = os.path.join(tempfile.gettempdir(), f"{sanitized_dir}-dataset.zip")
    # 上传zip
    if not os.path.exists(tmp_zip_path):
        raise RuntimeError("数据集压缩包不存在...")
    with open(tmp_zip_path, "rb") as f_in, jfs.open(zip_dir_path, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    try:
        # 删除临时文件
        os.remove(tmp_zip_path)
    except Exception as e:
        logger.error(f"删除临时文件失败: {str(e)}", error=e)



async def save_belle_training_task_id(self: TaskBase,task_id: int, belle_task_id: str) -> None:
    """更新训练任务状态到数据库（仅更新状态）"""
    from app.database.base import get_db_session
    try:
        async with get_db_session() as db:
            # 使用异步查询
            await db.execute(
                update(TrainingTask).filter(TrainingTask.id == task_id).values(lab_k8s_uuid=belle_task_id)
            )
            await db.commit()
            self._log_info(f"belle训练任务id已保存为: {belle_task_id}")
    except Exception as e:
        self._log_error(f"更新训练任务状态失败: {str(e)}", error=e)
# def start_training_deployment_impl(*, task_id: int, namespace: str) -> str:
#     """
#     使用Kubernetes Deployment启动训练环境，返回访问URL。
    
#     参数:
#         task_id: 训练任务ID
#         namespace: 项目命名空间（用于构造挂载子路径）
    
#     返回:
#         训练环境的访问URL
#     """
#     from app.utils.k8s_utils import build_secret_storage_url
#     from app.core.config import settings
    
#     # 读取运行时配置（镜像/命令/资源）
#     gpu_type = os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
    
#     # 生成K8s UUID
#     k8s_uuid = str(uuid.uuid4())
    
#     # 查询训练任务，获取GPU数量和项目ID
#     with SessionLocal() as db:
#         training_task: Optional[TrainingTask] = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
#         if training_task is None:
#             raise RuntimeError(f"训练任务不存在: {task_id}")
#         project_id = training_task.project_id
#         gpu_count_val = int(getattr(training_task, "gpu_count", 0) or 0)
#         task_name = training_task.name
        
#         # 查询项目名称
#         project = db.query(Project).filter(Project.id == project_id).first()
#         if not project:
#             raise RuntimeError(f"项目不存在: {project_id}")
#         project_name = project.name
        
#         # 查询集群 kubeconfig 与命名空间
#         stmt = (
#             select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
#             .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
#             .where(ProjectKubernetesRelation.project_id == project_id)
#         )
#         row = db.execute(stmt).first()
#         if not row:
#             raise RuntimeError(f"未绑定K8s集群或命名空间: project_id={project_id}")
#         kubeconfig_str, namespace = row[0], row[1]
        
#         # 获取完整的镜像地址
#         from app.api.repository_image import get_full_image_address_sync
#         image_name = os.getenv("TRAINING_DEPLOYMENT_IMAGE_NAME", "docker-cuda-llamafactory:0825")
#         image = get_full_image_address_sync(db, project_id, "lab", image_name)
    
#     # 初始化 K8s 启动器
#     launcher = K8sLauncher(config_str=kubeconfig_str)
    
#     # 构建卷与挂载（参考notebook的存储配置）
#     storage_items = [
#         {"name": "llm-training-pvc", "enum": StoragePath.REAL_TRAINING_DATASETS},
#         {"name": "public-pvc", "enum": StoragePath.BASE_MODELS},
#         {"name": "llm-training-pvc", "enum": StoragePath.UNREGISTERED_TRAINED_MODELS},
#         {"name": "llm-training-pvc", "enum": StoragePath.TRAINING_CONFIGS},
#     ]
#     volume_mounts, volumes = asyncio.run(
#         launcher.build_storage_volumes(
#             storage_items,
#             namespace=namespace,
#             task_id=task_id,
#         )
#     )
    
#     # 环境变量（用于日志记录和调试）
#     env_vars = {
#         "TASK_ID": str(task_id),  # 用于日志记录和调试
#         "MLFLOW_TRACKING_URI": settings.MLFLOW_TRACKING_URI,  # MLflow跟踪服务器地址
#         "MLFLOW_EXPERIMENT_NAME": settings.get_mlflow_experiment_name(project_name, task_name),  # 实验名称
#     }
    
#     # GPU设置
#     gpu_type_final = gpu_type if gpu_count_val > 0 else None
#     gpu_count_str = str(gpu_count_val) if gpu_count_val > 0 else "0"
    
#     # 解析 kubeconfig 获取服务器地址
#     config_dict = yaml.safe_load(kubeconfig_str)
#     server_url = config_dict["clusters"][0]["cluster"]["server"]
#     parsed = urlparse(server_url)
    
#     # 创建训练deployment
#     instance_name = f"training-{task_id}"
#     result = asyncio.run(
#         launcher.create_app(
#             namespace=namespace,
#             app_name=f"training-{instance_name}",
#             image=image,
#             service_type="training",
#             container_port=9000,  # 使用与notebook相同的端口
#             cpu_limit=None,       # 不设置CPU限制，按需使用
#             memory_limit=None,    # 不设置内存限制，按需使用
#             cpu_request=None,     # 不设置CPU请求
#             memory_request=None,  # 不设置内存请求
#             gpu_type=gpu_type_final,
#             gpu_count=gpu_count_str,
#             env_vars=env_vars,
#             volume_mounts=volume_mounts,
#             volumes=volumes,
#             working_dir="/data",  # 训练工作目录
#             security_context=None,
#             automount_service_account_token=True,
#             k8s_uuid=k8s_uuid,
#                     command=["bash"],  # 启动bash shell
#                     args=["-c", "sleep infinity"]  # 保持容器运行
#         )
#     )
    
#     # 构建访问URL
#     address = asyncio.run(build_secret_storage_url(parsed.hostname))
#     access_url = f"{address}:{result['node_port']}"
    
#     return access_url 

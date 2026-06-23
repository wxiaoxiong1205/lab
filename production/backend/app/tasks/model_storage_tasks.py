"""
模型存储相关任务（Celery）
用于异步复制模型产物到注册目录
"""
import asyncio
import logging
import os
from typing import Optional, Sequence, Tuple

from sqlalchemy import update

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.services.storage.interface import StorageService
from app.utils import app_runtime_context
from app.utils.storage_utils import JFSSelectiveCloner
from app.database.base import get_db_session
from app.models.model_manager import TrainedModel, MLModel
from app.common.status import TaskStatus
from app.utils.timezone_utils import get_current_shanghai_time

logger = logging.getLogger(__name__)


def get_storage_service() -> StorageService:
    """在 Celery worker 中获取 StorageService 实例"""
    from app.repository.storage import StorageMapper
    from app.database.database_depends import Database
    from app.services.storage.storage import DefaultStorageService

    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


@celery_app.task(base=TaskBase, bind=True)
def copy_registered_model_async(
    self: TaskBase,
    source_path: str,
    target_path: str,
    tenant_id: Optional[str] = None,
    trained_model_id: Optional[int] = None,
    ml_model_id: Optional[int] = None,
) -> bool:
    """
    异步复制注册模型（Celery 任务使用 JFSSelectiveCloner）。

    - 传入 ``trained_model_id`` 时：成功/失败会回写训练模型状态为已完成/失败。
    - 传入 ``ml_model_id`` 时：成功/失败会回写机器学习模型版本状态为已完成/失败。
    """
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    storage = get_storage_service()
    jfs = asyncio.run(storage.JUICEFS_CLIENT(tenant_id))
    remote_dir = os.path.dirname(target_path)
    if remote_dir and not jfs.exists(remote_dir):
        jfs.makedirs(remote_dir, exist_ok=True)
    self._log_start(f"开始复制注册模型: {source_path} -> {target_path}")
    try:
        cloner = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)
        cloner.clone(source_path, target_path)
        self._log_complete(f"复制注册模型完成: {target_path}")
        if trained_model_id is not None:
            asyncio.run(_update_trained_model_status(trained_model_id, TaskStatus.COMPLETED.value))
        if ml_model_id is not None:
            asyncio.run(_update_ml_model_status(ml_model_id, TaskStatus.COMPLETED.value))
        return True
    except Exception as e:
        self._log_error(f"复制注册模型失败: {e}")
        if trained_model_id is not None:
            asyncio.run(_update_trained_model_status(trained_model_id, TaskStatus.FAILED.value))
        if ml_model_id is not None:
            asyncio.run(_update_ml_model_status(ml_model_id, TaskStatus.FAILED.value))
        raise


@celery_app.task(base=TaskBase, bind=True)
def copy_registered_model_artifacts_async(
    self: TaskBase,
    copy_pairs: Sequence[Tuple[str, str]],
    tenant_id: Optional[str] = None,
    ml_model_id: Optional[int] = None,
) -> bool:
    """异步复制多个 ML 模型产物，全部成功后统一回写状态。"""
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    storage = get_storage_service()
    jfs = asyncio.run(storage.JUICEFS_CLIENT(tenant_id))
    self._log_start(f"开始复制 ML 模型产物，数量: {len(copy_pairs)}")
    try:
        cloner = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)
        for source_path, target_path in copy_pairs:
            remote_dir = os.path.dirname(target_path)
            if remote_dir and not jfs.exists(remote_dir):
                jfs.makedirs(remote_dir, exist_ok=True)
            cloner.clone(source_path, target_path)
            logger.info("复制 ML 模型产物完成: %s -> %s", source_path, target_path)
        self._log_complete("复制 ML 模型产物完成")
        if ml_model_id is not None:
            asyncio.run(_update_ml_model_status(ml_model_id, TaskStatus.COMPLETED.value))
        return True
    except Exception as e:
        self._log_error(f"复制 ML 模型产物失败: {e}")
        if ml_model_id is not None:
            asyncio.run(_update_ml_model_status(ml_model_id, TaskStatus.FAILED.value))
        raise


async def _update_trained_model_status(trained_model_id: int, status: str) -> None:
    async with get_db_session() as db:
        now = get_current_shanghai_time()
        await db.execute(
            update(TrainedModel)
            .where(TrainedModel.id == trained_model_id)
            .values(status=status, finished_at=now, updated_at=now)
        )
        await db.commit()


async def _update_ml_model_status(ml_model_id: int, status: str) -> None:
    """机器学习模型：异步复制产物成功后置为已完成，失败置为失败。"""
    async with get_db_session() as db:
        now = get_current_shanghai_time()
        await db.execute(
            update(MLModel)
            .where(MLModel.id == ml_model_id)
            .values(status=status, updated_at=now)
        )
        await db.commit()

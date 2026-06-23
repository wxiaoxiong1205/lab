import json
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.logging import logger


DATASET_METADATA_REPAIR_TTL_SECONDS = 60 * 60 * 24
REPAIR_KIND_TRAINING_DATASET = "training_dataset"
REPAIR_KIND_MACHINE_LEARNING_DATASET = "machine_learning_dataset"

_REPAIR_KIND_LABELS = {
    REPAIR_KIND_TRAINING_DATASET: "训练数据集",
    REPAIR_KIND_MACHINE_LEARNING_DATASET: "机器学习数据集",
}


def _now_iso() -> str:
    return datetime.now().isoformat()


def _tenant_key(tenant_id: Optional[str]) -> str:
    return str(tenant_id or "default")


def _repair_status_key(kind: str, tenant_id: Optional[str]) -> str:
    return f"dataset_metadata_fields_repair:{kind}:{_tenant_key(tenant_id)}"


def _repair_label(kind: str) -> str:
    return _REPAIR_KIND_LABELS.get(kind, "数据集")


async def get_metadata_fields_repair_status(
    kind: str,
    tenant_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    redis_client = settings.REDIS_CLIENT
    key = _repair_status_key(kind, tenant_id)
    try:
        raw_value = await redis_client.get(key)
        if not raw_value:
            return None
        if isinstance(raw_value, bytes):
            raw_value = raw_value.decode("utf-8")
        status_data = json.loads(raw_value)
        if not isinstance(status_data, dict):
            await redis_client.delete(key)
            return None
        return status_data
    except Exception as exc:
        logger.warning(f"读取 metadata_fields 修复状态失败: key={key}, error={exc}")
        return None


async def set_metadata_fields_repair_status(
    kind: str,
    tenant_id: Optional[str],
    status_data: Dict[str, Any],
    *,
    nx: bool = False,
) -> bool:
    redis_client = settings.REDIS_CLIENT
    key = _repair_status_key(kind, tenant_id)
    payload = {
        **status_data,
        "kind": kind,
        "tenant_id": tenant_id,
        "updated_at": _now_iso(),
    }
    try:
        result = await redis_client.set(
            key,
            json.dumps(payload, ensure_ascii=False, default=str),
            ex=DATASET_METADATA_REPAIR_TTL_SECONDS,
            nx=nx,
        )
        return bool(result)
    except Exception as exc:
        logger.warning(f"写入 metadata_fields 修复状态失败: key={key}, error={exc}")
        return False


async def mark_metadata_fields_repair_submitted(
    kind: str,
    tenant_id: Optional[str],
    celery_task_id: str,
    *,
    nx: bool = False,
) -> bool:
    label = _repair_label(kind)
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            "success": True,
            "status": "submitted",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields 修复任务已提交",
            "created_at": _now_iso(),
        },
        nx=nx,
    )


async def mark_metadata_fields_repair_running(
    kind: str,
    tenant_id: Optional[str],
    celery_task_id: str,
) -> bool:
    label = _repair_label(kind)
    existing = await get_metadata_fields_repair_status(kind, tenant_id) or {}
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            **existing,
            "success": True,
            "status": "running",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields 修复中",
            "started_at": existing.get("started_at") or _now_iso(),
        },
    )


async def mark_metadata_fields_repair_completed(
    kind: str,
    tenant_id: Optional[str],
    celery_task_id: str,
    result: Dict[str, Any],
) -> bool:
    label = _repair_label(kind)
    existing = await get_metadata_fields_repair_status(kind, tenant_id) or {}
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            **existing,
            **result,
            "success": True,
            "status": "completed",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields 修复已完成",
            "completed_at": _now_iso(),
        },
    )


async def mark_metadata_fields_repair_failed(
    kind: str,
    tenant_id: Optional[str],
    celery_task_id: str,
    exc: Exception,
) -> bool:
    label = _repair_label(kind)
    existing = await get_metadata_fields_repair_status(kind, tenant_id) or {}
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            **existing,
            "success": False,
            "status": "failed",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields 修复失败",
            "error": str(exc),
            "failed_at": _now_iso(),
        },
    )

import json
import asyncio
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings, _parse_sentinel_hosts
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


def _create_redis_client():
    if settings.REDIS_SENTINEL and settings.REDIS_SENTINEL == "enable":
        sentinel_hosts = _parse_sentinel_hosts(settings.REDIS_SENTINEL_HOST_PORT)
        if not sentinel_hosts:
            raise ValueError("REDIS_SENTINEL_HOST_PORT 配置错误，无法解析 Sentinel 地址")

        from redis.asyncio.sentinel import Sentinel

        sentinel_kwargs = {
            "socket_timeout": settings.REDIS_SOCKET_TIMEOUT,
            "socket_connect_timeout": settings.REDIS_SOCKET_CONNECT_TIMEOUT,
        }
        if settings.REDIS_NODE_PASSWORD and settings.REDIS_NODE_PASSWORD.strip():
            sentinel_kwargs["password"] = settings.REDIS_NODE_PASSWORD

        sentinel = Sentinel(sentinel_hosts, **sentinel_kwargs)
        master_kwargs = {
            "db": int(settings.REDIS_SENTINEL_DB),
            "socket_timeout": settings.REDIS_SOCKET_TIMEOUT,
            "decode_responses": True,
        }
        if settings.REDIS_NODE_PASSWORD and settings.REDIS_NODE_PASSWORD.strip():
            master_kwargs["password"] = settings.REDIS_NODE_PASSWORD
        return sentinel.master_for(settings.REDIS_MASTER_NAME, **master_kwargs)

    import redis.asyncio as redis_async

    return redis_async.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )


def _get_redis_client():
    """获取绑定当前事件循环的 Redis client，避免 Celery asyncio.run 复用旧 loop。"""
    try:
        current_loop = asyncio.get_running_loop()
        global_redis = settings.REDIS_CLIENT
        global_loop = getattr(global_redis, "_loop", None)
        if global_loop is not None and global_loop == current_loop:
            return global_redis
    except Exception:
        pass
    return _create_redis_client()


async def get_metadata_fields_repair_status(
    kind: str,
    tenant_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    redis_client = _get_redis_client()
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


async def refresh_metadata_fields_repair_status_from_celery(
    kind: str,
    tenant_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    """用 Celery result backend 校正卡在 submitted/running 的修复状态。"""
    status_data = await get_metadata_fields_repair_status(kind, tenant_id)
    if not status_data or status_data.get("status") not in {"submitted", "running"}:
        return status_data

    celery_task_id = status_data.get("celery_task_id")
    if not celery_task_id:
        return status_data

    try:
        from app.tasks.celery_app import celery_app

        async_result = celery_app.AsyncResult(celery_task_id)
        celery_state = async_result.state
        if celery_state == "SUCCESS":
            task_result = async_result.result if isinstance(async_result.result, dict) else {}
            await mark_metadata_fields_repair_completed(
                kind,
                tenant_id,
                celery_task_id,
                {
                    **task_result,
                    "celery_state": celery_state,
                },
            )
            return await get_metadata_fields_repair_status(kind, tenant_id)

        if celery_state in {"FAILURE", "REVOKED"}:
            label = _repair_label(kind)
            action_label = "强制刷新" if status_data.get("force") else "修复"
            await set_metadata_fields_repair_status(
                kind,
                tenant_id,
                {
                    **status_data,
                    "success": False,
                    "status": "failed",
                    "celery_state": celery_state,
                    "error": str(async_result.result),
                    "message": f"{label} metadata_fields {action_label}失败",
                    "failed_at": _now_iso(),
                },
            )
            return await get_metadata_fields_repair_status(kind, tenant_id)

        if status_data.get("status") == "submitted":
            return {
                **status_data,
                "celery_state": celery_state,
            }
        return status_data
    except Exception as exc:
        logger.warning(
            f"同步 metadata_fields 修复 Celery 状态失败: "
            f"kind={kind}, tenant_id={tenant_id}, celery_task_id={celery_task_id}, error={exc}"
        )
        return status_data


async def set_metadata_fields_repair_status(
    kind: str,
    tenant_id: Optional[str],
    status_data: Dict[str, Any],
    *,
    nx: bool = False,
) -> bool:
    redis_client = _get_redis_client()
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
    force: bool = False,
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
            "force": force,
            "message": f"{label} metadata_fields {'强制刷新' if force else '修复'}任务已提交",
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
    action_label = "强制刷新" if existing.get("force") else "修复"
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            **existing,
            "success": True,
            "status": "running",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields {action_label}中",
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
    action_label = "强制刷新" if existing.get("force") else "修复"
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            **existing,
            **result,
            "success": True,
            "status": "completed",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields {action_label}已完成",
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
    action_label = "强制刷新" if existing.get("force") else "修复"
    return await set_metadata_fields_repair_status(
        kind,
        tenant_id,
        {
            **existing,
            "success": False,
            "status": "failed",
            "celery_task_id": celery_task_id,
            "message": f"{label} metadata_fields {action_label}失败",
            "error": str(exc),
            "failed_at": _now_iso(),
        },
    )

"""
Notebook 代理相关缓存工具

针对 `proxy_notebook` / `proxy_notebook_ws` 在每次请求都要打 DB 查询
`ProjectUser` 关系和 `Notebook.real_address` 的性能问题，提供基于 Redis
的轻量缓存。

静态资源（lab/extensions、themes、static 等）默认落在本地磁盘（环境变量
``NOTEBOOK_STATIC_CACHE_DIR``），按 ``{project_id}/{notebook_id}/`` 分子目录，
避免不同 Notebook 路径冲突；停止 / 删除 Notebook 时会删除对应目录。

缓存内容：
- `(user_id, project_id) -> bool`：当前用户是否在项目空间内（不区分管理员）
- `notebook_id -> real_address`：Notebook 的真实代理地址

注意：
- 这两类数据在短时间内基本不变；TTL 取分钟级即可（默认 60 秒）。
- 如需立即失效，可调用 `invalidate_*` 方法。
- 任何 Redis 异常都不会影响主流程，会直接降级到调用方传入的回退查询。
"""
from __future__ import annotations

import asyncio
import mimetypes
from collections import OrderedDict
import os
import shutil
from typing import Awaitable, Callable, Optional

from app.core import settings
from app.core.logging import logger

PROJECT_USER_CACHE_TTL_SECONDS = 60
NOTEBOOK_ADDRESS_CACHE_TTL_SECONDS = 60

# 本地静态缓存根目录（建议使用持久卷或 SSD）
NOTEBOOK_STATIC_DISK_CACHE_BASE = os.getenv(
    "NOTEBOOK_STATIC_CACHE_DIR", "/tmp/notebook-static"
)
NOTEBOOK_STATIC_DISK_CACHE_MAX_NOTEBOOKS = int(
    os.getenv("NOTEBOOK_STATIC_CACHE_MAX_NOTEBOOKS", "50")
)

_PROJECT_USER_KEY_FMT = "notebook:proxy:project_user:{project_id}:{user_id}"
_NOTEBOOK_ADDRESS_KEY_FMT = "notebook:proxy:notebook_addr:{project_id}:{notebook_id}"

_PROJECT_USER_TRUE = "1"
_PROJECT_USER_FALSE = "0"

# 进程内静态缓存索引：notebook_key -> notebook_cache_root（LRU，末尾最新）
_STATIC_DISK_CACHE_INDEX: "OrderedDict[str, str]" = OrderedDict()
# notebook 维度文件索引，避免删除时全局扫描
_STATIC_NOTEBOOK_FILES: dict[str, set[str]] = {}
# 进程内静态缓存文件索引：避免热路径触发 os.path.isfile
_STATIC_DISK_CACHE_FILE_INDEX: set[str] = set()
# 进程内静态缓存元信息：避免热路径读取 .meta.json（同步 IO）
_STATIC_DISK_CACHE_META_MAP: dict[str, dict[str, str]] = {}
_STATIC_DISK_CACHE_LOCK = asyncio.Lock()


def _get_redis_client():
    try:
        return settings.REDIS_CLIENT
    except Exception as e:
        logger.warning(f"get redis client failed, fallback to db: {e}")
        return None


def notebook_static_disk_cache_file(
    project_id: int, notebook_id: int, relative_path: str
) -> str:
    """
    解析静态资源在磁盘上的绝对路径；防止 ``..`` 跳出缓存根目录。
    ``relative_path`` 为不带前导 ``/`` 的相对路径（与代理 ``path`` 一致）。
    """
    root = os.path.normpath(
        os.path.join(NOTEBOOK_STATIC_DISK_CACHE_BASE, str(project_id), str(notebook_id))
    )
    rel = relative_path.lstrip("/")
    full = os.path.normpath(os.path.join(root, rel))
    root_prefix = root if root.endswith(os.sep) else root + os.sep
    if not full.startswith(root_prefix) and full != root:
        raise ValueError(f"invalid notebook static cache path: {relative_path!r}")
    return full


def _notebook_static_cache_root(project_id: int, notebook_id: int) -> str:
    return os.path.normpath(
        os.path.join(NOTEBOOK_STATIC_DISK_CACHE_BASE, str(project_id), str(notebook_id))
    )


async def register_notebook_static_disk_cache_notebook(
    project_id: int, notebook_id: int
) -> None:
    """登记/刷新 notebook 维度的本地静态缓存访问信息（LRU 末尾为最近）。"""
    notebook_key = f"{project_id}:{notebook_id}"
    notebook_root = _notebook_static_cache_root(project_id, notebook_id)
    async with _STATIC_DISK_CACHE_LOCK:
        _STATIC_DISK_CACHE_INDEX.pop(notebook_key, None)
        _STATIC_DISK_CACHE_INDEX[notebook_key] = notebook_root


async def has_notebook_static_disk_cache_file(file_path: str) -> bool:
    async with _STATIC_DISK_CACHE_LOCK:
        if file_path in _STATIC_DISK_CACHE_FILE_INDEX:
            return True
    # 冷启动回填：进程重启后内存索引丢失，但磁盘缓存仍在
    if await asyncio.to_thread(os.path.isfile, file_path):
        async with _STATIC_DISK_CACHE_LOCK:
            _STATIC_DISK_CACHE_FILE_INDEX.add(file_path)
        return True
    return False


async def get_notebook_static_disk_cache_meta(
    file_path: str,
) -> tuple[Optional[str], Optional[str]]:
    async with _STATIC_DISK_CACHE_LOCK:
        meta = _STATIC_DISK_CACHE_META_MAP.get(file_path)
    if not meta:
        return None, None
    return meta.get("content_type"), meta.get("content_encoding")


async def register_notebook_static_disk_cache_file(
    project_id: int,
    notebook_id: int,
    file_path: str,
    content_type: str,
    content_encoding: str,
) -> None:
    """
    记录文件存在性与元信息，并刷新 notebook 维度 LRU。
    """
    notebook_key = f"{project_id}:{notebook_id}"
    notebook_root = _notebook_static_cache_root(project_id, notebook_id)
    async with _STATIC_DISK_CACHE_LOCK:
        _STATIC_DISK_CACHE_INDEX.pop(notebook_key, None)
        _STATIC_DISK_CACHE_INDEX[notebook_key] = notebook_root
        _STATIC_DISK_CACHE_FILE_INDEX.add(file_path)
        _STATIC_DISK_CACHE_META_MAP[file_path] = {
            "content_type": content_type or "",
            "content_encoding": content_encoding or "",
        }
        notebook_files = _STATIC_NOTEBOOK_FILES.setdefault(notebook_key, set())
        notebook_files.add(file_path)


def _drop_notebook_static_cache_entries(notebook_key: str) -> None:
    stale_paths = _STATIC_NOTEBOOK_FILES.pop(notebook_key, set())
    for path in stale_paths:
        _STATIC_DISK_CACHE_FILE_INDEX.discard(path)
        _STATIC_DISK_CACHE_META_MAP.pop(path, None)


def _remove_tree_background(path: str) -> None:
    async def _runner() -> None:
        try:
            await asyncio.to_thread(shutil.rmtree, path, True)
        except Exception as e:
            logger.warning("remove notebook static cache dir failed, path=%s: %s", path, e)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_runner())
    except RuntimeError:
        # 没有运行中的事件循环时降级同步删除（例如某些离线脚本）
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception as e:
            logger.warning("remove notebook static cache dir failed, path=%s: %s", path, e)


async def evict_notebook_static_disk_cache_if_needed(
    max_notebooks: int = NOTEBOOK_STATIC_DISK_CACHE_MAX_NOTEBOOKS,
) -> None:
    """超过上限时按 LRU 淘汰最久未访问 notebook 的整目录缓存。"""
    if max_notebooks <= 0:
        return
    while True:
        async with _STATIC_DISK_CACHE_LOCK:
            if len(_STATIC_DISK_CACHE_INDEX) <= max_notebooks:
                return
            victim_key, victim_root = _STATIC_DISK_CACHE_INDEX.popitem(last=False)
            _drop_notebook_static_cache_entries(victim_key)
        _remove_tree_background(victim_root)


async def clear_notebook_static_disk_cache(project_id: int, notebook_id: int) -> None:
    """删除某 Notebook 在磁盘上的静态缓存目录（停止 / 删除时调用）。"""
    root = _notebook_static_cache_root(project_id, notebook_id)
    notebook_key = f"{project_id}:{notebook_id}"
    async with _STATIC_DISK_CACHE_LOCK:
        _STATIC_DISK_CACHE_INDEX.pop(notebook_key, None)
        _drop_notebook_static_cache_entries(notebook_key)
    _remove_tree_background(root)


def _cleanup_orphan_tmp_files_sync(base_dir: str) -> int:
    """
    清理形如 ``{cache_file_path}.tmp.{pid}.{uuid}`` 的孤儿临时文件。

    设计：tee 写盘使用唯一命名，worker crash / pod kill / 任务取消会留下 .tmp.*；
    长期累积会拖慢目录扫描并占用 inode。这里只在启动时跑一次。
    """
    if not base_dir or not os.path.isdir(base_dir):
        return 0
    removed = 0
    for root, _dirs, files in os.walk(base_dir):
        for name in files:
            if ".tmp." not in name:
                continue
            full = os.path.join(root, name)
            try:
                os.remove(full)
                removed += 1
            except FileNotFoundError:
                continue
            except Exception as e:
                logger.debug(
                    "cleanup orphan tmp failed | path=%s | %s", full, e
                )
    return removed


async def cleanup_notebook_static_orphan_tmp_files(
    base_dir: str = NOTEBOOK_STATIC_DISK_CACHE_BASE,
) -> None:
    """启动时调用：异步线程中扫描并清理孤儿 ``*.tmp.*`` 文件。"""
    try:
        removed = await asyncio.to_thread(_cleanup_orphan_tmp_files_sync, base_dir)
        if removed:
            logger.info(
                "cleanup notebook static orphan tmp files | base=%s | removed=%s",
                base_dir,
                removed,
            )
    except Exception as e:
        logger.warning(
            "cleanup notebook static orphan tmp files failed | base=%s | %s",
            base_dir,
            e,
        )


def _bootstrap_notebook_static_disk_cache_sync(base_dir: str):
    """
    扫描 ``{base}/{project_id}/{notebook_id}/...``，重建以下内容：

    - ``_STATIC_DISK_CACHE_INDEX``（按 notebook 目录 mtime 升序，最旧在前）
    - ``_STATIC_DISK_CACHE_FILE_INDEX`` / ``_STATIC_DISK_CACHE_META_MAP``
    - ``_STATIC_NOTEBOOK_FILES``

    ``content_encoding`` 从路径 ``.enc/{variant}/`` 推断，``content_type`` 用 ``mimetypes`` 推断。
    跳过 ``.tmp.*`` 孤儿文件。
    """
    if not base_dir or not os.path.isdir(base_dir):
        return []

    results = []
    try:
        pid_entries = list(os.scandir(base_dir))
    except OSError:
        return []

    for pid_entry in pid_entries:
        if not pid_entry.is_dir():
            continue
        try:
            nid_entries = list(os.scandir(pid_entry.path))
        except OSError:
            continue
        for nid_entry in nid_entries:
            if not nid_entry.is_dir():
                continue
            nb_root = nid_entry.path
            try:
                nb_mtime = nid_entry.stat().st_mtime
            except OSError:
                nb_mtime = 0.0

            files_with_meta = []
            try:
                for sub_root, _dirs, files in os.walk(nb_root):
                    for name in files:
                        if ".tmp." in name:
                            continue
                        full = os.path.join(sub_root, name)
                        rel = os.path.relpath(full, nb_root)
                        parts = rel.split(os.sep)
                        encoding = ""
                        if len(parts) >= 2 and parts[0] == ".enc":
                            variant = parts[1]
                            if variant in ("br", "gzip"):
                                encoding = variant
                        ctype, _ = mimetypes.guess_type(name)
                        files_with_meta.append((full, ctype or "", encoding))
            except OSError as e:
                logger.debug(
                    "bootstrap walk notebook dir failed | dir=%s | %s", nb_root, e
                )

            results.append(
                (nb_mtime, pid_entry.name, nid_entry.name, nb_root, files_with_meta)
            )

    results.sort(key=lambda x: x[0])  # 最旧在前，后续 popitem(last=False) 先淘汰它
    return results


async def bootstrap_notebook_static_disk_cache(
    base_dir: str = NOTEBOOK_STATIC_DISK_CACHE_BASE,
    max_notebooks: int = NOTEBOOK_STATIC_DISK_CACHE_MAX_NOTEBOOKS,
) -> None:
    """
    启动时重建静态缓存内存索引，并立即触发一次 LRU 淘汰。

    解决冷启动问题：进程重启后内存索引为空，旧的 notebook 目录不在 LRU 里，
    导致 evict 永远比不出该淘汰它们。
    """
    try:
        notebook_dirs = await asyncio.to_thread(
            _bootstrap_notebook_static_disk_cache_sync, base_dir
        )
    except Exception as e:
        logger.warning(
            "bootstrap notebook static disk cache failed | base=%s | %s",
            base_dir,
            e,
        )
        return

    if not notebook_dirs:
        return

    total_files = 0
    async with _STATIC_DISK_CACHE_LOCK:
        for _mtime, pid, nid, nb_root, files_with_meta in notebook_dirs:
            notebook_key = f"{pid}:{nid}"
            _STATIC_DISK_CACHE_INDEX.pop(notebook_key, None)
            _STATIC_DISK_CACHE_INDEX[notebook_key] = nb_root
            nb_files = _STATIC_NOTEBOOK_FILES.setdefault(notebook_key, set())
            for file_path, content_type, content_encoding in files_with_meta:
                _STATIC_DISK_CACHE_FILE_INDEX.add(file_path)
                _STATIC_DISK_CACHE_META_MAP[file_path] = {
                    "content_type": content_type,
                    "content_encoding": content_encoding,
                }
                nb_files.add(file_path)
                total_files += 1

    logger.info(
        "bootstrap notebook static disk cache | base=%s | notebooks=%s | files=%s | max=%s",
        base_dir,
        len(notebook_dirs),
        total_files,
        max_notebooks,
    )

    await evict_notebook_static_disk_cache_if_needed(max_notebooks)


async def is_project_user_cached(
    project_id: int,
    user_id: int,
    fallback: Callable[[], Awaitable[bool]],
    ttl: int = PROJECT_USER_CACHE_TTL_SECONDS,
) -> bool:
    """
    判断用户是否归属于指定 project（项目空间成员）。

    优先读 Redis 缓存；缓存未命中则调用 `fallback` 协程查询并回填。
    Redis 任何异常都会被吞掉，直接降级到 fallback。
    """
    key = _PROJECT_USER_KEY_FMT.format(project_id=project_id, user_id=user_id)
    redis_client = _get_redis_client()

    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached is not None:
                return cached == _PROJECT_USER_TRUE
        except Exception as e:
            logger.warning(
                f"read project_user cache failed, key={key}, fallback to db: {e}"
            )

    is_member = await fallback()

    if redis_client is not None:
        try:
            await redis_client.set(
                key,
                _PROJECT_USER_TRUE if is_member else _PROJECT_USER_FALSE,
                ex=ttl,
            )
        except Exception as e:
            logger.warning(f"set project_user cache failed, key={key}: {e}")

    return is_member


async def get_notebook_address_cached(
    project_id: int,
    notebook_id: int,
    fallback: Callable[[], Awaitable[Optional[str]]],
    ttl: int = NOTEBOOK_ADDRESS_CACHE_TTL_SECONDS,
) -> Optional[str]:
    """
    获取 Notebook 的 `real_address`。

    优先读 Redis 缓存；缓存未命中则调用 `fallback` 协程查询并回填。
    `fallback` 返回 None 表示 Notebook 不存在，此时不写缓存（避免缓存
    穿透长时间生效，DB 一旦写入新数据可立刻生效）。
    """
    key = _NOTEBOOK_ADDRESS_KEY_FMT.format(
        project_id=project_id, notebook_id=notebook_id
    )
    redis_client = _get_redis_client()

    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                return cached
        except Exception as e:
            logger.warning(
                f"read notebook address cache failed, key={key}, fallback to db: {e}"
            )

    address = await fallback()

    if redis_client is not None and address:
        try:
            await redis_client.set(key, address, ex=ttl)
        except Exception as e:
            logger.warning(f"set notebook address cache failed, key={key}: {e}")

    return address


async def invalidate_project_user_cache(project_id: int, user_id: int) -> None:
    """主动清理 `(user_id, project_id) -> bool` 缓存。"""
    redis_client = _get_redis_client()
    if redis_client is None:
        return
    try:
        await redis_client.delete(
            _PROJECT_USER_KEY_FMT.format(project_id=project_id, user_id=user_id)
        )
    except Exception as e:
        logger.warning(
            f"invalidate project_user cache failed, project_id={project_id}, "
            f"user_id={user_id}: {e}"
        )


async def invalidate_notebook_address_cache(project_id: int, notebook_id: int) -> None:
    """主动清理 `notebook_id -> real_address` 缓存。"""
    redis_client = _get_redis_client()
    if redis_client is None:
        return
    try:
        await redis_client.delete(
            _NOTEBOOK_ADDRESS_KEY_FMT.format(
                project_id=project_id, notebook_id=notebook_id
            )
        )
    except Exception as e:
        logger.warning(
            f"invalidate notebook address cache failed, project_id={project_id}, "
            f"notebook_id={notebook_id}: {e}"
        )

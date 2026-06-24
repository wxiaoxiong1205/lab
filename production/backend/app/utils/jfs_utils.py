import json
import os
from typing import Any, Optional

from app.core.logging import logger


class JFSUtils:
    COPY_CHUNK_SIZE = 8 * 1024 * 1024

    @staticmethod
    def ensure_parent_dir(jfs: Any, path: str) -> None:
        parent = os.path.dirname(path.rstrip("/")).replace("\\", "/")
        if parent and not jfs.exists(parent):
            jfs.makedirs(parent, exist_ok=True)

    @staticmethod
    def copy_file(jfs: Any, source_path: str, target_path: str, chunk_size: int = COPY_CHUNK_SIZE) -> None:
        if not jfs.exists(source_path):
            raise FileNotFoundError(f"源文件不存在: {source_path}")

        JFSUtils.ensure_parent_dir(jfs, target_path)
        logger.info(f"开始复制文件: {source_path} -> {target_path}")
        with jfs.open(source_path, "rb") as source_file:
            with jfs.open(target_path, "wb") as target_file:
                while True:
                    chunk = source_file.read(chunk_size)
                    if not chunk:
                        break
                    target_file.write(chunk)
        logger.info(f"成功复制文件: {source_path} -> {target_path}")

    @staticmethod
    def copy_directory(jfs: Any, source_dir: str, target_dir: str) -> None:
        if not jfs.exists(source_dir):
            raise FileNotFoundError(f"源目录不存在: {source_dir}")

        if not jfs.exists(target_dir):
            jfs.makedirs(target_dir, exist_ok=True)

        def copy_recursive(source: str, target: str) -> None:
            if not jfs.exists(target):
                jfs.makedirs(target, exist_ok=True)
            for item in jfs.listdir(source):
                if item == "exports":
                    skipped_path = os.path.join(source, item).replace("\\", "/")
                    logger.info(f"跳过导出缓存目录: {skipped_path}")
                    continue
                source_path = os.path.join(source, item).replace("\\", "/")
                target_path = os.path.join(target, item).replace("\\", "/")
                try:
                    stat_info = jfs.stat(source_path)
                    is_dir = (stat_info.st_mode & 0o40000) != 0
                except Exception:
                    try:
                        jfs.listdir(source_path)
                        is_dir = True
                    except Exception:
                        is_dir = False

                if is_dir:
                    copy_recursive(source_path, target_path)
                else:
                    JFSUtils.copy_file(jfs, source_path, target_path)

        logger.info(f"开始复制目录: {source_dir} -> {target_dir}")
        copy_recursive(source_dir, target_dir)
        logger.info(f"成功复制目录: {source_dir} -> {target_dir}")

    @staticmethod
    def cleanup_path(jfs: Any, path: Optional[str]) -> None:
        if not path:
            return
        try:
            if not jfs.exists(path):
                return
            try:
                jfs.rmr(path)
            except Exception:
                jfs.remove(path)
            logger.info(f"已清理JFS路径: {path}")
        except Exception as exc:
            logger.warning(f"清理JFS路径失败: {path}, error={str(exc)}")

    @staticmethod
    def write_json(jfs: Any, path: str, payload: dict) -> None:
        JFSUtils.ensure_parent_dir(jfs, path)
        with jfs.open(path, "w", encoding="utf-8") as file_obj:
            file_obj.write(json.dumps(payload, ensure_ascii=False, indent=2))

    @staticmethod
    def write_bytes(jfs: Any, path: str, content: bytes, chunk_size: int = COPY_CHUNK_SIZE) -> None:
        JFSUtils.ensure_parent_dir(jfs, path)
        with jfs.open(path, "wb") as file_obj:
            for start in range(0, len(content), chunk_size):
                file_obj.write(content[start:start + chunk_size])

    @staticmethod
    def upload_local_file(jfs: Any, local_path: str, jfs_path: str, chunk_size: int = COPY_CHUNK_SIZE) -> None:
        JFSUtils.ensure_parent_dir(jfs, jfs_path)
        with open(local_path, "rb") as src:
            with jfs.open(jfs_path, "wb") as dst:
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    dst.write(chunk)

    @staticmethod
    def copy_file_to_local(jfs: Any, src_path: str, dst_path: str, chunk_size: int = COPY_CHUNK_SIZE) -> None:
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        with jfs.open(src_path, "rb") as src:
            with open(dst_path, "wb") as dst:
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    dst.write(chunk)

    @staticmethod
    def copy_dir_to_local(jfs: Any, src_dir: str, dst_dir: str) -> None:
        try:
            items = jfs.listdir(src_dir)
        except Exception:
            return
        os.makedirs(dst_dir, exist_ok=True)
        for item in items:
            src_item = os.path.join(src_dir, item).replace("\\", "/")
            dst_item = os.path.join(dst_dir, item)
            try:
                jfs.listdir(src_item)
                JFSUtils.copy_dir_to_local(jfs, src_item, dst_item)
            except Exception:
                JFSUtils.copy_file_to_local(jfs, src_item, dst_item)

import os
import subprocess
import stat
import threading
from typing import Dict, List, Union, Tuple, Optional, Iterable

import juicefs

from app.core.logging import logger
from app.core.config import settings
from concurrent.futures import ThreadPoolExecutor, as_completed

class StorageUtils:
    """存储工具类"""
    @staticmethod
    async def _run_cmd(cmd_str: str):
        try:
            """执行字符串形式的命令行，shell=True"""
            result = subprocess.run(cmd_str, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

            if result.returncode == 0:
                logger.info(
                    f"初始化文件系统执行完成 cmd：'{cmd_str}' stdout：'{result.stdout.strip()}' stderr：{result.stderr.strip()} returncode：{result.returncode}")
                return True
            else:
                logger.info(
                    f"初始化文件系统执行失败 cmd：'{cmd_str}' stdout：'{result.stdout.strip()}' stderr：{result.stderr.strip()} returncode：{result.returncode}")
                return False
        except Exception as e:
            logger.info(
                f"初始化文件系统执行异常 cmd：'{cmd_str}' stdout：'{result.stdout.strip()}' stderr：{result.stderr.strip()} returncode：{result.returncode}")
            return False

    @staticmethod
    async def format_fs(storage: str, bucket: str, meta_url: str,
                        volume_name: str = "juicefs-vol", access_key: str = None, secret_key: str = None):
        # 需要校验的
        if access_key and secret_key:
            access_cmd = (
                f'--access-key={access_key} '
                f'--secret-key={secret_key} '
            )
        else:
            access_cmd = ""

        cmd_str = (
            f'juicefs format '
            f'--storage={storage} '
            f'--bucket={bucket} '
            f'{access_cmd}'
            f'"{meta_url}" '
            f'{volume_name}'
        )
        return await StorageUtils._run_cmd(cmd_str)

    # ==================== 文件操作功能（使用JuiceFS客户端）====================

    @staticmethod
    def upload_file(
            local_path: str,
            remote_path: str,
            **kwargs
    ) -> bool:
        """
        上传文件到JuiceFS存储

        Args:
            local_path: 本地文件路径
            remote_path: 远程文件路径（相对于项目）

        Returns:
            是否上传成功
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                return False


            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 确保远程目录存在
            import os
            remote_dir = os.path.dirname(full_remote_path)
            if remote_dir:
                try:
                    jfs.makedirs(remote_dir, exist_ok=True)
                except:
                    pass  # 目录可能已存在

            # 上传文件 - 使用open方法
            with open(local_path, 'rb') as local_file:
                with jfs.open(full_remote_path, 'wb') as remote_file:
                    remote_file.write(local_file.read())

            logger.info(f"File uploaded successfully: {local_path} -> {full_remote_path}")
            return True

        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return False

    @staticmethod
    def download_file(
            remote_path: str,
            local_path: str,
            **kwargs
    ) -> bool:
        """
        从JuiceFS存储下载文件

        Args:
            remote_path: 远程文件路径（相对于项目）
            local_path: 本地文件路径

        Returns:
            是否下载成功
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                return False

            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 检查local_path是否为目录，如果是则自动拼接文件名
            if os.path.isdir(local_path) or not os.path.basename(local_path):
                # 从远程路径提取文件名
                remote_filename = os.path.basename(remote_path)
                if remote_filename:
                    local_path = os.path.join(local_path, remote_filename)

            # 下载文件 - 使用open方法
            with jfs.open(full_remote_path, 'rb') as remote_file:
                with open(local_path, 'wb') as local_file:
                    local_file.write(remote_file.read())

            logger.info(f"File downloaded successfully: {full_remote_path} -> {local_path}")
            return True

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            return False

    @staticmethod
    def delete_file(
            remote_path: str,
            **kwargs
    ) -> bool:
        """
        删除JuiceFS存储中的文件

        Args:
            remote_path: 远程文件路径（相对于项目）

        Returns:
            是否删除成功
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                return False

            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 删除文件
            jfs.remove(full_remote_path)
            logger.info(f"File deleted successfully: {full_remote_path}")
            return True

        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            return False

    @staticmethod
    def delete_directory(
            remote_path: str,
            **kwargs
    ) -> bool:
        """
        删除JuiceFS存储中的目录

        Args:
            remote_path: 远程目录路径（相对于项目）
            tenant_storage: 租户存储标识（格式：租户名称_存储类型）
            meta_url: 元数据连接URL

        Returns:
            是否删除成功
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                return False

            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 删除目录 - 使用rmr方法递归删除
            jfs.rmr(full_remote_path)
            logger.info(f"Directory deleted successfully: {full_remote_path}")
            return True

        except Exception as e:
            logger.error(f"Error deleting directory: {e}")
            return False

    @staticmethod
    def list_files(
            jfs: juicefs.Client,
            remote_path: str = "",
            recursive: bool = False,
            **kwargs
    ) -> List[Dict]:
        """
        列出JuiceFS存储中的文件

        Args:
            jfs: jfs客户端
            remote_path: 远程路径（相对于项目）
            recursive: 是否递归列出子目录

        Returns:
            文件列表
        """
        try:
            if jfs is None:
                return []

            # 构造路径
            if remote_path:
                full_path = remote_path.format(**kwargs)
            else:
                if kwargs:
                    full_path = list(kwargs.values())[0]
                else:
                    full_path = "/"

            base_path = full_path
            files: List[Dict] = []

            if recursive:

                def _list_files_recursive(path):
                    try:
                        items = jfs.listdir(path)

                        for item in items:
                            item_path = f"{path}/{item}"

                            try:
                                stat_info = jfs.stat(item_path)

                                rel_path = os.path.relpath(item_path, base_path)

                                if stat.S_ISDIR(stat_info.st_mode):

                                    files.append({
                                        "name": item,
                                        "path": rel_path,
                                        "type": "directory",
                                        "size": 0
                                    })

                                    _list_files_recursive(item_path)

                                else:

                                    files.append({
                                        "name": item,
                                        "path": rel_path,
                                        "type": "file",
                                        "size": stat_info.st_size
                                    })

                            except:
                                pass

                    except:
                        pass

                _list_files_recursive(full_path)

            else:

                try:
                    items = jfs.listdir(full_path)

                    for item in items:
                        item_path = f"{full_path}/{item}"

                        try:
                            stat_info = jfs.stat(item_path)

                            if stat.S_ISDIR(stat_info.st_mode):
                                file_type = "directory"
                                size = 0
                            else:
                                file_type = "file"
                                size = stat_info.st_size

                            files.append({
                                "name": item,
                                "path": item,
                                "type": file_type,
                                "size": size
                            })

                        except:
                            pass

                except:
                    pass

            return files

        except Exception as e:
            logger.error(f"Error listing files: {e}")
            return []

    @staticmethod
    def file_exists(
            remote_path: str,
            **kwargs
    ) -> bool:
        """
        检查JuiceFS存储中的文件是否存在

        Args:
            remote_path: 远程文件路径（相对于项目）

        Returns:
            文件是否存在
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                return False

            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 检查文件是否存在
            return jfs.exists(full_remote_path)

        except Exception as e:
            logger.error(f"Error checking file existence: {e}")
            return False

    @staticmethod
    def get_file_size(
            remote_path: str,
            **kwargs
    ) -> Optional[int]:
        """
        获取JuiceFS存储中文件的大小（字节）

        Args:
            remote_path: 远程文件路径（相对于项目）
            tenant_storage: 租户存储标识（格式：租户名称_存储类型）
            meta_url: 元数据连接URL

        Returns:
            文件大小（字节），如果文件不存在则返回None
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                return None

            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 获取文件大小
            stat_info = jfs.stat(full_remote_path)
            return stat_info.st_size

        except Exception as e:
            logger.error(f"Error getting file size: {e}")
            return 0

    @staticmethod
    async def create_directory(
            remote_path: str,
            meta_url:str,
            **kwargs
    ) -> bool:
        """
        在JuiceFS存储中创建目录

        Args:
            remote_path: 远程目录路径（相对于项目）
            tenant_storage: 租户存储标识（格式：租户名称_存储类型）
            meta_url: 元数据连接URL

        Returns:
            是否创建成功
        """
        try:
            # 获取JuiceFS客户端
            jfs = juicefs.Client(name="",meta=meta_url)
            if jfs is None:
                return False

            # 使用remote_path作为storage_path模板，动态替换变量
            full_remote_path = remote_path.format(**kwargs)

            # 创建目录
            jfs.makedirs(full_remote_path, exist_ok=True)
            logger.info(f"Directory created successfully: {full_remote_path}")
            return True

        except Exception as e:
            logger.error(f"Error creating directory: {e}")
            return False

    @staticmethod
    def write_content(
            storage_path: str,
            content: str,
            **kwargs
    ) -> bool:
        """
        将内容写入到JuiceFS存储的指定路径

        Args:
            storage_path: 存储路径（可以是模板字符串，支持变量替换，或者是已格式化的路径）
            content: 要写入的内容
            **kwargs: 用于替换storage_path中的占位符（如果storage_path是模板）

        Returns:
            是否写入成功
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                logger.error("JuiceFS客户端未初始化")
                return False

            # 如果storage_path是模板字符串且有关键字参数，则进行格式化
            if kwargs and any('{' in str(storage_path) and '}' in str(storage_path)):
                full_storage_path = storage_path.format(**kwargs)
            else:
                full_storage_path = storage_path

            # 确保远程目录存在
            import os
            remote_dir = os.path.dirname(full_storage_path)
            if remote_dir:
                try:
                    jfs.makedirs(remote_dir, exist_ok=True)
                except Exception as e:
                    logger.warning(f"创建目录失败: {e}")
                    # 继续执行，因为目录可能已经存在

            # 将内容写入文件
            with jfs.open(full_storage_path, 'w') as remote_file:
                remote_file.write(content)

            logger.info(f"内容已成功写入: {full_storage_path}")
            return True

        except Exception as e:
            logger.error(f"写入内容失败: {e}")
            return False

    @staticmethod
    def read_content(
            storage_path: str,
            **kwargs
    ) -> Optional[str]:
        """
        从JuiceFS存储的指定路径读取内容

        Args:
            storage_path: 存储路径（可以是模板字符串，支持变量替换）
            **kwargs: 用于替换storage_path中的占位符

        Returns:
            读取的内容，如果失败返回None
        """
        try:
            # 获取JuiceFS客户端
            jfs = settings.JUICEFS_CLIENT
            if jfs is None:
                logger.error("JuiceFS客户端未初始化")
                return None

            # 使用storage_path作为模板，动态替换变量
            full_storage_path = storage_path.format(**kwargs)

            # 检查文件是否存在
            if not jfs.exists(full_storage_path):
                logger.warning(f"文件不存在: {full_storage_path}")
                return None

            # 读取文件内容
            with jfs.open(full_storage_path, 'r') as remote_file:
                content = remote_file.read()

            logger.info(f"内容已成功读取: {full_storage_path}")
            return content

        except Exception as e:
            logger.error(f"读取内容失败: {e}")
            return None

    @staticmethod
    def sync_minio_to_jfs(meta_url: str, src_path: str, dst_path: str)-> Tuple[int, str, str]:
        cmd_str = (
            f'MINIO_ACCESS_KEY={settings.MINIO_ACCESS_KEY} '
            f'MINIO_SECRET_KEY={settings.MINIO_SECRET_KEY} '
            f'myfs={meta_url} '
            f'juicefs sync '
            f'minio://{settings.MINIO_ENDPOINT}/{settings.MINIO_BUCKET}/{src_path} '
            f'jfs://myfs{dst_path}'
        )
        result = subprocess.run(cmd_str, shell=True, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr

class JFSSelectiveCloner:
    """
    JuiceFS selective clone (inode-level)

    - directory: mkdir + recurse
    - file: jfs.clone(src, dst)
    - support exclude dirs / files
    """

    def __init__(
        self,
        jfs: juicefs.Client,
        max_workers: int = 8,
        dry_run: bool = False,
    ):
        self.jfs = jfs
        self.max_workers = max_workers
        self.dry_run = dry_run

        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._futures = []
        self._lock = threading.Lock()

        # stats
        self.dir_count = 0
        self.file_count = 0

    # ---------- public ----------

    def clone(
        self,
        src: str,
        dst: str,
        exclude_dirs: Optional[Iterable[str]] = None,
        exclude_files: Optional[Iterable[str]] = None,
    ):
        exclude_dirs = set(exclude_dirs or [])
        exclude_files = set(exclude_files or [])

        print(f"  selective clone start")
        print(f"  src: {src}")
        print(f"  dst: {dst}")
        print(f"  exclude_dirs: {exclude_dirs}")
        print(f"  exclude_files: {exclude_files}")
        print("-" * 60)

        self._clone_recursive(src.rstrip("/"), dst.rstrip("/"), exclude_dirs, exclude_files)

        # wait all file clone done
        for f in as_completed(self._futures):
            f.result()

        print("-" * 60)
        print(f"   clone finished")
        print(f"   dirs : {self.dir_count}")
        print(f"   files: {self.file_count}")

    # ---------- internal ----------

    def _clone_recursive(self, src: str, dst: str, exclude_dirs, exclude_files):
        st = self.jfs.stat(src)

        # ---------- directory ----------
        if stat.S_ISDIR(st.st_mode):
            name = os.path.basename(src)
            if name in exclude_dirs:
                print(f"⏭ skip dir: {src}")
                return

            self._mkdir(dst)

            for entry in self.jfs.listdir(src):
                self._clone_recursive(
                    f"{src}/{entry}",
                    f"{dst}/{entry}",
                    exclude_dirs,
                    exclude_files,
                )

        # ---------- file ----------
        else:
            name = os.path.basename(src)
            if name in exclude_files:
                print(f"⏭ skip file: {src}")
                return

            self._submit_file_clone(src, dst)

    # ---------- helpers ----------

    def _mkdir(self, path: str):
        with self._lock:
            self.dir_count += 1

        if self.dry_run:
            print(f"[dry-run] mkdir {path}")
            return

        try:
            self.jfs.makedirs(path, exist_ok=True)
        except FileExistsError:
            pass

    def _submit_file_clone(self, src: str, dst: str):
        with self._lock:
            self.file_count += 1

        if self.dry_run:
            print(f"[dry-run] clone {src} -> {dst}")
            return

        print(f"⚡ clone file: {src} -> {dst}")
        fut = self._pool.submit(self._clone_file, src, dst)
        self._futures.append(fut)

    def _clone_file(self, src: str, dst: str):
        try:
            self.jfs.clone(src, dst)
        except OSError as e:
            if e.errno == 17:  # File exists
                print(f"↩︎ file exists, skip clone: {dst}")
                return
            raise
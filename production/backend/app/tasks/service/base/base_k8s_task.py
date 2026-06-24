"""
K8s任务基类，实现通用逻辑
"""
import os
import hashlib
from pathlib import Path
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple, Any, Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from kubernetes.client import V1VolumeMount, V1Volume, V1Affinity, V1PodSecurityContext

import juicefs

from app.repository.base_mapper import BaseMapper
from app.tasks.service.interface.k8s_task import K8sTask
from app.utils.k8s_launcher import K8sLauncher
from app.core.logging import logger
from app.utils.storage_enum import StoragePath
from app.models.models import RepositoryImages, RepositoryResource, KubernetesRepositoryRelation, \
    ProjectKubernetesRelation
from app.utils.redis_lock_utils import try_acquire_lock, release_lock_if_owner
from app.core.config import settings


class BaseK8sTask(K8sTask, ABC):
    """K8s任务基类，提供通用功能"""

    def __init__(
            self,
            project_id: int,
            namespace: str,
            k8s_uuid: str,
            launcher: K8sLauncher,
            db: BaseMapper,
    ):
        """
        初始化基类
        
        Args:
            project_id: 项目ID
            namespace: K8s命名空间
            k8s_uuid: K8s UUID
            launcher: K8s启动器实例
            db: 数据库会话
        """
        self.project_id = project_id
        self.namespace = namespace  # namespace 就是 k8s_namespace
        self.k8s_uuid = k8s_uuid
        self.launcher = launcher
        self.db = db

    async def build_security_context(self) -> Optional[V1PodSecurityContext]:
        """
        构建安全上下文（默认返回None）
        
        Returns:
            Optional[V1PodSecurityContext]: 默认返回None
        """
        return None

    async def build_working_dir(self) -> str:
        """
        构建工作目录（默认返回/data）
        
        Returns:
            str: 工作目录路径
        """
        return "/app"

    @abstractmethod
    def _get_jfs_client(self) -> Optional[juicefs.Client]:
        """
        获取 JuiceFS 客户端（子类需要实现）
        
        Returns:
            Optional[juicefs.Client]: JuiceFS 客户端实例，如果子类没有则返回 None
        """
        pass

    @abstractmethod
    def _get_task_id(self) -> Optional[int]:
        """
        获取任务ID（子类需要实现）
        
        Returns:
            Optional[int]: 任务ID，如果子类没有则返回 None
        """
        pass

    def get_inference_prompt_config(self) -> str:
        return "inference_prompt_config.yaml"

    def get_inference_config(self) -> str:
        return "inference_config.yaml"

    def _calculate_scripts_md5(self, scripts_dir: Path) -> str:
        """
        计算所有脚本文件的综合 MD5 值
        
        Args:
            scripts_dir: 脚本目录路径
            
        Returns:
            str: 所有脚本文件的综合 MD5 值
        """
        md5_hash = hashlib.md5()
        
        py_files = sorted(
            (p for p in scripts_dir.rglob("*") if p.is_file()),
            key=lambda p: str(p.relative_to(scripts_dir)).replace("\\", "/"),
        )
        
        for py_file in py_files:
            # 计算相对于 scripts 目录的路径（用于标识文件）
            relative_path = str(py_file.relative_to(scripts_dir)).replace("\\", "/")
            
            # 将文件路径添加到 MD5（确保文件顺序和路径都影响最终 MD5）
            md5_hash.update(relative_path.encode('utf-8'))
            
            # 读取文件内容并添加到 MD5
            try:
                with open(py_file, 'rb') as f:
                    while True:
                        chunk = f.read(8192)  # 分块读取，避免大文件占用内存
                        if not chunk:
                            break
                        md5_hash.update(chunk)
            except Exception as e:
                logger.warning(f"读取脚本文件失败，跳过 MD5 计算: {py_file}, 错误: {e}")
                # 即使读取失败，也添加错误标记到 MD5，确保能检测到问题
                md5_hash.update(f"ERROR:{relative_path}".encode('utf-8'))
        
        return md5_hash.hexdigest()
    
    def _read_jfs_md5(self, jfs: juicefs.Client, md5_file_path: str) -> Optional[str]:
        """
        从 JuiceFS 读取 MD5 文件内容
        
        Args:
            jfs: JuiceFS 客户端
            md5_file_path: MD5 文件路径
            
        Returns:
            Optional[str]: MD5 值，如果文件不存在或读取失败返回 None
        """
        try:
            if not jfs.exists(md5_file_path):
                return None
            
            with jfs.open(md5_file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                return content if content else None
        except Exception as e:
            logger.warning(f"读取 MD5 文件失败: {md5_file_path}, 错误: {e}")
            return None
    
    def _write_jfs_md5(self, jfs: juicefs.Client, md5_file_path: str, md5_value: str) -> bool:
        """
        将 MD5 值写入 JuiceFS 文件
        
        Args:
            jfs: JuiceFS 客户端
            md5_file_path: MD5 文件路径
            md5_value: MD5 值
            
        Returns:
            bool: 是否写入成功
        """
        try:
            # 确保目录存在
            remote_dir = os.path.dirname(md5_file_path)
            if remote_dir:
                jfs.makedirs(remote_dir, exist_ok=True)
            
            with jfs.open(md5_file_path, 'w', encoding='utf-8') as f:
                f.write(md5_value)
            
            logger.info(f"已写入 MD5 文件: {md5_file_path}, MD5: {md5_value}")
            return True
        except Exception as e:
            logger.error(f"写入 MD5 文件失败: {md5_file_path}, 错误: {e}")
            return False
    
    def _delete_all_scripts_from_jfs(self, jfs: juicefs.Client, storage_path: str) -> None:
        """
        删除 JuiceFS 上的所有脚本文件（全量更新前清理）
        
        使用 JuiceFS 的 rmr 方法直接递归删除整个目录，然后重新创建。
        这样可以确保完全清理，包括所有子目录和文件。
        
        Args:
            jfs: JuiceFS 客户端
            storage_path: 脚本存储路径
        """
        try:
            if not jfs.exists(storage_path):
                logger.debug(f"脚本目录不存在，跳过删除: {storage_path}")
                return
            
            # 使用 rmr 方法递归删除整个目录（包括所有子目录和文件）
            jfs.rmr(storage_path)
            logger.info(f"已删除脚本目录: {storage_path}")
            
            # 重新创建目录（为空目录，后续会重新上传文件）
            jfs.makedirs(storage_path, exist_ok=True)
            logger.debug(f"已重新创建脚本目录: {storage_path}")
            
        except Exception as e:
            logger.error(f"清理脚本目录失败: {storage_path}, 错误: {e}")
            # 不抛出异常，允许继续执行（后续上传可能会失败，但至少尝试了）
    
    async def build_script_configs(self) -> Optional[Dict[str, Dict[str, str]]]:
        """
        构建脚本挂载配置，自动扫描 scripts 目录下的所有文件并上传到 JuiceFS
        
        脚本挂载配置格式：
        {
            "scripts": {
                "mount_path": "/scripts",  # 容器内挂载目录
                "storage_path": "/{namespace}/scripts/"  # JuiceFS 存储路径（项目空间级别，多任务共享）
            }
        }
        
        脚本维护机制（基于 MD5）：
        - 在脚本目录下创建 scripts_md5.txt 文件，存储所有脚本的综合 MD5 值
        - 如果 JFS 上没有 MD5 文件，说明是第一次，进行全量更新
        - 如果 JFS 上有 MD5 文件，比较 MD5：
          - 相同：不更新
          - 不同：全量更新（删除旧文件后创建）
        
        注意：
        - 脚本存储在项目空间级别，多个任务可以共享同一套脚本
        - 全量更新时会先删除所有旧脚本，然后上传新脚本
        
        Returns:
            Optional[Dict[str, Dict[str, str]]]: 脚本挂载配置字典，如果未找到脚本文件则返回 None
        """
        # 获取 JuiceFS 客户端和任务ID
        jfs = self._get_jfs_client()

        if not jfs:
            logger.warning("JuiceFS 客户端不可用，跳过脚本上传")
            return None

        # 获取项目根目录
        project_root = Path(__file__).parent.parent.parent.parent.parent
        scripts_dir = project_root / "scripts"

        if not scripts_dir.exists():
            logger.warning(f"scripts 目录不存在: {scripts_dir}")
            return None

        # 构建 JuiceFS 存储路径
        storage_path = StoragePath.SCRIPTS.format_storage_path(
            namespace=self.namespace,
        )

        # 确保存储目录存在
        try:
            jfs.makedirs(storage_path, exist_ok=True)
            logger.info(f"创建脚本存储目录: {storage_path}")
        except Exception as e:
            logger.error(f"创建脚本存储目录失败: {e}")
            return None

        # 1. 计算当前所有脚本的 MD5 值
        current_md5 = self._calculate_scripts_md5(scripts_dir)
        logger.info(f"当前脚本 MD5: {current_md5}")

        # 2. 构建 MD5 文件路径（在脚本目录下）
        md5_file_path = f"{storage_path.rstrip('/')}/scripts_md5.txt"

        # 3. 读取 JFS 上的 MD5 值（在锁外读取，避免长时间持有锁）
        jfs_md5 = self._read_jfs_md5(jfs, md5_file_path)

        # 4. 判断是否需要更新
        need_update = False
        if jfs_md5 is None:
            # 第一次：JFS 上没有 MD5 文件，需要全量更新
            logger.info("JFS 上没有 MD5 文件，进行全量更新（第一次）")
            need_update = True
        elif jfs_md5 != current_md5:
            # MD5 不同：脚本有变化，需要全量更新
            logger.info(f"脚本 MD5 已变化（JFS: {jfs_md5} -> 当前: {current_md5}），进行全量更新")
            need_update = True
        else:
            # MD5 相同：不需要更新
            logger.info(f"脚本 MD5 相同（{current_md5}），跳过更新")
            # 不需要更新，直接返回挂载配置
            py_files = list(scripts_dir.rglob("*"))
            if len(py_files) > 0:
                return {
                    "scripts": {
                        "mount_path": StoragePath.SCRIPTS.mount_path,
                        "storage_path": storage_path
                    }
                }
            else:
                logger.warning("未找到任何脚本文件")
                return None

        # 5. 如果需要更新，使用分布式锁进行全量更新（避免并发问题）
        if need_update:
            # 5.1 获取分布式锁（基于 namespace，确保同一项目空间的脚本更新是串行的）
            lock_key = f"distributed:scripts_upload:{self.namespace}:lock"
            lock_ttl = 300  # 5 分钟超时（足够上传所有脚本）
            
            lock_token = None
            try:
                # 检查 Redis 客户端是否可用
                if settings.REDIS_CLIENT is None:
                    logger.warning("Redis 客户端未初始化，跳过分布式锁，直接更新脚本（可能存在并发风险）")
                    # 如果没有 Redis，直接执行更新（单机环境或 Redis 不可用时）
                    # 设置一个虚拟 token，确保 finally 块不会出错
                    lock_token = "no_redis"
                else:
                    lock_token = await try_acquire_lock(lock_key, lock_ttl)
                
                # 如果未获得锁（且 Redis 可用），等待后重试
                if lock_token is None:
                    # 未获得锁，说明其他任务正在更新脚本，等待后重新检查 MD5
                    logger.info(f"未获得脚本上传锁（{lock_key}），其他任务正在更新脚本，等待后重试...")
                    
                    # 等待一段时间后，重新读取 MD5（可能已经被其他任务更新了）
                    import asyncio
                    await asyncio.sleep(2)  # 等待 2 秒
                    
                    # 重新读取 MD5，检查是否已被其他任务更新
                    jfs_md5_retry = self._read_jfs_md5(jfs, md5_file_path)
                    if jfs_md5_retry == current_md5:
                        logger.info("其他任务已完成脚本更新，MD5 已匹配，跳过更新")
                        # 返回挂载配置
                        py_files = list(scripts_dir.rglob("*"))
                        if len(py_files) > 0:
                            return {
                                "scripts": {
                                    "mount_path": StoragePath.SCRIPTS.mount_path,
                                    "storage_path": storage_path
                                }
                            }
                        else:
                            return None
                    else:
                        logger.warning(f"等待后 MD5 仍不匹配（JFS: {jfs_md5_retry}, 当前: {current_md5}），但未获得锁，跳过更新（依赖其他任务完成）")
                        # 即使 MD5 不匹配，由于未获得锁，也跳过更新（避免冲突）
                        # 返回挂载配置（使用现有脚本）
                        py_files = list(scripts_dir.rglob("*"))
                        if len(py_files) > 0:
                            return {
                                "scripts": {
                                    "mount_path": StoragePath.SCRIPTS.mount_path,
                                    "storage_path": storage_path
                                }
                            }
                        else:
                            return None
                
                # 获得锁，继续执行更新
                logger.info(f"获得脚本上传锁（{lock_key}），开始更新脚本")
                
                # 5.2 再次检查 MD5（双重检查，避免在等待锁期间其他任务已更新）
                jfs_md5_double_check = self._read_jfs_md5(jfs, md5_file_path)
                if jfs_md5_double_check == current_md5:
                    logger.info("获得锁后再次检查，MD5 已匹配（其他任务已更新），跳过更新")
                    # 返回挂载配置
                    py_files = list(scripts_dir.rglob("*"))
                    if len(py_files) > 0:
                        return {
                            "scripts": {
                                "mount_path": StoragePath.SCRIPTS.mount_path,
                                "storage_path": storage_path
                            }
                        }
                    else:
                        return None
                
                # 5.3 删除所有旧脚本文件
                logger.info("开始清理旧脚本文件...")
                self._delete_all_scripts_from_jfs(jfs, storage_path)

                # 5.4 上传所有新脚本文件
                logger.info("开始上传新脚本文件...")
                uploaded_count = 0
                total_count = 0

                for py_file in scripts_dir.rglob("*"):
                    total_count += 1
                    # 计算相对于 scripts 目录的路径
                    relative_path = py_file.relative_to(scripts_dir)

                    # 构建挂载后的文件路径（保持目录结构，使用 / 分隔）
                    file_name = str(relative_path).replace("\\", "/")

                    # 构建 JuiceFS 中的完整路径
                    jfs_file_path = f"{storage_path.rstrip('/')}/{file_name}"

                    try:
                        # 确保远程目录存在
                        remote_dir = os.path.dirname(jfs_file_path)
                        if remote_dir:
                            jfs.makedirs(remote_dir, exist_ok=True)
                        if py_file.is_file():
                            # 读取本地文件并上传到 JuiceFS
                            with open(py_file, 'rb') as local_file:
                                with jfs.open(jfs_file_path, 'wb') as remote_file:
                                    remote_file.write(local_file.read())

                        logger.debug(f"上传脚本文件: {py_file} -> {jfs_file_path}")
                        uploaded_count += 1

                    except Exception as e:
                        logger.error(f"上传脚本文件失败 {py_file} -> {jfs_file_path}: {e}")
                        # 继续上传其他文件，不中断整个流程

                # 5.5 更新 MD5 文件
                if uploaded_count > 0:
                    self._write_jfs_md5(jfs, md5_file_path, current_md5)
                    logger.info(
                        f"脚本文件全量更新完成: 总计 {total_count} 个，"
                        f"上传 {uploaded_count} 个，存储路径: {storage_path}"
                    )
                else:
                    logger.warning("没有成功上传任何脚本文件")
                    
            finally:
                # 释放锁（只有当真正获得了锁时才释放）
                if lock_token and lock_token != "no_redis":
                    try:
                        released = await release_lock_if_owner(lock_key, lock_token)
                        logger.info(f"释放脚本上传锁（{lock_key}）: {released}")
                    except Exception as e:
                        logger.warning(f"释放脚本上传锁失败: {e}")

        # 6. 检查是否有脚本文件（用于返回挂载配置）
        py_files = list(scripts_dir.rglob("*"))
        if len(py_files) > 0:
            # 返回挂载配置
            return {
                "scripts": {
                    "mount_path": StoragePath.SCRIPTS.mount_path,
                    "storage_path": storage_path
                }
            }
        else:
            logger.warning("未找到任何脚本文件")
            return None

    def get_mount_path_from_jfs_path(
            self,
            jfs_path: Union[str, List[str]],
            mount_prefix: str
    ) -> Union[Optional[str], List[Optional[str]]]:
        """
        通过真实的 JuiceFS 路径获取容器中的挂载路径
        
        Args:
            jfs_path: JuiceFS 路径（字符串或列表），支持以下格式：
                - jfs://evaluation/stop_words/stop_words_20250828.txt
                - /namespace/evaluation/task/task_123/datasets/stop_words.txt
                - /public/models/model.bin
            mount_prefix: 容器中的挂载前缀路径（如：/data/evaluation/）
        
        Returns:
            Union[Optional[str], List[Optional[str]]]: 
                - 如果 jfs_path 是字符串，返回单个挂载路径
                - 如果 jfs_path 是列表，返回挂载路径列表
        
        示例:
            # 单个路径
            jfs_path = "jfs://evaluation/stop_words/stop_words_20250828.txt"
            mount_path = self.get_mount_path_from_jfs_path(
                jfs_path,
                mount_prefix="/data/evaluation/"
            )
            # 返回: /data/evaluation/stop_words_20250828.txt
            
            # 多个路径
            jfs_paths = [
                "jfs://evaluation/stop_words/stop_words_20250828.txt",
                "/public/models/model.bin"
            ]
            mount_paths = self.get_mount_path_from_jfs_path(
                jfs_paths,
                mount_prefix="/data/evaluation/"
            )
            # 返回: ["/data/evaluation/stop_words_20250828.txt", "/data/evaluation/model.bin"]
        """

        def _extract_filename(path: str) -> str:
            """从路径中提取文件名"""
            if not path:
                return ""

            # 移除 jfs:// 前缀（如果存在）
            if path.startswith("jfs://"):
                path = path[6:]

            # 标准化路径
            path = os.path.normpath(path).replace("\\", "/")

            # 提取文件名
            filename = os.path.basename(path)
            return filename

        def _build_mount_path(path: str) -> Optional[str]:
            """构建单个挂载路径"""
            if not path:
                return None

            filename = _extract_filename(path)
            if not filename:
                logger.warning(f"无法从路径中提取文件名: {path}")
                return None

            # 确保 mount_prefix 以 / 结尾
            prefix = mount_prefix.rstrip("/") + "/"

            # 拼接路径
            mount_path = os.path.join(prefix, filename).replace("\\", "/")
            # 标准化路径
            mount_path = os.path.normpath(mount_path).replace("\\", "/")

            return mount_path

        # 处理列表
        if isinstance(jfs_path, list):
            return [_build_mount_path(path) for path in jfs_path]
        else:
            return _build_mount_path(jfs_path)
    
    async def build_process_and_statistics(self) -> None:
        """
        创建进度文件和统计文件到 JuiceFS（空文件）
        
        根据任务类型自动选择对应的 StoragePath：
        - 推理任务：使用 INFERENCE_PROCESS_RES 和 INFERENCE_STATISTICS_RES
        - 评估任务：使用 EVALUATION_PROCESS_RES 和 EVALUATION_STATISTICS_RES
        
        注意：
        - 仅创建空文件，不写入内容
        - 如果文件已存在，则跳过创建
        - 如果 JuiceFS 客户端不可用，则跳过
        """
        # 获取 JuiceFS 客户端和任务ID
        jfs = self._get_jfs_client()
        task_id = self._get_task_id()
        
        if not jfs:
            logger.warning("JuiceFS 客户端不可用，跳过创建进度和统计文件")
            return
        
        if not task_id:
            logger.warning("任务ID不可用，跳过创建进度和统计文件")
            return

        service_type = await self.build_service_type()
        if service_type == "evaluation":
            process_enum = StoragePath.EVALUATION_PROCESS_RES
            statistics_enum = StoragePath.EVALUATION_STATISTICS_RES
        else:
            process_enum = StoragePath.INFERENCE_PROCESS_RES
            statistics_enum = StoragePath.INFERENCE_STATISTICS_RES

        process_path = process_enum.format_storage_path(
            namespace=self.namespace,
            task_id=task_id
        )
        statistics_path = statistics_enum.format_storage_path(
            namespace=self.namespace,
            task_id=task_id
        )

        # 创建进度文件
        try:
            # 确保目录存在
            process_dir = os.path.dirname(process_path)
            if process_dir:
                jfs.makedirs(process_dir, exist_ok=True)
            
            # 如果文件已存在，跳过
            if jfs.exists(process_path):
                logger.debug(f"进度文件已存在，跳过创建: {process_path}")
            else:
                # 创建空文件
                with jfs.open(process_path, 'w', encoding='utf-8') as f:
                    f.write('')
                logger.info(f"已创建进度文件: {process_path}")
        except Exception as e:
            logger.error(f"创建进度文件失败 {process_path}: {e}")
            # 不抛出异常，继续创建统计文件
        
        # 创建统计文件
        try:
            # 确保目录存在
            statistics_dir = os.path.dirname(statistics_path)
            if statistics_dir:
                jfs.makedirs(statistics_dir, exist_ok=True)
            
            # 如果文件已存在，跳过
            if jfs.exists(statistics_path):
                logger.debug(f"统计文件已存在，跳过创建: {statistics_path}")
            else:
                # 创建空文件
                with jfs.open(statistics_path, 'w', encoding='utf-8') as f:
                    f.write('')
                logger.info(f"已创建统计文件: {statistics_path}")
        except Exception as e:
            logger.error(f"创建统计文件失败 {statistics_path}: {e}")
            # 不抛出异常，允许任务继续执行

    def get_input_and_output_files(
        self,
        inference_dataset_info: Dict[str, Dict[str, Any]],
        result_file_path: Optional[List[str]],
        input_mount_prefix: str = None,
        output_mount_prefix: str = None
    ) -> Tuple[List[str], List[str]]:
        """
        提取输入和输出文件的挂载路径, 评估专用，其他不适用
        
        Args:
            inference_dataset_info: 推理数据集信息字典，格式为 {dataset_id: {"file_path": "...", ...}}
            result_file_path: 评估结果文件路径列表
            input_mount_prefix: 输入文件的挂载前缀（默认使用 REAL_INFERENCE_DATASETS.mount_path）
            output_mount_prefix: 输出文件的挂载前缀（默认使用 REAL_EVALUATION.mount_path）
        
        Returns:
            Tuple[List[str], List[str]]: (输入文件挂载路径列表, 输出文件挂载路径列表)
        
        示例:
            inference_dataset_info = {
                1: {"file_path": "jfs://datasets/dataset1.jsonl"},
                2: {"file_path": "jfs://datasets/dataset2.jsonl"}
            }
            result_file_path = ["jfs://evaluation/result1.jsonl", "jfs://evaluation/result2.jsonl"]
            
            input_files, output_files = self.get_input_and_output_files(
                inference_dataset_info,
                result_file_path
            )
            # input_files: ["/data/inference/datasets/dataset1.jsonl", "/data/inference/datasets/dataset2.jsonl"]
            # output_files: ["/data/evaluation/result1.jsonl", "/data/evaluation/result2.jsonl"]
        """
        # 提取输入文件路径列表
        file_list = [dataset_info["file_path"] for dataset_info in inference_dataset_info.values() if "file_path" in dataset_info]
        
        # 使用默认挂载前缀（如果未提供）
        if input_mount_prefix is None:
            input_mount_prefix = StoragePath.REAL_INFERENCE_DATASETS.mount_path
        if output_mount_prefix is None:
            output_mount_prefix = StoragePath.REAL_EVALUATION.mount_path
        
        # 转换输入文件路径为挂载路径
        file_list_mount = self.get_mount_path_from_jfs_path(
            file_list,
            mount_prefix=input_mount_prefix
        )
        
        # 确保返回列表
        if isinstance(file_list_mount, str):
            file_list_mount = [file_list_mount]
        elif file_list_mount is None:
            file_list_mount = []
        
        # 处理输出文件路径
        output_files = result_file_path or []
        output_files_mount = self.get_mount_path_from_jfs_path(
            output_files,
            mount_prefix=output_mount_prefix
        )
        
        # 确保返回列表
        if isinstance(output_files_mount, str):
            output_files_mount = [output_files_mount]
        elif output_files_mount is None:
            output_files_mount = []
        
        return file_list_mount, output_files_mount

    async def find_image_address_by_project(
            self,
            project_id: int,
            image_type: int,
            card_category: Optional[str] = None,
            card_model: Optional[str] = None,
            is_card_model_null: bool = False
    ) -> Optional[str]:
        """
        使用任务自己的 db 查询镜像地址，避免使用共享的 AutoContainer 服务
        
        Args:
            project_id: 项目ID
            image_type: 镜像类型
            card_category: 显卡类型（如 'GPU', 'CPU'）
            card_model: 显卡型号（如 'A800'）
            is_card_model_null: 是否查询 card_model 为 NULL 的镜像（默认镜像）
        
        Returns:
            Optional[str]: 镜像地址，如果未找到返回 None
        """
        # 构建查询：只选择 image_address
        query = (
            select(
                func.concat(
                    func.concat(
                        func.replace(
                            func.replace(RepositoryResource.repository_address, "https://", ""),
                            "http://", ""
                        ),
                        "/", RepositoryImages.namespace
                    ),
                    "/", RepositoryImages.image
                ).label("image_address")
            )
            .join(RepositoryResource, RepositoryResource.id == RepositoryImages.repository_id)
            .join(KubernetesRepositoryRelation, KubernetesRepositoryRelation.repository_id == RepositoryImages.repository_id)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
            .where(ProjectKubernetesRelation.project_id == project_id)
            .where(RepositoryImages.type == image_type)
            .order_by(RepositoryImages.created_at.desc())
        )
        
        if card_category:
            query = query.where(RepositoryImages.card_category == card_category)
        
        if is_card_model_null:
            query = query.where(RepositoryImages.card_model.is_(None))
        elif card_model:
            query = query.where(RepositoryImages.card_model == card_model)
        
        result = await self.db.execute(query)
        row = result.first()
        
        if row:
            return row[0]
        return None

    def get_batch_size_by_count(self, count: Optional[int]) -> int:
        """
        根据当前数量动态获取 batch_size

        Args:
            count: 当前数量

        Returns:
            int: batch_size，规则如下：
                - count < 100: 返回 10
                - 100 <= count < 1000: 返回 count // 10
                - 1000 <= count < 10000: 返回 100
                - count >= 10000: 返回 1000
        """
        if count is None or count < 0:
            return 100
        if count < 100:
            return 10
        if count < 1000:
            return count // 10
        if count < 10000:
            return 100
        return 1000


"""
训练配置存储工具模块
提供训练配置的生成、转换和存储功能
"""

from typing import Optional
from fastapi import HTTPException

from app.schemas.training_task import TrainingTaskCreate, TrainingConfigConverter
from app.utils.storage_utils import StorageUtils
from app.utils.storage_enum import StoragePath
from app.core.logging import logger
class TrainingConfigStorage:
    """训练配置存储器"""
    
    def __init__(self, namespace: str, task_id: int):
        """
        初始化训练配置存储器
        
        Args:
            namespace: 项目命名空间
            task_id: 任务ID
        """
        self.namespace = namespace
        self.task_id = task_id
    
    def generate_and_store_config(
        self,
        task: TrainingTaskCreate,
        jfs_client
    ) -> str:
        """
        生成训练配置并存储到JuiceFS
        
        Args:
            task: 训练任务创建请求
            jfs_client: JuiceFS客户端实例
            
        Returns:
            str: 存储的配置文件路径
            
        Raises:
            RuntimeError: 当配置生成或存储失败时抛出
        """
        try:
            # 生成YAML配置内容
            yaml_content = self._generate_yaml_config(task, self.task_id)
            
            # 存储配置到JuiceFS
            config_path = self._store_config(yaml_content, jfs_client)
            
            logger.info(f"训练配置已成功生成并存储: {config_path}")
            return config_path
            
        except Exception as e:
            logger.error(f"生成或存储训练配置失败: {e}")
            # 在 Celery 任务中不能抛出 HTTPException，使用 RuntimeError
            raise RuntimeError(f"训练配置处理失败: {str(e)}")
    
    def _generate_yaml_config(
        self,
        task: TrainingTaskCreate,
        task_id: int
    ) -> str:
        """
        生成YAML配置内容
        
        Args:
            task: 训练任务创建请求
            task_id: 训练任务ID
            
        Returns:
            str: YAML配置内容
        """
        logger.info("开始生成训练配置...")
        
        # 使用转换器将API配置转换为内部配置
        yaml_content = TrainingConfigConverter.api_to_llama_factory(task, task_id).to_yaml()
        
        logger.info("训练配置生成完成")
        logger.debug(f"配置内容预览: {yaml_content[:500]}...")
        
        return yaml_content
    
    def _store_config(self, yaml_content: str, jfs_client) -> str:
        """
        存储配置到JuiceFS
        
        Args:
            yaml_content: YAML配置内容
            jfs_client: JuiceFS客户端实例
            
        Returns:
            str: 存储的配置文件路径
            
        Raises:
            RuntimeError: 当存储失败时抛出
        """
        logger.info("开始存储训练配置到JuiceFS...")
        
        # 构建实际的配置文件路径
        config_path = StoragePath.TRAINING_CONFIGS.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id
        )
        
        try:
            # 确保远程目录存在
            import os
            remote_dir = os.path.dirname(config_path)
            if remote_dir:
                try:
                    jfs_client.makedirs(remote_dir, exist_ok=True)
                except Exception as e:
                    logger.warning(f"创建目录失败: {e}")
                    # 继续执行，因为目录可能已经存在
            
            # 将内容写入文件
            with jfs_client.open(config_path, 'w') as remote_file:
                remote_file.write(yaml_content)
                remote_file.flush()
            
            logger.info(f"训练配置已存储到: {config_path}")
            return config_path
        except Exception as e:
            logger.error(f"写入配置内容失败: {e}")
            # 在 Celery 任务中不能抛出 HTTPException，使用 RuntimeError
            raise RuntimeError(f"YAML配置存储失败，无法创建训练任务: {str(e)}")

def store_training_config(
    task: TrainingTaskCreate,
    namespace: str,
    task_id: int,
    jfs_client
) -> str:
    """
    存储训练配置的便捷函数
    
    Args:
        task: 训练任务创建请求
        namespace: 项目命名空间
        task_id: 任务ID
        jfs_client: JuiceFS客户端实例
        
    Returns:
        str: 存储的配置文件路径
    """
    storage = TrainingConfigStorage(namespace, task_id)
    return storage.generate_and_store_config(task, jfs_client) 
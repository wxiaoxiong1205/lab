"""
数据格式适配器基类
定义所有数据格式适配器需要实现的接口
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple, Any
from kubernetes.client import V1VolumeMount

from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath, PvcName


class BaseDataFormatAdapter(ABC):
    """数据格式适配器基类"""
    
    def __init__(self, dataset: InferenceResultDataset):
        """
        初始化适配器
        
        Args:
            dataset: 推理结果数据集对象
        """
        self.dataset = dataset
    
    @property
    @abstractmethod
    def data_format(self) -> str:
        """
        返回适配器支持的数据格式
        
        Returns:
            str: 数据格式值（如 "prompt-response", "role-based" 等）
        """
        pass
    
    @abstractmethod
    def get_input_file_path(self, jfs_path: str) -> str:
        """
        获取输入文件路径（容器内的挂载路径）
        
        Args:
            jfs_path: 数据库存储的jfs路劲
            
        Returns:
            str: 输入文件的容器内路径
        """
        pass
    
    @abstractmethod
    def get_output_file_path(self, jfs_path: str) -> str:
        """
        获取输出文件路径（容器内的挂载路径）
        
        Args:
            jfs_path: 推理结果集 数据库中存储的路劲
            
        Returns:
            str: 输出文件的容器内路径
        """
        pass

    @property
    def get_storage_items(self) -> List[Dict[str, Any]]:
        """
        获取存储项配置列表（用于构建卷挂载）
        
        默认实现返回空列表，子类可以重写以添加格式特定的存储项
        
        Returns:
            List[Dict[str, Any]]: 存储项配置列表
        """
        storage_items = [
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.REAL_INFERENCE_DATASETS},
        ]
        return storage_items

    @abstractmethod
    def get_source_storage_items(self, source_dataset_usage):
        pass

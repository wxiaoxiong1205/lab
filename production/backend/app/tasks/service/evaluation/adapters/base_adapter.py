"""
评估任务数据格式适配器基类
定义所有评估任务数据格式适配器需要实现的接口
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple, Any

from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath, PathConfig


class BaseEvaluationAdapter(ABC):
    """评估任务数据格式适配器基类"""
    
    def __init__(self, datasets: Optional[List[InferenceResultDataset]] = None):
        """
        初始化适配器
        
        Args:
            datasets: 推理结果数据集对象列表（可以为空）
        """
        self.datasets = datasets or []
    
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
    def get_input_file_path(self, jfs_paths: List[str]) -> List[str]:
        """
        获取输入文件路径（容器内的挂载路径）
        用于评估任务读取推理结果集数据
        
        Args:
            jfs_paths: 多个推理结果集在数据库中存储的jfs路径列表
            
        Returns:
            List[str]: 输入文件的容器内挂载路径列表（与输入一一对应）
        """
        pass
    
    @abstractmethod
    def get_output_path(self, jfs_paths: List[str]) -> List[str]:
        """
        获取输出文件路径（容器内的挂载路径）
        用于评估任务写入评估结果数据
        
        Args:
            jfs_paths: 评估结果文件在数据库中存储的jfs路径列表
            
        Returns:
            List[str]: 输出文件的容器内挂载路径列表（与输入一一对应）
        """
        pass
    
    @abstractmethod
    def get_storage_paths(self, inference_result_datasets_jfs: List[str], evaluation_jfs: List[str]) -> List[Dict]:
        """
        获取适配器需要的存储路径列表，

        评估其实关心的是两个model_response字段，
        其他的不关心，就不用挂载推理结果集的images等其他额外的信息啦，
        只在在展示的时候，额外处理，将images列表和base_url按照推理结果集返回
        
        Args:
            inference_result_datasets_jfs: 推理结果集的JFS路径列表
            evaluation_jfs: 评估结果的JFS路径列表
            
        Returns:
            List[Dict]: 存储路径配置字典列表，格式为 [{"name": PvcName, "enum": PathConfig}, ...]
        """
        pass

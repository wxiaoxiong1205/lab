"""
prefix-suffix-middle 格式适配器
处理前缀+后缀+中间格式的推理任务配置
"""
import os
from typing import Optional
from kubernetes.client import V1VolumeMount

from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath


class PrefixSuffixMiddleAdapter(BaseDataFormatAdapter):
    """prefix-suffix-middle 格式适配器"""
    
    @property
    def data_format(self) -> str:
        """返回适配器支持的数据格式"""
        return "prefix-suffix-middle"
    
    def get_input_file_path(self, jfs_path: str) -> str:
        """
        获取输入文件路径（容器内的挂载路径）
        
        prefix-suffix-middle 格式：输入是单个文件（与 prompt-response 相同）
        """
        raise Exception("暂未实现")
    
    def get_output_file_path(self, jfs_path: str) -> str:
        """
        获取输出文件路径（容器内的挂载路径）
        
        prefix-suffix-middle 格式：输出是单个文件（与 prompt-response 相同）
        """
        raise Exception("暂未实现")

    def get_source_storage_items(self, source_dataset_usage):
        raise Exception("暂未实现")
        pass



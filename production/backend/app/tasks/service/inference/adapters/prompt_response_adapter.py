"""
prompt-response 格式适配器
处理提示词+回复格式的推理任务配置
"""
import os
from typing import Optional, List, Dict, Any
from kubernetes.client import V1VolumeMount

from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath, PvcName


class PromptResponseAdapter(BaseDataFormatAdapter):
    """prompt-response 格式适配器"""
    
    @property
    def data_format(self) -> str:
        """返回适配器支持的数据格式"""
        return "prompt-response"
    
    def get_input_file_path(self, jfs_path: str) -> str:
        """
        获取输入文件路径（容器内的挂载路径）

        例如：jfs_path /deepexilab-3/training/datasets/训练数据集XLSX_V17.jsonl
        期望返回 StoragePath.REAL_TRAINING_DATASETS.mount_path + 训练数据集XLSX_V17.jsonl
        prompt-response 格式：输入是单个文件，直接返回基础路径
        """
        # 解析 jfs_path，提取相对路径
        # jfs_path 格式：/{namespace}/training/datasets/文件名.jsonl
        # 或者：/{namespace}/validation/datasets/文件名.jsonl
        # 或者：/{namespace}/test/datasets/文件名.jsonl
        
        # 移除开头的斜杠
        path = jfs_path.lstrip('/')
        parts = path.split('/')
        
        # 查找 'datasets' 目录的位置
        if 'datasets' not in parts:
            # 如果找不到 datasets，直接返回文件名
            filename = os.path.basename(jfs_path)
            return os.path.join(StoragePath.REAL_TRAINING_DATASETS.mount_path, filename).replace('\\', '/')
        
        datasets_idx = parts.index('datasets')
        # 提取 datasets 之后的路径部分（文件名）
        relative_path = '/'.join(parts[datasets_idx + 1:])
        
        # 拼接 mount_path
        mount_path = StoragePath.REAL_TRAINING_DATASETS.mount_path
        return os.path.join(mount_path, relative_path).replace('\\', '/')
    
    def get_output_file_path(self, jfs_path: str) -> str:
        """
        获取输出文件路径（容器内的挂载路径）
        
        prompt-response 格式：输出 StoragePath.REAL_INFERENCE_DATASETS.mount_path + jfs_path的最后一节
        
        例如：jfs_path /deepexilab-3/inference/task/task_71/datasets/inference_result_xxx.jsonl
        期望返回 StoragePath.REAL_INFERENCE_DATASETS.mount_path + inference_result_xxx.jsonl
        """
        # 提取 jfs_path 的最后一节（文件名）
        last_part = os.path.basename(jfs_path.rstrip('/'))
        
        # 拼接 mount_path
        mount_path = StoragePath.REAL_INFERENCE_DATASETS.mount_path
        return os.path.join(mount_path, last_part).replace('\\', '/')

    def get_source_storage_items(self, source_dataset_usage):

        # 根据数据集类型选择对应的存储路径枚举
        if source_dataset_usage == "validation":
            source_dataset_enum = StoragePath.SOURCE_VALIDATION_DATASETS
        elif source_dataset_usage == "test":
            source_dataset_enum = StoragePath.SOURCE_TEST_DATASETS
        elif source_dataset_usage == "business_training":
            source_dataset_enum = StoragePath.SOURCE_BUSINESS_TRAINING_DATASETS
        elif source_dataset_usage == "business_test":
            source_dataset_enum = StoragePath.SOURCE_BUSINESS_TEST_DATASETS
        else:  # training 或默认值
            source_dataset_enum = StoragePath.SOURCE_TRAINING_DATASETS

        source_storage_items = [
            {"name": "llm-training-pvc", "enum": source_dataset_enum},
        ]

        return source_storage_items






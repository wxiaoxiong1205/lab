"""
role-based 格式适配器
处理基于角色的对话格式的推理任务配置
"""
import os
from typing import Optional, List, Dict, Any
from kubernetes.client import V1VolumeMount

from app.tasks.service.inference.adapters import PromptResponseAdapter
from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath, PathConfig


class RoleBasedImageUnderstandingAdapter(BaseDataFormatAdapter):
    """role-based 格式适配器"""
    
    @property
    def data_format(self) -> str:
        """返回适配器支持的数据格式"""
        return "role-based"
    
    def get_input_file_path(self, jfs_path: str) -> str:
        """
        获取输入文件路径（容器内的挂载路径）
        
        role-based 格式：输入是文件夹，需要指向文件夹内的 data.jsonl

        例如：jfs_path /deepexilab-3/training/datasets/imageUnderstanding/测试_V1/data.jsonl
            期望：SOURCE_IMAGE_UNDERSTAND_TRAINING_DATASETS.mount_path + 测试_V1/data.jsonl

        """
        # 解析 jfs_path，提取相对路径
        # jfs_path 格式：/{namespace}/training/datasets/imageUnderstanding/数据集名/data.jsonl
        # 或者：/{namespace}/validation/datasets/imageUnderstanding/数据集名/data.jsonl
        # 或者：/{namespace}/test/datasets/imageUnderstanding/数据集名/data.jsonl
        
        # 移除开头的斜杠
        path = jfs_path.lstrip('/')
        parts = path.split('/')
        
        # 查找 'imageUnderstanding' 目录的位置
        if 'imageUnderstanding' not in parts:
            raise ValueError(f"role-based 格式的输入路径必须包含 'imageUnderstanding' 目录: {jfs_path}")
        
        image_understand_idx = parts.index('imageUnderstanding')
        
        # 提取 imageUnderstanding 之后的路径部分（数据集名/data.jsonl）
        relative_path = '/'.join(parts[image_understand_idx + 1:])
        
        # 根据路径中的 usage（training/validation/test）选择对应的 StoragePath
        if 'validation' in parts:
            mount_path = StoragePath.SOURCE_IMAGE_UNDERSTAND_VALIDATION_DATASETS.mount_path
        elif 'test' in parts:
            mount_path = StoragePath.SOURCE_IMAGE_UNDERSTAND_TEST_DATASETS.mount_path
        else:  # training 或默认值
            mount_path = StoragePath.SOURCE_IMAGE_UNDERSTAND_TRAINING_DATASETS.mount_path
        
        # 拼接 mount_path
        return os.path.join(mount_path, relative_path).replace('\\', '/')
    
    def get_output_file_path(self, jfs_path: str) -> str:
        """
        获取输出文件路径（容器内的挂载路径）
        
        role-based 格式：输出 StoragePath.REAL_INFERENCE_DATASETS.mount_path + jfs_path的最后一节
        
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
            source_dataset_enum = StoragePath.SOURCE_IMAGE_UNDERSTAND_VALIDATION_DATASETS
        elif source_dataset_usage == "test":
            source_dataset_enum = StoragePath.SOURCE_IMAGE_UNDERSTAND_TEST_DATASETS
        elif source_dataset_usage == "business_training":
        # 业务训练数据集使用普通训练数据集路径（因为没有专门的图像理解业务数据集枚举）
            source_dataset_enum = StoragePath.SOURCE_IMAGE_UNDERSTAND_TRAINING_DATASETS
        elif source_dataset_usage == "business_test":
        # 业务测试数据集使用普通测试数据集路径
            source_dataset_enum = StoragePath.SOURCE_IMAGE_UNDERSTAND_TEST_DATASETS
        else:  # training 或默认值
            source_dataset_enum = StoragePath.SOURCE_IMAGE_UNDERSTAND_TRAINING_DATASETS
        source_storage_items = [
            {"name": "llm-training-pvc", "enum": source_dataset_enum},
        ]

        return source_storage_items
        pass



class RoleBasedTextGenerationAdapter(PromptResponseAdapter):
    """role-based 文本生成的 和 prompt-response 处理的逻辑一致，这个是有数据集那边定义决定的，这里这里按找适配即可，复用逻辑 格式适配器"""

    @property
    def data_format(self) -> str:
        """返回适配器支持的数据格式"""
        return "role-based"



"""
prompt-response 格式适配器（评估任务）
处理提示词+回复格式的评估任务配置
"""
import os
from typing import Optional, List, Dict

from app.tasks.service.evaluation.adapters.base_adapter import BaseEvaluationAdapter
from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath, PathConfig, PvcName


class PromptResponseEvaluationAdapter(BaseEvaluationAdapter):
    """prompt-response 格式评估适配器"""
    
    @property
    def data_format(self) -> str:
        """返回适配器支持的数据格式"""
        return "prompt-response"
    
    def get_input_file_path(self, jfs_paths: List[str]) -> List[str]:
        """
        获取输入文件路径（容器内的挂载路径）
        
        prompt-response 格式：输入是多个个文件，直接返回文件名
        
        例如：jfs_paths = ["/deepexilab-3/inference/task/task_71/datasets/inference_result_xxx.jsonl"]
        期望返回 [StoragePath.REAL_INFERENCE_DATASETS.mount_path + inference_result_xxx.jsonl]
        """
        mount_path = StoragePath.REAL_INFERENCE_DATASETS.mount_path
        result = []
        
        for jfs_path in jfs_paths:
            # 提取 jfs_path 的文件名
            filename = os.path.basename(jfs_path)
            # 拼接 mount_path
            input_path = os.path.join(mount_path, filename).replace('\\', '/')
            result.append(input_path)
        
        return result
    
    def get_output_path(self, jfs_paths: List[str]) -> List[str]:
        """
        获取输出文件路径（容器内的挂载路径）
        
        prompt-response 格式：输出是多个文件
        
        例如：jfs_paths = ["/deepexilab-3/evaluation/task/task_100/result_xxx.jsonl"]
        期望返回 [StoragePath.REAL_EVALUATION.mount_path + result_xxx.jsonl]
        """
        mount_path = StoragePath.REAL_EVALUATION.mount_path
        result = []
        
        for jfs_path in jfs_paths:
            # 提取 jfs_path 的文件名
            filename = os.path.basename(jfs_path) or "result.jsonl"
            # 拼接 mount_path
            output_path = os.path.join(mount_path, filename).replace('\\', '/')
            result.append(output_path)
        
        return result
    
    def get_storage_paths(self, inference_result_datasets_jfs: List[str], evaluation_jfs: List[str]) -> List[Dict]:
        """
        获取适配器需要的存储路径列表

        就是原先的数据格式

        输入推理结果集的挂载规则
        文件对文件
        StoragePath.REAL_INFERENCE_DATASETS
        StoragePath.REAL_INFERENCE_DATASETS.storage_path/推理结果集*.jsonl
                        ||
                        ||
                        V
        StoragePath.REAL_INFERENCE_DATASETS.mount_path/推理结果集*.jsonl

        输出评估文件的挂载规则
        文件对文件
        StoragePath.REAL_EVALUATION

        StoragePath.REAL_EVALUATION.storage_path/评估*.jsonl
                        ||
                        ||
                        V
        StoragePath.REAL_EVALUATION.mount_path/评估*.jsonl

        
        Args:
            inference_result_datasets_jfs: 推理结果集的JFS路径列表
            evaluation_jfs: 评估结果的JFS路径列表
            
        Returns:
            List[Dict]: 存储路径配置字典列表，格式为 [{"name": PvcName, "enum": PathConfig}, ...]
        """
        total_storage_path = []
        
        # 处理推理结果集路径
        for inference_result_datasets_jfs_path in inference_result_datasets_jfs:
            # 获取最后一层的文件名
            filename = os.path.basename(inference_result_datasets_jfs_path)
            total_storage_path.append(
                {"name": PvcName.LLM_TRAINING_PVC.value, "enum": PathConfig(
                    mount_path=f"{StoragePath.REAL_INFERENCE_DATASETS.mount_path}{filename}",
                    storage_path=inference_result_datasets_jfs_path
                )}
            )


        # 处理评估结果路径,结果的不用处理

        return total_storage_path

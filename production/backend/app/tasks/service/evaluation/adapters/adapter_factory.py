"""
评估任务适配器工厂类
根据数据格式创建对应的适配器实例
"""
from typing import List, Optional
from app.tasks.service.evaluation.adapters.base_adapter import BaseEvaluationAdapter
from app.tasks.service.evaluation.adapters.prompt_response_adapter import PromptResponseEvaluationAdapter
from app.tasks.service.evaluation.adapters.role_based_adapter import RoleBasedEvaluationAdapter
from app.models.inference_result_manager import InferenceResultDataset
from app.schemas import DatasetFormat


class EvaluationAdapterFactory:
    """评估任务适配器工厂类"""
    
    @staticmethod
    def create_adapter(datasets: List[InferenceResultDataset]) -> BaseEvaluationAdapter:
        """
        根据数据集列表创建对应的适配器（从数据集中获取数据格式）
        
        Args:
            datasets: 推理结果数据集对象列表
            
        Returns:
            BaseEvaluationAdapter: 对应的适配器实例
            
        Raises:
            ValueError: 如果数据格式不支持或不一致
        """
        # 验证数据格式一致性并获取统一格式
        data_format = EvaluationAdapterFactory.validate_datasets_format_consistency(datasets)
        
        # 根据格式创建适配器（传入数据集列表）
        if data_format == DatasetFormat.PROMPT_RESPONSE.value:
            return PromptResponseEvaluationAdapter(datasets)
        elif data_format == DatasetFormat.BUSINESS.value:
            return PromptResponseEvaluationAdapter(datasets)
        elif data_format == DatasetFormat.ROLE_BASED.value:
            return RoleBasedEvaluationAdapter(datasets)
        else:
            raise ValueError(f"不支持的数据格式: {data_format}")
    
    @staticmethod
    def validate_datasets_format_consistency(datasets: Optional[List[InferenceResultDataset]] = None) -> str:
        """
        验证所有数据集的数据格式是否一致
        
        Args:
            datasets: 推理结果数据集对象列表（可以为空）
            
        Returns:
            str: 统一的数据格式（如果列表为空，返回默认格式 prompt-response）
            
        Raises:
            ValueError: 如果数据格式不一致
        """
        # 如果数据集列表为空，返回默认格式
        if not datasets:
            return DatasetFormat.PROMPT_RESPONSE.value
        
        # 收集所有数据集的格式
        formats = []
        for dataset in datasets:
            dataset_format = dataset.dataset_format
            # 如果没有指定格式，默认使用 prompt-response
            if not dataset_format:
                dataset_format = DatasetFormat.PROMPT_RESPONSE.value
            formats.append(dataset_format)
        
        # 检查格式是否一致
        unique_formats = list(set(formats))
        if len(unique_formats) > 1:
            format_info = {}
            for dataset in datasets:
                fmt = dataset.dataset_format or DatasetFormat.PROMPT_RESPONSE.value
                if fmt not in format_info:
                    format_info[fmt] = []
                format_info[fmt].append(f"{dataset.id}({dataset.name})")
            
            error_msg = "对比评估中的所有推理结果集数据格式必须一致，但发现以下不一致：\n"
            for fmt, dataset_list in format_info.items():
                error_msg += f"  格式 {fmt}: {', '.join(dataset_list)}\n"
            raise ValueError(error_msg)
        
        # 返回统一的数据格式
        return unique_formats[0]

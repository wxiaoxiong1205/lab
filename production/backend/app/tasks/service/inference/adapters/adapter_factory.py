"""
适配器工厂类
根据数据格式创建对应的适配器实例
"""
from app.schemas.model import ModelType
from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.tasks.service.inference.adapters.prompt_response_adapter import PromptResponseAdapter
from app.tasks.service.inference.adapters.role_based_adapter import RoleBasedImageUnderstandingAdapter, \
    RoleBasedTextGenerationAdapter
from app.tasks.service.inference.adapters.prefix_suffix_middle_adapter import PrefixSuffixMiddleAdapter
from app.models.inference_result_manager import InferenceResultDataset
from app.schemas import DatasetFormat


class AdapterFactory:
    """适配器工厂类"""
    
    @staticmethod
    def create_adapter(dataset: InferenceResultDataset) -> BaseDataFormatAdapter:
        """
        根据数据集格式创建对应的适配器
        
        Args:
            dataset: 推理结果数据集对象
            
        Returns:
            BaseDataFormatAdapter: 对应的适配器实例
            
        Raises:
            ValueError: 如果数据格式不支持
        """
        dataset_format = dataset.dataset_format
        dataset_type = dataset.dataset_type
        
        # 如果没有指定格式，默认使用 prompt-response
        if not dataset_format:
            dataset_format = DatasetFormat.PROMPT_RESPONSE.value
        
        # 根据格式创建适配器
        if dataset_format == DatasetFormat.PROMPT_RESPONSE.value:
            return PromptResponseAdapter(dataset)
        elif dataset_format == DatasetFormat.ROLE_BASED.value and dataset_type == ModelType.IMAGE_UNDERSTANDING.value:
            return RoleBasedImageUnderstandingAdapter(dataset)
        elif dataset_format == DatasetFormat.ROLE_BASED.value and dataset_type == ModelType.TEXT_GENERATION.value:
            return RoleBasedTextGenerationAdapter(dataset)
        elif dataset_format == DatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
            return PrefixSuffixMiddleAdapter(dataset)
        elif dataset_format == DatasetFormat.BUSINESS.value:
            # 业务推理结果数据集使用 PromptResponseAdapter（文件结构相同
            return PromptResponseAdapter(dataset)
        else:
            raise ValueError(f"不支持的数据格式: {dataset_format}")

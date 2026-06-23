"""
数据格式适配器模块
用于处理不同数据格式的推理任务配置差异
"""

from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.tasks.service.inference.adapters.prompt_response_adapter import PromptResponseAdapter
from app.tasks.service.inference.adapters.role_based_adapter import RoleBasedImageUnderstandingAdapter
from app.tasks.service.inference.adapters.prefix_suffix_middle_adapter import PrefixSuffixMiddleAdapter
from app.tasks.service.inference.adapters.adapter_factory import AdapterFactory

__all__ = [
    "BaseDataFormatAdapter",
    "PromptResponseAdapter",
    "RoleBasedImageUnderstandingAdapter",
    "PrefixSuffixMiddleAdapter",
    "AdapterFactory",
]

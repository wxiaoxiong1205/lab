from enum import Enum
from typing import Dict, List, Optional, Type, Any

from app.common.status import TaskStatus
from app.schemas.model import ModelType, ModelProvider
from app.schemas.training_dataset import DatasetFormat, DatasetUsage, TrainingDatasetUploadTypeCategory
from app.schemas.training_task import (
    TrainingTypeCategory, TrainingMethodType, FineTuningType,
    MonitoringTool, RoPEType, LRSchedulerType,
    EvalStrategy, SaveStrategy
)
from app.schemas.evaluation_task import MetricsParam
from app.schemas.repository_image import CardType, CardModel
from app.schemas.inference_service import InferenceServiceModelType
from app.schemas.benchmark_task import BenchmarkModelProvider
from .interface import EnumService, EnumOption, EnumInfo, EnumListResponse
from ...schemas.inference_result import InferenceResultDatasetUploadType


def get_enum_description(enum_class, enum_value) -> Optional[str]:
    """获取枚举值的描述（如果枚举类有get_description方法）"""
    try:
        if hasattr(enum_class, 'get_description'):
            return enum_class.get_description(enum_value.value)
        return None
    except:
        return None


class DefaultEnumService(EnumService):
    """枚举服务实现类"""

    def get_enum_registry(self) -> Dict[str, Dict[str, Any]]:
        """获取枚举注册表（包含所有枚举类及元信息）"""
        return {
            # 模型相关枚举
            "ModelType": {
                "enum_class": ModelType,
                "module": "model",
                "description": "模型类型，支持文本生成、图像生成、图像理解和多模态"
            },
            "ModelProvider": {
                "enum_class": ModelProvider,
                "module": "model",
                "description": "模型提供商，目前支持Qwen和Llama"
            },

            # 训练数据集相关枚举
            "DatasetFormat": {
                "enum_class": DatasetFormat,
                "module": "training_dataset",
                "description": "训练数据集格式，支持多种数据组织方式"
            },
            "DatasetUsage": {
                "enum_class": DatasetUsage,
                "module": "training_dataset",
                "description": "数据集用途，区分训练数据集和验证数据集"
            },
            "TrainingDatasetUploadTypeCategory": {
                "enum_class": TrainingDatasetUploadTypeCategory,
                "module": "training_dataset",
                "description": "上传数据集文件类型枚举"
            },

            # 训练任务相关枚举
            "TrainingTypeCategory": {
                "enum_class": TrainingTypeCategory,
                "module": "training_task",
                "description": "训练类型分类，与ModelType对应"
            },
            "TrainingMethodType": {
                "enum_class": TrainingMethodType,
                "module": "training_task",
                "description": "训练方法类型，支持SFT和DPO"
            },
            "FineTuningType": {
                "enum_class": FineTuningType,
                "module": "training_task",
                "description": "微调类型，支持LoRA、全参数和冻结参数"
            },
            "TrainingTaskStatus": {
                "enum_class": TaskStatus,
                "module": "training_task",
                "description": "训练任务状态"
            },
            "MonitoringTool": {
                "enum_class": MonitoringTool,
                "module": "training_task",
                "description": "训练监控工具选择"
            },
            "RoPEType": {
                "enum_class": RoPEType,
                "module": "training_task",
                "description": "RoPE（旋转位置编码）类型"
            },
            "LRSchedulerType": {
                "enum_class": LRSchedulerType,
                "module": "training_task",
                "description": "学习率调度器类型"
            },
            "EvalStrategy": {
                "enum_class": EvalStrategy,
                "module": "training_task",
                "description": "评估策略"
            },
            "SaveStrategy": {
                "enum_class": SaveStrategy,
                "module": "training_task",
                "description": "模型保存策略"
            },

            # 评估任务指标参数相关枚举
            "MetricsParam": {
                "enum_class": MetricsParam,
                "module": "evaluation_task",
                "description": "指标参数，用于评估任务中的参数定义"
            },

            # 推理结果集相关枚举
            "InferenceResultDatasetUploadType": {
                "enum_class": InferenceResultDatasetUploadType,
                "module": "inference_result",
                "description": "推理结果数据集类型，支持XLSX、CSV和JSONL"
            },

            # 资源相关枚举
            "CardType": {
                "enum_class": CardType,
                "module": "resource",
                "description": "显卡类型，支持GPU、NPU和CPU"
            },
            "CardModel": {
                "enum_class": CardModel,
                "module": "resource",
                "description": "显卡型号，目前支持A800、V100和NPU 910B"
            },

            # 在线推理服务相关枚举
            "InferenceServiceModelType": {
                "enum_class": InferenceServiceModelType,
                "module": "inference_service",
                "description": "在线推理服务模型类型"
            },
            "InferenceServiceModelProvider": {
                "enum_class": BenchmarkModelProvider,
                "module": "benchmark",
                "description": "基准评估在线服务模型提供商，支持 openai、deepseek、qwen、zhipu、kimi、minimax、gemini"
            },
        }

    def get_enum_description(self, enum_class: Type[Enum], enum_value: Enum) -> Optional[str]:
        """获取枚举值的描述（如果枚举类有get_description方法）"""
        try:
            if hasattr(enum_class, 'get_description'):
                return enum_class.get_description(enum_value.value)  # 调用枚举类自定义的描述方法
            return None
        except Exception as e:
            # 忽略获取描述时的异常，返回None
            return None

    def get_enum_options(self, enum_class: Type[Enum]) -> List[EnumOption]:
        """获取指定枚举类的所有选项"""
        options = []
        for item in enum_class:
            description = self.get_enum_description(enum_class, item)
            # 如果枚举值有 name_cn 属性，使用它作为描述
            if hasattr(item, 'name_cn') and item.name_cn:
                description = item.name_cn
            options.append(EnumOption(
                name=item.name,
                value=item.value,
                description=description
            ))
        return options

    def list_enums(self, module: Optional[str] = None) -> EnumListResponse:
        """获取枚举列表（支持按模块筛选）"""
        enum_registry = self.get_enum_registry()
        enums_by_module: Dict[str, List[EnumInfo]] = {}
        all_enums: List[EnumInfo] = []

        # 处理空字符串模块筛选（视为None）
        if module is not None and isinstance(module, str) and module.strip() == "":
            module = None

        # 遍历注册表构建枚举信息
        for enum_name, enum_meta in enum_registry.items():
            enum_module = enum_meta["module"]
            enum_class = enum_meta["enum_class"]

            # 按模块筛选
            if module is not None and enum_module != module:
                continue

            # 构建枚举详情
            enum_options = self.get_enum_options(enum_class)
            enum_info = EnumInfo(
                enum_name=enum_name,
                module=enum_module,
                description=enum_meta["description"],
                options=enum_options
            )

            # 按模块分组
            if enum_module not in enums_by_module:
                enums_by_module[enum_module] = []
            enums_by_module[enum_module].append(enum_info)
            all_enums.append(enum_info)

        return EnumListResponse(
            total_count=len(all_enums),
            enums_by_module=enums_by_module,
            all_enums=all_enums
        )
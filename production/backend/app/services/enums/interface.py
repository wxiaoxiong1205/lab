from typing import Dict, List, Optional, Type, Any
from abc import ABC, abstractmethod
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas import DatasetFormat, TrainingTypeCategory, TrainingMethodType, FineTuningType
from app.schemas.model import ModelType, ModelProvider
from app.schemas.benchmark_task import BenchmarkModelProvider
from app.schemas.training_dataset import DatasetUsage
from app.schemas.training_task import MonitoringTool, RoPEType, LRSchedulerType, EvalStrategy, SaveStrategy
from app.schemas.evaluation_task import MetricsParam
from app.tasks import TaskStatus


class EnumOption(BaseModel):
    """枚举选项模型"""
    name: str = Field(..., description="枚举项名称")
    value: str = Field(..., description="枚举项值")
    description: Optional[str] = Field(None, description="枚举项描述")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "TEXT_GENERATION",
                "value": "text-generation",
                "description": "文本生成模型"
            }
        }


class EnumInfo(BaseModel):
    """枚举信息模型"""
    enum_name: str = Field(..., description="枚举类名称")
    module: str = Field(..., description="所属模块")
    description: Optional[str] = Field(None, description="枚举描述")
    options: List[EnumOption] = Field(..., description="枚举选项列表")

    class Config:
        json_schema_extra = {
            "example": {
                "enum_name": "ModelType",
                "module": "model",
                "description": "模型类型，支持文本生成、图像生成、图像理解和多模态",
                "options": [
                    {
                        "name": "TEXT_GENERATION",
                        "value": "text-generation",
                        "description": None
                    },
                    {
                        "name": "IMAGE_GENERATION",
                        "value": "image-generation",
                        "description": None
                    }
                ]
            }
        }


class EnumListResponse(BaseModel):
    """枚举列表响应模型"""
    total_count: int = Field(..., description="枚举总数")
    enums_by_module: Dict[str, List[EnumInfo]] = Field(..., description="按模块分组的枚举详细信息")
    all_enums: List[EnumInfo] = Field(..., description="所有枚举详细信息列表")

    class Config:
        json_schema_extra = {
            "example": {
                "total_count": 2,
                "enums_by_module": {
                    "model": [
                        {
                            "enum_name": "ModelType",
                            "module": "model",
                            "description": "模型类型，支持文本生成、图像生成、图像理解和多模态",
                            "options": [
                                {"name": "TEXT_GENERATION", "value": "text-generation", "description": None},
                                {"name": "IMAGE_GENERATION", "value": "image-generation", "description": None}
                            ]
                        }
                    ]
                },
                "all_enums": [
                    {
                        "enum_name": "ModelType",
                        "module": "model",
                        "description": "模型类型，支持文本生成、图像生成、图像理解和多模态",
                        "options": [
                            {"name": "TEXT_GENERATION", "value": "text-generation", "description": None}
                        ]
                    }
                ]
            }
        }


# 枚举注册表 - 包含所有可用的枚举类及其元信息
ENUM_REGISTRY = {
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

    # 评估任务相关枚举
    "MetricsParam": {
        "enum_class": MetricsParam,
        "module": "evaluation_task",
        "description": "指标参数，用于评估任务中的参数定义"
    },

    # 基准评估在线服务模型提供商（原在线推理服务提供商枚举，现由基准评估提供）
    "InferenceServiceModelProvider": {
        "enum_class": BenchmarkModelProvider,
        "module": "benchmark",
        "description": "基准评估在线服务模型提供商，支持 openai、deepseek、qwen、zhipu、kimi、minimax、gemini"
    },
}

class EnumService(ABC):
    """枚举服务抽象接口类"""

    @abstractmethod
    def get_enum_registry(self) -> Dict[str, Dict[str, Any]]:
        """获取枚举注册表（包含所有枚举类及元信息）"""
        pass

    @abstractmethod
    def get_enum_options(self, enum_class: Type[Enum]) -> List[EnumOption]:
        """获取指定枚举类的所有选项"""
        pass

    @abstractmethod
    def get_enum_description(self, enum_class: Type[Enum], enum_value: Enum) -> Optional[str]:
        """获取枚举值的描述（支持自定义描述方法）"""
        pass

    @abstractmethod
    def list_enums(self, module: Optional[str] = None) -> EnumListResponse:
        """获取枚举列表（支持按模块筛选）"""
        pass




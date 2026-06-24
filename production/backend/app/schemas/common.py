from typing import Optional, TypeVar, Generic
from pydantic import BaseModel, ConfigDict, model_validator, Field
from datetime import datetime, timezone
from app.utils.timezone_utils import to_local_tz
from enum import Enum


class DatasetSampleFileCategory(str, Enum):
    """测试/训练/验证数据集样例文件文件名称与下载名称配置枚举字典"""
    IMAGE_UNDERSTANDING_ROLE_BASED = ("image_understand_qa_role_based", "图像理解对话样例(role-based)")
    IMAGE_UNDERSTANDING_GRPO = ("image_understand_qa_grpo", "图像理解强化学习样例(grpo)")
    TEXT_GENERATION_PROMPT_RESPONSE = ("text_generation_qa_prompt_response", "文本生成对话样例(prompt-response)")
    TEXT_GENERATION_ALPACA = ("text_generation_qa_alpaca", "文本生成样例(alpaca)")
    TEXT_GENERATION_DPO_ALPACA = ("text_generation_qa_dpo_alpaca", "文本生成偏好样例(alpaca)")
    TEXT_GENERATION_ROLE_BASED =  ("text_generation_qa_role_based", "文本生成对话样例(role-based)")
    TEXT_GENERATION_ROLE_BASED_JSON = ("text_generation_qa_role_based_json", "文本生成对话样例json(role-based)")
    TEXT_GENERATION_ROLE_BASED_JSONL = ("text_generation_qa_role_based_jsonl", "文本生成对话样例jsonl(role-based)")
    TEXT_GENERATION_ROLE_BASED_XLSX = ("text_generation_qa_role_based_xlsx", "文本生成对话样例xlsx(role-based)")
    TEXT_GENERATION_DPO_ROLE_BASED = ("text_generation_qa_dpo_role_based", "文本生成偏好对话样例(role-based)")
    TEXT_GENERATION_GRPO = ("text_generation_qa_grpo", "文本生成强化学习样例(grpo)")
    BUSINESS_TEST_BUSINESS = ("business_sample_dataset", "业务数据集样例(business)")

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        return self._description

    @classmethod
    def get_description_by_value(cls, value: str) -> Optional[str]:
        """根据值获取描述"""
        try:
            enum_member = cls(value)
            return enum_member.description
        except ValueError:
            return None


class InferenceResultSampleFileCategory(str, Enum):
    """推理结果集样例文件文件名称与下载名称配置枚举字典"""
    IMAGE_UNDERSTANDING_ROLE_BASED = ("inference_image_understanding_qa_role_based", "图像理解推理结果集样例(role-based)")
    TEXT_GENERATION_PROMPT_RESPONSE = ("inference_text_generation_qa_prompt_response", "文本生成推理结果集样例(prompt-response)")
    TEXT_GENERATION_ROLE_BASED = ("inference_text_generation_qa_role_based", "文本生成推理结果集样例(role-based)")
    TEXT_GENERATION_ROLE_BASED_JSON = ("inference_text_generation_qa_role_based_json", "文本生成推理结果集样例json(role-based)")
    TEXT_GENERATION_ROLE_BASED_JSONL = ("inference_text_generation_qa_role_based_jsonl", "文本生成推理结果集样例jsonl(role-based)")
    TEXT_GENERATION_ROLE_BASED_XLSX = ("inference_text_generation_qa_role_based_xlsx", "文本生成推理结果集样例xlsx(role-based)")
    BUSINESS_TEST_BUSINESS = ("business_sample_dataset", "业务推理结果集样例(business)")

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        return self._description

    @classmethod
    def get_description_by_value(cls, value: str) -> Optional[str]:
        """根据值获取描述"""
        try:
            enum_member = cls(value)
            return enum_member.description
        except ValueError:
            return None


class ModelTypeBase(str, Enum):
    """基础模型类型枚举"""
    TEXT_GENERATION = "text-generation", "文本生成"
    IMAGE_GENERATION = "image-generation", "图像生成"
    IMAGE_UNDERSTANDING = "image-understanding", "图像理解"
    MULTIMODAL = "multimodal", "多模态"

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        return self._description

    @classmethod
    def get_description_by_value(cls, value: str) -> Optional[str]:
        """根据值获取描述"""
        try:
            # 通过值查找枚举成员
            enum_member = cls(value)
            return enum_member.description
        except ValueError:
            # 如果值不存在，返回None
            return None

class ConnectionStatus(str, Enum):
    """连接状态枚举"""
    UNTESTED = "未测试"
    CONNECTED = "连接正常"
    FAILED = "连接失败"


class BaseModelWithTimezone(BaseModel):
    """基础模型类，自动将datetime字段转换为本地时区"""

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='after')
    def convert_datetime_fields(self) -> 'BaseModelWithTimezone':
        """将所有datetime字段转换为本地时区"""
        for field_name, field_value in self.__dict__.items():
            if isinstance(field_value, datetime):
                setattr(self, field_name, to_local_tz(field_value))
        return self

# 定义泛型类型变量
T = TypeVar('T')

class ResModel(BaseModelWithTimezone, Generic[T]):
    code: int
    msg: str
    payload: Optional[T] = None  # 可接收单个对象或数组

"""
ModelHandle 基类：定义单标签文本分类任务的统一处理接口。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass

import torch


@dataclass
class PredictionResult:
    """
    单标签文本分类中间结果。

    - `class_id` 使用 0-based 编号；
    - `score` 为 top1 概率。
    """

    class_id: int
    score: float


class ModelHandle(ABC):
    """
    单标签文本分类任务的后处理接口。

    平台固定骨架负责文本读取、分词、模型推理和协议编码，
    业务实现只需要将模型输出转换为 `PredictionResult`。
    """

    _DEFAULT_MAX_LEN = 128

    @abstractmethod
    def post_handle(self, model_output: torch.Tensor) -> PredictionResult:
        """
        将单次模型输出转换为标准化分类结果。
        """
        raise NotImplementedError

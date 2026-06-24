"""
ModelHandle 基类：定义多标签文本分类任务的统一处理接口。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List

import torch


@dataclass
class PredictedLabel:
    """
    多标签任务中单个命中标签的中间结果。

    - `class_id` 使用 0-based 编号；
    - `score` 为该类别的 sigmoid 概率。
    """

    class_id: int
    score: float


@dataclass
class PredictionResult:
    """
    多标签文本分类中间结果。
    """

    labels: List[PredictedLabel]


class ModelHandle(ABC):
    """
    多标签文本分类任务的后处理接口。

    平台固定骨架负责文本读取、分词、模型推理和协议编码，
    业务实现只需要将模型输出转换为 `PredictionResult`。
    """

    _DEFAULT_MAX_LEN = 128

    @abstractmethod
    def post_handle(self, model_output: torch.Tensor, threshold: float) -> PredictionResult:
        """
        将单次模型输出转换为标准化多标签结果。
        """
        raise NotImplementedError

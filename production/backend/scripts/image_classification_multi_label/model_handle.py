"""
ModelHandle 基类：定义单图多标签图像分类任务的处理接口。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List

import torch


@dataclass
class PredictedLabel:
    """
    多标签任务中单个命中标签的预测结果。

    - class_id:
      模型输出的类别索引，使用 0-based 编号。
    - score:
      该类别的 sigmoid 概率。
    """

    class_id: int
    score: float


@dataclass
class PredictionResult:
    """
    单图多标签图像分类预测结果。

    - labels:
      所有通过阈值筛选的标签集合。
      每个元素都包含 0-based `class_id` 与对应的 `score`。
    """

    labels: List[PredictedLabel]


class ModelHandle(ABC):
    """
    ModelHandle 基类。

    单图多标签图像分类任务下，平台会固定执行以下链路：
    1. 下载任务图片并准备本地路径；
    2. 调用 `pre_handle` 将图片转换成模型输入 tensor；
    3. 执行 TorchScript 模型推理；
    4. 调用 `post_handle` 将模型原始输出转换为标准 `PredictionResult`。
    """

    @abstractmethod
    def pre_handle(self, image_path: str) -> torch.Tensor:
        """
        预处理单张图片。

        :param image_path: 平台已准备好的本地图片路径
        :return: 可直接送入 Torch 模型的输入 tensor，通常形状为 [1, 3, H, W]
        """
        raise NotImplementedError

    @abstractmethod
    def post_handle(self, model_output: torch.Tensor, threshold: float) -> PredictionResult:
        """
        后处理单次模型输出。

        :param model_output: TorchScript 模型原始输出，当前任务约定为分类 logits
        :param threshold: 多标签筛选阈值，通常来自 `Choices` 控件的 `model_score_threshold`
        :return: 标准化后的多标签分类结果
        """
        raise NotImplementedError

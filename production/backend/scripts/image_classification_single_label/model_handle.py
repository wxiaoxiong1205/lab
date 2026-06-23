"""
ModelHandle 基类：定义单标签图像分类任务的处理接口。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass

import torch


@dataclass
class PredictionResult:
    """
    单标签图像分类预测结果。

    - class_id:
      模型输出的类别索引，使用 0-based 编号。
      当前项目的训练代码与离线评估脚本都使用该编号方式。
      在线服务会在结果映射阶段把它转换为平台要求的 1-based `Choices index`。
    - score:
      预测为该类别的置信度，取值范围为 0.0 ~ 1.0。
      当前 demo 约定该值来自 softmax 后 top1 概率。
    """

    class_id: int
    score: float


class ModelHandle(ABC):
    """
    ModelHandle 基类。

    图像分类任务下，平台会固定执行以下链路：
    1. 下载任务图片并准备本地路径；
    2. 调用 `pre_handle` 将图片转换成模型输入 tensor；
    3. 执行 TorchScript 模型推理；
    4. 调用 `post_handle` 将模型原始输出转换为标准 `PredictionResult`。

    用户只需要实现与模型强相关的输入输出转换逻辑，
    不需要关心 Label Studio 协议解析、HTTP 接口或结果 JSON 拼装。
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
    def post_handle(self, model_output: torch.Tensor) -> PredictionResult:
        """
        后处理单次模型输出。

        :param model_output: TorchScript 模型原始输出，当前任务约定为分类 logits
        :return: 标准化后的单标签分类结果
        """
        raise NotImplementedError

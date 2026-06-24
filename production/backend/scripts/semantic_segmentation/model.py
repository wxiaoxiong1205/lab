"""
ModelHandle 基类：定义语义分割模型处理的接口。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np
import torch


@dataclass
class PredictionResult:
    """
    语义分割预测结果。

    - mask: 最终类别图，shape=[H, W]，像素值为类别 id
    - confidence_map: 最终类别置信度图，shape=[H, W]，每个像素值表示
      “该像素最终预测类别”的概率，范围为 0.0 ~ 1.0
    """
    mask: np.ndarray
    confidence_map: np.ndarray

class ModelHandle(ABC):
    """
    ModelHandle 基类
    定义模型处理的接口，子类需要实现 pre_handle 和 post_handle 方法

    使用模式：
    1. pre_handle: 预处理输入数据（如图片路径 -> tensor）
    2. post_handle: 后处理模型输出（tensor -> [h, w] mask 图）
    """


    @abstractmethod
    def pre_handle(self, image_path: str) -> torch.Tensor:
        pass

    @abstractmethod
    def post_handle(self, model_output: torch.Tensor) -> PredictionResult:
        pass

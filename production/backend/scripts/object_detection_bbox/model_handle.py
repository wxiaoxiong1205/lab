"""
ModelHandle 基类：定义目标检测任务的统一处理接口。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List

import torch


@dataclass
class ModelInput:
    """
    目标检测任务标准输入。

    - `image_tensor`:
      可直接送入 TorchScript 模型前向的输入张量。
    - `postprocess_context`:
      供 `post_handle` 使用的透传上下文字典。
      当前接口不约定固定字段；如果后处理不需要额外信息，应返回空字典。
      平台不会读取、校验或解释其中内容，只会在调用 `post_handle` 时原样传回。
    """

    image_tensor: torch.Tensor
    postprocess_context: Dict[str, object] = field(default_factory=dict)


@dataclass
class PredictionResult:
    """
    字段说明：
    - `x1` / `y1`：
      检测框左上角在原图坐标系下的像素坐标。
    - `x2` / `y2`：
      检测框右下角在原图坐标系下的像素坐标。
    - `class_id`：
      稳定类别 ID，需要和 `label_config` 中 `RectangleLabels/Label index` 对齐。
    - `score`：
      当前检测框的置信度，取值范围为 0.0 ~ 1.0。

    `PredictionResult` 仅表示平台内部标准检测结果，不等价于最终返回的
    Label Studio 协议 JSON。
    """

    x1: float
    y1: float
    x2: float
    y2: float
    class_id: int
    score: float


class ModelHandle(ABC):
    """
    ModelHandle 基类。

    目标检测任务下，平台会固定执行以下链路：
    1. 下载任务图片并准备本地路径；
    2. 调用 `pre_handle` 将图片转换为目标检测任务定义的标准 `ModelInput`；
    3. 执行 TorchScript 模型推理；
    4. 调用 `post_handle` 将模型原始输出转换为标准 `PredictionResult` 列表；
    5. 平台固定骨架再将其转换为 Label Studio `rectanglelabels` 结果。

    用户只需要在 `model.py` 中实现 `pre_handle` 与 `post_handle`，
    完成与具体模型相关的输入输出转换逻辑。平台不对 `model_output`
    的内部结构做具体模型假设。
    """

    @abstractmethod
    def pre_handle(self, image_path: str) -> ModelInput:
        """
        预处理单张图片。

        :param image_path: 平台已准备好的本地图片路径
        :return:
            目标检测任务定义的标准 `ModelInput` 对象。
            其中 `image_tensor` 必须是 `torch.Tensor`；
            如后处理需要额外上下文，可写入 `postprocess_context`，
            不需要时返回空字典即可。
        """
        raise NotImplementedError

    @abstractmethod
    def post_handle(
        self,
        model_output,
        model_input: ModelInput,
    ) -> List[PredictionResult]:
        """
        后处理单次模型输出。

        :param model_output:
            用户 TorchScript 模型一次前向得到的原始输出，具体结构由用户模型决定
        :param model_input:
            对应本次推理的目标检测任务标准输入对象，
            其中可能包含 `postprocess_context`
        :return: 标准化后的目标检测中间结果列表
        """
        raise NotImplementedError

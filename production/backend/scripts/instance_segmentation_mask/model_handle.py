"""
ModelHandle 基类：定义实例分割（孔洞）任务的统一处理接口。

与 image_segmentation_instance 的区别：
- PredictionResult 输出 binary mask（numpy 数组），而非 polygon points。
- 平台骨架负责将 mask 转换为 polygon_with_holes.regions 格式返回给前端。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np
import torch


@dataclass
class ModelInput:
    """
    实例分割（孔洞）任务标准输入。

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
    单个实例分割（孔洞）结果。

    - `class_id`:
      稳定类别 ID，需要和 `label_config` 中 PolygonLabels/Label index 对齐。
    - `score`:
      当前实例的真实置信度，取值范围为 0.0 ~ 1.0。
    - `mask`:
      原图尺寸的二值 numpy mask，shape=(H, W)，dtype=uint8。
      1 表示前景（当前实例），0 表示背景。
      平台骨架会将 mask 转换为 polygon_with_holes.regions 格式后返回前端。

    `PredictionResult` 仅表示平台内部标准实例结果，不等价于最终返回给前端的 JSON。
    """

    class_id: int
    score: float
    mask: np.ndarray


class ModelHandle(ABC):
    """
    ModelHandle 基类。

    实例分割（孔洞）任务下，平台会固定执行以下链路：
    1. 下载任务图片并准备本地路径；
    2. 调用 `pre_handle` 将图片转换为标准 `ModelInput`；
    3. 执行 TorchScript 模型推理；
    4. 调用 `post_handle` 将模型原始输出转换为标准 `PredictionResult` 列表；
    5. 平台固定骨架将 PredictionResult.mask 编码为 polygon_with_holes.regions 格式返回前端。

    用户只需要在 `model.py` 中实现 `pre_handle` 与 `post_handle`，
    完成与具体模型相关的输入输出转换逻辑。
    """

    @abstractmethod
    def pre_handle(self, image_path: str) -> ModelInput:
        """
        预处理单张图片。

        :param image_path: 平台已准备好的本地图片路径
        :return:
            标准 `ModelInput` 对象。
            `image_tensor` 必须是 `torch.Tensor`；
            如后处理需要额外上下文，可写入 `postprocess_context`。
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
            用户 TorchScript 模型一次前向得到的原始输出，具体结构由用户模型决定。
        :param model_input:
            对应本次推理的标准输入对象，其中可能包含 `postprocess_context`。
        :return:
            标准化后的实例分割中间结果列表，每个结果包含原图尺寸的 binary mask。
        """
        raise NotImplementedError

import logging

import numpy as np
from PIL import Image
import torch

from .model_handle import ModelHandle, PredictedLabel, PredictionResult

logger = logging.getLogger(__name__)


class TorchImageClassificationHandle(ModelHandle):
    """
    单图多标签图像分类示例实现。

    该类只负责模型输入输出转换：
    - `pre_handle` 将图片路径转换成模型输入 tensor；
    - `post_handle` 将模型 logits 转换成标准化多标签结果。
    """

    _MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    _STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    _IMAGE_SIZE = (224, 224)

    def pre_handle(self, image_path: str) -> torch.Tensor:
        """
        将单张图片转换为模型可消费的 `[1, 3, H, W]` tensor。
        """
        try:
            image = Image.open(image_path).convert("RGB")
        except FileNotFoundError:
            raise
        except Exception as exc:
            raise ValueError(f"无法读取图像文件: {image_path}") from exc

        height, width = self._IMAGE_SIZE
        image = image.resize((width, height), Image.BILINEAR)

        image_np = np.asarray(image, dtype=np.float32) / 255.0
        image_np = (image_np - self._MEAN) / self._STD

        image_tensor = torch.from_numpy(
            np.ascontiguousarray(np.transpose(image_np, (2, 0, 1)))
        ).unsqueeze(0)

        return image_tensor

    def post_handle(self, model_output: torch.Tensor, threshold: float) -> PredictionResult:
        """
        将模型原始输出转换为多标签分类结果。

        当前任务约定模型输出为分类 logits，常见形状为 `[1, C]`。
        后处理统一做 sigmoid，并保留所有 `score >= threshold` 的类别。
        """
        logits = self._extract_logits(model_output)

        if logits.ndim == 1:
            logits = logits.unsqueeze(0)

        if logits.ndim != 2:
            raise ValueError(f"图像分类模型输出应为 [B, C]，实际为 {tuple(logits.shape)}")

        if logits.shape[0] != 1:
            raise ValueError(
                "当前 demo 按单任务逐条推理，post_handle 期望单条输出，"
                f"实际 batch 大小为 {logits.shape[0]}"
            )

        probabilities = torch.sigmoid(logits)[0]
        pred_indices = torch.where(probabilities >= threshold)[0].tolist()
        labels = [
            PredictedLabel(class_id=int(idx), score=float(probabilities[idx].item()))
            for idx in pred_indices
        ]

        return PredictionResult(labels=labels)

    @staticmethod
    def _extract_logits(model_output) -> torch.Tensor:
        """
        兼容 TorchScript 常见输出格式，统一提取 logits。
        """
        if isinstance(model_output, torch.Tensor):
            return model_output

        if isinstance(model_output, (list, tuple)):
            if not model_output:
                raise ValueError("模型输出为空列表")
            return TorchImageClassificationHandle._extract_logits(model_output[0])

        if isinstance(model_output, dict):
            if not model_output:
                raise ValueError("模型输出为空字典")
            if "logits" in model_output:
                return TorchImageClassificationHandle._extract_logits(model_output["logits"])
            return TorchImageClassificationHandle._extract_logits(next(iter(model_output.values())))

        raise TypeError(f"不支持的模型输出类型: {type(model_output)}")

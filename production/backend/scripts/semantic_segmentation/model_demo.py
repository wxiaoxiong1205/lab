import logging
import torch
from .model_handle import ModelHandle, PredictionResult
import cv2
import numpy as np

logger = logging.getLogger(__name__)

class TorchSemanticSegmentationHandle(ModelHandle):

    def pre_handle(self, image_path: str) -> torch.Tensor:
        """
        预处理：读取图片 -> 归一化 -> tensor
        """
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"无法读取图像: {image_path}")
        img_resized = cv2.resize(img, (512, 512))
        img_normalized = img_resized.astype(np.float32) / 255.0
        tensor = torch.from_numpy(np.transpose(img_normalized, (2, 0, 1))).unsqueeze(0)
        return tensor
    
    def post_handle(self, model_output: torch.Tensor) -> PredictionResult:
        """
        后处理模型输出，生成分割 mask 图和逐像素置信度图。

        :param model_output: 模型推理输出 tensor，shape 为 [1, num_classes, H, W]
        :return:
            PredictionResult
            - mask: np.ndarray shape=[H, W]，像素值为类别索引
            - confidence_map: np.ndarray shape=[H, W]，像素值为最终预测类别的概率
        """
        if isinstance(model_output, (list, tuple)):
            if not model_output:
                raise ValueError("模型输出为空")
            model_output = model_output[0]
        elif isinstance(model_output, dict):
            if not model_output:
                raise ValueError("模型输出为空")
            model_output = next(iter(model_output.values()))

        if not isinstance(model_output, torch.Tensor):
            raise TypeError(f"不支持的模型输出类型: {type(model_output)}")

        if model_output.ndim != 4:
            raise ValueError(f"语义分割模型输出应为 [B, C, H, W]，实际为 {tuple(model_output.shape)}")

        if model_output.shape[1] == 1:
            # 兼容单通道二分类输出：
            # sigmoid 表示“前景”概率，背景概率为 1 - p。
            foreground_probability = torch.sigmoid(model_output)
            predicted_foreground = (foreground_probability >= 0.5).to(torch.uint8)
            confidence_map = torch.where(
                predicted_foreground.bool(),
                foreground_probability,
                1.0 - foreground_probability,
            )
            pred_class = predicted_foreground.squeeze(0).squeeze(0).cpu().numpy().astype(np.uint8)
            confidence_map_np = confidence_map.squeeze(0).squeeze(0).cpu().numpy().astype(np.float32)
        else:
            # 多分类场景：
            # 1. 对 logits 做 softmax 得到每个像素对各类别的概率分布；
            # 2. 取 argmax 得到最终类别图；
            # 3. 再从概率图中提取“最终预测类别对应的概率”，作为 confidence_map。
            probabilities = torch.softmax(model_output, dim=1)
            predicted_indices = torch.argmax(probabilities, dim=1, keepdim=True)
            confidence_map = torch.gather(probabilities, dim=1, index=predicted_indices)
            pred_class = predicted_indices.squeeze(0).squeeze(0).cpu().numpy().astype(np.uint8)
            confidence_map_np = confidence_map.squeeze(0).squeeze(0).cpu().numpy().astype(np.float32)

        return PredictionResult(mask=pred_class, confidence_map=confidence_map_np)

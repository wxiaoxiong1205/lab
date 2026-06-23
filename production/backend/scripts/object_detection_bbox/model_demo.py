import logging
from typing import Dict, List, Tuple

import cv2
import numpy as np
import torch

from .model_handle import ModelHandle, ModelInput, PredictionResult

logger = logging.getLogger(__name__)


class TorchObjectDetectionHandle(ModelHandle):
    """
    目标检测实现。

    该类只负责两件事：
    1. 把平台提供的图片路径转换成模型输入；
    2. 把 TorchScript 原始输出转换成平台统一的检测框中间结果。
    """

    _IMAGE_SIZE = 640
    _CONF_THRESHOLD = 0.01
    _IOU_THRESHOLD = 0.45
    _LETTERBOX_COLOR = (114, 114, 114)

    def pre_handle(self, image_path: str) -> ModelInput:
        """
        将单张图片转换为当前任务约定的标准输入对象。

        当前示例会完成以下处理：
        - 读取原图；
        - 做等比例缩放与 padding；
        - BGR -> RGB；
        - HWC -> CHW；
        - 归一化到 0~1；
        - 将后处理需要的几何信息写入 `postprocess_context`。
        """
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"无法读取图像: {image_path}")

        original_shape = image.shape[:2]
        letterboxed_image, scale_ratio, padding = self._letterbox(image)
        image_tensor = torch.from_numpy(
            np.ascontiguousarray(
                np.transpose(cv2.cvtColor(letterboxed_image, cv2.COLOR_BGR2RGB), (2, 0, 1))
            )
        ).float().unsqueeze(0) / 255.0

        return ModelInput(
            image_tensor=image_tensor,
            postprocess_context={
                "original_shape": original_shape,
                "scale_ratio": scale_ratio,
                "padding": padding,
            },
        )

    def post_handle(
        self,
        model_output,
        model_input: ModelInput,
    ) -> List[PredictionResult]:
        """
        将模型输出解码为检测框列表。

        当前示例兼容两类常见检测输出：
        - 特征张量形式：`[B, C, N]` 或 `[B, N, C]`
        - 已解码检测框形式：`[B, N, 6]`
        """
        original_shape, scale_ratio, padding = self._parse_postprocess_context(model_input)
        raw_predictions = self._extract_predictions(model_output)
        predictions = self._normalize_predictions(raw_predictions)

        if predictions.shape[0] != 1:
            raise ValueError(
                "当前实现按单任务逐条推理，post_handle 期望单条输出，"
                f"实际 batch 大小为 {predictions.shape[0]}"
            )

        decoded = self._decode_predictions(predictions[0])
        if decoded.numel() == 0:
            diagnostics = self._collect_score_diagnostics(predictions[0])
            logger.warning(
                "目标检测后处理未产出检测框：raw_output_shape=%s, normalized_shape=%s, "
                "feature_count=%s, max_class_score=%.6f, top_class_scores=%s, "
                "max_sigmoid_class_score=%.6f, top_sigmoid_scores=%s",
                tuple(raw_predictions.shape),
                tuple(predictions.shape),
                diagnostics["feature_count"],
                diagnostics["max_class_score"],
                diagnostics["top_class_scores"],
                diagnostics["max_sigmoid_class_score"],
                diagnostics["top_sigmoid_scores"],
            )
            return []

        keep_indices = self._class_aware_nms(
            boxes=decoded[:, :4],
            scores=decoded[:, 4],
            class_ids=decoded[:, 5].to(torch.int64),
        )
        kept = decoded[keep_indices].detach().cpu()
        kept[:, :4] = self._restore_boxes(
            boxes=kept[:, :4],
            original_shape=original_shape,
            scale_ratio=scale_ratio,
            padding=padding,
        )

        logger.info(
            "目标检测后处理完成：raw_output_shape=%s, normalized_shape=%s, "
            "decoded_count=%s, kept_count=%s, top_decoded_scores=%s",
            tuple(raw_predictions.shape),
            tuple(predictions.shape),
            int(decoded.shape[0]),
            int(kept.shape[0]),
            self._topk_values(kept[:, 4]),
        )

        results: List[PredictionResult] = []
        for box in kept.tolist():
            x1, y1, x2, y2, score, class_id = box
            results.append(
                PredictionResult(
                    x1=float(x1),
                    y1=float(y1),
                    x2=float(x2),
                    y2=float(y2),
                    class_id=int(class_id),
                    score=float(score),
                )
            )
        return results

    @classmethod
    def _letterbox(cls, image: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int]]:
        """
        对原图做等比例缩放，并补齐到固定输入尺寸。

        返回值中的 `scale_ratio` 和 `padding` 会在后处理阶段用于把检测框还原到原图。
        """
        original_height, original_width = image.shape[:2]
        scale_ratio = min(cls._IMAGE_SIZE / original_height, cls._IMAGE_SIZE / original_width)

        resized_width = int(round(original_width * scale_ratio))
        resized_height = int(round(original_height * scale_ratio))
        resized_image = cv2.resize(
            image,
            (resized_width, resized_height),
            interpolation=cv2.INTER_LINEAR,
        )

        pad_width = cls._IMAGE_SIZE - resized_width
        pad_height = cls._IMAGE_SIZE - resized_height
        pad_left = int(round(pad_width / 2 - 0.1))
        pad_right = int(round(pad_width / 2 + 0.1))
        pad_top = int(round(pad_height / 2 - 0.1))
        pad_bottom = int(round(pad_height / 2 + 0.1))

        padded_image = cv2.copyMakeBorder(
            resized_image,
            pad_top,
            pad_bottom,
            pad_left,
            pad_right,
            cv2.BORDER_CONSTANT,
            value=cls._LETTERBOX_COLOR,
        )
        return padded_image, float(scale_ratio), (pad_left, pad_top)

    @staticmethod
    def _parse_postprocess_context(model_input: ModelInput) -> Tuple[Tuple[int, int], float, Tuple[int, int]]:
        """
        校验并提取当前示例写入 `postprocess_context` 的关键字段。
        """
        if not isinstance(model_input, ModelInput):
            raise TypeError(f"model_input 必须是 ModelInput，实际类型为: {type(model_input)}")

        if not isinstance(model_input.image_tensor, torch.Tensor):
            raise ValueError("ModelInput.image_tensor 必须是 torch.Tensor")

        if not isinstance(model_input.postprocess_context, dict):
            raise ValueError("ModelInput.postprocess_context 必须是 dict")

        context = model_input.postprocess_context

        try:
            original_shape = tuple(int(value) for value in context["original_shape"])
            padding = tuple(int(value) for value in context["padding"])
            scale_ratio = float(context["scale_ratio"])
        except KeyError as exc:
            raise ValueError(
                "当前示例要求 postprocess_context 至少包含 "
                "`original_shape`、`scale_ratio`、`padding`"
            ) from exc
        except Exception as exc:
            raise ValueError(
                "postprocess_context 中的 `original_shape`、`scale_ratio`、`padding` "
                "格式不正确"
            ) from exc

        return original_shape, scale_ratio, padding

    @staticmethod
    def _extract_predictions(model_output) -> torch.Tensor:
        """
        从 TorchScript 常见输出结构中提取检测预测张量。
        """
        if isinstance(model_output, torch.Tensor):
            return model_output
        if isinstance(model_output, (list, tuple)):
            if not model_output:
                raise ValueError("模型输出为空列表")
            return TorchObjectDetectionHandle._extract_predictions(model_output[0])
        if isinstance(model_output, dict):
            if not model_output:
                raise ValueError("模型输出为空字典")
            for key in ("preds", "prediction", "output", "logits"):
                if key in model_output:
                    return TorchObjectDetectionHandle._extract_predictions(model_output[key])
            return TorchObjectDetectionHandle._extract_predictions(next(iter(model_output.values())))
        raise TypeError(f"不支持的模型输出类型: {type(model_output)}")

    @staticmethod
    def _normalize_predictions(predictions: torch.Tensor) -> torch.Tensor:
        """
        将模型输出统一整理成 `[B, N, C]`。
        """
        if not isinstance(predictions, torch.Tensor):
            raise TypeError(f"检测模型输出必须是 torch.Tensor，实际为: {type(predictions)}")

        if predictions.ndim == 2:
            predictions = predictions.unsqueeze(0)
        if predictions.ndim != 3:
            raise ValueError(
                "目标检测模型输出应为 3 维张量，"
                f"实际 shape 为 {tuple(predictions.shape)}"
            )
        if predictions.shape[1] >= 6 and predictions.shape[2] > predictions.shape[1]:
            predictions = predictions.transpose(1, 2)
        return predictions.contiguous()

    @classmethod
    def _decode_predictions(cls, prediction: torch.Tensor) -> torch.Tensor:
        """
        将单张图片的检测输出转换成统一的 `[N, 6]`：
        `[x1, y1, x2, y2, score, class_id]`。
        """
        if prediction.ndim != 2:
            raise ValueError(
                "单张图片的检测输出应为二维张量，"
                f"实际 shape 为 {tuple(prediction.shape)}"
            )

        prediction = prediction.detach()
        prediction = prediction[torch.isfinite(prediction).all(dim=1)]
        if prediction.numel() == 0:
            return prediction.new_zeros((0, 6))

        feature_count = prediction.shape[1]
        if feature_count < 6:
            raise ValueError(
                "目标检测输出的最后一维至少应包含 6 个元素，"
                f"实际为 {feature_count}"
            )

        if feature_count == 6:
            boxes = cls._maybe_xywh_to_xyxy(prediction[:, :4])
            scores = prediction[:, 4]
            class_ids = prediction[:, 5]
        else:
            boxes = cls._xywh_to_xyxy(prediction[:, :4])
            scores, class_ids = torch.max(prediction[:, 4:], dim=1)

        keep_mask = scores >= cls._CONF_THRESHOLD
        if not keep_mask.any():
            return prediction.new_zeros((0, 6))

        return torch.cat(
            [
                boxes[keep_mask],
                scores[keep_mask].unsqueeze(1),
                class_ids[keep_mask].to(boxes.dtype).unsqueeze(1),
            ],
            dim=1,
        )

    @classmethod
    def _collect_score_diagnostics(cls, prediction: torch.Tensor) -> Dict[str, object]:
        """
        汇总原始输出的分类分数，用于定位“模型执行成功但没有检测框”的原因。
        """
        feature_count = int(prediction.shape[1]) if prediction.ndim == 2 else 0
        if prediction.numel() == 0 or feature_count <= 4:
            return {
                "feature_count": feature_count,
                "max_class_score": 0.0,
                "top_class_scores": [],
                "max_sigmoid_class_score": 0.0,
                "top_sigmoid_scores": [],
            }

        class_scores = prediction[:, 4:]
        raw_scores = torch.max(class_scores, dim=1).values
        sigmoid_scores = torch.max(torch.sigmoid(class_scores), dim=1).values
        return {
            "feature_count": feature_count,
            "max_class_score": float(raw_scores.max().item()),
            "top_class_scores": cls._topk_values(raw_scores),
            "max_sigmoid_class_score": float(sigmoid_scores.max().item()),
            "top_sigmoid_scores": cls._topk_values(sigmoid_scores),
        }

    @staticmethod
    def _topk_values(values: torch.Tensor, limit: int = 5) -> List[float]:
        """
        提取张量中的 top-k 数值，方便直接写入日志。
        """
        if values.numel() == 0:
            return []
        topk = min(limit, int(values.numel()))
        return [float(value) for value in torch.topk(values, k=topk).values.tolist()]

    @classmethod
    def _class_aware_nms(
        cls,
        boxes: torch.Tensor,
        scores: torch.Tensor,
        class_ids: torch.Tensor,
    ) -> torch.Tensor:
        """
        按类别执行 NMS，不同类别之间互不抑制。
        """
        if boxes.numel() == 0:
            return torch.empty((0,), dtype=torch.long, device=boxes.device)

        kept_groups = []
        for class_id in torch.unique(class_ids):
            class_indices = torch.where(class_ids == class_id)[0]
            kept_groups.append(class_indices[cls._nms(boxes[class_indices], scores[class_indices])])

        merged_indices = torch.cat(kept_groups, dim=0)
        return merged_indices[torch.argsort(scores[merged_indices], descending=True)]

    @classmethod
    def _nms(cls, boxes: torch.Tensor, scores: torch.Tensor) -> torch.Tensor:
        """
        纯 torch 实现的单类别 NMS。
        """
        if boxes.numel() == 0:
            return torch.empty((0,), dtype=torch.long, device=boxes.device)

        order = torch.argsort(scores, descending=True)
        keep = []
        while order.numel() > 0:
            current = order[0]
            keep.append(current)
            if order.numel() == 1:
                break
            remaining = order[1:]
            iou = cls._box_iou(boxes[current].unsqueeze(0), boxes[remaining]).squeeze(0)
            order = remaining[iou <= cls._IOU_THRESHOLD]
        return torch.stack(keep)

    @staticmethod
    def _box_iou(boxes1: torch.Tensor, boxes2: torch.Tensor) -> torch.Tensor:
        """
        计算两组 `xyxy` 检测框之间的 IoU。
        """
        if boxes1.numel() == 0 or boxes2.numel() == 0:
            return boxes1.new_zeros((boxes1.shape[0], boxes2.shape[0]))

        top_left = torch.maximum(boxes1[:, None, :2], boxes2[:, :2])
        bottom_right = torch.minimum(boxes1[:, None, 2:], boxes2[:, 2:])
        intersection_wh = (bottom_right - top_left).clamp(min=0)
        intersection_area = intersection_wh[..., 0] * intersection_wh[..., 1]

        area1 = (boxes1[:, 2] - boxes1[:, 0]).clamp(min=0) * (boxes1[:, 3] - boxes1[:, 1]).clamp(min=0)
        area2 = (boxes2[:, 2] - boxes2[:, 0]).clamp(min=0) * (boxes2[:, 3] - boxes2[:, 1]).clamp(min=0)
        return intersection_area / (area1[:, None] + area2 - intersection_area + 1e-6)

    @staticmethod
    def _maybe_xywh_to_xyxy(boxes: torch.Tensor) -> torch.Tensor:
        """
        对 6 维检测框输出做轻量判断：
        - 如果已经像 `xyxy`，直接返回；
        - 否则按 `xywh` 转成 `xyxy`。
        """
        if boxes.numel() == 0:
            return boxes

        looks_like_xyxy = ((boxes[:, 2] >= boxes[:, 0]) & (boxes[:, 3] >= boxes[:, 1])).float().mean().item()
        return boxes if looks_like_xyxy >= 0.9 else TorchObjectDetectionHandle._xywh_to_xyxy(boxes)

    @staticmethod
    def _xywh_to_xyxy(boxes: torch.Tensor) -> torch.Tensor:
        """
        将 `xywh(center_x, center_y, width, height)` 转成 `xyxy`。
        """
        converted = boxes.clone()
        converted[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
        converted[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
        converted[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
        converted[:, 3] = boxes[:, 1] + boxes[:, 3] / 2
        return converted

    @staticmethod
    def _restore_boxes(
        boxes: torch.Tensor,
        original_shape: Tuple[int, int],
        scale_ratio: float,
        padding: Tuple[int, int],
    ) -> torch.Tensor:
        """
        将 letterbox 坐标系下的框还原到原图像素坐标系。
        """
        original_height, original_width = original_shape
        pad_left, pad_top = padding

        boxes = boxes.clone()
        boxes[:, [0, 2]] -= float(pad_left)
        boxes[:, [1, 3]] -= float(pad_top)
        boxes[:, :4] /= float(scale_ratio)
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clamp(0, float(original_width))
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clamp(0, float(original_height))
        return boxes

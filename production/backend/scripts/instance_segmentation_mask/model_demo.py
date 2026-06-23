"""
model_demo.py：实例分割（孔洞）处理器示例实现。

演示如何将 YOLO-seg 风格的输出解码为 binary mask 并封装为 PredictionResult。
与 image_segmentation_instance/model_demo.py 的核心差异：
- post_handle 输出 PredictionResult.mask（numpy uint8 mask），
  不再生成 polygon points。
- 平台骨架（custom_predict.py）负责 mask → polygon_with_holes.regions 的转换。
"""
import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np
import torch
import torch.nn.functional as F

from .model_handle import ModelHandle, ModelInput, PredictionResult

logger = logging.getLogger(__name__)


class TorchInstanceSegmentationMaskHandle(ModelHandle):
    """
    实例分割（孔洞）处理器示例。

    输入：与 image_segmentation_instance 相同的 YOLO-seg 模型格式。
    输出：PredictionResult.mask（原图尺寸 binary numpy mask）。
    """

    _IMAGE_SIZE = 640
    _MAX_DET = 300
    _CONF_THRESHOLD = 0.25
    _IOU_THRESHOLD = 0.45
    _LETTERBOX_COLOR = (114, 114, 114)
    _MIN_MASK_AREA = 1.0

    def pre_handle(self, image_path: str) -> ModelInput:
        """
        将单张图片转换为标准 ModelInput。
        等比例缩放 + padding，BGR→RGB，HWC→CHW，归一化到 [0,1]。
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

    def post_handle(self, model_output, model_input: ModelInput) -> List[PredictionResult]:
        """
        将 YOLO-seg 输出解码为 binary mask 列表。

        核心差异（相对于 image_segmentation_instance/model_demo.py）：
        - 不调用 _mask_to_polygon_points，直接将 numpy binary mask 封装入 PredictionResult。
        """
        original_shape, scale_ratio, padding = self._parse_postprocess_context(model_input)
        image_tensor = model_input.image_tensor
        raw_predictions, raw_proto = self._extract_predictions_and_proto(model_output)
        predictions = self._normalize_predictions(raw_predictions)
        proto = self._normalize_proto(raw_proto)

        if predictions.shape[0] != 1 or proto.shape[0] != 1:
            raise ValueError("当前实现按单任务逐条推理，期望 batch_size=1")

        decoded = self._decode_predictions(
            prediction=predictions[0],
            mask_dim=int(proto.shape[1]),
            conf_threshold=self._CONF_THRESHOLD,
        )
        if decoded.numel() == 0:
            return []

        keep_indices = self._class_aware_nms(
            boxes=decoded[:, :4],
            scores=decoded[:, 4],
            class_ids=decoded[:, 5].to(torch.int64),
            iou_threshold=self._IOU_THRESHOLD,
        )[: self._MAX_DET]
        kept = decoded[keep_indices]
        if kept.numel() == 0:
            return []

        input_shape = tuple(int(dim) for dim in image_tensor.shape[2:])
        instance_masks = self._process_masks(
            protos=proto[0],
            masks_in=kept[:, 6:],
            boxes=kept[:, :4],
            shape=input_shape,
        )

        results: List[PredictionResult] = []
        for index in range(int(kept.shape[0])):
            mask = instance_masks[index]
            scaled_mask = self._scale_mask_to_original(
                mask=mask,
                original_shape=original_shape,
                padding=padding,
            )
            if float(scaled_mask.sum()) < self._MIN_MASK_AREA:
                logger.debug("第 %s 个实例 mask 面积过小，已跳过", index)
                continue

            results.append(
                PredictionResult(
                    class_id=int(kept[index, 5].item()),
                    score=float(kept[index, 4].item()),
                    mask=scaled_mask,
                )
            )

        return results

    @classmethod
    def _letterbox(cls, image: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int, int, int]]:
        original_height, original_width = image.shape[:2]
        scale_ratio = min(cls._IMAGE_SIZE / original_height, cls._IMAGE_SIZE / original_width)
        resized_width = int(round(original_width * scale_ratio))
        resized_height = int(round(original_height * scale_ratio))
        resized_image = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
        pad_width = cls._IMAGE_SIZE - resized_width
        pad_height = cls._IMAGE_SIZE - resized_height
        pad_left = int(round(pad_width / 2 - 0.1))
        pad_right = int(round(pad_width / 2 + 0.1))
        pad_top = int(round(pad_height / 2 - 0.1))
        pad_bottom = int(round(pad_height / 2 + 0.1))
        padded_image = cv2.copyMakeBorder(
            resized_image, pad_top, pad_bottom, pad_left, pad_right,
            cv2.BORDER_CONSTANT, value=cls._LETTERBOX_COLOR,
        )
        return padded_image, float(scale_ratio), (pad_left, pad_top, pad_right, pad_bottom)

    @staticmethod
    def _parse_postprocess_context(model_input: ModelInput) -> Tuple:
        ctx = model_input.postprocess_context
        return (
            tuple(int(v) for v in ctx["original_shape"]),
            float(ctx["scale_ratio"]),
            tuple(int(v) for v in ctx["padding"]),
        )

    @classmethod
    def _extract_predictions_and_proto(cls, model_output) -> Tuple[torch.Tensor, torch.Tensor]:
        if isinstance(model_output, (list, tuple)) and len(model_output) >= 2:
            return cls._extract_tensor(model_output[0]), cls._extract_tensor(model_output[1])
        raise ValueError("模型输出格式异常，期望 (predictions, proto) 两个分支")

    @staticmethod
    def _extract_tensor(output) -> torch.Tensor:
        if isinstance(output, torch.Tensor):
            return output
        if isinstance(output, (list, tuple)) and output:
            return TorchInstanceSegmentationMaskHandle._extract_tensor(output[0])
        raise TypeError(f"无法从类型 {type(output)} 中提取 torch.Tensor")

    @staticmethod
    def _normalize_predictions(predictions: torch.Tensor) -> torch.Tensor:
        if predictions.ndim == 2:
            predictions = predictions.unsqueeze(0)
        if predictions.shape[1] < predictions.shape[2]:
            predictions = predictions.transpose(1, 2)
        return predictions.contiguous()

    @staticmethod
    def _normalize_proto(proto: torch.Tensor) -> torch.Tensor:
        if proto.ndim == 3:
            proto = proto.unsqueeze(0)
        return proto.contiguous()

    @classmethod
    def _decode_predictions(cls, prediction: torch.Tensor, mask_dim: int, conf_threshold: float) -> torch.Tensor:
        prediction = prediction.detach()
        prediction = prediction[torch.isfinite(prediction).all(dim=1)]
        if prediction.numel() == 0:
            return prediction.new_zeros((0, 6 + mask_dim))
        feature_count = int(prediction.shape[1])
        class_count = feature_count - 4 - mask_dim
        boxes = cls._xywh_to_xyxy(prediction[:, :4])
        class_scores = prediction[:, 4: 4 + class_count]
        mask_coefficients = prediction[:, 4 + class_count:]
        confidence, class_ids = class_scores.max(1)
        keep_mask = confidence >= conf_threshold
        if not keep_mask.any():
            return prediction.new_zeros((0, 6 + mask_dim))
        return torch.cat([
            boxes[keep_mask],
            confidence[keep_mask].unsqueeze(1),
            class_ids[keep_mask].to(boxes.dtype).unsqueeze(1),
            mask_coefficients[keep_mask],
        ], dim=1)

    @classmethod
    def _class_aware_nms(cls, boxes, scores, class_ids, iou_threshold) -> torch.Tensor:
        if boxes.numel() == 0:
            return torch.empty((0,), dtype=torch.long, device=boxes.device)
        kept_groups = []
        for cid in torch.unique(class_ids):
            idx = torch.where(class_ids == cid)[0]
            kept_groups.append(idx[cls._nms(boxes[idx], scores[idx], iou_threshold)])
        merged = torch.cat(kept_groups, dim=0)
        return merged[torch.argsort(scores[merged], descending=True)]

    @classmethod
    def _nms(cls, boxes, scores, iou_threshold) -> torch.Tensor:
        if boxes.numel() == 0:
            return torch.empty((0,), dtype=torch.long, device=boxes.device)
        order = torch.argsort(scores, descending=True)
        keep = []
        while order.numel() > 0:
            current = order[0]
            keep.append(current)
            if order.numel() == 1:
                break
            iou = cls._box_iou(boxes[current].unsqueeze(0), boxes[order[1:]]).squeeze(0)
            order = order[1:][iou <= iou_threshold]
        return torch.stack(keep)

    @staticmethod
    def _box_iou(b1, b2):
        tl = torch.maximum(b1[:, None, :2], b2[:, :2])
        br = torch.minimum(b1[:, None, 2:], b2[:, 2:])
        inter_wh = (br - tl).clamp(min=0)
        inter = inter_wh[..., 0] * inter_wh[..., 1]
        a1 = (b1[:, 2] - b1[:, 0]).clamp(min=0) * (b1[:, 3] - b1[:, 1]).clamp(min=0)
        a2 = (b2[:, 2] - b2[:, 0]).clamp(min=0) * (b2[:, 3] - b2[:, 1]).clamp(min=0)
        return inter / (a1[:, None] + a2 - inter + 1e-6)

    @staticmethod
    def _xywh_to_xyxy(boxes):
        c = boxes.clone()
        c[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
        c[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
        c[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
        c[:, 3] = boxes[:, 1] + boxes[:, 3] / 2
        return c

    @classmethod
    def _process_masks(cls, protos, masks_in, boxes, shape) -> torch.Tensor:
        if masks_in.numel() == 0:
            return torch.zeros((0, shape[0], shape[1]), dtype=torch.bool, device=protos.device)
        mask_dim, mh, mw = protos.shape
        masks = (masks_in @ protos.float().view(mask_dim, -1)).view(-1, mh, mw)
        ratios = torch.tensor(
            [[mw / shape[1], mh / shape[0], mw / shape[1], mh / shape[0]]],
            device=boxes.device, dtype=boxes.dtype,
        )
        masks = cls._crop_mask(masks, boxes * ratios)
        masks = F.interpolate(masks.unsqueeze(1), size=shape, mode="bilinear", align_corners=False).squeeze(1)
        return masks > 0.0

    @staticmethod
    def _crop_mask(masks, boxes):
        _, h, w = masks.shape
        x1, y1, x2, y2 = torch.chunk(boxes[:, :, None], 4, 1)
        xr = torch.arange(w, device=masks.device, dtype=x1.dtype)[None, None, :]
        yr = torch.arange(h, device=masks.device, dtype=x1.dtype)[None, :, None]
        return masks * ((xr >= x1) * (xr < x2) * (yr >= y1) * (yr < y2))

    @staticmethod
    def _scale_mask_to_original(mask: torch.Tensor, original_shape, padding) -> np.ndarray:
        oh, ow = original_shape
        pl, pt, pr, pb = padding
        mask_np = mask.detach().to(dtype=torch.uint8).cpu().numpy()
        ih, iw = mask_np.shape[:2]
        top = max(pt, 0)
        bottom = max(ih - pb, top + 1)
        left = max(pl, 0)
        right = max(iw - pr, left + 1)
        cropped = mask_np[top:bottom, left:right]
        if cropped.size == 0:
            return np.zeros((oh, ow), dtype=np.uint8)
        return cv2.resize(cropped, (ow, oh), interpolation=cv2.INTER_NEAREST).astype(np.uint8)

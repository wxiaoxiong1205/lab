import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np
import torch
import torch.nn.functional as F

from .model_handle import ModelHandle, ModelInput, PredictionResult

logger = logging.getLogger(__name__)


class TorchInstanceSegmentationHandle(ModelHandle):
    """
    实例分割（标准）实现示例。

    该类只负责：
    1. 把平台提供的图片路径转换成模型输入；
    2. 把 TorchScript 原始输出解码为实例级 polygon 中间结果。
    """

    _IMAGE_SIZE = 640
    _MAX_DET = 300
    _CONF_THRESHOLD = 0.25
    _IOU_THRESHOLD = 0.45
    _LETTERBOX_COLOR = (114, 114, 114)
    _POLYGON_EPSILON_RATIO = 0.002
    _MIN_MASK_AREA = 1.0

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
        将当前示例支持的模型原始输出解码为实例分割结果列表。
        """
        original_shape, scale_ratio, padding = self._parse_postprocess_context(model_input)
        image_tensor = model_input.image_tensor
        raw_predictions, raw_proto = self._extract_predictions_and_proto(model_output)
        predictions = self._normalize_predictions(raw_predictions)
        proto = self._normalize_proto(raw_proto)

        if predictions.shape[0] != 1:
            raise ValueError(
                "当前实现按单任务逐条推理，post_handle 期望单条输出，"
                f"实际 batch 大小为 {predictions.shape[0]}"
            )
        if proto.shape[0] != 1:
            raise ValueError(
                "当前实现按单任务逐条推理，proto 期望单条输出，"
                f"实际 batch 大小为 {proto.shape[0]}"
            )

        decoded = self._decode_predictions(
            prediction=predictions[0],
            mask_dim=int(proto.shape[1]),
            conf_threshold=self._CONF_THRESHOLD,
        )
        if decoded.numel() == 0:
            logger.info(
                "实例分割后处理未产出候选框：raw_pred_shape=%s, proto_shape=%s",
                tuple(raw_predictions.shape),
                tuple(proto.shape),
            )
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
        kept_boxes_input = kept[:, :4]
        kept_scores = kept[:, 4]
        kept_class_ids = kept[:, 5].to(torch.int64)
        kept_mask_coeffs = kept[:, 6:]

        instance_masks = self._process_masks(
            protos=proto[0],
            masks_in=kept_mask_coeffs,
            boxes=kept_boxes_input,
            shape=input_shape,
        )
        restored_boxes = self._restore_boxes(
            boxes=kept_boxes_input.detach().cpu(),
            original_shape=original_shape,
            scale_ratio=scale_ratio,
            padding=padding,
        )

        results: List[PredictionResult] = []
        for index in range(int(kept.shape[0])):
            mask = instance_masks[index]
            scaled_mask = self._scale_mask_to_original(
                mask=mask,
                original_shape=original_shape,
                padding=padding,
            )
            polygon_points = self._mask_to_polygon_points(scaled_mask)
            if polygon_points is None:
                logger.debug("第 %s 个实例未提取到有效 polygon，已跳过", index)
                continue

            results.append(
                PredictionResult(
                    class_id=int(kept_class_ids[index].item()),
                    score=float(kept_scores[index].item()),
                    points=polygon_points,
                )
            )

        logger.info(
            "实例分割后处理完成：raw_pred_shape=%s, proto_shape=%s, "
            "decoded_count=%s, kept_count=%s, polygon_count=%s, restored_box_count=%s",
            tuple(raw_predictions.shape),
            tuple(proto.shape),
            int(decoded.shape[0]),
            int(kept.shape[0]),
            len(results),
            int(restored_boxes.shape[0]),
        )
        return results

    @classmethod
    def _letterbox(cls, image: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int, int, int]]:
        """
        对原图做等比例缩放，并补齐到固定输入尺寸。
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
        return padded_image, float(scale_ratio), (pad_left, pad_top, pad_right, pad_bottom)

    @staticmethod
    def _parse_postprocess_context(
        model_input: ModelInput,
    ) -> Tuple[Tuple[int, int], float, Tuple[int, int, int, int]]:
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
        if isinstance(model_output, torch.Tensor):
            return model_output
        if isinstance(model_output, (list, tuple)):
            if not model_output:
                raise ValueError("模型输出为空列表")
            return TorchInstanceSegmentationHandle._extract_predictions(model_output[0])
        if isinstance(model_output, dict):
            if not model_output:
                raise ValueError("模型输出为空字典")
            for key in ("preds", "prediction", "output", "boxes", "detections"):
                if key in model_output:
                    return TorchInstanceSegmentationHandle._extract_predictions(model_output[key])
            return TorchInstanceSegmentationHandle._extract_predictions(next(iter(model_output.values())))
        raise TypeError(f"不支持的检测输出类型: {type(model_output)}")

    @staticmethod
    def _extract_proto(model_output) -> torch.Tensor:
        if isinstance(model_output, torch.Tensor):
            return model_output
        if isinstance(model_output, (list, tuple)):
            if not model_output:
                raise ValueError("模型输出为空列表")
            return TorchInstanceSegmentationHandle._extract_proto(model_output[0])
        if isinstance(model_output, dict):
            if not model_output:
                raise ValueError("模型输出为空字典")
            for key in ("proto", "protos", "masks", "mask_proto", "output1"):
                if key in model_output:
                    return TorchInstanceSegmentationHandle._extract_proto(model_output[key])
            return TorchInstanceSegmentationHandle._extract_proto(next(iter(model_output.values())))
        raise TypeError(f"不支持的 proto 输出类型: {type(model_output)}")

    @classmethod
    def _extract_predictions_and_proto(cls, model_output) -> Tuple[torch.Tensor, torch.Tensor]:
        if isinstance(model_output, (list, tuple)):
            if len(model_output) < 2:
                raise ValueError("当前示例要求实例分割模型输出至少包含两个分支")
            return cls._extract_predictions(model_output[0]), cls._extract_proto(model_output[1])

        if isinstance(model_output, dict):
            prediction = None
            proto = None
            for key in ("preds", "prediction", "output", "boxes", "detections"):
                if key in model_output:
                    prediction = cls._extract_predictions(model_output[key])
                    break
            for key in ("proto", "protos", "masks", "mask_proto", "output1"):
                if key in model_output:
                    proto = cls._extract_proto(model_output[key])
                    break
            if prediction is not None and proto is not None:
                return prediction, proto

        raise ValueError(
            "实例分割模型输出格式异常，请确保当前示例所需的两个输出分支均可被正确提取"
        )

    @staticmethod
    def _normalize_predictions(predictions: torch.Tensor) -> torch.Tensor:
        if not isinstance(predictions, torch.Tensor):
            raise TypeError(f"检测模型输出必须是 torch.Tensor，实际为: {type(predictions)}")

        if predictions.ndim == 2:
            predictions = predictions.unsqueeze(0)
        if predictions.ndim != 3:
            raise ValueError(
                "实例分割模型检测分支输出应为 3 维张量，"
                f"实际 shape 为 {tuple(predictions.shape)}"
            )

        if predictions.shape[1] < predictions.shape[2]:
            predictions = predictions.transpose(1, 2)
        return predictions.contiguous()

    @staticmethod
    def _normalize_proto(proto: torch.Tensor) -> torch.Tensor:
        if not isinstance(proto, torch.Tensor):
            raise TypeError(f"实例分割 proto 输出必须是 torch.Tensor，实际为: {type(proto)}")
        if proto.ndim == 3:
            proto = proto.unsqueeze(0)
        if proto.ndim != 4:
            raise ValueError(
                "实例分割 proto 输出应为 4 维张量，"
                f"实际 shape 为 {tuple(proto.shape)}"
            )
        return proto.contiguous()

    @classmethod
    def _decode_predictions(
        cls,
        prediction: torch.Tensor,
        mask_dim: int,
        conf_threshold: float,
    ) -> torch.Tensor:
        if prediction.ndim != 2:
            raise ValueError(
                "单张图片的实例分割检测输出应为二维张量，"
                f"实际 shape 为 {tuple(prediction.shape)}"
            )

        prediction = prediction.detach()
        prediction = prediction[torch.isfinite(prediction).all(dim=1)]
        if prediction.numel() == 0:
            return prediction.new_zeros((0, 6 + mask_dim))

        feature_count = int(prediction.shape[1])
        if feature_count <= 4 + mask_dim:
            raise ValueError(
                "实例分割输出维度不足，无法同时容纳 box/class/mask 信息，"
                f"feature_count={feature_count}, mask_dim={mask_dim}"
            )

        class_count = feature_count - 4 - mask_dim
        boxes = cls._xywh_to_xyxy(prediction[:, :4])
        class_scores = prediction[:, 4 : 4 + class_count]
        mask_coefficients = prediction[:, 4 + class_count :]
        confidence, class_ids = class_scores.max(1)

        keep_mask = confidence >= conf_threshold
        if not keep_mask.any():
            return prediction.new_zeros((0, 6 + mask_dim))

        return torch.cat(
            [
                boxes[keep_mask],
                confidence[keep_mask].unsqueeze(1),
                class_ids[keep_mask].to(boxes.dtype).unsqueeze(1),
                mask_coefficients[keep_mask],
            ],
            dim=1,
        )

    @classmethod
    def _class_aware_nms(
        cls,
        boxes: torch.Tensor,
        scores: torch.Tensor,
        class_ids: torch.Tensor,
        iou_threshold: float,
    ) -> torch.Tensor:
        if boxes.numel() == 0:
            return torch.empty((0,), dtype=torch.long, device=boxes.device)

        kept_groups = []
        for class_id in torch.unique(class_ids):
            class_indices = torch.where(class_ids == class_id)[0]
            kept_groups.append(
                class_indices[cls._nms(boxes[class_indices], scores[class_indices], iou_threshold)]
            )

        merged_indices = torch.cat(kept_groups, dim=0)
        return merged_indices[torch.argsort(scores[merged_indices], descending=True)]

    @classmethod
    def _nms(
        cls,
        boxes: torch.Tensor,
        scores: torch.Tensor,
        iou_threshold: float,
    ) -> torch.Tensor:
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
            order = remaining[iou <= iou_threshold]
        return torch.stack(keep)

    @staticmethod
    def _box_iou(boxes1: torch.Tensor, boxes2: torch.Tensor) -> torch.Tensor:
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
    def _xywh_to_xyxy(boxes: torch.Tensor) -> torch.Tensor:
        converted = boxes.clone()
        converted[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
        converted[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
        converted[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
        converted[:, 3] = boxes[:, 1] + boxes[:, 3] / 2
        return converted

    @staticmethod
    def _crop_mask(masks: torch.Tensor, boxes: torch.Tensor) -> torch.Tensor:
        if boxes.device != masks.device:
            boxes = boxes.to(masks.device)

        _, height, width = masks.shape
        x1, y1, x2, y2 = torch.chunk(boxes[:, :, None], 4, 1)
        x_range = torch.arange(width, device=masks.device, dtype=x1.dtype)[None, None, :]
        y_range = torch.arange(height, device=masks.device, dtype=x1.dtype)[None, :, None]
        return masks * ((x_range >= x1) * (x_range < x2) * (y_range >= y1) * (y_range < y2))

    @classmethod
    def _process_masks(
        cls,
        protos: torch.Tensor,
        masks_in: torch.Tensor,
        boxes: torch.Tensor,
        shape: Tuple[int, int],
    ) -> torch.Tensor:
        if masks_in.numel() == 0:
            return torch.zeros((0, shape[0], shape[1]), dtype=torch.bool, device=protos.device)

        mask_dim, mask_height, mask_width = protos.shape
        masks = (masks_in @ protos.float().view(mask_dim, -1)).view(-1, mask_height, mask_width)

        width_ratio = mask_width / shape[1]
        height_ratio = mask_height / shape[0]
        ratios = torch.tensor(
            [[width_ratio, height_ratio, width_ratio, height_ratio]],
            device=boxes.device,
            dtype=boxes.dtype,
        )
        masks = cls._crop_mask(masks, boxes=boxes * ratios)
        masks = F.interpolate(
            masks.unsqueeze(1),
            size=shape,
            mode="bilinear",
            align_corners=False,
        ).squeeze(1)
        return masks > 0.0

    @staticmethod
    def _restore_boxes(
        boxes: torch.Tensor,
        original_shape: Tuple[int, int],
        scale_ratio: float,
        padding: Tuple[int, int, int, int],
    ) -> torch.Tensor:
        original_height, original_width = original_shape
        pad_left, pad_top, _, _ = padding

        boxes = boxes.clone()
        boxes[:, [0, 2]] -= float(pad_left)
        boxes[:, [1, 3]] -= float(pad_top)
        boxes[:, :4] /= float(scale_ratio)
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clamp(0, float(original_width))
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clamp(0, float(original_height))
        return boxes

    @staticmethod
    def _scale_mask_to_original(
        mask: torch.Tensor,
        original_shape: Tuple[int, int],
        padding: Tuple[int, int, int, int],
    ) -> np.ndarray:
        original_height, original_width = original_shape
        pad_left, pad_top, pad_right, pad_bottom = padding

        mask_np = mask.detach().to(dtype=torch.uint8).cpu().numpy()
        input_height, input_width = mask_np.shape[:2]
        top = max(pad_top, 0)
        bottom = max(input_height - pad_bottom, top + 1)
        left = max(pad_left, 0)
        right = max(input_width - pad_right, left + 1)

        cropped = mask_np[top:bottom, left:right]
        if cropped.size == 0:
            return np.zeros((original_height, original_width), dtype=np.uint8)

        return cv2.resize(
            cropped,
            (original_width, original_height),
            interpolation=cv2.INTER_NEAREST,
        ).astype(np.uint8)

    @classmethod
    def _mask_to_polygon_points(cls, mask: np.ndarray) -> Optional[List[List[float]]]:
        if mask is None or mask.size == 0:
            return None
        if float(mask.sum()) < cls._MIN_MASK_AREA:
            return None

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        contour = max(contours, key=cv2.contourArea)
        contour_area = float(cv2.contourArea(contour))
        perimeter = float(cv2.arcLength(contour, True))
        epsilon = max(perimeter * cls._POLYGON_EPSILON_RATIO, 1.0)
        simplified = cv2.approxPolyDP(contour, epsilon, True)

        simplified_points = cls._normalize_points(simplified)
        contour_points = cls._normalize_points(contour)
        final_points = simplified_points if len(simplified_points) >= 3 else contour_points

        if len(final_points) < 3:
            final_points = cls._build_box_polygon_from_mask(mask)

        if final_points is None or len(final_points) < 3:
            logger.debug("实例 mask 无法构造合法 polygon：contour_area=%s", contour_area)
            return None

        return [[float(x), float(y)] for x, y in final_points]

    @staticmethod
    def _normalize_points(points: np.ndarray) -> np.ndarray:
        if points.size == 0:
            return points.reshape(0, 2)

        normalized_points = []
        for point in points.reshape(-1, 2):
            if not normalized_points or not np.array_equal(point, normalized_points[-1]):
                normalized_points.append(point.copy())

        if len(normalized_points) >= 2 and np.array_equal(normalized_points[0], normalized_points[-1]):
            normalized_points.pop()

        if not normalized_points:
            return np.empty((0, 2), dtype=np.float32)

        return np.asarray(normalized_points, dtype=np.float32)

    @staticmethod
    def _build_box_polygon_from_mask(mask: np.ndarray) -> Optional[np.ndarray]:
        coordinates = cv2.findNonZero(mask)
        if coordinates is None:
            return None

        x, y, width, height = cv2.boundingRect(coordinates)
        return np.asarray(
            [
                [x, y],
                [x + max(width, 1), y],
                [x + max(width, 1), y + max(height, 1)],
                [x, y + max(height, 1)],
            ],
            dtype=np.float32,
        )

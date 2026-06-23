import inspect
import logging
import os
import sys
from typing import Dict, List, Optional
from uuid import uuid4

import cv2
import numpy as np
import torch

# 当 demo 移到外部独立运行时，当前目录不是包，需加入 path 才能导入同目录模块
_wsgi_dir = os.path.dirname(os.path.abspath(__file__))
if _wsgi_dir not in sys.path:
    sys.path.insert(0, _wsgi_dir)

from model_handle import ModelHandle, ModelInput, PredictionResult
from label_studio_ml.model import LabelStudioMLBase
from label_studio_ml.response import ModelResponse
from label_studio_ml.utils import DATA_UNDEFINED_NAME

logger = logging.getLogger(__name__)


MODEL_TYPE_TORCHSCRIPT = "torchscript"
MODEL_TYPE_CHECKPOINT = "checkpoint"


def load_model(model_path: str, device: str):
    """
    优先按 TorchScript 加载；失败时回退为 torchvision Mask R-CNN checkpoint。

    返回 (model, model_type)：
    - torchscript：可直接对张量前向（YOLO-seg 风格），输出 (predictions, proto)；
    - checkpoint：torchvision 检测模型，前向需要 List[Tensor[C,H,W]]，输出 List[Dict]。
    两类模型前向调用方式不同（.pt 后缀无法区分），调用方必须按 model_type 分支处理。
    """
    try:
        model = torch.jit.load(model_path, map_location=device)
        model.eval()
        logger.info("按 TorchScript 成功加载模型: %s", model_path)
        return model, MODEL_TYPE_TORCHSCRIPT
    except RuntimeError:
        logger.info("模型不是 TorchScript，尝试按 checkpoint 恢复: %s", model_path)

    checkpoint = torch.load(model_path, map_location=device)
    if not isinstance(checkpoint, dict) or "model_state_dict" not in checkpoint:
        raise ValueError("checkpoint 缺少 model_state_dict，无法恢复模型")

    num_classes = checkpoint.get("num_classes")
    if not isinstance(num_classes, int):
        raise ValueError("checkpoint 缺少 num_classes，无法恢复 Mask R-CNN")

    try:
        from torchvision.models.detection import maskrcnn_resnet50_fpn
    except ImportError as exc:
        raise ImportError("需要安装 torchvision 才能加载当前 Mask R-CNN checkpoint") from exc

    model = maskrcnn_resnet50_fpn(weights=None, weights_backbone=None, num_classes=num_classes)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    logger.info("按 Mask R-CNN checkpoint 成功恢复模型: %s (num_classes=%s)", model_path, num_classes)
    return model, MODEL_TYPE_CHECKPOINT


def get_model_handle_class(handle_class_name=None):
    """
    动态获取 `model.py` 中的 ModelHandle 实现类。
    """
    if handle_class_name is None or handle_class_name == "ModelHandle":
        handle_class_name = None
        auto_discover = True
    else:
        auto_discover = False

    current_dir = os.path.dirname(os.path.abspath(__file__))
    current_module_name = __name__

    if "." in current_module_name:
        package_path = current_module_name.rsplit(".", 1)[0]
    else:
        package_path = None
        search_dir = current_dir
        while search_dir and search_dir != os.path.dirname(search_dir):
            init_file = os.path.join(search_dir, "__init__.py")
            if os.path.exists(init_file):
                for sys_path in sys.path:
                    try:
                        if os.path.commonpath([search_dir, sys_path]) == sys_path:
                            rel_path = os.path.relpath(search_dir, sys_path)
                            if rel_path and rel_path != ".":
                                package_parts = [
                                    part
                                    for part in rel_path.replace(os.sep, ".").split(".")
                                    if part and part != "__pycache__"
                                ]
                                if package_parts:
                                    package_path = ".".join(package_parts)
                                    break
                    except (ValueError, OSError):
                        continue
                if package_path:
                    break
            search_dir = os.path.dirname(search_dir)

    if package_path:
        module_name = f"{package_path}.model"
    else:
        module_name = "model"

    import importlib
    model_module = importlib.import_module(module_name)

    if auto_discover:
        for name, obj in inspect.getmembers(model_module, inspect.isclass):
            if issubclass(obj, ModelHandle) and obj is not ModelHandle:
                return obj
        raise ImportError(
            f"在 {module_name} 中未找到 ModelHandle 子类，请在 model.py 中实现 ModelHandle"
        )
    else:
        handle_cls = getattr(model_module, handle_class_name, None)
        if handle_cls is None or not issubclass(handle_cls, ModelHandle):
            raise ImportError(
                f"在 {module_name} 中未找到名为 {handle_class_name} 的 ModelHandle 子类"
            )
        return handle_cls


class PlatformLabelStudio(LabelStudioMLBase):
    """
    实例分割（孔洞）平台骨架。

    与 image_segmentation_instance 的核心差异：
    - post_handle 输出 PredictionResult.mask（binary numpy mask），非 polygon points。
    - _build_prediction_region 将 mask 转换为 polygon_with_holes.regions 格式返回。
    - 不再使用 Label Studio polygonlabels 百分比坐标协议，返回绝对像素坐标的掩码协议。
    """

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

    def __init__(self, **kwargs):
        # 与其它任务模板保持一致：平台固定将模型文件下发到 model_dir 下的 model.pt
        self.MODEL_DIR = kwargs.pop("model_dir", "/data/models")
        self.MODEL_PATH = os.path.join(self.MODEL_DIR, "model.pt")
        super().__init__(**kwargs)
        handle_class_name = kwargs.get("handle_class_name")
        handle_cls = get_model_handle_class(handle_class_name)
        self.model_handle: ModelHandle = handle_cls()
        self.keep_largest_component = bool(kwargs.get("keep_largest_component", True))
        self.min_component_area = max(int(kwargs.get("min_component_area", 32)), 1)
        self.min_hole_area = max(int(kwargs.get("min_hole_area", 32)), 0)
        self.polygon_epsilon_ratio = float(kwargs.get("polygon_epsilon_ratio", 0.002))

        logger.info(
            (
                "初始化实例分割（孔洞）后端实例：模型目录=%s，模型文件=%s，"
                "keep_largest_component=%s，min_component_area=%s，min_hole_area=%s，"
                "polygon_epsilon_ratio=%s"
            ),
            self.MODEL_DIR,
            self.MODEL_PATH,
            self.keep_largest_component,
            self.min_component_area,
            self.min_hole_area,
            self.polygon_epsilon_ratio,
        )
        # 模型缺失属于配置错误，必须显式报错，避免静默返回空预测掩盖问题
        if not os.path.isfile(self.MODEL_PATH):
            raise FileNotFoundError(f"模型不存在: {self.MODEL_PATH}")
        self.model, self.model_type = load_model(self.MODEL_PATH, self.DEVICE)
        logger.info(
            "实例分割（孔洞）模型已加载: %s (device=%s, model_type=%s)",
            self.MODEL_PATH,
            self.DEVICE,
            self.model_type,
        )

    def _resolve_instance_segmentation_control(self):
        """定位第一个 PolygonLabels + Image 控件，返回 (control_tag, from_name, to_name, value)。"""
        from_name, to_name, value = self.get_first_tag_occurence("PolygonLabels", "Image")
        return "PolygonLabels", from_name, to_name, value or DATA_UNDEFINED_NAME

    def _get_validated_label_mapping(self, from_name: str, control_tag: str) -> Dict[int, str]:
        """
        从 parsed_label_config / label_interface 读取标签的 `index` 属性，返回 {index: label_name}。

        与 image_segmentation_instance 等样例保持完全一致的取法与约定：
        - index 来自 labels_attrs（即 <Label index="..."/>），而非标签文档顺序；
        - index 必须连续为 1..N；模型 class_id 从 0 起始，+1 后与之对齐。
        """
        tag_info = self.parsed_label_config.get(from_name) or {}
        labels = tag_info.get("labels") or []
        labels_attrs = tag_info.get("labels_attrs") or {}

        if not labels:
            labels = list(getattr(self.label_interface.get_tag(from_name), "labels", []) or [])
        if not labels_attrs:
            labels_attrs = getattr(self.label_interface.get_control(from_name), "labels_attrs", {}) or {}

        if not labels:
            raise AssertionError(f"{control_tag} `{from_name}` 未配置任何标签")

        indexed_mapping: Dict[int, str] = {}
        for label_name in labels:
            label_attr = labels_attrs.get(label_name) or {}
            if not isinstance(label_attr, dict):
                label_attr = vars(label_attr).get("attr", {}) or {}

            index_value = label_attr.get("index")
            if index_value is None:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中标签 `{label_name}` 缺少 `index` 配置"
                )

            try:
                class_index = int(index_value)
            except (TypeError, ValueError) as exc:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中标签 `{label_name}` 的 `index`={index_value!r} 不是合法整数"
                ) from exc

            if class_index < 0:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中标签 `{label_name}` 的 `index` 不能小于 0"
                )

            if class_index in indexed_mapping:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中存在重复的 `index`={class_index}，每个标签必须唯一"
                )

            indexed_mapping[class_index] = label_name

        sorted_class_indices = sorted(indexed_mapping)
        expected_class_indices = list(range(1, len(sorted_class_indices) + 1))
        if sorted_class_indices != expected_class_indices:
            raise AssertionError(
                f"{control_tag} `{from_name}` 的 `index` 必须是连续 1..N，"
                f"当前实际为 {sorted_class_indices}"
            )

        return indexed_mapping

    @staticmethod
    def _mask_to_polygon_with_holes_regions(mask: np.ndarray) -> List[Dict]:
        raise NotImplementedError("请通过实例方法调用 _build_mask_regions")

    def _build_mask_regions(self, mask: np.ndarray) -> List[Dict]:
        """
        将 binary mask 转换为 polygon_with_holes.regions 列表。

        新版默认只保留最大主体连通域，并过滤小孔洞，避免前端把单实例噪声轮廓画成“一坨”。
        """
        return self._refined_mask_to_polygon_with_holes_regions(
            mask,
            keep_largest_component=self.keep_largest_component,
            min_component_area=self.min_component_area,
            min_hole_area=self.min_hole_area,
            polygon_epsilon_ratio=self.polygon_epsilon_ratio,
        )

    @staticmethod
    def _refined_mask_to_polygon_with_holes_regions(
        mask: np.ndarray,
        *,
        keep_largest_component: bool = True,
        min_component_area: int = 32,
        min_hole_area: int = 32,
        polygon_epsilon_ratio: float = 0.002,
    ) -> List[Dict]:
        """
        优先保留主体轮廓，过滤小碎片与小孔洞。

        设计目标：
        - 用户上传模型质量不稳定时，前端优先展示“主实例”而不是所有噪声轮廓；
        - 尽量保留主孔洞语义（如 ring 的内孔）；
        - 行为可预测，不在这里做过强的形态学修复。
        """
        if mask is None or mask.size == 0:
            return []

        binary = (mask > 0).astype(np.uint8)
        if not binary.any():
            return []

        prepared_mask = PlatformLabelStudio._filter_components(
            binary=binary,
            keep_largest_component=keep_largest_component,
            min_component_area=max(int(min_component_area), 1),
        )
        if not prepared_mask.any():
            return []

        contours, hierarchy = cv2.findContours(
            prepared_mask,
            cv2.RETR_CCOMP,
            cv2.CHAIN_APPROX_SIMPLE,
        )
        if contours is None or len(contours) == 0 or hierarchy is None:
            return []

        hierarchy = hierarchy[0]
        exterior_indices = [index for index, item in enumerate(hierarchy) if item[3] == -1]
        if not exterior_indices:
            return []

        chosen_exterior_index = max(exterior_indices, key=lambda idx: cv2.contourArea(contours[idx]))
        chosen_exterior = PlatformLabelStudio._simplify_contour(
            contours[chosen_exterior_index],
            epsilon_ratio=polygon_epsilon_ratio,
        )
        if len(chosen_exterior) < 3:
            return []

        holes = []
        for index, contour in enumerate(contours):
            if hierarchy[index][3] != chosen_exterior_index:
                continue
            if cv2.contourArea(contour) < float(min_hole_area):
                continue
            hole_points = PlatformLabelStudio._simplify_contour(
                contour,
                epsilon_ratio=polygon_epsilon_ratio,
            )
            if len(hole_points) >= 3:
                holes.append(hole_points)

        return [{"exterior": chosen_exterior, "holes": holes}]

    @staticmethod
    def _filter_components(
        binary: np.ndarray,
        *,
        keep_largest_component: bool,
        min_component_area: int,
    ) -> np.ndarray:
        """
        基于连通域过滤前景，避免小碎片单独变成前端轮廓。
        """
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
        if num_labels <= 1:
            return binary

        component_ids = []
        for component_id in range(1, num_labels):
            area = int(stats[component_id, cv2.CC_STAT_AREA])
            if area >= min_component_area:
                component_ids.append(component_id)

        if not component_ids:
            return np.zeros_like(binary)

        if keep_largest_component:
            component_ids = [
                max(component_ids, key=lambda component_id: int(stats[component_id, cv2.CC_STAT_AREA]))
            ]

        filtered_mask = np.zeros_like(binary)
        for component_id in component_ids:
            filtered_mask[labels == component_id] = 1
        return filtered_mask

    @staticmethod
    def _simplify_contour(contour: np.ndarray, epsilon_ratio: float = 0.002) -> List[List[int]]:
        """
        按轮廓弧长比例做多边形近似，最小 epsilon 为 1 像素。
        """
        epsilon = max(1.0, float(epsilon_ratio) * cv2.arcLength(contour, True))
        approx = cv2.approxPolyDP(contour, epsilon, True)
        return approx.reshape(-1, 2).astype(int).tolist()

    def _build_prediction_region(
        self,
        prediction_result: PredictionResult,
        class_label_mapping: Dict[int, str],
    ) -> Optional[Dict]:
        """
        将单个 PredictionResult（含 binary mask）转换为前端 polygon_with_holes 格式。

        模型 class_id 从 0 起始，+1 后与 label_config 中标签的 `index`（1..N）对齐；
        返回的 `class_id` 同样为 1 起始，与平台标签 schema 的 class_id 约定一致。
        """
        resolved_class_id = prediction_result.class_id + 1
        class_name = class_label_mapping.get(resolved_class_id)
        if class_name is None:
            logger.warning(
                "预测类别 id=%s（模型原始 class_id=%s）未在当前 label_config 中找到映射，当前实例已跳过",
                resolved_class_id,
                prediction_result.class_id,
            )
            return None

        mask = prediction_result.mask
        if mask is None or mask.size == 0 or float(mask.sum()) < 1.0:
            logger.warning("class_id=%s 的 mask 为空，当前实例已跳过", resolved_class_id)
            return None

        regions = self._build_mask_regions(mask)
        if not regions:
            logger.warning("class_id=%s 的 mask 无法提取有效轮廓，当前实例已跳过", resolved_class_id)
            return None

        return {
            "id": str(uuid4())[:8],
            "class_id": resolved_class_id,
            "category_name": class_name,
            "score": float(prediction_result.score),
            "segmentation": {
                "type": "polygon_with_holes",
                "regions": regions,
            },
        }

    def _empty_prediction(self, error: Optional[str] = None) -> Dict:
        prediction = {
            "result": [],
            "score": 0.0,
            "model_version": self.get("model_version"),
        }
        if error:
            # 把失败原因透传到响应，便于在不翻服务日志的情况下直接定位问题
            prediction["error"] = error
        return prediction

    def _forward(self, image_tensor: torch.Tensor):
        """
        按模型类型选择正确的前向调用方式。

        - checkpoint（torchvision 检测模型）：输入要求 List[Tensor[C,H,W]]，输出 List[Dict]；
          单任务逐条推理，取第 0 个结果交给 post_handle 解码。
        - torchscript（YOLO-seg 风格）：直接对批量张量前向，保持原有（已验证可用）的调用方式。
        """
        if self.model_type == MODEL_TYPE_CHECKPOINT:
            # 兼容 pre_handle 返回 [N,C,H,W] 或 [C,H,W]：统一整理为 List[Tensor[C,H,W]]
            if image_tensor.dim() == 4:
                images = list(image_tensor)
            else:
                images = [image_tensor]
            outputs = self.model(images)
            if isinstance(outputs, (list, tuple)) and len(outputs) >= 1:
                return outputs[0]
            return outputs

        return self.model(image_tensor)

    def predict(self, tasks: List[Dict], context: Optional[Dict] = None, **kwargs) -> ModelResponse:
        predictions = []
        logger.info("收到实例分割（孔洞）预测请求，任务数量=%s", len(tasks))

        try:
            control_tag, from_name, _, value = self._resolve_instance_segmentation_control()
            class_label_mapping = self._get_validated_label_mapping(from_name, control_tag)
        except Exception as e:
            logger.exception("获取标签配置失败")
            # 标签配置失败是整体性错误：逐任务返回带原因的空结果，避免返回空列表让调用方无从判断
            error_message = f"标签配置解析失败: {e}"
            return ModelResponse(
                predictions=[self._empty_prediction(error=error_message) for _ in tasks]
            )

        for task in tasks:
            try:
                task_id = task.get("id")
                image_url = task["data"].get(value) or task["data"].get(DATA_UNDEFINED_NAME)
                if not image_url:
                    logger.warning("任务 task_id=%s 中未找到图片 URL，已跳过", task_id)
                    predictions.append(self._empty_prediction(error="任务数据中未找到图片 URL"))
                    continue

                logger.info("开始处理实例分割（孔洞）任务，任务编号=%s", task_id)
                image_path = self.get_local_path(image_url, task_id=task_id)
                image = cv2.imread(image_path)
                if image is None:
                    raise FileNotFoundError(f"无法读取图像: {image_path}")

                model_input = self.model_handle.pre_handle(image_path)
                if not isinstance(model_input, ModelInput):
                    raise TypeError(f"pre_handle 必须返回 ModelInput，实际返回类型为 {type(model_input)}")

                image_tensor = model_input.image_tensor
                if not isinstance(image_tensor, torch.Tensor):
                    raise TypeError("pre_handle 返回的 ModelInput.image_tensor 必须是 torch.Tensor")

                model_input.image_tensor = image_tensor.to(self.DEVICE)

                with torch.no_grad():
                    outputs = self._forward(model_input.image_tensor)

                prediction_results = self.model_handle.post_handle(outputs, model_input)
                logger.info("任务编号=%s 后处理完成：instance_count=%s", task_id, len(prediction_results))

                regions = []
                for prediction_result in prediction_results:
                    region = self._build_prediction_region(
                        prediction_result=prediction_result,
                        class_label_mapping=class_label_mapping,
                    )
                    if region is not None:
                        regions.append(region)

                predictions.append(
                    {
                        "result": regions,
                        "score": (
                            float(sum(r["score"] for r in regions) / len(regions))
                            if regions
                            else 0.0
                        ),
                        "model_version": self.get("model_version"),
                    }
                )
                logger.info("任务编号=%s 预测完成：区域数量=%s", task_id, len(regions))

            except Exception as e:
                logger.exception("实例分割（孔洞）任务失败，任务编号=%s", task.get("id"))
                predictions.append(self._empty_prediction(error=f"{type(e).__name__}: {e}"))

        logger.info("实例分割（孔洞）预测流程结束，返回结果条数=%s", len(predictions))
        return ModelResponse(predictions=predictions)

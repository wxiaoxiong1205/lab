import inspect
import logging
import os
import sys
from typing import Dict, List, Optional
from uuid import uuid4

import cv2
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

        if not package_path:
            package_path = os.path.basename(current_dir)

    found_classes = []
    loaded_modules = {}

    for filename in os.listdir(current_dir):
        if filename != "model.py":
            continue

        module_name = filename[:-3]
        if module_name == "model_handle":
            continue

        try:
            full_module_name = f"{package_path}.{module_name}" if package_path else module_name
            if full_module_name in sys.modules:
                module = sys.modules[full_module_name]
                loaded_modules[module_name] = module
            else:
                import importlib.util

                module_path = os.path.join(current_dir, filename)
                if module_name in loaded_modules:
                    module = loaded_modules[module_name]
                else:
                    spec = importlib.util.spec_from_file_location(full_module_name, module_path)
                    if spec is None or spec.loader is None:
                        continue

                    module = importlib.util.module_from_spec(spec)
                    module.__package__ = package_path
                    module.__name__ = full_module_name
                    module.__dict__["ModelHandle"] = ModelHandle

                    model_handle_module_name = (
                        f"{package_path}.model_handle" if package_path else "model_handle"
                    )
                    if model_handle_module_name not in sys.modules:
                        actual_model_handle_module = sys.modules.get("model_handle")
                        if actual_model_handle_module is not None:
                            sys.modules[model_handle_module_name] = actual_model_handle_module

                    spec.loader.exec_module(module)
                    loaded_modules[module_name] = module
                    sys.modules[full_module_name] = module

            if handle_class_name and hasattr(module, handle_class_name):
                handle_class = getattr(module, handle_class_name)
                try:
                    if (
                        inspect.isclass(handle_class)
                        and issubclass(handle_class, ModelHandle)
                        and handle_class != ModelHandle
                    ):
                        return handle_class
                except (TypeError, AttributeError):
                    pass

            for name, obj in inspect.getmembers(module, inspect.isclass):
                try:
                    if issubclass(obj, ModelHandle) and obj != ModelHandle:
                        if not inspect.isabstract(obj):
                            found_classes.append((name, obj, module_name))
                except (TypeError, AttributeError):
                    continue
        except Exception:
            logger.exception("加载模型句柄实现模块失败：%s", filename)
            continue

    if handle_class_name and not auto_discover:
        raise ValueError(
            f"ModelHandle implementation class '{handle_class_name}' not found. "
            f"Available classes: {[name for name, _, _ in found_classes]}"
        )

    if found_classes:
        class_name, handle_class, module_name = found_classes[0]
        logger.info("自动发现模型句柄实现类：%s（来源模块：%s）", class_name, module_name)
        return handle_class

    raise ValueError(
        "No ModelHandle implementation class found. "
        "Please ensure at least one class inherits from ModelHandle."
    )


class PlatformLabelStudio(LabelStudioMLBase):
    """
    基于 TorchScript 的实例分割（标准）ML Backend。

    固定骨架职责：
    1. 解析 `PolygonLabels + Image` 标注配置；
    2. 下载或定位任务图片；
    3. 调用 `model.py` 中的实例分割句柄完成输入输出转换；
    4. 统一将中间结果编码为 Label Studio `polygonlabels` 协议。
    """

    _HANDLE_CLASS = None
    _DEVICE = None
    _MODEL = None
    _MODEL_HANDLE = None

    def __init__(self, **kwargs):
        self.MODEL_DIR = kwargs.pop("model_dir", "/data/models")
        self.MODEL_PATH = os.path.join(self.MODEL_DIR, "model.pt")
        base_kwargs = {
            key: kwargs[key]
            for key in ("project_id", "label_config")
            if key in kwargs
        }
        logger.info(
            "初始化实例分割（标准）后端实例：模型目录=%s，模型文件=%s",
            self.MODEL_DIR,
            self.MODEL_PATH,
        )
        super(PlatformLabelStudio, self).__init__(**base_kwargs)

        self.DEVICE = self._get_fixed_device()
        self.model = self._init_model()
        self.model_handle = self._get_fixed_model_handle()

    def setup(self):
        self.set("model_version", f"{self.__class__.__name__}")

    def _init_model(self):
        if self.__class__._MODEL is not None:
            return self.__class__._MODEL

        if not os.path.exists(self.MODEL_PATH):
            raise FileNotFoundError(f"模型不存在: {self.MODEL_PATH}")

        try:
            model = torch.jit.load(self.MODEL_PATH, map_location=torch.device("cpu"))
            if self.DEVICE.type != "cpu":
                model = model.to(self.DEVICE)
            model.eval()
            self.__class__._MODEL = model
            logger.info("模型加载成功：路径=%s，设备=%s", self.MODEL_PATH, self.DEVICE)
        except Exception:
            logger.exception("模型加载失败：路径=%s，设备=%s", self.MODEL_PATH, self.DEVICE)
            raise

        return self.__class__._MODEL

    @classmethod
    def _get_fixed_handle_class(cls):
        if cls._HANDLE_CLASS is None:
            cls._HANDLE_CLASS = get_model_handle_class("ModelHandle")
            logger.info("固定加载模型句柄实现类：%s", cls._HANDLE_CLASS.__name__)
        return cls._HANDLE_CLASS

    @classmethod
    def _get_fixed_device(cls):
        if cls._DEVICE is not None:
            return cls._DEVICE

        try:
            import torch_npu  # noqa: F401
        except Exception:
            pass

        try:
            if hasattr(torch, "npu") and torch.npu.is_available():
                cls._DEVICE = torch.device("npu")
                logger.info("自动检测到 NPU 环境，推理设备设置为: %s", cls._DEVICE)
                return cls._DEVICE
        except Exception:
            logger.exception("检测 NPU 设备失败，继续尝试 CUDA")

        try:
            if torch.cuda.is_available():
                cls._DEVICE = torch.device("cuda")
                logger.info("自动检测到 CUDA 环境，推理设备设置为: %s", cls._DEVICE)
                return cls._DEVICE
        except Exception:
            logger.exception("检测 CUDA 设备失败，继续回退到 CPU")

        cls._DEVICE = torch.device("cpu")
        logger.info("未检测到 NPU/CUDA，推理设备回退为: %s", cls._DEVICE)
        return cls._DEVICE

    @classmethod
    def _get_fixed_model_handle(cls):
        if cls._MODEL_HANDLE is None:
            handle_class = cls._get_fixed_handle_class()
            cls._MODEL_HANDLE = handle_class()
            logger.info("固定创建模型句柄实例：%s", handle_class.__name__)
        return cls._MODEL_HANDLE

    def _resolve_instance_segmentation_control(self):
        from_name, to_name, value = self.get_first_tag_occurence("PolygonLabels", "Image")
        return "PolygonLabels", from_name, to_name, value

    def _get_validated_label_mapping(self, from_name: str, control_tag: str) -> Dict[int, str]:
        tag_info = self.parsed_label_config.get(from_name) or {}
        labels = tag_info.get("labels") or []
        labels_attrs = tag_info.get("labels_attrs") or {}

        if not labels:
            labels = list(getattr(self.label_interface.get_tag(from_name), "labels", []) or [])
        if not labels_attrs:
            labels_attrs = getattr(self.label_interface.get_control(from_name), "labels_attrs", {}) or {}

        if not labels:
            raise AssertionError(f"{control_tag} `{from_name}` 未配置任何标签")

        indexed_mapping = {}
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
    def _to_percent_points(
        points: List[List[float]],
        original_width: int,
        original_height: int,
    ) -> List[List[float]]:
        percent_points = []
        for x, y in points:
            percent_points.append(
                [
                    round((float(x) / float(original_width)) * 100.0, 4),
                    round((float(y) / float(original_height)) * 100.0, 4),
                ]
            )
        return percent_points

    def _build_prediction_region(
        self,
        prediction_result: PredictionResult,
        from_name: str,
        to_name: str,
        class_label_mapping: Dict[int, str],
        original_width: int,
        original_height: int,
    ) -> Optional[Dict]:
        resolved_class_id = prediction_result.class_id + 1
        class_name = class_label_mapping.get(resolved_class_id)
        if class_name is None:
            logger.warning(
                "预测类别 id=%s（模型原始 class_id=%s）未在当前 label_config 中找到映射，当前实例已跳过",
                resolved_class_id,
                prediction_result.class_id,
            )
            return None

        if len(prediction_result.points) < 3:
            logger.warning(
                "实例分割结果点数不足 3 个，无法编码为 polygonlabels，当前实例已跳过："
                "resolved_class_id=%s, model_class_id=%s",
                resolved_class_id,
                prediction_result.class_id,
            )
            return None

        return {
            "id": str(uuid4())[:8],
            "from_name": from_name,
            "to_name": to_name,
            "type": "polygonlabels",
            "original_width": original_width,
            "original_height": original_height,
            "image_rotation": 0,
            "value": {
                "points": self._to_percent_points(
                    prediction_result.points,
                    original_width=original_width,
                    original_height=original_height,
                ),
                "polygonlabels": [class_name],
                "closed": True,
            },
            "score": float(prediction_result.score),
            "readonly": False,
        }

    def _empty_prediction(self) -> Dict:
        return {
            "result": [],
            "score": 0.0,
            "model_version": self.get("model_version"),
        }

    def predict(self, tasks: List[Dict], context: Optional[Dict] = None, **kwargs) -> ModelResponse:
        predictions = []
        logger.info("收到实例分割（标准）预测请求，任务数量=%s", len(tasks))

        try:
            control_tag, from_name, to_name, value = self._resolve_instance_segmentation_control()
            class_label_mapping = self._get_validated_label_mapping(from_name, control_tag)
        except Exception:
            logger.exception("获取实例分割标签配置失败")
            return ModelResponse(predictions=[])

        for task in tasks:
            try:
                task_id = task.get("id")
                image_url = task["data"].get(value) or task["data"].get(DATA_UNDEFINED_NAME)
                if not image_url:
                    logger.warning("任务 task_id=%s 中未找到图片 URL，已跳过", task_id)
                    predictions.append(self._empty_prediction())
                    continue

                logger.info("开始处理实例分割（标准）任务，任务编号=%s", task_id)
                image_path = self.get_local_path(image_url, task_id=task_id)
                image = cv2.imread(image_path)
                if image is None:
                    raise FileNotFoundError(f"无法读取图像: {image_path}")

                original_height, original_width = image.shape[:2]

                model_input = self.model_handle.pre_handle(image_path)
                if not isinstance(model_input, ModelInput):
                    raise TypeError(
                        "pre_handle 必须返回 ModelInput，"
                        f"实际返回类型为 {type(model_input)}"
                    )

                image_tensor = model_input.image_tensor
                if not isinstance(image_tensor, torch.Tensor):
                    raise TypeError("pre_handle 返回的 ModelInput.image_tensor 必须是 torch.Tensor")

                model_input.image_tensor = image_tensor.to(self.DEVICE)

                with torch.no_grad():
                    outputs = self.model(model_input.image_tensor)

                prediction_results = self.model_handle.post_handle(outputs, model_input)
                logger.info(
                    "任务编号=%s 后处理完成：instance_count=%s",
                    task_id,
                    len(prediction_results),
                )

                regions = []
                for prediction_result in prediction_results:
                    region = self._build_prediction_region(
                        prediction_result=prediction_result,
                        from_name=from_name,
                        to_name=to_name,
                        class_label_mapping=class_label_mapping,
                        original_width=original_width,
                        original_height=original_height,
                    )
                    if region is not None:
                        regions.append(region)

                predictions.append(
                    {
                        "result": regions,
                        "score": (
                            float(sum(region["score"] for region in regions) / len(regions))
                            if regions
                            else 0.0
                        ),
                        "model_version": self.get("model_version"),
                    }
                )
                logger.info(
                    "任务编号=%s 预测完成：区域数量=%s",
                    task_id,
                    len(regions),
                )
            except Exception:
                logger.exception("实例分割（标准）任务失败，任务编号=%s", task.get("id"))
                predictions.append(self._empty_prediction())

        logger.info("实例分割（标准）预测流程结束，返回结果条数=%s", len(predictions))
        return ModelResponse(predictions=predictions)

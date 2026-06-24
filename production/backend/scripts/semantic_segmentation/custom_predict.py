import inspect
import logging
import os
import sys
import tempfile
from typing import List, Dict, Optional
from uuid import uuid4
from urllib.parse import urlparse
import requests
import cv2
import numpy as np
import torch
# 当 demo 移到外部独立运行时，当前目录不是包，需加入 path 才能导入同目录模块
_wsgi_dir = os.path.dirname(os.path.abspath(__file__))
if _wsgi_dir not in sys.path:
    sys.path.insert(0, _wsgi_dir)
from model_handle import ModelHandle, PredictionResult
from label_studio_ml.model import LabelStudioMLBase
from label_studio_ml.response import ModelResponse
from label_studio_ml.utils import DATA_UNDEFINED_NAME

logger = logging.getLogger(__name__)


def get_model_handle_class(handle_class_name=None):
    """
    动态获取 ModelHandle 的实现类

    :param handle_class_name: 指定的实现类名称
        - 如果为 None 或 "ModelHandle"，则自动查找第一个实现类
        - 如果指定了具体类名（如 "TorchImageClassifierHandle"），则查找该类
    :return: ModelHandle 的子类
    :raises: ValueError 如果找不到指定的类
    """
    import logging
    logger = logging.getLogger(__name__)

    # 如果类名是 "ModelHandle" 或 None，则自动查找
    if handle_class_name is None or handle_class_name == "ModelHandle":
        handle_class_name = None
        auto_discover = True
    else:
        auto_discover = False

    # 获取当前模块所在目录
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # 动态获取当前模块的包路径
    # 从当前模块的 __name__ 获取包路径（去掉模块名）
    current_module_name = __name__
    if '.' in current_module_name:
        # 如果当前模块在包中，直接使用包路径
        package_path = current_module_name.rsplit('.', 1)[0]  # 去掉最后的模块名
    else:
        # 如果当前模块不在包中（直接运行），尝试从文件路径推断
        # 查找包含 __init__.py 的目录来确定包路径
        package_path = None
        search_dir = current_dir

        # 向上查找包含 __init__.py 的目录
        while search_dir and search_dir != os.path.dirname(search_dir):
            init_file = os.path.join(search_dir, '__init__.py')
            if os.path.exists(init_file):
                # 找到包目录，尝试从 sys.path 中找到对应的包路径
                for sys_path in sys.path:
                    try:
                        if os.path.commonpath([search_dir, sys_path]) == sys_path:
                            rel_path = os.path.relpath(search_dir, sys_path)
                            if rel_path and rel_path != '.':
                                # 转换为包路径格式
                                package_parts = [p for p in rel_path.replace(os.sep, '.').split('.')
                                                 if p and p != '__pycache__']
                                if package_parts:
                                    package_path = '.'.join(package_parts)
                                    break
                    except (ValueError, OSError):
                        # 路径不在同一个驱动器上（Windows）或其他错误，跳过
                        continue
                if package_path:
                    break
            search_dir = os.path.dirname(search_dir)

        # 如果还是找不到，尝试使用当前目录名
        if not package_path:
            package_path = os.path.basename(current_dir)

    # 扫描当前目录下的所有 Python 文件
    found_classes = []
    loaded_modules = {}  # 缓存已加载的模块，避免重复加载

    # 获取当前目录下所有 .py 文件
    for filename in os.listdir(current_dir):
        if filename != 'model.py':
            continue

        module_name = filename[:-3]  # 去掉 .py 后缀

        # 跳过当前文件（model_handle.py）本身，避免循环导入
        if module_name == 'model_handle':
            continue

        try:
            # 构建完整的模块名
            full_module_name = f'{package_path}.{module_name}' if package_path else module_name

            # 尝试使用标准导入机制（如果模块已经在 sys.modules 中）
            if full_module_name in sys.modules:
                module = sys.modules[full_module_name]
                loaded_modules[module_name] = module
            else:
                # 动态导入模块
                import importlib.util
                module_path = os.path.join(current_dir, filename)

                # 如果模块已加载，直接使用
                if module_name in loaded_modules:
                    module = loaded_modules[module_name]
                else:
                    spec = importlib.util.spec_from_file_location(full_module_name, module_path)
                    if spec is None or spec.loader is None:
                        continue

                    module = importlib.util.module_from_spec(spec)

                    # 动态设置模块的包路径，使相对导入能够工作
                    module.__package__ = package_path
                    module.__name__ = full_module_name

                    # 在导入模块之前，将 ModelHandle 注入到模块的命名空间
                    # 这样可以解决相对导入 `from .model_handle import ModelHandle` 的问题
                    module.__dict__['ModelHandle'] = ModelHandle

                    # 确保 model_handle 模块在 sys.modules 中，这样相对导入就能找到它
                    model_handle_module_name = f'{package_path}.model_handle' if package_path else 'model_handle'
                    if model_handle_module_name not in sys.modules:
                        # 将当前模块（model_handle）添加到 sys.modules
                        sys.modules[model_handle_module_name] = sys.modules[__name__]

                    spec.loader.exec_module(module)
                    loaded_modules[module_name] = module
                    # 也添加到 sys.modules，方便后续使用
                    sys.modules[full_module_name] = module

            # 如果指定了类名，直接查找
            if handle_class_name and hasattr(module, handle_class_name):
                handle_class = getattr(module, handle_class_name)
                try:
                    if (inspect.isclass(handle_class) and
                            issubclass(handle_class, ModelHandle) and
                            handle_class != ModelHandle):
                        return handle_class
                except (TypeError, AttributeError):
                    pass

            # 收集所有 ModelHandle 的子类
            for name, obj in inspect.getmembers(module, inspect.isclass):
                try:
                    # 检查是否是 ModelHandle 的子类
                    if (issubclass(obj, ModelHandle) and
                            obj != ModelHandle):
                        # 不检查 __module__，因为动态导入时模块名可能不同
                        if not inspect.isabstract(obj):
                            found_classes.append((name, obj, module_name))
                except (TypeError, AttributeError):
                    # 如果 issubclass 失败，说明 obj 不是 ModelHandle 的子类，跳过
                    continue

        except Exception:
            continue

    # 如果指定了类名但没找到，抛出错误
    if handle_class_name and not auto_discover:
        raise ValueError(
            f"ModelHandle implementation class '{handle_class_name}' not found. "
            f"Available classes: {[name for name, _, _ in found_classes]}"
        )

    # 自动查找：返回第一个找到的实现类
    if found_classes:
        class_name, handle_class, module_name = found_classes[0]
        logger.info("自动发现模型句柄实现类：%s（来源模块：%s）", class_name, module_name)
        return handle_class

    # 如果都找不到，抛出错误
    raise ValueError(
        "No ModelHandle implementation class found. "
        "Please ensure at least one class inherits from ModelHandle."
    )


class PlatformLabelStudio(LabelStudioMLBase):
    """
    语义分割 ML Backend。

    调用链与集成方案保持一致：
    1. 读取 `PolygonLabels` 配置，拿到图片字段和标签顺序；
    2. 将原图预处理后送入 TorchScript 模型；
    3. 同类别再按连通域拆分为多个独立 region。
    """

    # 当前 demo 采用固定单模型、固定配置的运行方式：
    # - 句柄类只扫描一次；
    # - 推理设备只探测一次；
    # - TorchScript 模型只加载一次；
    # - 无状态 model_handle 只实例化一次。
    _HANDLE_CLASS = None
    _DEVICE = None
    _MODEL = None
    _MODEL_HANDLE = None

    def __init__(self, **kwargs):
        self.MODEL_DIR = kwargs.pop('model_dir', "/data/models")
        self.MODEL_PATH = os.path.join(self.MODEL_DIR, "model.pt")
        min_polygon_area = kwargs.pop('min_polygon_area', 1.0)
        polygon_epsilon_ratio = kwargs.pop('polygon_epsilon_ratio', 0.002)
        base_kwargs = {
            key: kwargs[key]
            for key in ("project_id", "label_config")
            if key in kwargs
        }
        logger.info(
            "初始化语义分割后端实例：模型目录=%s，模型文件=%s",
            self.MODEL_DIR,
            self.MODEL_PATH,
        )
        super(PlatformLabelStudio, self).__init__(**base_kwargs)

        self.DEVICE = self._get_fixed_device()
        self.model = self._init_model()
        self.model_handle = self._get_fixed_model_handle()
        self.min_polygon_area = float(min_polygon_area)
        self.polygon_epsilon_ratio = float(polygon_epsilon_ratio)
        # 当前项目的前端协议仍然消费 polygonlabels，但几何语义有自定义约定：
        # 1. 单像素连通域返回该像素单元的 4 个角点，作为最小合法面；
        # 2. 2 个点表示线状区域；
        # 3. 3 个及以上点表示正常 polygon 面。
        # 因此这里会优先保留真实点集，仅对单像素场景走固定四角点兜底。

    def setup(self):
        """配置模型参数。固定资源在类级缓存中初始化，不在这里重复加载。"""
        self.set("model_version", f'{self.__class__.__name__}')

    def _init_model(self):
        """初始化固定模型；同一进程内只加载一次。"""
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
        """固定获取模型句柄类；同一进程内只扫描一次目录。"""
        if cls._HANDLE_CLASS is None:
            cls._HANDLE_CLASS = get_model_handle_class("ModelHandle")
            logger.info("固定加载模型句柄实现类：%s", cls._HANDLE_CLASS.__name__)
        return cls._HANDLE_CLASS

    @classmethod
    def _get_fixed_device(cls):
        """
        固定选择当前进程的推理设备，只探测一次。

        优先级：
        1. NPU
        2. CUDA
        3. CPU
        """
        if cls._DEVICE is not None:
            return cls._DEVICE

        # 在部分昇腾环境中，需要先 import torch_npu 才会注册 torch.npu。
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
        """
        固定创建模型句柄实例；当前 handle 为无状态纯处理逻辑，可安全复用。
        """
        if cls._MODEL_HANDLE is None:
            handle_class = cls._get_fixed_handle_class()
            cls._MODEL_HANDLE = handle_class()
            logger.info("固定创建模型句柄实例：%s", handle_class.__name__)
        return cls._MODEL_HANDLE

    def _get_validated_class_label_mapping(self, from_name: str, control_tag: str) -> Dict[int, str]:
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
                    f"{control_tag} `{from_name}` 中标签 `{label_name}` 缺少 `index` 配置，请按集成方案显式传入类别索引"
                )

            try:
                class_index = int(index_value)
            except (TypeError, ValueError) as exc:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中标签 `{label_name}` 的 `index`={index_value!r} 不是合法整数"
                ) from exc

            if class_index <= 0:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中标签 `{label_name}` 的 `index` 必须大于 0，0 保留为背景类"
                )

            if class_index in indexed_mapping:
                raise AssertionError(
                    f"{control_tag} `{from_name}` 中存在重复的 `index`={class_index}，每个标签必须使用唯一类别索引"
                )

            indexed_mapping[class_index] = label_name

        return indexed_mapping

    def _resolve_segmentation_control(self):
        from_name, to_name, value = self.get_first_tag_occurence("PolygonLabels", 'Image')
        return "PolygonLabels", from_name, to_name, value

    def _get_model_score_threshold(self, from_name: str) -> float:
        """
        从 label config 控件属性读取 model_score_threshold。

        优先读取：
        1. model_score_threshold
        2. score_threshold（兼容旧字段名）
        3. 默认值 0.5
        """
        control = self.label_interface.get_control(from_name)
        control_attr = getattr(control, "attr", {}) or {}
        threshold_value = (
            control_attr.get("model_score_threshold")
            or control_attr.get("score_threshold")
            or 0.5
        )
        try:
            return float(threshold_value)
        except (TypeError, ValueError):
            logger.warning(
                "控件 `%s` 的 model_score_threshold=%r 不是合法浮点数，已回退到默认值 0.5",
                from_name,
                threshold_value,
            )
            return 0.5

    def _component_to_polygon_points(
        self,
        component_mask: np.ndarray,
        original_width: int,
        original_height: int,
    ) -> Optional[List[List[float]]]:
        def to_percent_points(points: np.ndarray) -> List[List[float]]:
            """将像素坐标统一转换为 Label Studio 使用的百分比坐标。"""
            percent_points = []
            for x, y in points.astype(float):
                percent_points.append([
                    round((x / original_width) * 100, 4),
                    round((y / original_height) * 100, 4),
                ])
            return percent_points

        def normalize_points(points: np.ndarray) -> np.ndarray:
            """
            清洗轮廓点集，避免重复点把点/线误判成面。

            OpenCV 轮廓结果在某些情况下会带有连续重复点，或者首尾重复点。
            当前前端会按点数解释语义：
            2 点 -> 线，3+ 点 -> 面。
            单像素则单独转换为固定 4 个角点，因此这里需要先把重复点去掉，
            再把真实点集按原样返回。
            """
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

        def build_single_pixel_box_points() -> Optional[List[List[float]]]:
            """
            将单像素连通域转换为该像素单元的 4 个角点。

            这里不是随意向四周扩框，而是严格使用像素格本身的边界：
            左上、右上、右下、左下。这样既满足前端始终消费 polygon 点集的约束，
            也能把单像素稳定表达为最小合法四边形。
            """
            coords = cv2.findNonZero(component_mask)
            if coords is None or len(coords) != 1:
                return None

            x, y = coords[0][0]
            single_pixel_box_points = np.array(
                [
                    [x, y],
                    [x + 1, y],
                    [x + 1, y + 1],
                    [x, y + 1],
                ],
                dtype=np.float32,
            )
            return to_percent_points(single_pixel_box_points)

        component_area = int(component_mask.sum())
        if component_area == 1:
            single_pixel_box_points = build_single_pixel_box_points()
            if single_pixel_box_points:
                return single_pixel_box_points

        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        contour = max(contours, key=cv2.contourArea)
        perimeter = cv2.arcLength(contour, True)
        epsilon = max(perimeter * self.polygon_epsilon_ratio, 1.0)
        simplified = cv2.approxPolyDP(contour, epsilon, True)
        simplified_points = normalize_points(simplified)
        contour_points = normalize_points(contour)

        # 对真实有面积的区域，优先保证它仍然输出为“面”而不是被过度简化成点/线。
        # 对单像素或细线这类退化区域，则按真实点数原样输出，不补点、不补框。
        if len(simplified_points) >= 3:
            final_points = simplified_points
        elif cv2.contourArea(contour) > 0 and len(contour_points) >= 3:
            final_points = contour_points
        elif len(simplified_points) > 0:
            final_points = simplified_points
        else:
            final_points = contour_points

        if len(final_points) == 0:
            return None

        return to_percent_points(final_points)

    def _build_polygon_regions(
        self,
        resized_mask: np.ndarray,
        resized_confidence_map: np.ndarray,
        from_name: str,
        to_name: str,
        class_label_mapping: Dict[int, str],
        original_width: int,
        original_height: int,
        model_score_threshold: float,
    ) -> List[Dict]:
        results = []
        for class_id, class_name in sorted(class_label_mapping.items()):
            class_mask = (resized_mask == class_id).astype("uint8")
            if not class_mask.any():
                continue

            num_components, component_labels = cv2.connectedComponents(class_mask)
            for component_id in range(1, num_components):
                component_mask = (component_labels == component_id).astype("uint8")
                area = float(component_mask.sum())
                if area < self.min_polygon_area:
                    continue
                is_single_point = area == 1.0
                component_confidences = resized_confidence_map[component_mask.astype(bool)]
                if component_confidences.size == 0:
                    logger.warning(
                        "类别 `%s` 的连通域无法提取置信度像素，已跳过。连通域面积=%s",
                        class_name,
                        area,
                    )
                    continue

                # 单点虽然会被转换为 4 个固定角点返回给前端，但 score 仍应取唯一真实像素的置信度。
                # 其他区域则按连通域内所有前景像素的平均置信度计算。
                region_score = (
                    float(component_confidences[0])
                    if is_single_point
                    else float(component_confidences.mean())
                )
                if region_score < model_score_threshold:
                    # logger.info(
                    #     "类别 `%s` 的连通域得分=%s 小于阈值=%s，已过滤。面积=%s",
                    #     class_name,
                    #     round(region_score, 6),
                    #     model_score_threshold,
                    #     area,
                    # )
                    continue

                points = self._component_to_polygon_points(
                    component_mask=component_mask,
                    original_width=original_width,
                    original_height=original_height,
                )
                if not points:
                    continue

                results.append(
                    {
                        "id": str(uuid4())[:8],
                        "from_name": from_name,
                        "to_name": to_name,
                        "type": "polygonlabels",
                        "original_width": original_width,
                        "original_height": original_height,
                        "image_rotation": 0,
                        "value": {
                            "points": points,
                            # 协议约定：单像素虽然会被转换为 4 个固定角点，
                            # 但前端仍按“单点语义”处理，因此 closed 需要显式为 False。
                            "closed": not is_single_point,
                            "polygonlabels": [class_name],
                        },
                        "score": region_score,
                        "readonly": False,
                    }
                )

        return results

    def _build_prediction_regions(
        self,
        prediction_result: PredictionResult,
        control_tag: str,
        from_name: str,
        to_name: str,
        class_label_mapping: Dict[int, str],
        original_width: int,
        original_height: int,
        model_score_threshold: float,
    ) -> List[Dict]:
        resized_mask = cv2.resize(
            prediction_result.mask.astype("uint8"),
            (original_width, original_height),
            interpolation=cv2.INTER_NEAREST,
        )
        # confidence_map 是连续概率值，缩放时使用线性插值，尽量保留概率分布的平滑变化。
        resized_confidence_map = cv2.resize(
            prediction_result.confidence_map.astype("float32"),
            (original_width, original_height),
            interpolation=cv2.INTER_LINEAR,
        )
        resized_confidence_map = np.clip(resized_confidence_map, 0.0, 1.0)
        max_class_id = int(resized_mask.max()) if resized_mask.size else 0
        if class_label_mapping and max_class_id > max(class_label_mapping):
            logger.warning(
                "预测类别 id=%s 超过已配置的标签映射上限，多余类别将被忽略，当前映射键=%s",
                max_class_id,
                sorted(class_label_mapping),
            )

        if control_tag != "PolygonLabels":
            raise AssertionError(f"暂不支持的分割控件类型: {control_tag}")

        return self._build_polygon_regions(
            resized_mask=resized_mask,
            resized_confidence_map=resized_confidence_map,
            from_name=from_name,
            to_name=to_name,
            class_label_mapping=class_label_mapping,
            original_width=original_width,
            original_height=original_height,
            model_score_threshold=model_score_threshold,
        )

    def _empty_prediction(self) -> Dict:
        return {
            "result": [],
            "score": 0.0,
            "model_version": self.get("model_version"),
        }

    def _download_image_to_temp_path(self, image_url: str) -> str:
        """
        将远程图片下载到唯一的临时文件，并返回文件路径。
        """
        parsed_url = urlparse(image_url)
        _, ext = os.path.splitext(parsed_url.path)
        suffix = ext if ext else ".img"

        # 使用唯一临时文件名隔离不同任务，避免共享固定文件路径。
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_path = temp_file.name
        temp_file.close()

        try:
            response = requests.get(image_url)
            if response.status_code != 200:
                raise Exception(f"下载图片失败，图片地址={image_url}")

            with open(temp_path, "wb") as f:
                f.write(response.content)
        except Exception:
            # 下载或写文件失败时立即清理临时文件，避免留下无效残留。
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise

        return temp_path

    def predict(self, tasks: List[Dict], context: Optional[Dict] = None, **kwargs) -> ModelResponse:
        """
        对任务进行预测，并把类别索引图转换为 Label Studio `polygonlabels`。
        """
        predictions = []
        logger.info("收到预测请求，任务数量=%s", len(tasks))


        try:
            control_tag, from_name, to_name, value = self._resolve_segmentation_control()
        except Exception:
            logger.exception("获取标签配置失败")
            return ModelResponse(predictions=[])

        # 语义分割的类别索引必须和请求里的 label_config 显式对齐，每次 predict 都做一次校验。
        class_label_mapping = self._get_validated_class_label_mapping(from_name, control_tag)
        model_score_threshold = self._get_model_score_threshold(from_name)

        for task in tasks:
            temp_image_path = None
            try:
                task_id = task.get('id')
                image_url = task['data'].get(value) or task['data'].get(DATA_UNDEFINED_NAME)
                if not image_url:
                    logger.warning("任务 task_id=%s 中未找到图片 URL，已跳过", task_id)
                    predictions.append(self._empty_prediction())
                    continue

                logger.info("开始处理任务，任务编号=%s", task_id)
                temp_image_path = self._download_image_to_temp_path(image_url)
                image = cv2.imread(temp_image_path)
                if image is None:
                    raise FileNotFoundError(f"无法读取图像: {temp_image_path}")

                original_height, original_width = image.shape[:2]

                image_tensor = self.model_handle.pre_handle(temp_image_path).to(self.DEVICE)
      
                with torch.no_grad():
                    outputs = self.model(image_tensor)

                prediction_result = self.model_handle.post_handle(outputs)
                result_regions = self._build_prediction_regions(
                    prediction_result=prediction_result,
                    control_tag=control_tag,
                    from_name=from_name,
                    to_name=to_name,
                    class_label_mapping=class_label_mapping,
                    original_width=original_width,
                    original_height=original_height,
                    model_score_threshold=model_score_threshold,
                )

                result = {
                    'result': result_regions,
                    'score': (
                        float(sum(region['score'] for region in result_regions) / len(result_regions))
                        if result_regions else 0.0
                    ),
                    'model_version': self.get('model_version')
                }
                predictions.append(result)
                logger.info(
                    "任务编号=%s 预测完成：区域数量=%s",
                    task_id,
                    len(result_regions),
                )

            except Exception:
                logger.exception("预测任务失败，任务编号=%s", task.get('id'))
                predictions.append(self._empty_prediction())
            finally:
                # 每个任务结束后都清理对应的临时图片，避免长期堆积到系统临时目录。
                if temp_image_path and os.path.exists(temp_image_path):
                    os.remove(temp_image_path)

        logger.info("预测流程结束，返回结果条数=%s", len(predictions))
        return ModelResponse(predictions=predictions)

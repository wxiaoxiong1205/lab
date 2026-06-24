import json
import os
import shutil
import cv2
from abc import ABC, abstractmethod
from typing import Any, Dict, Iterator, List, Optional

from fastapi import HTTPException
import numpy as np

from app.schemas.machine_learning_dataset import ExportFormat, MachineLearningDatasetTemplateType
from app.utils.segmentation_codec import is_rle_segmentation as _is_rle_seg


class ExporterType:
    TEXT_CLASSIFICATION_SINGLE_LABEL__PLATFORM = "text_classification_single_label__platform"
    TEXT_CLASSIFICATION_MULTI_LABEL__PLATFORM = "text_classification_multi_label__platform"
    ENTITY_RECOGNITION__PLATFORM = "entity_recognition__platform"
    IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM = "image_classification_single_label__platform"
    IMAGE_CLASSIFICATION_MULTI_LABEL__PLATFORM = "image_classification_multi_label__platform"
    OBJECT_DETECTION_BBOX__PLATFORM = "object_detection_bbox__platform"
    IMAGE_SEGMENTATION_INSTANCE__PLATFORM = "image_segmentation_instance__platform"
    SEMANTIC_SEGMENTATION__PLATFORM = "semantic_segmentation__platform"
    TEXT_CLASSIFICATION_SINGLE_LABEL__JSONL = "text_classification_single_label__jsonl"
    TEXT_CLASSIFICATION_MULTI_LABEL__JSONL = "text_classification_multi_label__jsonl"
    ENTITY_RECOGNITION__JSONL = "entity_recognition__jsonl"
    IMAGE_CLASSIFICATION_SINGLE_LABEL__IMAGE_FOLDER = "image_classification_single_label__image_folder"
    IMAGE_CLASSIFICATION_MULTI_LABEL__COCO = "image_classification_multi_label__coco"
    OBJECT_DETECTION_BBOX__COCO = "object_detection_bbox__coco"
    IMAGE_SEGMENTATION_INSTANCE__COCO = "image_segmentation_instance__coco"
    INSTANCE_SEGMENTATION_MASK__PLATFORM = "instance_segmentation_mask__platform"
    INSTANCE_SEGMENTATION_MASK__COCO = "instance_segmentation_mask__coco"
    SEMANTIC_SEGMENTATION__MASK_IMAGE = "semantic_segmentation__mask_image"


class ExporterAdapter(ABC):
    exporter_type: str = ""
    primary_filename: str = ""

    @abstractmethod
    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        pass


EXPORTER_REGISTRY: Dict[str, ExporterAdapter] = {}


def register_exporter(cls):
    EXPORTER_REGISTRY[cls.exporter_type] = cls()
    return cls


def register_exporter_alias(alias_type: str, exporter_type: str) -> None:
    exporter = EXPORTER_REGISTRY.get(exporter_type)
    if exporter is not None:
        EXPORTER_REGISTRY[alias_type] = exporter


def resolve_exporter_type(template_type: MachineLearningDatasetTemplateType, export_format: ExportFormat) -> str:
    if export_format == ExportFormat.PLATFORM:
        if template_type == MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_SINGLE_LABEL:
            return ExporterType.TEXT_CLASSIFICATION_SINGLE_LABEL__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_MULTI_LABEL:
            return ExporterType.TEXT_CLASSIFICATION_MULTI_LABEL__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.ENTITY_RECOGNITION:
            return ExporterType.ENTITY_RECOGNITION__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_SINGLE_LABEL:
            return ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_MULTI_LABEL:
            return ExporterType.IMAGE_CLASSIFICATION_MULTI_LABEL__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.OBJECT_DETECTION_BBOX:
            return ExporterType.OBJECT_DETECTION_BBOX__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.IMAGE_SEGMENTATION_INSTANCE:
            return ExporterType.IMAGE_SEGMENTATION_INSTANCE__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK:
            return ExporterType.INSTANCE_SEGMENTATION_MASK__PLATFORM
        if template_type == MachineLearningDatasetTemplateType.SEMANTIC_SEGMENTATION:
            return ExporterType.SEMANTIC_SEGMENTATION__PLATFORM
        raise HTTPException(status_code=400, detail=f"未支持的模板类型: {template_type.value}")

    if template_type == MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_SINGLE_LABEL:
        if export_format == ExportFormat.JSONL:
            return ExporterType.TEXT_CLASSIFICATION_SINGLE_LABEL__JSONL
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_MULTI_LABEL:
        if export_format == ExportFormat.JSONL:
            return ExporterType.TEXT_CLASSIFICATION_MULTI_LABEL__JSONL
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.ENTITY_RECOGNITION:
        if export_format == ExportFormat.JSONL:
            return ExporterType.ENTITY_RECOGNITION__JSONL
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_SINGLE_LABEL:
        if export_format == ExportFormat.IMAGE_FOLDER:
            return ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__IMAGE_FOLDER
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_MULTI_LABEL:
        if export_format == ExportFormat.COCO:
            return ExporterType.IMAGE_CLASSIFICATION_MULTI_LABEL__COCO
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.OBJECT_DETECTION_BBOX:
        if export_format == ExportFormat.COCO:
            return ExporterType.OBJECT_DETECTION_BBOX__COCO
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.IMAGE_SEGMENTATION_INSTANCE:
        if export_format == ExportFormat.COCO:
            return ExporterType.IMAGE_SEGMENTATION_INSTANCE__COCO
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK:
        if export_format == ExportFormat.COCO:
            return ExporterType.INSTANCE_SEGMENTATION_MASK__COCO
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    if template_type == MachineLearningDatasetTemplateType.SEMANTIC_SEGMENTATION:
        if export_format == ExportFormat.MASK_IMAGE:
            return ExporterType.SEMANTIC_SEGMENTATION__MASK_IMAGE
        raise HTTPException(status_code=400, detail=f"导出格式不支持: {template_type.value} -> {export_format.value}")
    raise HTTPException(status_code=400, detail=f"未支持的模板类型: {template_type.value}")


def read_label_schema_from_jfs(jfs, schema_path: Optional[str]) -> Dict[str, str]:
    if not schema_path or not jfs.exists(schema_path):
        return {}
    try:
        with jfs.open(schema_path, "r", encoding="utf-8") as f:
            text = f.read().strip()
        if not text:
            return {}
        raw = json.loads(text)
        if not isinstance(raw, dict):
            return {}

        # 格式1（历史/平台）：{"1":"Person","2":"Car"}
        if all(str(k).isdigit() for k in raw.keys()) and all(isinstance(v, str) for v in raw.values()):
            return {str(int(str(k))): str(v) for k, v in raw.items()}

        # 格式2（部分工具链）：{"num_class":3,"label_mapping":{"Person":1,"Car":2}}
        label_mapping = raw.get("label_mapping")
        if isinstance(label_mapping, dict):
            normalized: Dict[str, str] = {}

            # 2a: {"Person":1,"Car":2} -> {"1":"Person","2":"Car"}
            name_to_id_ok = all(isinstance(k, str) and isinstance(v, int) for k, v in label_mapping.items())
            if name_to_id_ok:
                for class_name, class_id in label_mapping.items():
                    if class_id >= 0:
                        normalized[str(class_id)] = class_name
                if normalized:
                    return normalized

            # 2b: {"1":"Person","2":"Car"}（嵌套在 label_mapping 下）
            id_to_name_ok = all(str(k).isdigit() and isinstance(v, str) for k, v in label_mapping.items())
            if id_to_name_ok:
                return {str(int(str(k))): str(v) for k, v in label_mapping.items()}

        return {}
    except Exception:
        return {}


def iter_unified_samples_from_jfs(jfs, dataset_path: str) -> Iterator[Dict[str, Any]]:
    with jfs.open(dataset_path, "r", encoding="utf-8") as src:
        for line in src:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                item = json.loads(stripped)
            except json.JSONDecodeError:
                continue
            normalized = normalize_platform_sample(item)
            if normalized:
                yield normalized


def normalize_platform_sample(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    data = item.get("data") if isinstance(item.get("data"), dict) else {}
    anns = item.get("annotations")
    if not isinstance(anns, list):
        anns = []

    if isinstance(data.get("content"), str) and (not anns or all(isinstance(a, int) for a in anns)):
        return {
            "sample_id": str(item.get("sample_id") or ""),
            "data": {"content": data.get("content", "")},
            "annotation": {"labels": anns},
        }

    if isinstance(data.get("content"), str) and all(isinstance(a, dict) and "offset" in a and "tag" in a for a in anns):
        entities = []
        for a in anns:
            offset = a.get("offset")
            if isinstance(offset, list) and len(offset) == 2:
                try:
                    int(a.get("tag"))
                except (ValueError, TypeError):
                    continue
                entities.append({"start": offset[0], "end": offset[1], "label": int(a.get("tag"))})
        return {
            "sample_id": str(item.get("sample_id") or ""),
            "data": {"content": data.get("content", "")},
            "annotation": {"entities": entities},
        }

    if isinstance(data.get("image"), str):
        bboxes = []
        segments = []
        labels = []
        for a in anns:
            if isinstance(a, int):
                labels.append(a)
                continue
            if not isinstance(a, dict):
                continue
            if isinstance(a.get("class_id"), int) and isinstance(a.get("bbox"), list):
                bboxes.append({"label": int(a["class_id"]), "bbox": a["bbox"]})
            seg = a.get("segmentation")
            if isinstance(a.get("class_id"), int) and (
                isinstance(seg, list) or _is_rle_seg(seg)
            ):
                segments.append({"label": int(a["class_id"]), "segmentation": seg})
        return {
            "sample_id": str(item.get("sample_id") or ""),
            "data": {"image": data.get("image"), "width": data.get("width"), "height": data.get("height")},
            "annotation": {"labels": labels, "bboxes": bboxes, "segments": segments},
        }
    return None


def export_samples_to_dir(
    *,
    jfs,
    dataset_path: str,
    template_type: MachineLearningDatasetTemplateType,
    export_format: ExportFormat,
    output_dir: str,
    label_schema: Dict[str, str],
) -> str:
    exporter_type = resolve_exporter_type(template_type, export_format)
    exporter = EXPORTER_REGISTRY.get(exporter_type)
    if not exporter:
        raise HTTPException(status_code=500, detail=f"未注册的导出器: {exporter_type}")
    options = {
        "label_schema": label_schema,
        "template_type": template_type.value,
        "export_format": export_format.value,
        "assets_dir": os.path.join(output_dir, "images"),
    }
    exporter.export(samples=iter_unified_samples_from_jfs(jfs, dataset_path), output_dir=output_dir, options=options)
    return exporter.primary_filename


def _write_platform_classname_file(output_dir: str, label_schema: Dict[Any, Any]) -> Dict[int, str]:
    normalized: Dict[int, str] = {}
    if isinstance(label_schema, dict):
        for class_id, class_name in label_schema.items():
            if not str(class_id).isdigit():
                continue
            if not isinstance(class_name, str) or not class_name.strip():
                continue
            normalized[int(str(class_id))] = class_name.strip()
    ordered = {str(class_id): normalized[class_id] for class_id in sorted(normalized.keys())}
    with open(os.path.join(output_dir, "classname.json"), "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=2)
    return normalized


def _build_export_label_mapping(
    label_schema: Dict[Any, Any],
    recalculated_class_id_start: int = 1,
) -> tuple[List[tuple[int, str]], Dict[int, int]]:
    """将原始 label_schema 重新映射为导出用的连续类别 id（从指定初始值开始）。"""
    normalized_schema_items: List[tuple[int, str]] = []
    if isinstance(label_schema, dict):
        for class_id, class_name in label_schema.items():
            if not str(class_id).isdigit():
                continue
            if not isinstance(class_name, str) or not class_name.strip():
                continue
            normalized_schema_items.append((int(str(class_id)), class_name.strip()))
    normalized_schema_items.sort(key=lambda item: item[0])
    export_class_id_mapping = {
        original_class_id: recalculated_class_id_start + idx
        for idx, (original_class_id, _) in enumerate(normalized_schema_items)
    }
    return normalized_schema_items, export_class_id_mapping


def _write_class_map_file(
    output_dir: str,
    normalized_schema_items: List[tuple[int, str]],
    export_class_id_mapping: Dict[int, int],
) -> None:
    class_map_items = [
        {
            "id": export_class_id_mapping[original_class_id],
            "name": class_name,
        }
        for original_class_id, class_name in normalized_schema_items
        if original_class_id in export_class_id_mapping
    ]

    with open(os.path.join(output_dir, "class_map.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "classes": class_map_items,
                "metadata": {"num_classes": len(class_map_items)}
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _remap_label_list(labels: Any, class_id_mapping: Dict[int, int]) -> List[int]:
    remapped_labels: List[int] = []
    if not isinstance(labels, list):
        return remapped_labels
    for label in labels:
        if not isinstance(label, int):
            continue
        export_label = class_id_mapping.get(label)
        if export_label is not None:
            remapped_labels.append(export_label)
    return remapped_labels


def _remap_entities(entities: Any, class_id_mapping: Dict[int, int], normalized_schema_items: List[tuple[int, str]]) -> List[Dict[str, Any]]:
    class_map_items = [
        {
            "id": class_id_mapping[original_class_id],
            "name": class_name,
        }
        for original_class_id, class_name in normalized_schema_items
        if original_class_id in class_id_mapping
    ]

    remapped_entities: List[Dict[str, Any]] = []
    if not isinstance(entities, list):
        return remapped_entities
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        label = entity.get("label")
        export_label = class_id_mapping.get(label) if isinstance(label, int) else None
        remapped_entity = dict(entity)
        if export_label is not None:
            for item in class_map_items:
                if item["id"] == export_label:
                    remapped_entity["label"] = item["name"]
                    break
        remapped_entities.append(remapped_entity)
    return remapped_entities


def _write_coco_json_by_ndjson(images_path: str, annotations_path: str, categories: List[Dict[str, Any]], out_path: str) -> None:
    with open(out_path, "w", encoding="utf-8") as out_f:
        out_f.write('{"images":[')
        first = True
        with open(images_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if not first:
                    out_f.write(",")
                out_f.write(line)
                first = False
        out_f.write('],"annotations":[')
        first = True
        with open(annotations_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if not first:
                    out_f.write(",")
                out_f.write(line)
                first = False
        out_f.write('],"categories":')
        out_f.write(json.dumps(categories, ensure_ascii=False))
        out_f.write("}")


def _bbox_from_polygons(polygons: Any) -> List[float]:
    points = []
    if isinstance(polygons, list):
        for poly in polygons:
            if isinstance(poly, list) and len(poly) >= 6 and len(poly) % 2 == 0:
                for i in range(0, len(poly), 2):
                    x, y = poly[i], poly[i + 1]
                    if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                        points.append((float(x), float(y)))
    if not points:
        return [0.0, 0.0, 0.0, 0.0]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return [min_x, min_y, max(0.0, max_x - min_x), max(0.0, max_y - min_y)]


def _area_from_polygons(polygons: Any) -> float:
    total = 0.0
    if not isinstance(polygons, list):
        return total
    for poly in polygons:
        if not isinstance(poly, list) or len(poly) < 6 or len(poly) % 2 != 0:
            continue
        pts = []
        for i in range(0, len(poly), 2):
            x, y = poly[i], poly[i + 1]
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                pts.append((float(x), float(y)))
        if len(pts) < 3:
            continue
        area = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            area += x1 * y2 - x2 * y1
        total += abs(area) / 2.0
    return total


def _build_semantic_mask(height: int, width: int, segments: List[Dict[str, Any]], class_id_mapping: Optional[Dict[int, int]] = None) -> np.ndarray:
    """根据 segments 构建语义分割 mask，像素值为导出后的 class_id（使用 cv2.fillPoly）。"""
    mask = np.zeros((height, width), dtype=np.uint16)
    for seg in segments:
        class_id = seg.get("label")
        polygons = seg.get("segmentation")
        if not isinstance(class_id, int) or class_id < 0 or not isinstance(polygons, list):
            continue
        output_class_id = class_id_mapping.get(class_id, class_id) if isinstance(class_id_mapping, dict) else class_id
        for polygon in polygons:
            if not isinstance(polygon, list) or len(polygon) < 4 or len(polygon) % 2 != 0:
                continue
            pts = np.array(polygon, dtype=np.float32).reshape(-1, 2)
            pts[:, 0] = np.clip(pts[:, 0], 0, width - 1)
            pts[:, 1] = np.clip(pts[:, 1], 0, height - 1)
            pts = np.round(pts).astype(np.int32)
            if pts.shape[0] >= 3:
                # 多边形 → 填充
                cv2.fillPoly(mask, [pts], color=int(output_class_id))
            else:
                # 线（2点）
                cv2.polylines(
                    mask,
                    [pts],
                    isClosed=False,
                    color=int(output_class_id),
                    thickness=2
                )
    return mask


def _save_mask_png(mask: np.ndarray, output_path: str) -> None:
    """使用 cv2 保存单通道 mask png。"""
    if mask.ndim != 2:
        raise ValueError("mask must be 2D")
    # class_id 通常较小，导出为 uint8；如需更大范围可改为 uint16。
    data = np.clip(mask, 0, 255).astype(np.uint8)
    ok = cv2.imwrite(output_path, data)
    if not ok:
        raise ValueError(f"failed to write mask png: {output_path}")


def _generate_palette(num_classes: int) -> np.ndarray:
    """生成 VOC 风格调色板（RGB）。"""
    palette = np.zeros((num_classes, 3), dtype=np.uint8)
    for i in range(num_classes):
        r, g, b = 0, 0, 0
        class_id = i
        for j in range(8):
            r |= ((class_id >> 0) & 1) << (7 - j)
            g |= ((class_id >> 1) & 1) << (7 - j)
            b |= ((class_id >> 2) & 1) << (7 - j)
            class_id >>= 3
        palette[i] = [r, g, b]
    return palette


def _colorize_mask(mask: np.ndarray, num_classes: int) -> np.ndarray:
    """将单通道 mask 转为彩色可视化图。"""
    safe_num_classes = max(1, int(num_classes))
    palette = _generate_palette(safe_num_classes)
    indexed = np.clip(mask.astype(np.int32), 0, safe_num_classes - 1)
    return palette[indexed].astype(np.uint8)


def _save_vis_mask(mask: np.ndarray, output_path: str, num_classes: int) -> None:
    """保存可视化彩色 mask 到 VIS 目录。"""
    color_mask = _colorize_mask(mask, num_classes)
    # palette 是 RGB，cv2.imwrite 需要 BGR
    color_mask_bgr = cv2.cvtColor(color_mask, cv2.COLOR_RGB2BGR)
    ok = cv2.imwrite(output_path, color_mask_bgr)
    if not ok:
        raise ValueError(f"failed to write vis png: {output_path}")


@register_exporter
class TextClsPlatformExporter(ExporterAdapter):
    exporter_type = ExporterType.TEXT_CLASSIFICATION_SINGLE_LABEL__PLATFORM
    primary_filename = "dataset.jsonl"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        raw_label_schema = options.get("label_schema", {}) or {}
        label_name_map = (
            _write_platform_classname_file(output_dir, raw_label_schema)
            if raw_label_schema
            else {}
        )
        with open(os.path.join(output_dir, self.primary_filename), "w", encoding="utf-8") as f:
            for sample in samples:
                text = sample.get("data", {}).get("content")
                if not isinstance(text, str):
                    continue
                labels = sample.get("annotation", {}).get("labels", [])
                annotations = [
                    label_name_map[label]
                    for label in labels
                    if isinstance(label, int) and label in label_name_map
                ]
                record = {"content": text}
                if annotations:
                    record["annotations"] = annotations
                f.write(json.dumps(record, ensure_ascii=False) + "\n")


@register_exporter
class NerPlatformExporter(ExporterAdapter):
    exporter_type = ExporterType.ENTITY_RECOGNITION__PLATFORM
    primary_filename = "dataset.jsonl"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        raw_label_schema = options.get("label_schema", {}) or {}
        label_name_map = (
            _write_platform_classname_file(output_dir, raw_label_schema)
            if raw_label_schema
            else {}
        )
        with open(os.path.join(output_dir, self.primary_filename), "w", encoding="utf-8") as f:
            for sample in samples:
                text = sample.get("data", {}).get("content")
                if not isinstance(text, str):
                    continue
                annotations = []
                for entity in sample.get("annotation", {}).get("entities", []):
                    if not isinstance(entity, dict):
                        continue
                    start = entity.get("start")
                    end = entity.get("end")
                    label = entity.get("label")
                    if not isinstance(start, int) or not isinstance(end, int) or not isinstance(label, int):
                        continue
                    annotations.append({"offset": [start, end], "tag": label_name_map[int(label)]})
                record = {"content": text}
                if annotations:
                    record["annotations"] = annotations
                f.write(json.dumps(record, ensure_ascii=False) + "\n")


@register_exporter
class ImagePlatformExporter(ExporterAdapter):
    exporter_type = ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM
    primary_filename = "dataset.jsonl"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        raw_label_schema = options.get("label_schema", {}) or {}
        if raw_label_schema:
            _write_platform_classname_file(output_dir, raw_label_schema)
        template_type = str(options.get("template_type", "")).strip()
        assets_dir = str(options.get("assets_dir", "")).strip() or os.path.join(output_dir, "images")

        label_dir_map: Dict[int, str] = {}
        if isinstance(raw_label_schema, dict):
            for class_id, class_name in raw_label_schema.items():
                if str(class_id).isdigit() and isinstance(class_name, str) and class_name.strip():
                    label_dir_map[int(str(class_id))] = class_name.strip()

        def resolve_local_image_path(image_path: str) -> str:
            raw = str(image_path or "").strip()
            if not raw:
                return ""
            if os.path.isfile(raw):
                return raw

            relative = raw.lstrip("/").replace("\\", "/")
            candidates: List[str] = [
                os.path.join(output_dir, relative),
                os.path.join(assets_dir, relative),
                os.path.join(assets_dir, os.path.basename(relative)),
            ]
            if relative.startswith("images/"):
                sub_rel = relative[len("images/"):]
                candidates.append(os.path.join(assets_dir, sub_rel))
                candidates.append(os.path.join(assets_dir, os.path.basename(sub_rel)))

            for candidate in candidates:
                if os.path.isfile(candidate):
                    return candidate
            return ""

        def unique_target_path(target_dir: str, filename: str) -> str:
            base, ext = os.path.splitext(filename)
            candidate = os.path.join(target_dir, filename)
            idx = 1
            while os.path.exists(candidate):
                candidate = os.path.join(target_dir, f"{base}_{idx}{ext}")
                idx += 1
            return candidate

        dataset_file_path = os.path.join(output_dir, self.primary_filename)
        wrote_dataset_rows = False

        with open(dataset_file_path, "w", encoding="utf-8") as f:
            for sample in samples:
                data = sample.get("data", {})
                image = data.get("image")
                if not isinstance(image, str) or not image.strip():
                    continue

                local_image_path = resolve_local_image_path(image)
                if not local_image_path:
                    continue

                if template_type in (
                    MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_SINGLE_LABEL.value,
                    MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_MULTI_LABEL.value,
                ):
                    labels = sample.get("annotation", {}).get("labels", [])
                    valid_labels = sorted({label for label in labels if isinstance(label, int) and label in label_dir_map})
                    image_name = os.path.basename(local_image_path)

                    if not valid_labels:
                        target_path = unique_target_path(output_dir, image_name)
                        shutil.copy2(local_image_path, target_path)
                        continue

                    primary_label = valid_labels[0]
                    class_dir_name = label_dir_map[primary_label]
                    class_dir = os.path.join(output_dir, class_dir_name)
                    os.makedirs(class_dir, exist_ok=True)
                    target_path = unique_target_path(class_dir, image_name)
                    shutil.copy2(local_image_path, target_path)
                    relative_image_path = os.path.relpath(target_path, output_dir).replace("\\", "/")
                    f.write(
                        json.dumps(
                            {
                                "image": relative_image_path,
                                "annotations": valid_labels,
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    wrote_dataset_rows = True
                elif template_type == MachineLearningDatasetTemplateType.OBJECT_DETECTION_BBOX.value:
                    annotations = []
                    for obj in sample.get("annotation", {}).get("bboxes", []):
                        if not isinstance(obj, dict):
                            continue
                        label = obj.get("label")
                        bbox = obj.get("bbox")
                        if not isinstance(label, int) or label not in label_dir_map:
                            continue
                        if not isinstance(bbox, list) or len(bbox) != 4:
                            continue
                        annotations.append(
                            {
                                "class_id": label,
                                "bbox": bbox,
                            }
                        )

                    if not annotations:
                        target_path = unique_target_path(output_dir, os.path.basename(local_image_path))
                        shutil.copy2(local_image_path, target_path)
                        continue

                    record = {"image": f"images/{os.path.basename(image)}"}
                    width = data.get("width")
                    height = data.get("height")
                    if isinstance(width, int):
                        record["width"] = width
                    if isinstance(height, int):
                        record["height"] = height
                    record["annotations"] = annotations
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    wrote_dataset_rows = True
                else:
                    annotations = []
                    if template_type == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value:
                        # 掩码模板：segmentation 是 RLE dict，原样透传
                        for obj in sample.get("annotation", {}).get("segments", []):
                            if not isinstance(obj, dict):
                                continue
                            label = obj.get("label")
                            segmentation = obj.get("segmentation")
                            if not isinstance(label, int) or label not in label_dir_map:
                                continue
                            if not _is_rle_seg(segmentation):
                                continue
                            annotations.append({"class_id": label, "segmentation": segmentation})
                    else:
                        # 旧模板（image_segmentation_instance / semantic_segmentation）：polygon list 格式
                        for obj in sample.get("annotation", {}).get("segments", []):
                            if not isinstance(obj, dict):
                                continue
                            label = obj.get("label")
                            segmentation = obj.get("segmentation")
                            if not isinstance(label, int) or label not in label_dir_map:
                                continue
                            if not isinstance(segmentation, list):
                                continue
                            annotations.append({"class_id": label, "segmentation": segmentation})

                    if not annotations:
                        target_path = unique_target_path(output_dir, os.path.basename(local_image_path))
                        shutil.copy2(local_image_path, target_path)
                        continue

                    record = {"image": f"images/{os.path.basename(image)}"}
                    width = data.get("width")
                    height = data.get("height")
                    if isinstance(width, int):
                        record["width"] = width
                    if isinstance(height, int):
                        record["height"] = height
                    record["annotations"] = annotations
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    wrote_dataset_rows = True

        if not wrote_dataset_rows and os.path.exists(dataset_file_path):
            os.remove(dataset_file_path)


@register_exporter
class TextClsJsonlExporter(ExporterAdapter):
    exporter_type = ExporterType.TEXT_CLASSIFICATION_SINGLE_LABEL__JSONL
    primary_filename = "data.jsonl"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        _write_class_map_file(output_dir, normalized_schema_items, export_class_id_mapping)

        with open(os.path.join(output_dir, self.primary_filename), "w", encoding="utf-8") as f:
            for sample in samples:
                text = sample.get("data", {}).get("content")
                if isinstance(text, str):
                    f.write(
                        json.dumps(
                            {
                                "text": text,
                                "labels": _remap_label_list(
                                    sample.get("annotation", {}).get("labels", []),
                                    export_class_id_mapping,
                                ),
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )


@register_exporter
class NerJsonlExporter(ExporterAdapter):
    exporter_type = ExporterType.ENTITY_RECOGNITION__JSONL
    primary_filename = "data.jsonl"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        with open(os.path.join(output_dir, self.primary_filename), "w", encoding="utf-8") as f:
            for sample in samples:
                text = sample.get("data", {}).get("content")
                if isinstance(text, str):
                    f.write(
                        json.dumps(
                            {
                                "text": text,
                                "entities": _remap_entities(
                                    sample.get("annotation", {}).get("entities", []),
                                    export_class_id_mapping,
                                    normalized_schema_items
                                ),
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )

        _write_class_map_file(output_dir, normalized_schema_items, export_class_id_mapping)


@register_exporter
class ImageClsImageFolderExporter(ExporterAdapter):
    exporter_type = ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__IMAGE_FOLDER
    primary_filename = "class_map.json"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        _write_class_map_file(output_dir, normalized_schema_items, export_class_id_mapping)
        assets_dir = str(options.get("assets_dir", "")).strip() or os.path.join(output_dir, "images")
        label_name_map: Dict[int, str] = {}
        for k, v in label_schema.items():
            if str(k).isdigit() and isinstance(v, str) and v.strip():
                export_label_id = export_class_id_mapping.get(int(str(k)))
                if export_label_id is not None:
                    label_name_map[export_label_id] = v.strip()

        fallback_name_map: Dict[int, str] = {}

        def resolve_label_name(label_id: int) -> str:
            name = label_name_map.get(label_id)
            if name:
                return name
            if label_id not in fallback_name_map:
                fallback_name_map[label_id] = f"class_{label_id}"
            return fallback_name_map[label_id]

        def unique_target_path(target_dir: str, filename: str) -> str:
            base, ext = os.path.splitext(filename)
            candidate = os.path.join(target_dir, filename)
            idx = 1
            while os.path.exists(candidate):
                candidate = os.path.join(target_dir, f"{base}_{idx}{ext}")
                idx += 1
            return candidate

        def resolve_local_image_path(image_path: str) -> str:
            raw = str(image_path or "").strip()
            if not raw:
                return ""
            if os.path.isfile(raw):
                return raw

            relative = raw.lstrip("/").replace("\\", "/")
            candidates: List[str] = []
            candidates.append(os.path.join(output_dir, relative))
            candidates.append(os.path.join(assets_dir, relative))
            candidates.append(os.path.join(assets_dir, os.path.basename(relative)))

            if relative.startswith("images/"):
                sub_rel = relative[len("images/"):]
                candidates.append(os.path.join(assets_dir, sub_rel))
                candidates.append(os.path.join(assets_dir, os.path.basename(sub_rel)))

            for candidate in candidates:
                if os.path.isfile(candidate):
                    return candidate
            return ""

        for sample in samples:
            data = sample.get("data", {})
            image_path = resolve_local_image_path(str(data.get("image", "")).strip())
            if not image_path:
                continue

            labels = sample.get("annotation", {}).get("labels", [])
            if not isinstance(labels, list):
                continue

            image_name = os.path.basename(image_path)
            valid_labels = []
            for label in labels:
                if not isinstance(label, int):
                    continue
                export_label = export_class_id_mapping.get(label)
                if export_label is not None:
                    valid_labels.append(export_label)
            if not valid_labels:
                continue

            # 单标签 ImageFolder: 每张图片只落在一个类别目录
            valid_labels = [valid_labels[0]]

            for label in valid_labels:
                class_name = resolve_label_name(label)
                class_dir = os.path.join(output_dir, class_name)
                os.makedirs(class_dir, exist_ok=True)
                target_path = unique_target_path(class_dir, image_name)
                shutil.copy2(image_path, target_path)


@register_exporter
class ImageClsMultiLabelCocoExporter(ExporterAdapter):
    exporter_type = ExporterType.IMAGE_CLASSIFICATION_MULTI_LABEL__COCO
    primary_filename = "annotations.json"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        categories_by_id: Dict[int, str] = {export_class_id_mapping[original_class_id]: class_name for original_class_id, class_name in normalized_schema_items}
        assets_dir = str(options.get("assets_dir", "")).strip() or os.path.join(output_dir, "images")

        fallback_name_map: Dict[int, str] = {}

        def resolve_label_name(label_id: int) -> str:
            export_label_id = export_class_id_mapping.get(label_id)
            name = categories_by_id.get(export_label_id) if export_label_id is not None else None
            if name:
                return name
            if label_id not in fallback_name_map:
                fallback_name_map[label_id] = f"class_{label_id}"
            return fallback_name_map[label_id]

        def resolve_local_image_path(image_path: str) -> str:
            raw = str(image_path or "").strip()
            if not raw:
                return ""
            if os.path.isfile(raw):
                return raw

            relative = raw.lstrip("/").replace("\\", "/")
            candidates: List[str] = []
            candidates.append(os.path.join(output_dir, relative))
            candidates.append(os.path.join(assets_dir, relative))
            candidates.append(os.path.join(assets_dir, os.path.basename(relative)))
            if relative.startswith("images/"):
                sub_rel = relative[len("images/"):]
                candidates.append(os.path.join(assets_dir, sub_rel))
                candidates.append(os.path.join(assets_dir, os.path.basename(sub_rel)))

            for candidate in candidates:
                if os.path.isfile(candidate):
                    return candidate
            return ""

        images_ndjson = os.path.join(output_dir, "_images.ndjson")
        anns_ndjson = os.path.join(output_dir, "_annotations.ndjson")
        image_id = 1

        with open(images_ndjson, "w", encoding="utf-8") as img_f, open(anns_ndjson, "w", encoding="utf-8") as ann_f:
            for sample in samples:
                data = sample.get("data", {})
                image_path = resolve_local_image_path(str(data.get("image", "")).strip())
                if not image_path:
                    continue

                img_f.write(
                    json.dumps(
                        {
                            "id": image_id,
                            "file_name": f"images/{os.path.basename(image_path)}",
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )

                labels = sample.get("annotation", {}).get("labels", [])
                if not isinstance(labels, list):
                    labels = []
                valid_labels = sorted({label for label in labels if isinstance(label, int)})
                for label in valid_labels:
                    export_label = export_class_id_mapping.get(label)
                    if export_label is None:
                        continue
                    categories_by_id.setdefault(export_label, resolve_label_name(label))
                    ann_f.write(
                        json.dumps(
                            {
                                "image_id": image_id,
                                "category_id": export_label,
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )

                image_id += 1

        categories = [{"id": category_id, "name": categories_by_id[category_id]} for category_id in sorted(categories_by_id.keys())]
        _write_coco_json_by_ndjson(images_ndjson, anns_ndjson, categories, os.path.join(output_dir, self.primary_filename))
        os.remove(images_ndjson)
        os.remove(anns_ndjson)


@register_exporter
class DetectionCocoExporter(ExporterAdapter):
    exporter_type = ExporterType.OBJECT_DETECTION_BBOX__COCO
    primary_filename = "annotations.json"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        categories = [{"id": export_class_id_mapping[original_class_id], "name": class_name} for original_class_id, class_name in normalized_schema_items]
        images_ndjson = os.path.join(output_dir, "_images.ndjson")
        anns_ndjson = os.path.join(output_dir, "_annotations.ndjson")
        ann_id = 1
        image_id = 1
        with open(images_ndjson, "w", encoding="utf-8") as img_f, open(anns_ndjson, "w", encoding="utf-8") as ann_f:
            for sample in samples:
                data = sample.get("data", {})
                image_path = str(data.get("image", "")).strip()
                if not image_path:
                    continue
                img_f.write(json.dumps({"id": image_id, "file_name": f"images/{os.path.basename(image_path)}", "width": int(data.get("width")) if isinstance(data.get("width"), int) else 0, "height": int(data.get("height")) if isinstance(data.get("height"), int) else 0}, ensure_ascii=False) + "\n")
                for obj in sample.get("annotation", {}).get("bboxes", []):
                    label = obj.get("label")
                    bbox = obj.get("bbox")
                    export_label = export_class_id_mapping.get(label) if isinstance(label, int) else None
                    if export_label is None or not isinstance(bbox, list) or len(bbox) != 4:
                        continue
                    x, y, w, h = [float(v) for v in bbox]
                    ann_f.write(json.dumps({"id": ann_id, "image_id": image_id, "category_id": export_label, "bbox": [x, y, w, h], "area": max(0.0, w) * max(0.0, h), "iscrowd": 0, "segmentation": None}, ensure_ascii=False) + "\n")
                    ann_id += 1
                image_id += 1
        _write_coco_json_by_ndjson(images_ndjson, anns_ndjson, categories, os.path.join(output_dir, self.primary_filename))
        os.remove(images_ndjson)
        os.remove(anns_ndjson)


@register_exporter
class SegmentationCocoExporter(ExporterAdapter):
    exporter_type = ExporterType.IMAGE_SEGMENTATION_INSTANCE__COCO
    primary_filename = "annotations.json"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        valid_category_ids = set(export_class_id_mapping.keys())
        categories = [{"id": export_class_id_mapping[original_class_id], "name": class_name} for original_class_id, class_name in normalized_schema_items]
        images_ndjson = os.path.join(output_dir, "_images.ndjson")
        anns_ndjson = os.path.join(output_dir, "_annotations.ndjson")
        ann_id = 1
        image_id = 1
        with open(images_ndjson, "w", encoding="utf-8") as img_f, open(anns_ndjson, "w", encoding="utf-8") as ann_f:
            for sample in samples:
                data = sample.get("data", {})
                image_path = str(data.get("image", "")).strip()
                if not image_path:
                    continue
                img_f.write(json.dumps({"id": image_id, "file_name": f"images/{os.path.basename(image_path)}", "width": int(data.get("width")) if isinstance(data.get("width"), int) else 0, "height": int(data.get("height")) if isinstance(data.get("height"), int) else 0}, ensure_ascii=False) + "\n")
                segments = sample.get("annotation", {}).get("segments", [])
                if not isinstance(segments, list):
                    segments = []
                for obj in segments:
                    label = obj.get("label")
                    segmentation = obj.get("segmentation")
                    if not isinstance(label, int) or label not in valid_category_ids:
                        continue
                    if not isinstance(segmentation, list):
                        continue
                    export_label = export_class_id_mapping[label]
                    ann_f.write(json.dumps({"id": ann_id, "image_id": image_id, "category_id": export_label, "bbox": _bbox_from_polygons(segmentation), "area": _area_from_polygons(segmentation), "iscrowd": 0, "segmentation": segmentation}, ensure_ascii=False) + "\n")
                    ann_id += 1
                image_id += 1
        _write_coco_json_by_ndjson(images_ndjson, anns_ndjson, categories, os.path.join(output_dir, self.primary_filename))
        os.remove(images_ndjson)
        os.remove(anns_ndjson)


@register_exporter
class InstanceSegmentationMaskCocoExporter(ExporterAdapter):
    """实例分割（孔洞）COCO 导出器：segmentation 存储为 RLE dict，bbox/area 从 mask 计算。"""

    exporter_type = ExporterType.INSTANCE_SEGMENTATION_MASK__COCO
    primary_filename = "annotations.json"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        from app.utils.segmentation_codec import decode_rle_to_mask, rle_to_coco_segmentation

        label_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            label_schema,
            recalculated_class_id_start,
        )
        valid_category_ids = set(export_class_id_mapping.keys())
        categories = [
            {"id": export_class_id_mapping[original_class_id], "name": class_name}
            for original_class_id, class_name in normalized_schema_items
        ]
        images_ndjson = os.path.join(output_dir, "_images.ndjson")
        anns_ndjson = os.path.join(output_dir, "_annotations.ndjson")
        ann_id = 1
        image_id = 1
        with open(images_ndjson, "w", encoding="utf-8") as img_f, open(anns_ndjson, "w", encoding="utf-8") as ann_f:
            for sample in samples:
                data = sample.get("data", {})
                image_path = str(data.get("image", "")).strip()
                if not image_path:
                    continue
                img_f.write(
                    json.dumps(
                        {
                            "id": image_id,
                            "file_name": f"images/{os.path.basename(image_path)}",
                            "width": int(data.get("width")) if isinstance(data.get("width"), int) else 0,
                            "height": int(data.get("height")) if isinstance(data.get("height"), int) else 0,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                segments = sample.get("annotation", {}).get("segments", [])
                if not isinstance(segments, list):
                    segments = []
                for obj in segments:
                    label = obj.get("label")
                    segmentation = obj.get("segmentation")
                    if not isinstance(label, int) or label not in valid_category_ids:
                        continue
                    if not _is_rle_seg(segmentation):
                        continue
                    export_label = export_class_id_mapping[label]
                    try:
                        _mask = decode_rle_to_mask(segmentation)
                        _nonzero = cv2.findNonZero(_mask)
                        if _nonzero is None:
                            bbox = [0.0, 0.0, 0.0, 0.0]
                        else:
                            _x, _y, _bw, _bh = cv2.boundingRect(_nonzero)
                            bbox = [float(_x), float(_y), float(_bw), float(_bh)]
                        area = float(int(_mask.sum()))
                        coco_seg = rle_to_coco_segmentation(segmentation)
                    except Exception:
                        continue
                    ann_f.write(
                        json.dumps(
                            {
                                "id": ann_id,
                                "image_id": image_id,
                                "category_id": export_label,
                                "bbox": bbox,
                                "area": area,
                                "iscrowd": 0,
                                "segmentation": coco_seg,
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    ann_id += 1
                image_id += 1
        _write_coco_json_by_ndjson(images_ndjson, anns_ndjson, categories, os.path.join(output_dir, self.primary_filename))
        os.remove(images_ndjson)
        os.remove(anns_ndjson)


@register_exporter
class SegmentationMaskImageExporter(ExporterAdapter):
    exporter_type = ExporterType.SEMANTIC_SEGMENTATION__MASK_IMAGE
    primary_filename = "class_map.json"

    def export(self, samples: Iterator[dict], output_dir: str, options: dict) -> None:
        images_dir = os.path.join(output_dir, "images")
        segmentation_dir = os.path.join(output_dir, "labels")
        vis_dir = os.path.join(output_dir, "vis")
        os.makedirs(images_dir, exist_ok=True)
        os.makedirs(segmentation_dir, exist_ok=True)
        os.makedirs(vis_dir, exist_ok=True)

        raw_schema = options.get("label_schema", {}) or {}
        recalculated_class_id_start = 1
        normalized_schema_items, export_class_id_mapping = _build_export_label_mapping(
            raw_schema,
            recalculated_class_id_start,
        )
        vis_num_classes = len(normalized_schema_items) + recalculated_class_id_start

        row_idx = 0
        for sample in samples:
            data = sample.get("data", {})
            image_path = str(data.get("image", "")).strip()
            if not image_path:
                continue
            height = data.get("height")
            width = data.get("width")
            if not isinstance(height, int) or not isinstance(width, int) or height <= 0 or width <= 0:
                continue

            segments = sample.get("annotation", {}).get("segments", [])
            if not isinstance(segments, list):
                segments = []
            mask = _build_semantic_mask(height, width, segments, class_id_mapping=export_class_id_mapping)

            image_name = os.path.basename(image_path)
            image_stem, _ = os.path.splitext(image_name)
            mask_name = f"{image_stem}.png"
            if os.path.exists(os.path.join(segmentation_dir, mask_name)):
                mask_name = f"{image_stem}_{row_idx}.png"
            _save_mask_png(mask, os.path.join(segmentation_dir, mask_name))
            _save_vis_mask(mask, os.path.join(vis_dir, mask_name), vis_num_classes)

            row_idx += 1

        schema_by_id: Dict[int, str] = {0: "background"}
        for original_class_id, class_name in normalized_schema_items:
            export_class_id = export_class_id_mapping[original_class_id]
            schema_by_id[export_class_id] = class_name

        class_ids = sorted(schema_by_id.keys())
        palette = _generate_palette(vis_num_classes)
        classes: List[Dict[str, Any]] = []
        for class_id in class_ids:
            color = palette[class_id].tolist() if class_id < palette.shape[0] else [0, 0, 0]
            classes.append({"id": class_id, "name": schema_by_id[class_id], "color": color})

        data_info = {"classes": classes, "metadata": {"num_classes": len(classes)}}
        with open(os.path.join(output_dir, self.primary_filename), "w", encoding="utf-8") as f:
            json.dump(data_info, f, ensure_ascii=False, indent=2)


# platform 导出别名
register_exporter_alias(
    ExporterType.TEXT_CLASSIFICATION_MULTI_LABEL__PLATFORM,
    ExporterType.TEXT_CLASSIFICATION_SINGLE_LABEL__PLATFORM,
)
register_exporter_alias(
    ExporterType.IMAGE_CLASSIFICATION_MULTI_LABEL__PLATFORM,
    ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM,
)
register_exporter_alias(
    ExporterType.OBJECT_DETECTION_BBOX__PLATFORM,
    ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM,
)
register_exporter_alias(
    ExporterType.IMAGE_SEGMENTATION_INSTANCE__PLATFORM,
    ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM,
)
register_exporter_alias(
    ExporterType.INSTANCE_SEGMENTATION_MASK__PLATFORM,
    ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM,
)
register_exporter_alias(
    ExporterType.SEMANTIC_SEGMENTATION__PLATFORM,
    ExporterType.IMAGE_CLASSIFICATION_SINGLE_LABEL__PLATFORM,
)

# 复用同一导出实现：按 template_type + export_format 区分导出类型键
register_exporter_alias(
    ExporterType.TEXT_CLASSIFICATION_MULTI_LABEL__JSONL,
    ExporterType.TEXT_CLASSIFICATION_SINGLE_LABEL__JSONL,
)

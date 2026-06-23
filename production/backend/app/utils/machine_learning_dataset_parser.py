import hashlib
import io
import json
import os
import zipfile
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict, List, Optional, Set, Tuple
from PIL import Image

from fastapi import HTTPException, UploadFile

from app.schemas.machine_learning_dataset import MachineLearningDatasetTaskType

MANIFEST_EXTENSIONS = {".json", ".jsonl"}
CLASSNAME_FILE = "classname.json"
TEMPLATE_TO_TASK_TYPE = {
    "text_classification_single_label": "text_classification",
    "text_classification_multi_label": "text_classification",
    "entity_recognition": "text_entity_recognition",
    "image_classification_single_label": "image_classification",
    "image_classification_multi_label": "image_classification",
    "object_detection_bbox": "object_detection",
    "image_segmentation_instance": "image_segmentation",
    "instance_segmentation_mask": "image_segmentation",
    "semantic_segmentation": "image_segmentation",
}


@dataclass
class MachineLearningDatasetParseResult:
    dataset_jsonl_content: bytes
    sample_count: int
    source_type: str
    task_type: str
    label_schema: Optional[Dict[str, str]]


def _validate_declared_types(data_type: str, annotation_type: str, template_type: str) -> str:
    """校验前端声明的类型组合，并返回归一化后的 task_type。"""
    if template_type not in TEMPLATE_TO_TASK_TYPE:
        raise HTTPException(status_code=400, detail=f"不支持的标注模板: {template_type}")

    expected_task = TEMPLATE_TO_TASK_TYPE[template_type]
    allowed = {
        "text": {"text_classification", "entity_recognition", "text_entity_recognition"},
        "image": {"image_classification", "object_detection", "image_segmentation"},
    }
    if data_type not in allowed:
        raise HTTPException(status_code=400, detail=f"不支持的数据类型: {data_type}")

    normalized_annotation = (
        "text_entity_recognition" if annotation_type == "entity_recognition" else annotation_type
    )
    if normalized_annotation != expected_task:
        raise HTTPException(status_code=400, detail="标注类型与标注模板不一致")
    if expected_task not in allowed[data_type]:
        raise HTTPException(status_code=400, detail="数据类型与标注模板不匹配")
    return expected_task


def _validate_assets_by_data_type(data_type: str, asset_files: Dict[str, bytes]) -> None:
    """按声明数据类型约束附件是否允许出现。"""
    if data_type == "text" and asset_files:
        raise HTTPException(status_code=400, detail="文本数据集不应包含图片/二进制附件")


def _canonical_data(data: Dict[str, Any]) -> str:
    """稳定序列化，用于 sample_id 生成时避免字段顺序影响哈希结果。"""
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _generate_sample_id(source_name: str, index: int, data: Dict[str, Any], version: Optional[str] = None) -> str:
    """基于来源文件名 + 行序 + 归一化数据生成稳定 sample_id；可额外加入版本号。"""
    version_part = f":{version}" if version else ""
    raw = f"{source_name}{version_part}:{index}:{_canonical_data(data)}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def _iter_records(content: bytes, ext: str) -> List[Any]:
    """读取 json/jsonl 清单，输出原始样本列表。"""
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="清单文件必须使用 UTF-8 编码") from exc

    if ext == ".json":
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="JSON 文件格式错误") from exc
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
        raise HTTPException(status_code=400, detail="JSON 文件必须是对象或数组")

    records = []
    for i, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"JSONL 第 {i} 行格式错误") from exc
    return records


def _is_nonempty_digit_classname_mapping(obj: Any) -> bool:
    """非空 dict，且 key 为数字字符串、value 为非空类别名。"""
    if not isinstance(obj, dict) or not obj:
        return False
    return all(isinstance(k, str) and k.isdigit() for k in obj) and all(isinstance(v, str) and v.strip() for v in obj.values())


def _is_embedded_classname_row(obj: Any) -> bool:
    """jsonl 首行类别信息：空对象 {}（无标注）或 {\"0\":\"类名\"} 形式。"""
    if not isinstance(obj, dict):
        return False
    if not obj:
        return True
    return _is_nonempty_digit_classname_mapping(obj)


def _normalize_classname_mapping(mapping: Any) -> Dict[str, str]:
    """解析 classname.json / 内嵌首行：允许 {}；非空须为数字字符串 key → 非空类别名。"""
    if not isinstance(mapping, dict):
        raise HTTPException(status_code=400, detail="classname.json 格式错误，须为 JSON 对象")
    if not mapping:
        return {}
    if not _is_nonempty_digit_classname_mapping(mapping):
        raise HTTPException(status_code=400, detail="classname.json 格式错误，必须是数字字符串到类别名映射")
    return {str(int(k)): v.strip() for k, v in mapping.items()}


def _split_records_and_classname(records: List[Any]) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, str]]]:
    """把样本清单里的业务样本与内嵌类别映射分离（支持 jsonl 首行 classname 映射）。"""
    dataset_records: List[Dict[str, Any]] = []
    schema: Optional[Dict[str, str]] = None
    for item in records:
        if _is_embedded_classname_row(item):
            if schema is not None:
                raise HTTPException(status_code=400, detail="发现多个类别映射定义")
            schema = _normalize_classname_mapping(item)
            continue
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="样本必须是 JSON 对象")
        dataset_records.append(item)
    return dataset_records, schema


def _label_to_id(annotation: Any, schema: Dict[str, str], index: int) -> int:
    """支持标签名/标签ID双写法，统一转为 class_id。str 时先按 class_id(key) 匹配，再按类别名(value)匹配。"""
    if isinstance(annotation, int):
        if str(annotation) not in schema:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 class_id 不在 classname.json 中")
        return annotation
    if isinstance(annotation, str):
        # 先按 class_id（classname.json 的 key）匹配，支持 data 里写 "0" 与 classname 里 "0":"科技"
        if annotation in schema:
            return int(annotation)
        for class_id, name in schema.items():
            if name == annotation:
                return int(class_id)
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本标签名未在 classname.json 中定义: {annotation}")
    raise HTTPException(status_code=400, detail=f"第 {index} 条样本标签必须是 int 或 str")


def _normalize_classification_annotations(
    annotations: Any, schema: Dict[str, str], index: int, single_label: bool
) -> List[int]:
    """分类任务标签归一化；按模板区分单标签/多标签。"""
    if not isinstance(annotations, list) or not annotations:
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 annotations 必须是非空数组")
    ids = sorted(set(_label_to_id(item, schema, index) for item in annotations))
    if single_label and len(ids) != 1:
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本要求单标签")
    return ids


def _validate_ner(content: str, annotations: Any, index: int, label_schema: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """NER 标注校验与标准化（offset/tag）。

    兼容策略：
    - 当存在 label_schema 时，优先将 tag 归一化为 schema 中的 class_id；
    - 允许 tag 直接传 class_id 字符串，或传类别名并映射回对应 class_id；
    - 若无法映射则保留原 tag，避免影响历史数据。
    """
    if not isinstance(annotations, list):
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 annotations 必须是数组")
    normalized: List[Dict[str, Any]] = []
    for ann in annotations:
        if not isinstance(ann, dict):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 NER 标注必须是对象")
        offset = ann.get("offset")
        tag = ann.get("tag")
        if not isinstance(offset, list) or len(offset) != 2:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 NER offset 必须是长度 2 数组")
        s, e = offset
        if not (isinstance(s, int) and isinstance(e, int) and 0 <= s < e <= len(content)):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 NER offset 越界")
        if not isinstance(tag, str) or not tag.strip():
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 NER tag 必须是非空字符串")
        normalized_tag = tag.strip()
        if label_schema and normalized_tag not in label_schema:
            for class_id, name in label_schema.items():
                if name == normalized_tag:
                    normalized_tag = class_id
                    break
        normalized.append({"offset": [s, e], "tag": normalized_tag})
    return normalized


def _validate_bbox_annotations(annotations: Any, schema: Dict[str, str], index: int) -> List[Dict[str, Any]]:
    """目标检测标注校验与标准化（class_id/bbox）。"""
    if not isinstance(annotations, list):
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 annotations 必须是数组")
    normalized = []
    for ann in annotations:
        if not isinstance(ann, dict):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本检测标注必须是对象")
        class_id = ann.get("class_id")
        bbox = ann.get("bbox")
        if not isinstance(class_id, int) or str(class_id) not in schema:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 class_id 非法")
        if not isinstance(bbox, list) or len(bbox) != 4 or not all(isinstance(v, (int, float)) for v in bbox):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 bbox 必须是 4 个数字")
        normalized.append({"class_id": class_id, "bbox": [float(v) for v in bbox]})
    return normalized


def _validate_segmentation_annotations(annotations: Any, schema: Dict[str, str], index: int) -> List[Dict[str, Any]]:
    """图像分割标注校验与标准化（class_id/segmentation）。"""
    if not isinstance(annotations, list):
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 annotations 必须是数组")
    normalized = []
    for ann in annotations:
        if not isinstance(ann, dict):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本分割标注必须是对象")
        class_id = ann.get("class_id")
        segmentation = ann.get("segmentation")
        if not isinstance(class_id, int) or str(class_id) not in schema:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 class_id 非法")
        if not isinstance(segmentation, list):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 segmentation 必须是数组")
        for polygon in segmentation:
            if not isinstance(polygon, list) or len(polygon) < 6 or len(polygon) % 2 != 0:
                raise HTTPException(status_code=400, detail=f"第 {index} 条样本 segmentation 多边形非法")
            if not all(isinstance(v, (int, float)) for v in polygon):
                raise HTTPException(status_code=400, detail=f"第 {index} 条样本 segmentation 顶点必须为数字")
        normalized.append({"class_id": class_id, "segmentation": segmentation})
    return normalized


def _validate_mask_segmentation_annotations(
    annotations: Any, schema: Dict[str, str], index: int, height: int, width: int
) -> List[Dict[str, Any]]:
    """掩码实例分割标注校验（接受 RLE dict 或 polygon_with_holes dict，拒绝裸 polygon list）。"""
    from app.utils.segmentation_codec import is_rle_segmentation, is_polygon_with_holes
    if not isinstance(annotations, list):
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 annotations 必须是数组")
    normalized = []
    for ann in annotations:
        if not isinstance(ann, dict):
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本分割标注必须是对象")
        class_id = ann.get("class_id")
        segmentation = ann.get("segmentation")
        if not isinstance(class_id, int) or str(class_id) not in schema:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 class_id 非法")
        if not isinstance(segmentation, dict):
            raise HTTPException(
                status_code=400,
                detail=f"第 {index} 条样本 instance_segmentation_mask 模板的 segmentation 必须是对象（rle 或 polygon_with_holes）",
            )
        if is_rle_segmentation(segmentation):
            # RLE 格式：校验 size 与 counts
            size = segmentation.get("size", [])
            counts = segmentation.get("counts", [])
            if len(size) != 2 or not all(isinstance(v, int) and v > 0 for v in size):
                raise HTTPException(status_code=400, detail=f"第 {index} 条样本 rle.size 必须是包含两个正整数的数组")
            if not isinstance(counts, list) or len(counts) == 0:
                raise HTTPException(status_code=400, detail=f"第 {index} 条样本 rle.counts 必须是非空整数数组")
            # rle.size 必须与图片 height/width 一致（约定 size=[height, width]）
            if size[0] != height or size[1] != width:
                raise HTTPException(
                    status_code=400,
                    detail=f"第 {index} 条样本 rle.size {size} 与图片尺寸 [{height}, {width}] 不一致",
                )
            # 行程编码硬约束：各段长度之和必须正好铺满整张图（否则无法解码，前端会退化为 rle）
            counts_sum = sum(counts)
            if counts_sum != height * width:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"第 {index} 条样本 rle.counts 总和 {counts_sum} 与图片像素数 "
                        f"{height}×{width}={height * width} 不一致，不是合法的行程编码"
                    ),
                )
        elif is_polygon_with_holes(segmentation):
            # polygon_with_holes 格式：校验 regions 结构
            regions = segmentation.get("regions", [])
            if not isinstance(regions, list) or len(regions) == 0:
                raise HTTPException(status_code=400, detail=f"第 {index} 条样本 polygon_with_holes.regions 必须是非空数组")
            for region in regions:
                if not isinstance(region, dict):
                    raise HTTPException(status_code=400, detail=f"第 {index} 条样本 region 必须是对象")
                exterior = region.get("exterior", [])
                if not isinstance(exterior, list) or len(exterior) < 3:
                    raise HTTPException(status_code=400, detail=f"第 {index} 条样本 region.exterior 至少需要 3 个点")
                for pt in exterior:
                    if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 exterior 坐标格式非法")
        else:
            raise HTTPException(
                status_code=400,
                detail=f"第 {index} 条样本 segmentation 格式不支持，必须是 rle 或 polygon_with_holes",
            )
        normalized.append({"class_id": class_id, "segmentation": segmentation})
    return normalized


def _normalize_image_path(path: Any, asset_names: Set[str], index: int) -> str:
    """把原始图片引用路径统一改写为 assets/<filename>。"""
    if not isinstance(path, str) or not path.strip():
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本 image 必须是非空字符串")
    basename = os.path.basename(path)
    if basename not in asset_names:
        raise HTTPException(status_code=400, detail=f"第 {index} 条样本引用图片不存在: {path}")
    return f"assets/{basename}"


def _normalize_by_task(
    record: Dict[str, Any],
    index: int,
    task_type: str,
    template_type: str,
    label_schema: Optional[Dict[str, str]],
    asset_names: Set[str],
) -> Tuple[Dict[str, Any], List[Any]]:
    """按任务类型执行 Adapter 校验，分别输出 data 与 annotations。"""
    if task_type == "text_classification":
        # label_schema 来自 classname.json / jsonl 首行 / ZIP；允许空 {}（无标注数据集）
        if label_schema is None:
            raise HTTPException(
                status_code=400,
                detail="文本分类任务缺少类别映射（ZIP 须含 classname.json；单文件 jsonl 首行须为 {} 或类别映射）",
            )
        content = record.get("content")
        if not isinstance(content, str) or not content.strip():
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 content 必须是非空字符串")
        raw_annotations = record.get("annotations")
        if raw_annotations in (None, []):
            return {"content": content}, []
        if len(label_schema) == 0:
            raise HTTPException(
                status_code=400,
                detail=f"第 {index} 条样本包含 annotations，但类别映射为空（无标注数据集仅允许 annotations 为空）",
            )
        return {
            "content": content
        }, _normalize_classification_annotations(
            raw_annotations,
            label_schema,
            index,
            single_label=template_type == "text_classification_single_label",
        )

    if task_type == "text_entity_recognition":
        content = record.get("content")
        if not isinstance(content, str) or not content.strip():
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 content 必须是非空字符串")
        raw_annotations = record.get("annotations")
        if raw_annotations in (None, []):
            return {"content": content}, []
        return {"content": content}, _validate_ner(content, raw_annotations, index, label_schema=label_schema)

    if task_type == "image_classification":
        if label_schema is None:
            raise HTTPException(status_code=400, detail="图像分类任务缺少类别映射（classname.json 或 jsonl 首行映射）")
        image_data = {"image": _normalize_image_path(record.get("image"), asset_names, index)}
        raw_annotations = record.get("annotations")
        if not label_schema and raw_annotations:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本包含 annotations，但类别映射为空（无标注数据集仅允许 annotations 为空）")
        if raw_annotations in (None, []):
            return image_data, []
        return image_data, _normalize_classification_annotations(
            raw_annotations,
            label_schema,
            index,
            single_label=template_type == "image_classification_single_label",
        )

    if task_type == "object_detection":
        if label_schema is None:
            raise HTTPException(status_code=400, detail="目标检测任务缺少类别映射（classname.json 或 jsonl 首行映射）")
        height = record.get("height")
        width = record.get("width")
        if not isinstance(height, int) or height <= 0 or not isinstance(width, int) or width <= 0:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 height/width 必须为正整数")
        image_data = {
            "image": _normalize_image_path(record.get("image"), asset_names, index),
            "height": height,
            "width": width,
        }
        raw_annotations = record.get("annotations")
        if not label_schema and raw_annotations:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本包含 annotations，但类别映射为空（无标注数据集仅允许 annotations 为空）")
        if raw_annotations in (None, []):
            return image_data, []
        return image_data, _validate_bbox_annotations(raw_annotations, label_schema, index)

    if task_type == "image_segmentation":
        if label_schema is None:
            raise HTTPException(status_code=400, detail="图像分割任务缺少类别映射（classname.json 或 jsonl 首行映射）")
        height = record.get("height")
        width = record.get("width")
        if not isinstance(height, int) or height <= 0 or not isinstance(width, int) or width <= 0:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本 height/width 必须为正整数")
        image_data = {
            "image": _normalize_image_path(record.get("image"), asset_names, index),
            "height": height,
            "width": width,
        }
        raw_annotations = record.get("annotations")
        if not label_schema and raw_annotations:
            raise HTTPException(status_code=400, detail=f"第 {index} 条样本包含 annotations，但类别映射为空（无标注数据集仅允许 annotations 为空）")
        if raw_annotations in (None, []):
            return image_data, []
        if template_type == "instance_segmentation_mask":
            return image_data, _validate_mask_segmentation_annotations(
                raw_annotations, label_schema, index, height, width
            )
        return image_data, _validate_segmentation_annotations(raw_annotations, label_schema, index)

    raise HTTPException(status_code=400, detail=f"不支持的任务类型: {task_type}")


def _extract_user_data_and_sample_id(item: Any) -> Tuple[Dict[str, Any], str]:
    """兼容两种输入：标准 sample 结构 / 纯业务对象结构。"""
    sample_id = ""
    if isinstance(item, dict) and isinstance(item.get("data"), dict):
        sample_id = str(item.get("sample_id") or "")
        return item["data"], sample_id
    if isinstance(item, list):
        if len(item) != 1 or not isinstance(item[0], dict):
            raise HTTPException(status_code=400, detail="数组样本必须只包含一个对象")
        return item[0], sample_id
    if isinstance(item, dict):
        return item, sample_id
    raise HTTPException(status_code=400, detail="样本必须是 JSON 对象或单对象数组")


def _normalize_records(
    records: List[Any],
    asset_files: Dict[str, bytes],
    source_name: str,
    task_type: str,
    template_type: str,
    explicit_schema: Optional[Dict[str, str]] = None,
    is_annotated: bool = True,
    version: Optional[str] = None,
) -> Tuple[MachineLearningDatasetParseResult, Dict[str, bytes]]:
    """核心 Adapter：按声明模板校验样本并生成统一 dataset.jsonl 行。"""
    # 1) 拆分业务样本和内嵌类别映射（若有）
    core_records, inline_schema = _split_records_and_classname(records)
    # 显式 classname 优先（含空 {}），避免 explicit_schema or inline 把 {} 当 falsy
    label_schema = inline_schema if explicit_schema is None else explicit_schema
    if not is_annotated and label_schema is None:
        # 无标注导入场景，允许不提供 classname，统一按空映射处理
        label_schema = {}
    if is_annotated:
        if not label_schema:
            if task_type in [MachineLearningDatasetTaskType.TEXT_CLASSIFICATION,
                             MachineLearningDatasetTaskType.TEXT_ENTITY_RECOGNITION]:
                raise HTTPException(
                    status_code=400,
                    detail="文本有标注导入必须提供非空类别映射（classname.json 或 jsonl 首行映射）",
                )
            if task_type in [MachineLearningDatasetTaskType.IMAGE_CLASSIFICATION,
                             MachineLearningDatasetTaskType.OBJECT_DETECTION,
                             MachineLearningDatasetTaskType.IMAGE_SEGMENTATION]:
                raise HTTPException(status_code=400, detail="图片有标注导入必须提供非空类别映射 classname.json 文件")

    asset_names = set(asset_files.keys())

    normalized_lines: List[str] = []
    existing_ids: Set[str] = set()

    for idx, raw in enumerate(core_records, start=1):
        # 3) 统一抽取 data，并按任务规则进行严格校验
        data, existed_id = _extract_user_data_and_sample_id(raw)
        normalized_data, normalized_annotations = _normalize_by_task(
            data,
            idx,
            task_type,
            template_type,
            label_schema,
            asset_names,
        )
        if not is_annotated and normalized_annotations:
            raise HTTPException(status_code=400, detail=f"第 {idx} 条样本存在 annotations；无标注导入仅允许 annotations 为空")
        if is_annotated and not normalized_annotations:
            raise HTTPException(status_code=400, detail=f"第 {idx} 条样本缺少有效 annotations；有标注导入不允许为空")
        # 4) 生成/复用 sample_id，保证唯一
        sample_id = existed_id or _generate_sample_id(source_name, idx, normalized_data, version)
        if sample_id in existing_ids:
            raise HTTPException(status_code=400, detail=f"发现重复 sample_id: {sample_id}")
        existing_ids.add(sample_id)
        normalized_lines.append(
            json.dumps(
                {
                    "sample_id": sample_id,
                    "data": normalized_data,
                    "annotations": normalized_annotations,
                },
                ensure_ascii=False,
            )
        )

    if not normalized_lines:
        raise HTTPException(status_code=400, detail="没有可用样本")

    # 5) 输出最终标准化 dataset.jsonl（每行 sample）
    dataset_jsonl = ("\n".join(normalized_lines) + "\n").encode("utf-8")
    return MachineLearningDatasetParseResult(
        dataset_jsonl_content=dataset_jsonl,
        sample_count=len(normalized_lines),
        source_type="mixed" if asset_files else os.path.splitext(source_name)[1].lstrip(".").lower() or "json",
        task_type=task_type,
        # 无标注导入也生成平台标准空映射，确保后续产物结构统一（classname.json 为 {}）
        label_schema=label_schema if is_annotated else {},
    ), asset_files


def _parse_zip_text_classification(
    zip_bytes: bytes,
    require_classname: bool = True,
) -> Tuple[List[Any], Dict[str, bytes], Optional[Dict[str, str]], str]:
    """
    文本分类 ZIP：必须包含且仅包含一个 .jsonl 清单文件和一个 classname.json（无其它条目）。
    清单文件名不限（兼容 data.jsonl、text_cls_xxx.jsonl 等）；类别仅来自 classname.json（可为 {}）。
    """
    try:
        archive = zipfile.ZipFile(BytesIO(zip_bytes), "r")
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="ZIP 文件格式错误") from exc

    manifest_content: Optional[bytes] = None
    manifest_filename: Optional[str] = None
    label_schema: Optional[Dict[str, str]] = None
    classname_seen = False

    with archive:
        for member in archive.namelist():
            if member.endswith("/") or member.startswith("__MACOSX/"):
                continue
            basename = os.path.basename(member)
            content = archive.read(member)
            lower = basename.lower()
            ext = os.path.splitext(lower)[1]

            if lower == CLASSNAME_FILE:
                if classname_seen:
                    raise HTTPException(status_code=400, detail="ZIP 中只能包含一个 classname.json")
                classname_seen = True
                try:
                    label_schema = _normalize_classname_mapping(json.loads(content.decode("utf-8")))
                except HTTPException:
                    raise
                except Exception as exc:
                    raise HTTPException(status_code=400, detail="classname.json 解析失败") from exc
                continue

            if ext == ".jsonl":
                if manifest_content is not None:
                    raise HTTPException(status_code=400, detail="文本分类 ZIP 中只能包含一个 jsonl 清单文件")
                manifest_content = content
                manifest_filename = basename
                continue

            raise HTTPException(
                status_code=400,
                detail=f"文本分类 ZIP 仅允许包含一个 jsonl 清单文件与 classname.json，发现多余文件: {basename}",
            )

    if manifest_content is None:
        raise HTTPException(status_code=400, detail="文本分类 ZIP 中缺少 jsonl 清单文件")
    if require_classname and not classname_seen:
        raise HTTPException(status_code=400, detail="文本分类 ZIP 中缺少 classname.json")

    records = _iter_records(manifest_content, ".jsonl")
    return records, {}, label_schema, (manifest_filename or "data.jsonl")


def _parse_zip_generic(
    zip_bytes: bytes,
    task_type: str,
    is_annotated: bool = True,
) -> Tuple[List[Any], Dict[str, bytes], Optional[Dict[str, str]], str]:
    """解析 ZIP（图像 / NER 等）：一个 json/jsonl 清单 + 可选 classname.json + 附件。"""
    try:
        archive = zipfile.ZipFile(BytesIO(zip_bytes), "r")
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="ZIP 文件格式错误") from exc

    records_file = None
    records_ext = None
    records_content = None
    label_schema = None
    asset_files: Dict[str, bytes] = {}

    with archive:
        for member in archive.namelist():
            if member.endswith("/") or member.startswith("__MACOSX/"):
                continue
            basename = os.path.basename(member)
            ext = os.path.splitext(basename)[1].lower()
            content = archive.read(member)

            if basename.lower() == CLASSNAME_FILE:
                try:
                    label_schema = _normalize_classname_mapping(json.loads(content.decode("utf-8")))
                except HTTPException:
                    raise
                except Exception as exc:
                    raise HTTPException(status_code=400, detail="classname.json 解析失败") from exc
                continue

            if ext in MANIFEST_EXTENSIONS:
                if records_file is not None:
                    raise HTTPException(status_code=400, detail="ZIP 中必须且只能有一个数据清单文件（json/jsonl）")
                records_file = basename
                records_ext = ext
                records_content = content
                continue

            if basename in asset_files:
                raise HTTPException(status_code=400, detail=f"ZIP 中存在重复附件文件名: {basename}")
            asset_files[basename] = content

    if records_file is None or records_content is None or records_ext is None:
        # 无标注允许仅上传图片 ZIP，自动生成平台清单
        if not is_annotated:
            if not asset_files:
                raise HTTPException(status_code=400, detail="ZIP 中缺少图片文件")

            # 检查所有图片文件的扩展名是否一致
            image_extensions = {os.path.splitext(filename)[1].lower() for filename in asset_files.keys()}
            if len(image_extensions) > 1:
                raise HTTPException(status_code=400, detail="所有图片文件的扩展名必须一致")

            # 添加图片尺寸信息
            records = []
            for filename, content in sorted(asset_files.items()):
                try:
                    with Image.open(io.BytesIO(content)) as img:
                        width, height = img.size
                    records.append({"image": filename, "width": width, "height": height})
                except Exception as exc:
                    raise HTTPException(status_code=400, detail=f"无法读取图片文件 {filename}") from exc

            return records, asset_files, label_schema, "images_only.zip"

        raise HTTPException(status_code=400, detail="ZIP 中缺少数据清单文件（json/jsonl）")

    records = _iter_records(records_content, records_ext)
    return records, asset_files, label_schema, records_file


def _parse_zip(
    zip_bytes: bytes,
    task_type: str,
    is_annotated: bool = True,
) -> Tuple[List[Any], Dict[str, bytes], Optional[Dict[str, str]], str]:
    """按任务类型选择 ZIP 解析策略。"""
    if task_type == "text_classification":
        return _parse_zip_text_classification(zip_bytes, require_classname=is_annotated)
    return _parse_zip_generic(zip_bytes, task_type=task_type, is_annotated=is_annotated)


async def parse_machine_learning_dataset_files(
    files: List[UploadFile],
    data_type: str,
    annotation_type: str,
    template_type: str,
    is_annotated: bool = True,
    inherited_label_schema: Optional[Dict[str, str]] = None,
    version: Optional[str] = None,
) -> Tuple[MachineLearningDatasetParseResult, Dict[str, bytes]]:
    """机器学习数据集导入入口（按声明类型/模板进行解析，支持 jsonl 首行类别映射）。"""
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一个文件")
    task_type = _validate_declared_types(data_type, annotation_type, template_type)

    if len(files) == 1 and (files[0].filename or "").lower().endswith(".zip"):
        # ZIP 模式：自动提取清单/类别映射/附件
        zip_bytes = await files[0].read()
        if task_type == "text_classification":
            records, asset_files, label_schema, source_name = _parse_zip_text_classification(
                zip_bytes,
                require_classname=is_annotated and inherited_label_schema is None,
            )
        else:
            records, asset_files, label_schema, source_name = _parse_zip(
                zip_bytes,
                task_type,
                is_annotated=is_annotated,
            )
        if label_schema is None and inherited_label_schema is not None:
            label_schema = inherited_label_schema
        _validate_assets_by_data_type(data_type, asset_files)
        parse_result, parse_assets = _normalize_records(
            records,
            asset_files,
            source_name,
            task_type=task_type,
            template_type=template_type,
            explicit_schema=label_schema,
            is_annotated=is_annotated,
            version=version,
        )
        parse_result.source_type = "zip"
        return parse_result, parse_assets

    manifest_file: Optional[UploadFile] = None
    label_schema: Optional[Dict[str, str]] = None
    asset_files: Dict[str, bytes] = {}

    for file in files:
        filename = file.filename or ""
        lower_name = filename.lower()
        ext = os.path.splitext(filename)[1].lower()

        if lower_name == CLASSNAME_FILE:
            # 非 ZIP 模式下，classname.json 作为独立文件参与导入
            content = await file.read()
            try:
                label_schema = _normalize_classname_mapping(json.loads(content.decode("utf-8")))
            except Exception as exc:
                raise HTTPException(status_code=400, detail="classname.json 解析失败") from exc
            continue

        if ext in MANIFEST_EXTENSIONS:
            # 只允许一个主数据清单文件
            if manifest_file is not None:
                raise HTTPException(status_code=400, detail="非 ZIP 上传场景必须且只能有一个数据清单文件（json/jsonl）")
            manifest_file = file
            continue

        # 其余文件全部当作附件（图片/二进制）
        content = await file.read()
        basename = os.path.basename(filename)
        if basename in asset_files:
            raise HTTPException(status_code=400, detail=f"存在重复上传文件名: {basename}")
        asset_files[basename] = content

    if manifest_file is None:
        raise HTTPException(status_code=400, detail="缺少数据清单文件（json/jsonl）")
    _validate_assets_by_data_type(data_type, asset_files)
    if label_schema is None and inherited_label_schema is not None:
        label_schema = inherited_label_schema

    manifest_ext = os.path.splitext(manifest_file.filename or "")[1].lower()
    records = _iter_records(await manifest_file.read(), manifest_ext)
    return _normalize_records(
        records,
        asset_files,
        manifest_file.filename or f"dataset{manifest_ext}",
        task_type=task_type,
        template_type=template_type,
        explicit_schema=label_schema,
        is_annotated=is_annotated,
        version=version,
    )

"""
分割格式编解码工具。

负责 polygon_with_holes、RLE、binary mask 三种格式之间的相互转换，
以及服务层的批量前端↔存储格式转换。不含业务逻辑。

内部 RLE 格式（Fortran-order / 列优先，与 COCO 标准兼容，无 pycocotools 依赖）：
  {"type": "rle", "size": [height, width], "counts": [int, ...]}
  counts[0] 为起始连续 0-run 的长度（可以为 0），之后交替 1-run / 0-run。
  遍历顺序：列优先（Fortran order），与 pycocotools encode/decode 一致。

前端 polygon_with_holes 格式：
  {
    "type": "polygon_with_holes",
    "regions": [
      {"exterior": [[x, y], ...], "holes": [[[x, y], ...], ...]}
    ]
  }
  坐标为绝对像素坐标（整数或浮点）。
"""

from __future__ import annotations

from typing import Any, List, Optional

import cv2
import numpy as np

from app.core.logging import logger


# ---------------------------------------------------------------------------
# 鉴别函数
# ---------------------------------------------------------------------------

def is_rle_segmentation(seg: Any) -> bool:
    """判断是否为内部 RLE dict 格式。"""
    if not isinstance(seg, dict):
        return False
    if seg.get("type") != "rle":
        return False
    size = seg.get("size")
    if not isinstance(size, list) or len(size) != 2:
        return False
    if not all(isinstance(v, int) and v > 0 for v in size):
        return False
    counts = seg.get("counts")
    if not isinstance(counts, list) or len(counts) == 0:
        return False
    if not all(isinstance(v, int) and v >= 0 for v in counts):
        return False
    return True


def is_polygon_with_holes(seg: Any) -> bool:
    """判断是否为 polygon_with_holes dict 格式。"""
    if not isinstance(seg, dict):
        return False
    if seg.get("type") != "polygon_with_holes":
        return False
    return isinstance(seg.get("regions"), list)


def is_polygon_list(seg: Any) -> bool:
    """判断是否为旧式 COCO polygon list（list of list of numbers）。"""
    if not isinstance(seg, list):
        return False
    for poly in seg:
        if not isinstance(poly, list) or len(poly) < 6 or len(poly) % 2 != 0:
            return False
        if not all(isinstance(v, (int, float)) for v in poly):
            return False
    return True


# ---------------------------------------------------------------------------
# RLE 编解码
# ---------------------------------------------------------------------------

def encode_mask_to_rle(mask: np.ndarray, height: int, width: int) -> dict:
    """
    将二值 numpy mask（H×W，uint8）编码为 Fortran-order uncompressed RLE dict。

    遍历顺序为列优先（Fortran order），与 COCO 标准及 pycocotools 一致。
    counts[0] 表示起始的连续 0-pixel 数量（可以为 0），
    之后交替存储 1-run 和 0-run 的长度。
    """
    flat = mask.flatten(order='F').astype(np.uint8)
    n = len(flat)
    if n == 0:
        return {"type": "rle", "size": [height, width], "counts": [0]}

    # 找到值发生变化的位置
    changes = np.where(np.diff(flat))[0] + 1
    boundaries = np.concatenate(([0], changes, [n]))
    runs = np.diff(boundaries).tolist()

    # 如果第一个像素是 1，在头部插入一个长度为 0 的 0-run
    if flat[0] == 1:
        runs = [0] + runs

    return {"type": "rle", "size": [height, width], "counts": runs}


def decode_rle_to_mask(rle: dict) -> np.ndarray:
    """将内部 RLE dict 解码为 H×W uint8 binary mask（Fortran-order 解码）。"""
    h, w = rle["size"]
    counts = rle["counts"]
    total = h * w
    if sum(counts) != total:
        raise ValueError(f"RLE counts 总和 {sum(counts)} 与 size {h}×{w}={total} 不一致")
    flat = np.zeros(total, dtype=np.uint8)
    idx = 0
    val = 0
    for run in counts:
        if run > 0:
            flat[idx: idx + run] = val
        idx += run
        val = 1 - val
    return flat.reshape(h, w, order='F')


# ---------------------------------------------------------------------------
# polygon_with_holes ↔ mask
# ---------------------------------------------------------------------------

def _points_to_cv2_contour(points: list) -> Optional[np.ndarray]:
    """将 [[x, y], ...] 转换为 cv2 contour 数组，至少 3 个点才有效。"""
    if not isinstance(points, list) or len(points) < 3:
        return None
    pts = []
    for p in points:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            x = float(p[0])
            y = float(p[1])
            pts.append([int(round(x)), int(round(y))])
    if len(pts) < 3:
        return None
    return np.array(pts, dtype=np.int32).reshape((-1, 1, 2))


def polygon_with_holes_to_mask(regions: list, height: int, width: int) -> np.ndarray:
    """
    将 polygon_with_holes.regions 列表转换为 H×W uint8 binary mask。

    每个 region 有一个 exterior polygon 和零到多个 hole polygon。
    先填充 exterior（置 1），再用 hole 抠空（置 0）。
    多个 region 做 OR 合并（填充后 hole 抠空互相独立）。
    """
    mask = np.zeros((height, width), dtype=np.uint8)
    for region in regions:
        if not isinstance(region, dict):
            continue
        exterior_pts = region.get("exterior", [])
        ext_contour = _points_to_cv2_contour(exterior_pts)
        if ext_contour is None:
            continue
        # 在临时 mask 上填充单个 region，避免多 region hole 相互干扰
        region_mask = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(region_mask, [ext_contour], 1)
        for hole_pts in region.get("holes", []):
            hole_contour = _points_to_cv2_contour(hole_pts)
            if hole_contour is not None:
                cv2.fillPoly(region_mask, [hole_contour], 0)
        mask = np.bitwise_or(mask, region_mask)
    return mask


def mask_to_polygon_with_holes(mask: np.ndarray) -> list:
    """
    将 H×W uint8 binary mask 转换为 polygon_with_holes.regions 列表。

    使用 cv2.RETR_CCOMP 提取两级轮廓层级：
    - level 0（hierarchy[3] == -1）：外轮廓，作为 exterior
    - level 1（hierarchy[3] != -1）：内轮廓，作为对应 exterior 的 hole

    少于 3 个点的轮廓跳过。
    """
    if mask is None or mask.size == 0:
        return []

    binary = (mask > 0).astype(np.uint8)
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    if contours is None or len(contours) == 0 or hierarchy is None:
        return []

    hierarchy = hierarchy[0]  # shape: (N, 4) — [next, prev, first_child, parent]

    def _simplify(cnt: np.ndarray) -> list:
        # epsilon 取弧长的 0.2%，最小 1px，与 demo 一致
        epsilon = max(1.0, 0.002 * cv2.arcLength(cnt, True))
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        return approx.reshape(-1, 2).tolist()

    # 按外轮廓索引收集：outer_idx -> [hole_contour, ...]
    regions_map: dict[int, dict] = {}
    for i, cnt in enumerate(contours):
        pts = _simplify(cnt)
        if len(pts) < 3:
            continue
        parent = hierarchy[i][3]
        if parent == -1:
            # 外轮廓
            regions_map[i] = {"exterior": pts, "holes": []}
        else:
            # 内轮廓（hole），挂到对应的外轮廓
            if parent in regions_map:
                regions_map[parent]["holes"].append(pts)

    return list(regions_map.values())


# ---------------------------------------------------------------------------
# 服务层批量转换
# ---------------------------------------------------------------------------

def frontend_annotations_to_storage(annotations: list, height: int, width: int) -> list:
    """
    将前端提交的 annotation 列表转换为后端存储格式。

    输入（前端）：
      [{"id": ..., "class_id": int, "segmentation": {"type": "polygon_with_holes", "regions": [...]}}, ...]
    输出（存储）：
      [{"class_id": int, "segmentation": {"type": "rle", "size": [h, w], "counts": [...]}}, ...]

    转换失败的 item 跳过（不抛异常，保证健壮性）。
    """
    result = []
    for ann in annotations:
        if not isinstance(ann, dict):
            continue
        category_id = ann.get("class_id")
        if not isinstance(category_id, int):
            continue
        seg = ann.get("segmentation")
        if not is_polygon_with_holes(seg):
            continue
        try:
            regions = seg.get("regions", [])
            mask = polygon_with_holes_to_mask(regions, height, width)
            rle = encode_mask_to_rle(mask, height, width)
            result.append({"class_id": category_id, "segmentation": rle})
        except Exception:
            continue
    return result


def storage_annotations_to_frontend(annotations: list, height: int, width: int) -> list:
    """
    将后端存储格式的 annotation 列表转换为前端读取格式。

    输入（存储）：
      [{"class_id": int, "segmentation": {"type": "rle", "size": [h, w], "counts": [...]}}, ...]
    输出（前端）：
      [{"id": "ann_<i>", "class_id": int, "segmentation": {"type": "polygon_with_holes", "regions": [...]}}, ...]

    转换失败的 item 跳过。
    """
    result = []
    for i, ann in enumerate(annotations):
        if not isinstance(ann, dict):
            continue
        class_id = ann.get("class_id")
        if not isinstance(class_id, int):
            logger.warning(f"RLE→前端转换跳过第 {i} 个标注：class_id 非 int（{class_id!r}）")
            continue
        seg = ann.get("segmentation")
        if not is_rle_segmentation(seg):
            # type=="rle" 但结构不合法（如 size/counts 缺失或类型错误）也会落到这里
            logger.warning(f"RLE→前端转换跳过第 {i} 个标注：segmentation 不是合法 RLE 结构")
            continue
        try:
            mask = decode_rle_to_mask(seg)
            regions = mask_to_polygon_with_holes(mask)
            result.append({
                "id": f"ann_{i}",
                "class_id": class_id,
                "segmentation": {
                    "type": "polygon_with_holes",
                    "regions": regions,
                },
            })
        except Exception as e:
            # 解码失败（最常见：counts 总和与 size 不一致）不再静默吞掉，记录原因便于排查
            logger.warning(f"RLE→前端转换失败，第 {i} 个标注按原样保留 RLE：{e}")
            continue
    return result


# ---------------------------------------------------------------------------
# COCO 导出辅助
# ---------------------------------------------------------------------------

def rle_to_coco_segmentation(rle: dict) -> dict:
    """
    将内部 RLE dict 转换为 COCO uncompressed RLE 格式。

    COCO 格式：{"size": [H, W], "counts": [int, ...]}
    iscrowd=1 场景兼容，无需 pycocotools。
    """
    return {"size": rle["size"], "counts": rle["counts"]}


def bbox_from_rle(rle: dict) -> List[float]:
    """
    从 RLE 计算 COCO bbox [x, y, w, h]（左上角坐标 + 宽高）。

    返回 [0.0, 0.0, 0.0, 0.0] 若 mask 全为 0。
    """
    mask = decode_rle_to_mask(rle)
    nonzero = cv2.findNonZero(mask)
    if nonzero is None:
        return [0.0, 0.0, 0.0, 0.0]
    x, y, w, h = cv2.boundingRect(nonzero)
    return [float(x), float(y), float(w), float(h)]


def area_from_rle(rle: dict) -> float:
    """从 RLE 计算前景像素面积（像素计数）。"""
    mask = decode_rle_to_mask(rle)
    return float(int(mask.sum()))

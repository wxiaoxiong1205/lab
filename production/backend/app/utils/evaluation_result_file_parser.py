import csv
import json
from io import BytesIO, StringIO
from typing import List, Dict, Any, Tuple

from openpyxl import Workbook

from app.services.storage.interface import StorageService


# 排除的字段（不作为普通表头；evaluations/annotation 需展开为指标列）
_EXCLUDED_COLUMNS = {'evaluations', 'messages', 'images', 'annotation'}

# 基础列优先顺序
_PRIORITY_COLUMNS = ['prompt', 'response', 'system', 'model_response', 'error', 'error_message']


def _get_metrics_list_from_item(item: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    从单条结果中获取指标列表，兼容自动评估(evaluations)与人工评估(annotation.metrics)。
    返回元素为包含 metric_name、score、score_max 等的字典列表。
    """
    evaluations = item.get('evaluations')
    if isinstance(evaluations, list) and len(evaluations) > 0:
        return evaluations
    annotation = item.get('annotation')
    if isinstance(annotation, dict):
        metrics = annotation.get('metrics')
        if isinstance(metrics, list):
            return metrics
    return []


async def _read_jsonl_file_content(file_path: str, storage_service: StorageService) -> List[Dict[str, Any]]:
    """
    从存储中读取 JSONL 文件内容

    Args:
        file_path: 评估结果 jsonl 文件在存储中的路径
        storage_service: 存储服务

    Returns:
        解析后的数据项列表
    """
    if not file_path:
        raise ValueError("评估结果文件路径为空")

    jfs = await storage_service.JUICEFS_CLIENT()
    if not jfs.exists(file_path):
        raise ValueError(f"评估结果文件不存在: {file_path}")

    all_items = []
    with jfs.open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                if isinstance(item, dict):
                    all_items.append(item)
            except json.JSONDecodeError:
                continue

    return all_items


def _build_table_rows(items: List[Dict[str, Any]]) -> Tuple[List[str], List[List[Any]]]:
    """
    将评估结果项转换为表格行（表头 + 数据行）。
    兼容自动评估（evaluations）与人工评估详情（annotation.metrics）。

    转换规则：
    - 表头 = 除 evaluations/messages/images/annotation 外的字段 + 各 metric_name
    - 基础字段值 = 原值
    - 指标列值 = score / score_max * 100（百分制）；若为人工评估则从 annotation.metrics 取
    """
    # 1. 收集所有基础列（排除 evaluations, messages, images, annotation）
    base_columns_set = set()
    for item in items:
        for k in item.keys():
            if k not in _EXCLUDED_COLUMNS:
                base_columns_set.add(k)

    # 2. 收集所有 metric_name（来自 evaluations 或 annotation.metrics，顺序按首次出现）
    metric_names_ordered = []
    seen_metrics = set()
    for item in items:
        for ev in _get_metrics_list_from_item(item):
            if isinstance(ev, dict):
                name = ev.get('metric_name')
                if name and name not in seen_metrics:
                    seen_metrics.add(name)
                    metric_names_ordered.append(name)

    # 3. 构建有序表头：优先列 + 其他基础列 + metric_name 列
    ordered_base = []
    for col in _PRIORITY_COLUMNS:
        if col in base_columns_set:
            ordered_base.append(col)
            base_columns_set.discard(col)
    ordered_base.extend(sorted(base_columns_set))
    headers = ordered_base + metric_names_ordered

    # 4. 构建数据行
    rows = []
    for item in items:
        row = []
        for h in ordered_base:
            val = item.get(h, '')
            row.append('' if val is None else val)

        # 指标列：从 evaluations 或 annotation.metrics 取 score/score_max*100
        metrics_map = {}
        for ev in _get_metrics_list_from_item(item):
            if not isinstance(ev, dict):
                continue
            name = ev.get('metric_name')
            score = ev.get('score')
            score_max = ev.get('score_max')
            if name is not None:
                if score_max and score_max != 0 and score is not None:
                    metrics_map[name] = round((score / score_max) * 100, 2)
                else:
                    metrics_map[name] = ''

        for h in metric_names_ordered:
            row.append(metrics_map.get(h, ''))

        rows.append(row)

    return headers, rows


def _convert_evaluation_to_xlsx(items: List[Dict[str, Any]]) -> bytes:
    """将评估结果转换为 XLSX"""
    headers, rows = _build_table_rows(items)
    wb = Workbook()
    ws = wb.active
    ws.title = "评估结果"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def _convert_evaluation_to_csv(items: List[Dict[str, Any]]) -> bytes:
    """将评估结果转换为 CSV"""
    headers, rows = _build_table_rows(items)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return output.getvalue().encode('utf-8-sig')  # BOM for Excel UTF-8


# =========== 评估结果集导出入口函数 =============
async def analyze_export_evaluation_result_file_single(
        target_file_path: str,
        export_file_type: str,
        storage_service: StorageService,
) -> bytes:
    """
    评估结果集多格式导出

    Args:
        target_file_path: 评估结果 jsonl 文件在存储中的路径
        export_file_type: 导出格式（jsonl / json / xlsx / csv）
        storage_service: 存储服务实例

    Returns:
        转换后的文件内容（bytes）

    转换规则：
    - JSONL：直接返回原始内容
    - JSON：将每行 JSON 对象合并为 JSON 数组
    - XLSX/CSV：表头 = 除 evaluations/messages/images/annotation 外的字段 + 指标名（来自 evaluations 或 annotation.metrics）；
               指标列值 = score / score_max * 100。兼容自动评估(evaluations)与人工评估详情(annotation.metrics)。
    """
    all_items = await _read_jsonl_file_content(target_file_path, storage_service)

    if not all_items:
        raise ValueError("评估结果文件为空，无法导出")

    export_type = (export_file_type or "jsonl").lower()

    if export_type == "jsonl":
        jsonl_lines = [json.dumps(item, ensure_ascii=False) for item in all_items]
        return "\n".join(jsonl_lines).encode('utf-8')

    elif export_type == "json":
        return json.dumps(all_items, ensure_ascii=False, indent=2).encode('utf-8')

    elif export_type == "xlsx":
        return _convert_evaluation_to_xlsx(all_items)

    elif export_type == "csv":
        return _convert_evaluation_to_csv(all_items)

    else:
        raise ValueError(f"不支持的导出格式: {export_type}，仅支持 jsonl、json、xlsx、csv")

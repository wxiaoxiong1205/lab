"""
基准评估任务：从 JFS 日志解析进度（供服务层与定时进度更新器共用）。

进度来源可二选一：
1. 从 predictions 下 JSON 的 key 数量 + benchmark_datasets.original_sample_count 计算（推荐）
2. 从 logs 下 .out 日志行解析（兜底）
"""
import json
import re
from typing import Dict, List, Optional

from app.utils.storage_enum import StoragePath


def get_progress_from_predictions(
    jfs,
    namespace: str,
    task_id: int,
    dataset_code_to_total: Dict[str, int],
) -> Optional[int]:
    """从 JFS 上 results/{timestamp}/predictions/{model_name}/*.json 读取进度。

    路径示例：.../benchmark/task/task_80/results/20260309_054823/predictions/qwen-vl-max/xxxx.json
    每个 JSON 的 key 数量表示该（模型+数据集）已完成的样本数；总样本数由调用方从
    benchmark_datasets.original_sample_count 传入（dataset_code_to_total）。
    进度 = sum(各 JSON 的 key 数) / sum(各数据集对应的 original_sample_count) * 100。
    """
    if not dataset_code_to_total:
        return None
    task_root = StoragePath.BENCHMARK_TASK_ROOT.format_storage_path(
        namespace=namespace, task_id=task_id
    ).rstrip("/")
    results_base = task_root + "/results/"
    try:
        subdirs = jfs.listdir(results_base)
    except Exception:
        return None
    if not subdirs:
        return None
    latest = sorted(subdirs)[-1]
    predictions_base = results_base + latest + "/predictions/"
    if not jfs.exists(predictions_base):
        return None

    codes_lower = {c.lower(): c for c in dataset_code_to_total}

    def _stem_to_dataset_code(stem: str) -> Optional[str]:
        stem_lower = stem.lower().strip()
        if not stem_lower:
            return None
        # 未完成前 OpenCompass 可能写 tmp_ 前缀，先尝试去掉再匹配
        stem_for_lookup = stem_lower[4:] if stem_lower.startswith("tmp_") else stem_lower
        if stem_for_lookup in codes_lower:
            return codes_lower[stem_for_lookup]
        if stem_for_lookup.startswith("openai_") and stem_for_lookup[7:] in codes_lower:
            return codes_lower[stem_for_lookup[7:]]
        for code_low, code in codes_lower.items():
            if stem_for_lookup == code_low or stem_for_lookup.startswith(code_low + "_"):
                return code
        return None

    total_done = 0
    total_expected = 0
    try:
        model_dirs = jfs.listdir(predictions_base)
    except Exception:
        return None
    for model_name in model_dirs:
        pred_dir = (predictions_base.rstrip("/") + "/" + model_name).replace("//", "/")
        try:
            jfs.listdir(pred_dir)
        except Exception:
            continue
        try:
            names = jfs.listdir(pred_dir)
        except Exception:
            continue
        for name in names:
            if not name.endswith(".json"):
                continue
            stem = name[:-5]
            code = _stem_to_dataset_code(stem)
            if not code or code not in dataset_code_to_total:
                continue
            expected = dataset_code_to_total[code] or 0
            total_expected += expected
            full = (pred_dir.rstrip("/") + "/" + name).replace("//", "/")
            try:
                with jfs.open(full, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    total_done += len(data)
                elif isinstance(data, list):
                    total_done += len(data)
                else:
                    total_done += 0
            except Exception:
                pass
    if total_expected <= 0:
        return None
    return min(100, int(round((total_done / total_expected) * 100)))




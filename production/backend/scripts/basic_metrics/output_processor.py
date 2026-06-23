#!/usr/bin/env python
"""
基础指标评估结果输出处理器
用于处理评估结果的输出格式，方便后期维护和修改
"""
import json
import os
from typing import List, Dict, Any, Optional
from loguru import logger


# 指标代码到中文名称和描述的映射
METRIC_INFO = {
    "accuracy": {
        "name": "准确率",
        "description": "用于评估模型正确执行给定任务的能力，模型预测结果与评估集完全一致的样本占比，反映整体预测的正确性",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "f1": {
        "name": "F1",
        "description": "综合考虑模型精准率与召回率的调和平均值，衡量模型在生成内容时的平衡性能，越高表示模型越稳健",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "rouge-1": {
        "name": "ROUGE-1",
        "description": "基于单个词(unigram)的匹配程度，计算模型生成文本与参考答案之间的词汇覆盖率，用于评估关键信息是否被提及",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "rouge-2": {
        "name": "Rouge-2",
        "description": "基于两个连续词(bigram)的匹配程度，衡量模型生成文本在短语级别的连贯性与准确性，反映语言的自然度",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "rouge-l": {
        "name": "Rouge-L",
        "description": "通过计算模型输出与参考答案之间的最长公共子序列(LCS)，评估语序与结构的相似性，适用于衡量整体语义结构一致性",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "bleu-4": {
        "name": "BLEU-4",
        "description": "综合评估模型生成文本与参考文本在1至4元语法(n-gram)层面上的匹配程度，反映语言流畅性与表达准确性，常用于机器翻译与文本生成任务",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "format_compliance": {
        "name": "格式遵从性",
        "description": "检测模型输出是否严格遵循JSON格式规范，确保结果具备程序可读性与系统集成友好性",
        "score_min": 0.0,
        "score_max": 1.0
    },
    "semantic_similarity": {
        "name": "语义相似度",
        "description": "综合Exact Match(完全匹配)与词重叠度两个维度，衡量模型输出与参考答案在字面层面的一致性",
        "score_min": 0.0,
        "score_max": 1.0
    }
}


def get_metric_info(metric_code: str) -> Dict[str, Any]:
    """
    获取指标信息（名称、描述、分数范围）
    
    Args:
        metric_code: 指标代码
    
    Returns:
        Dict[str, Any]: 指标信息字典，包含 name、description、score_min、score_max
    """
    return METRIC_INFO.get(metric_code, {
        "name": metric_code,
        "description": None,
        "score_min": 0.0,
        "score_max": 1.0
    })


def build_evaluation_item(
    metric_code: str,
    score: Optional[float],
    error: bool = False,
    error_message: Optional[str] = None,
    raw_response: Optional[str] = None
) -> Dict[str, Any]:
    """
    构建单个评估结果项
    
    Args:
        metric_code: 指标代码
        score: 指标分数（可以为 None，表示字段内容缺少或计算失败）
        error: 是否有错误
        error_message: 错误信息（如果有错误）
        raw_response: 原始响应（基础指标评估通常为None）
    
    Returns:
        Dict[str, Any]: 评估结果字典
    """
    metric_info = get_metric_info(metric_code)
    
    # 如果分数不为 None，保留4位小数
    rounded_score = round(score, 4) if score is not None else None
    
    evaluation: Dict[str, Any] = {
        "metric_name": metric_info["name"],
        "description": metric_info["description"],
        "score_min": metric_info["score_min"],
        "score_max": metric_info["score_max"],
        "score": rounded_score,
        "reason": None,  # 基础指标评估没有reason
        "error": error,
        "raw_response": raw_response,
    }
    
    if error and error_message:
        evaluation["error_message"] = error_message
    
    return evaluation


def format_output_data(
    all_data: List[Dict[str, Any]],
    results: Dict[str, Any],
    metrics: List[str]
) -> List[Dict[str, Any]]:
    """
    格式化输出数据，将指标分数转换为evaluations数组格式
    
    Args:
        all_data: 原始数据列表
        results: 计算结果
        metrics: 指标列表
    
    Returns:
        List[Dict[str, Any]]: 格式化后的数据列表，每条数据包含evaluations数组
    """
    output_data = []
    
    for idx, data in enumerate(all_data):
        output_item = data.copy()
        evaluations = []
        
        # 为每个指标构建评估结果
        for metric_code in metrics:
            if metric_code in results["metrics"]:
                metric_result = results["metrics"][metric_code]
                
                if "scores" in metric_result and idx in metric_result["scores"]:
                    # 有分数，构建评估结果
                    score = metric_result["scores"][idx]
                    
                    # 如果分数为 None，说明字段内容缺少，跳过计算
                    if score is None:
                        evaluation = build_evaluation_item(
                            metric_code=metric_code,
                            score=None,
                            error=True,
                            error_message="字段内容缺少，跳过计算",
                            raw_response=None
                        )
                        evaluations.append(evaluation)
                    else:
                        try:
                            score_value = float(score) if score is not None else None
                            # 保留4位小数
                            if score_value is not None:
                                score_value = round(score_value, 4)
                        except (ValueError, TypeError):
                            score_value = None
                        
                        evaluation = build_evaluation_item(
                            metric_code=metric_code,
                            score=score_value,
                            error=(score_value is None),
                            error_message="分数转换失败" if score_value is None and score is not None else None,
                            raw_response=None
                        )
                        evaluations.append(evaluation)
                elif "error" in metric_result:
                    # 有错误，构建错误评估结果
                    evaluation = build_evaluation_item(
                        metric_code=metric_code,
                        score=None,
                        error=True,
                        error_message=metric_result["error"],
                        raw_response=None
                    )
                    evaluations.append(evaluation)
        
        # 将evaluations数组添加到输出项
        output_item["evaluations"] = evaluations
        output_data.append(output_item)
    
    return output_data


def write_output_file(
    output_data: List[Dict[str, Any]],
    output_file: str
) -> None:
    """
    将格式化后的数据写入JSONL文件
    
    Args:
        output_data: 格式化后的数据列表
        output_file: 输出文件路径
    """
    # 确保输出目录存在
    output_dir = os.path.dirname(output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    
    # 写入JSONL文件
    with open(output_file, 'w', encoding='utf-8') as f:
        for item in output_data:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')
    
    logger.info(f"结果已输出到: {output_file}")


def write_summary_file(
    results: Dict[str, Any],
    output_file: str
) -> None:
    """
    输出汇总统计文件
    
    Args:
        results: 计算结果
        output_file: 输出文件路径（用于生成汇总文件名）
    """
    summary_file = output_file.replace('.jsonl', '_summary.json')
    
    summary = {
        "total_samples": results["total"],
        "valid_samples": results["valid"],
        "metrics_summary": {
            metric_code: {
                "average": metric_result.get("average"),
                "total": metric_result.get("total"),
                "valid": metric_result.get("valid"),
                "error": metric_result.get("error")
            }
            for metric_code, metric_result in results["metrics"].items()
        }
    }
    
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    
    logger.info(f"汇总统计已输出到: {summary_file}")


def output_results_to_file(
    all_data: List[Dict[str, Any]],
    results: Dict[str, Any],
    output_file: str,
    metrics: List[str]
) -> None:
    """
    将计算结果输出到文件（新格式：使用evaluations数组）
    
    Args:
        all_data: 原始数据列表
        results: 计算结果
        output_file: 输出文件路径
        metrics: 指标列表
    """
    logger.info(f"开始输出结果到文件: {output_file}")
    
    # 格式化输出数据
    output_data = format_output_data(all_data, results, metrics)
    
    # 写入输出文件
    write_output_file(output_data, output_file)
    
    # 输出汇总统计
    write_summary_file(results, output_file)


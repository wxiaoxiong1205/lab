"""
基础指标评估模块
提供各种基础指标的计算器
"""
from .base_metric_calculator import BaseMetricCalculator
from .accuracy import AccuracyCalculator
from .f1 import F1Calculator
from .rouge_1 import Rouge1Calculator
from .rouge_2 import Rouge2Calculator
from .rouge_l import RougeLCalculator
from .bleu_4 import Bleu4Calculator
from .format_compliance import FormatComplianceCalculator
from .semantic_similarity import SemanticSimilarityCalculator

__all__ = [
    "BaseMetricCalculator",
    "AccuracyCalculator",
    "F1Calculator",
    "Rouge1Calculator",
    "Rouge2Calculator",
    "RougeLCalculator",
    "Bleu4Calculator",
    "FormatComplianceCalculator",
    "SemanticSimilarityCalculator",
]

# 指标代码到计算器类的映射
METRIC_CALCULATORS = {
    "accuracy": AccuracyCalculator,
    "f1": F1Calculator,
    "rouge-1": Rouge1Calculator,
    "rouge-2": Rouge2Calculator,
    "rouge-l": RougeLCalculator,
    "bleu-4": Bleu4Calculator,
    "format_compliance": FormatComplianceCalculator,
    "semantic_similarity": SemanticSimilarityCalculator,
}


def get_calculator(metric_code: str, stop_words: list = None):
    """
    根据指标代码获取对应的计算器实例
    
    Args:
        metric_code: 指标代码（如：accuracy、f1、rouge-1等）
        stop_words: 停用词列表
    
    Returns:
        BaseMetricCalculator: 对应的计算器实例
    
    Raises:
        ValueError: 如果指标代码不存在
    """
    if metric_code not in METRIC_CALCULATORS:
        raise ValueError(f"不支持的指标代码: {metric_code}")
    
    calculator_class = METRIC_CALCULATORS[metric_code]
    return calculator_class(stop_words=stop_words)


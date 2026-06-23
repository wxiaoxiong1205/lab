"""
F1 计算器
与准确率一致：归一化后完全匹配为 1.0，否则 0.0；批量时对有效样本分数取简单平均。
"""
from typing import Any

from .base_metric_calculator import BaseMetricCalculator


class F1Calculator(BaseMetricCalculator):
    """F1 计算器（单条 0/1，平均为有效样本的简单平均）"""

    def calculate(self, prediction: str, reference: str) -> float:
        """
        计算单条 F1：归一化后完全匹配返回 1.0，否则 0.0。
        """
        y_pred = self._normalize_text(prediction)
        y_true = self._normalize_text(reference)
        return 1.0 if (y_pred == y_true and y_true != "") else 0.0

    def _normalize_text(self, text: Any) -> str:
        """F1 使用 strip + lower，与原先逻辑一致。"""
        if text is None:
            return ""
        return str(text).strip().lower()

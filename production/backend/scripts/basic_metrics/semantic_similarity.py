"""
语义相似度（Semantic Similarity）计算器
综合Exact Match(完全匹配)与词重叠度两个维度，不使用模型进行语义相似度计算
"""
from typing import Optional
from .base_metric_calculator import BaseMetricCalculator


class SemanticSimilarityCalculator(BaseMetricCalculator):
    """语义相似度计算器"""
    
    def __init__(self, stop_words: Optional[list] = None):
        """
        初始化语义相似度计算器
        
        Args:
            stop_words: 停用词列表
        """
        super().__init__(stop_words)
    
    def _exact_match(self, prediction: str, reference: str) -> float:
        """
        计算完全匹配分数
        
        Args:
            prediction: 模型预测结果
            reference: 参考答案
        
        Returns:
            float: 完全匹配分数，1.0表示完全匹配，0.0表示不匹配
        """
        pred_normalized = self._normalize_text(prediction)
        ref_normalized = self._normalize_text(reference)
        
        return 1.0 if pred_normalized == ref_normalized else 0.0
    
    def _token_overlap(self, prediction: str, reference: str) -> float:
        """
        计算词重叠度（简单的语义相似度近似）
        
        Args:
            prediction: 模型预测结果
            reference: 参考答案
        
        Returns:
            float: 词重叠度（0-1之间）
        """
        pred_tokens = set(self._tokenize(self._normalize_text(prediction)))
        ref_tokens = set(self._tokenize(self._normalize_text(reference)))
        
        if not ref_tokens:
            return 1.0 if not pred_tokens else 0.0
        
        if not pred_tokens:
            return 0.0
        
        # 计算Jaccard相似度
        intersection = pred_tokens & ref_tokens
        union = pred_tokens | ref_tokens
        
        jaccard = len(intersection) / len(union) if union else 0.0
        return jaccard
    
    
    def calculate(self, prediction: str, reference: str) -> float:
        """
        计算语义相似度
        
        实现方式（不使用模型）：
        - Exact Match: 完全匹配时返回1.0
        - 词重叠度: 使用Jaccard相似度作为语义相似度的近似
        
        Args:
            prediction: 模型预测结果
            reference: 参考答案
        
        Returns:
            float: 语义相似度分数（0-1之间）
        """
        # 计算完全匹配
        em_score = self._exact_match(prediction, reference)
        
        if em_score == 1.0:
            return 1.0
        
        # 计算词重叠度（Jaccard相似度）作为语义相似度的近似
        overlap_score = self._token_overlap(prediction, reference)
        
        return overlap_score


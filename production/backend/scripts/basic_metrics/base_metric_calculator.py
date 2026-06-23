"""
基础指标计算器基类
提供统一的接口和通用功能
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from loguru import logger


class BaseMetricCalculator(ABC):
    """基础指标计算器抽象基类"""
    
    def __init__(self, stop_words: Optional[List[str]] = None):
        """
        初始化计算器
        
        Args:
            stop_words: 停用词列表，用于某些指标计算时过滤停用词
        """
        self.stop_words = set(stop_words) if stop_words else set()
    
    @abstractmethod
    def calculate(self, prediction: str, reference: str) -> float:
        """
        计算单个样本的指标值
        
        Args:
            prediction: 模型预测结果
            reference: 参考答案
        
        Returns:
            float: 指标值（通常在0-1之间）
        """
        pass
    
    def calculate_batch(self, predictions: List[str], references: List[str]) -> Dict[str, Any]:
        """
        批量计算指标值
        
        Args:
            predictions: 模型预测结果列表（可能包含 None）
            references: 参考答案列表（可能包含 None）
        
        Returns:
            Dict[str, Any]: 包含平均指标值、每个样本的指标值等统计信息
        """
        if len(predictions) != len(references):
            raise ValueError(f"预测结果数量({len(predictions)})与参考答案数量({len(references)})不一致")
        
        scores = []
        for i, (pred, ref) in enumerate(zip(predictions, references)):
            # 如果 pred 或 ref 为 None 或空字符串，分数设为 None，不参与计算
            if pred is None or ref is None or pred == "" or ref == "":
                scores.append(None)
                logger.debug(f"第{i+1}个样本的预测结果或参考答案为 None 或空字符串，跳过计算")
            else:
                try:
                    score = self.calculate(pred, ref)
                    # 保留4位小数
                    scores.append(round(score, 4) if score is not None else None)
                except Exception as e:
                    logger.warning(f"计算第{i+1}个样本的指标失败: {e}")
                    scores.append(None)  # 失败时设为 None，不参与计算
        
        # 计算平均值时排除 None 值
        valid_scores = [s for s in scores if s is not None]
        average = sum(valid_scores) / len(valid_scores) if valid_scores else 0.0
        # 平均值也保留4位小数
        average = round(average, 4)
        
        return {
            "average": average,
            "scores": scores,
            "total": len(scores),
            "valid": len(valid_scores)  # 只统计非 None 的分数
        }
    
    def _normalize_text(self, text: str) -> str:
        """
        文本标准化处理
        
        Args:
            text: 原始文本
        
        Returns:
            str: 标准化后的文本
        """
        if not text:
            return ""
        # 去除首尾空白
        text = text.strip()
        # 可以在这里添加更多的标准化处理
        return text
    
    def _tokenize(self, text: str) -> List[str]:
        """
        文本分词（简单实现，可根据需要扩展）
        
        Args:
            text: 输入文本
        
        Returns:
            List[str]: 词列表
        """
        if not text:
            return []
        # 简单的空格分词，可以根据需要扩展为更复杂的分词逻辑
        tokens = text.split()
        # 过滤停用词
        if self.stop_words:
            tokens = [t for t in tokens if t.lower() not in self.stop_words]
        return tokens


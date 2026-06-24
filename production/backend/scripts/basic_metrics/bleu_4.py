import jieba
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
from .base_metric_calculator import BaseMetricCalculator

class Bleu4Calculator(BaseMetricCalculator):
    """基于 NLTK 和 jieba 的标准 BLEU-4 计算器"""
    
    def calculate(self, prediction: str, reference: str) -> float:
        # 1. 规范化
        p_text = self._normalize_text(prediction)
        r_text = self._normalize_text(reference)
        
        # 2. 中文分词 (解决 0 分的关键)
        p_tokens = jieba.lcut(p_text)
        r_tokens = jieba.lcut(r_text)
        
        # 3. 边界处理
        if not r_tokens:
            return 1.0 if not p_tokens else 0.0
        if not p_tokens:
            return 0.0
            
        # 4. 调用 NLTK 计算单句 BLEU
        # weights=(0.25, 0.25, 0.25, 0.25) 表示计算 BLEU-4
        # smoothing_function 是防止 0 分的核心
        chencherry = SmoothingFunction()
        
        # 注意：NLTK 的 reference 需要是一个列表的列表（支持多条参考答案）
        score = sentence_bleu(
            [r_tokens], 
            p_tokens, 
            weights=(0.25, 0.25, 0.25, 0.25),
            smoothing_function=chencherry.method1  # 使用 method1 平滑
        )
        
        return score
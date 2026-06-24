import jieba
from rouge import Rouge
from .base_metric_calculator import BaseMetricCalculator
from typing import List, Dict, Any

class Rouge2Calculator(BaseMetricCalculator):
    """基于 rouge 库和 jieba 的 Rouge-2 计算器"""
    
    def __init__(self, stop_words=None):
        super().__init__(stop_words)
        # 初始化 rouge 库
        # 注意：这里使用的 rouge 库不会像 google 的 rouge-score 那样过滤掉中文
        self.rouge = Rouge()

    def _prepare_text(self, text: str) -> str:
        """分词并用空格拼接，这是解决中文 0 分的关键"""
        if not text:
            return ""
        # 使用基类的规范化方法
        normalized = self._normalize_text(str(text))
        # 中文分词
        tokens = jieba.lcut(normalized)
        # 用空格拼接，让 rouge 库能按词识别
        return " ".join(tokens)

    def calculate(self, prediction: str, reference: str) -> float:
        """
        计算单条 ROUGE-2 F1 分数
        """
        p_formatted = self._prepare_text(prediction)
        r_formatted = self._prepare_text(reference)
        
        # 边界处理
        if not r_formatted.strip():
            return 1.0 if not p_formatted.strip() else 0.0
        if not p_formatted.strip():
            return 0.0
        
        try:
            # get_scores 返回一个列表，取第一项
            scores = self.rouge.get_scores(p_formatted, r_formatted)
            # 返回 rouge-2 的 f 分数 (F1-score)
            return scores[0]['rouge-2']['f']
        except Exception as e:
            # 对于无法形成 bigram 的极短文本，如果内容一致返回 1.0
            if p_formatted == r_formatted and p_formatted != "":
                return 1.0
            return 0.0

    def calculate_batch(self, predictions: List[str], references: List[str]) -> Dict[str, Any]:
        """
        实现批量计算接口，适配 main.py 的调用
        """
        if len(predictions) != len(references):
            raise ValueError(f"预测结果数量({len(predictions)})与参考答案数量({len(references)})不一致")
        
        scores = []
        for i, (pred, ref) in enumerate(zip(predictions, references)):
            # 如果 pred 或 ref 为 None 或空字符串（去除空格后），分数设为 None，不参与计算
            if pred is None or ref is None:
                scores.append(None)
            else:
                # 去除首尾空格
                pred_stripped = str(pred).strip() if pred is not None else ""
                ref_stripped = str(ref).strip() if ref is not None else ""
                
                if pred_stripped == "" or ref_stripped == "":
                    scores.append(None)
                else:
                    try:
                        p_formatted = self._prepare_text(pred_stripped)
                        r_formatted = self._prepare_text(ref_stripped)
                        
                        if not r_formatted.strip():
                            score = 1.0 if not p_formatted.strip() else 0.0
                        elif not p_formatted.strip():
                            score = 0.0
                        else:
                            try:
                                res = self.rouge.get_scores(p_formatted, r_formatted)[0]
                                score = res['rouge-2']['f']
                            except:
                                # 处理文本太短无法形成 bigram 的情况
                                score = 1.0 if p_formatted == r_formatted else 0.0
                        
                        # 保留4位小数
                        scores.append(round(score, 4))
                    except Exception as e:
                        from loguru import logger
                        logger.warning(f"计算第{i+1}个样本的指标失败: {e}")
                        scores.append(None)
        
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
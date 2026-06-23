import jieba
from rouge import Rouge
from .base_metric_calculator import BaseMetricCalculator
from typing import List, Dict, Any

class RougeLCalculator(BaseMetricCalculator):
    """基于 rouge 库和 jieba 的 Rouge-L 计算器"""
    
    def __init__(self, stop_words=None):
        super().__init__(stop_words)
        self.rouge = Rouge()

    def _prepare_text(self, text: str) -> str:
        """规范化文本并进行中文分词"""
        if not text:
            return ""
        normalized = self._normalize_text(str(text))
        return " ".join(jieba.lcut(normalized))

    def calculate(self, prediction: str, reference: str) -> float:
        """计算单条 ROUGE-L F1 分数"""
        p_formatted = self._prepare_text(prediction)
        r_formatted = self._prepare_text(reference)
        
        if not r_formatted.strip():
            return 1.0 if not p_formatted.strip() else 0.0
        if not p_formatted.strip():
            return 0.0
        
        try:
            scores = self.rouge.get_scores(p_formatted, r_formatted)
            return scores[0]['rouge-l']['f']
        except Exception:
            return 1.0 if p_formatted == r_formatted else 0.0

    def calculate_batch(self, predictions: List[str], references: List[str]) -> Dict[str, Any]:
        """批量计算接口"""
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
                                score = res['rouge-l']['f']
                            except:
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
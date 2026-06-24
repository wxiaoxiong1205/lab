"""
准确率（Accuracy）计算器
用于评估模型正确执行给定任务的能力，模型预测结果与评估集完全一致的样本占比
"""
from typing import Optional
from .base_metric_calculator import BaseMetricCalculator


class AccuracyCalculator(BaseMetricCalculator):
    """准确率计算器"""
    
    def calculate(self, prediction: str, reference: str) -> float:
        """
        计算准确率（完全匹配）
        
        Args:
            prediction: 模型预测结果
            reference: 参考答案
        
        Returns:
            float: 准确率值，1.0表示完全匹配，0.0表示不匹配
        """
        pred_normalized = self._normalize_text(prediction)
        ref_normalized = self._normalize_text(reference)
        
        # 完全匹配返回1.0，否则返回0.0
        return 1.0 if pred_normalized == ref_normalized else 0.0

if __name__ == "__main__":
    # --- 1. 你在这里复制你的文件路径 ---
    file_path = r"/data/project/huangwenyuan/lab/test.jsonl" 
    import json
    test_data = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                test_data.append(json.loads(line))

    # --- 4. 执行计算 ---
    calculator = AccuracyCalculator()
    correct_count = 0
    total_count = len(test_data)

    print(f"\n{'#'*10} 开始测试 {'#'*10}")
    for i, item in enumerate(test_data):
        # 这里的 key 名 'prediction' 和 'reference' 请确保和你文件里的表头一致
        pred = str(item["response"])
        ref = str(item["model_response"])
        
        result = calculator.calculate(pred, ref)
        correct_count += result
        
        status = "✅ [正确]" if result == 1.0 else "❌ [错误]"
        print(f"样本 {i+1}: {status} | 预测: '{pred}' | 参考: '{ref}'")

    # --- 5. 打印统计结果 ---
    if total_count > 0:
        accuracy = correct_count / total_count
        print(f"\n{'='*30}")
        print(f"测试结束！")
        print(f"总样本数: {total_count}")
        print(f"正确数量: {int(correct_count)}")
        print(f"最终准确率: {accuracy:.2%}")
        print(f"{'='*30}")
    else:
        print("没有读取到任何有效数据，请检查文件内容或表头是否正确。")
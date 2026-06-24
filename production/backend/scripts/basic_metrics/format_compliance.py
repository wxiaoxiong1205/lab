import json
import re
from .base_metric_calculator import BaseMetricCalculator

class FormatComplianceCalculator(BaseMetricCalculator):
    """格式遵从性计算器 (增强版)"""

    def _extract_json(self, text: str) -> str:
        """从模型输出中提取可能的 JSON 部分"""
        # 1. 尝试匹配 Markdown 格式的 JSON 块
        json_block_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
        match = re.search(json_block_pattern, text)
        if match:
            return match.group(1).strip()
        
        # 2. 如果没找到标签，尝试寻找最外层的 { ... } 或 [ ... ]
        start_dict = text.find('{')
        start_list = text.find('[')
        
        # 确定哪一个先出现
        start_idx = -1
        if start_dict != -1 and start_list != -1:
            start_idx = min(start_dict, start_list)
        elif start_dict != -1:
            start_idx = start_dict
        elif start_list != -1:
            start_idx = start_list
            
        if start_idx != -1:
            # 找到最后一个闭合括号
            end_idx = max(text.rfind('}'), text.rfind(']'))
            if end_idx > start_idx:
                return text[start_idx:end_idx+1].strip()
        
        return text.strip()

    def calculate(self, prediction: str, reference: str) -> float:
        """
        计算格式遵从性
        """
        # 注意：这里不要使用 _normalize_text，因为会破坏 JSON 内部的大小写
        if not prediction or not str(prediction).strip():
            return 0.0
        
        # 提取 JSON 核心内容
        content = self._extract_json(str(prediction))
        
        try:
            # 尝试解析
            json.loads(content)
            return 1.0
        except (json.JSONDecodeError, ValueError):
            # 如果解析失败，返回 0
            return 0.0
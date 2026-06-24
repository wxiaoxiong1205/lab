from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List

import torch


@dataclass
class PredictionResult:
    start: int
    end: int
    class_id: int
    score: float


class ModelHandle(ABC):
    """命名实体识别后处理接口。"""

    _DEFAULT_MAX_LEN = 128

    @staticmethod
    def extract_logits(model_output) -> torch.Tensor:
        if isinstance(model_output, torch.Tensor):
            return model_output

        if isinstance(model_output, (list, tuple)):
            if not model_output:
                raise ValueError("模型输出为空列表")
            return ModelHandle.extract_logits(model_output[0])

        if isinstance(model_output, dict):
            if not model_output:
                raise ValueError("模型输出为空字典")
            if "logits" in model_output:
                return ModelHandle.extract_logits(model_output["logits"])
            return ModelHandle.extract_logits(next(iter(model_output.values())))

        raise TypeError(f"不支持的模型输出类型: {type(model_output)}")

    @abstractmethod
    def post_handle(
        self,
        model_output: torch.Tensor,
        text: str,
        model_input: Dict[str, object],
    ) -> List[PredictionResult]:
        """
        将模型输出解码为实体列表。

        `model_input` 由平台骨架统一构造，当前约定包含：
        - `attention_mask`: 真实 token / padding 掩码
        - `token_offsets`: 每个 token 对应原文中的 `(start, end)` 字符区间
        - `special_tokens_mask`: 特殊 token 掩码；没有时按全 0 处理
        """
        raise NotImplementedError

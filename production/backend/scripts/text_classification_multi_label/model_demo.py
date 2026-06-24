import torch

from .model_handle import ModelHandle, PredictedLabel, PredictionResult


class TorchTextClassificationHandle(ModelHandle):
    """
    多标签文本分类示例后处理实现。
    """

    def post_handle(self, model_output: torch.Tensor, threshold: float) -> PredictionResult:
        """
        对单条分类 logits 做 sigmoid，并保留所有超过阈值的标签。
        """
        if isinstance(model_output, (tuple, list)):
            if not model_output:
                raise ValueError("文本分类模型输出为空")
            model_output = model_output[0]

        if not isinstance(model_output, torch.Tensor):
            raise TypeError(f"文本分类模型输出必须是 torch.Tensor，实际为: {type(model_output)}")

        logits = model_output.unsqueeze(0) if model_output.ndim == 1 else model_output

        if logits.ndim != 2:
            raise ValueError(
                "文本分类模型输出应为 [B, C]。"
                f"如果实际为 {tuple(logits.shape)}，请优先检查是否误挂成了 token classification / NER 模型。"
            )

        if logits.shape[0] != 1:
            raise ValueError(
                "当前 demo 按单任务逐条推理，post_handle 期望单条输出，"
                f"实际 batch 大小为 {logits.shape[0]}"
            )

        probabilities = torch.sigmoid(logits)[0]
        pred_indices = torch.where(probabilities >= threshold)[0].tolist()
        labels = [
            PredictedLabel(class_id=int(idx), score=float(probabilities[idx].item()))
            for idx in pred_indices
        ]

        return PredictionResult(labels=labels)

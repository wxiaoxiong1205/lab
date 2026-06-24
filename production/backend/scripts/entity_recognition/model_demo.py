from typing import Dict, List, Optional

import torch

from .model_handle import ModelHandle, PredictionResult


class TorchEntityRecognitionHandle(ModelHandle):
    """命名实体识别后处理实现。"""

    BIO_ID_TO_LABEL: Dict[int, str] = {
        0: "O",
        1: "B-LOC",
        2: "I-LOC",
        3: "B-企业",
        4: "I-企业",
        5: "B-学校",
        6: "I-学校",
        7: "B-人名",
        8: "I-人名",
        9: "B-产品",
        10: "I-产品",
        11: "B-药物",
        12: "I-药物",
        13: "B-业务",
        14: "I-业务",
    }

    ENTITY_NAME_TO_CLASS_ID: Dict[str, int] = {
        "LOC": 1,
        "企业": 2,
        "学校": 3,
        "人名": 4,
        "产品": 5,
        "药物": 6,
        "业务": 7,
    }

    @classmethod
    def _get_runtime_mappings(cls) -> tuple[Dict[int, str], Dict[str, int]]:
        id2bio_label = cls.BIO_ID_TO_LABEL
        entity_name_to_class_id = cls.ENTITY_NAME_TO_CLASS_ID

        if not id2bio_label:
            raise ValueError("BIO_ID_TO_LABEL 不能为空")
        if id2bio_label.get(0) != "O":
            raise ValueError("BIO_ID_TO_LABEL 必须包含 `0: \"O\"`")
        if not entity_name_to_class_id:
            raise ValueError("ENTITY_NAME_TO_CLASS_ID 不能为空")

        for pred_id, bio_label in id2bio_label.items():
            if not isinstance(pred_id, int):
                raise TypeError(f"BIO 标签 id 必须是整数，实际为: {type(pred_id)}")

            cleaned_label = str(bio_label).strip()
            if not cleaned_label:
                raise ValueError(f"存在空 BIO 标签定义，pred_id={pred_id}")

            if cleaned_label == "O":
                continue

            if "-" not in cleaned_label:
                raise ValueError(
                    f"BIO 标签格式非法：pred_id={pred_id}, label={cleaned_label!r}"
                )

            prefix, entity_name = cleaned_label.split("-", 1)
            if prefix not in {"B", "I"}:
                raise ValueError(
                    f"BIO 标签前缀非法：pred_id={pred_id}, label={cleaned_label!r}"
                )

            if entity_name not in entity_name_to_class_id:
                raise ValueError(
                    "BIO_ID_TO_LABEL 中存在未声明稳定 class_id 的实体类型："
                    f"{entity_name!r}"
                )

        return id2bio_label, entity_name_to_class_id

    def post_handle(
        self,
        model_output: torch.Tensor,
        text: str,
        model_input: Dict[str, object],
    ) -> List[PredictionResult]:
        logits = self.extract_logits(model_output)
        id2bio_label, entity_name_to_class_id = self._get_runtime_mappings()

        if logits.ndim != 3:
            raise ValueError(f"NER 模型输出应为 [B, L, C]，实际为 {tuple(logits.shape)}")
        if logits.shape[0] != 1:
            raise ValueError(
                "当前实现按单任务逐条推理，post_handle 期望单条输出，"
                f"实际 batch 大小为 {logits.shape[0]}"
            )
        if logits.shape[2] != len(id2bio_label):
            raise ValueError(
                "模型输出类别数与 `BIO_ID_TO_LABEL` 定义不一致："
                f"模型输出 C={logits.shape[2]}，BIO 标签数={len(id2bio_label)}"
            )

        if not isinstance(model_input, dict):
            raise TypeError(f"model_input 必须是字典，实际类型为: {type(model_input)}")

        attention_mask_tensor = model_input.get("attention_mask")
        token_offsets_tensor = model_input.get("token_offsets")
        special_tokens_mask_tensor = model_input.get("special_tokens_mask")
        if attention_mask_tensor is None or token_offsets_tensor is None:
            raise ValueError("model_input 必须包含 `attention_mask` 和 `token_offsets`")

        probabilities = torch.softmax(logits, dim=-1)
        pred_score_tensor, pred_id_tensor = torch.max(probabilities, dim=-1)

        pred_ids = pred_id_tensor[0].detach().cpu().tolist()
        pred_scores = pred_score_tensor[0].detach().cpu().tolist()
        attention_mask = attention_mask_tensor[0].detach().cpu().tolist()
        token_offsets = token_offsets_tensor[0].detach().cpu().tolist()
        special_tokens_mask = (
            special_tokens_mask_tensor[0].detach().cpu().tolist()
            if special_tokens_mask_tensor is not None
            else [0] * len(pred_ids)
        )

        if not (
            len(pred_ids)
            == len(pred_scores)
            == len(attention_mask)
            == len(token_offsets)
            == len(special_tokens_mask)
        ):
            raise ValueError("模型输出序列长度与平台编码得到的辅助信息长度不一致")

        results: List[PredictionResult] = []
        current_entity: Optional[Dict[str, object]] = None

        def flush_current_entity():
            nonlocal current_entity
            if not current_entity:
                return

            start = int(current_entity["start"])
            end = int(current_entity["end"])
            entity_name = str(current_entity["entity_name"])
            token_scores = current_entity["scores"]
            if not isinstance(token_scores, list) or not token_scores:
                current_entity = None
                return

            if start < end:
                class_id = entity_name_to_class_id.get(entity_name)
                if class_id is None:
                    raise ValueError(f"未找到实体类型 {entity_name!r} 对应的稳定 class_id")

                results.append(
                    PredictionResult(
                        start=start,
                        end=end,
                        class_id=class_id,
                        score=float(sum(token_scores) / len(token_scores)),
                    )
                )

            current_entity = None

        for pred_id, pred_score, mask_value, special_token, (start, end) in zip(
            pred_ids,
            pred_scores,
            attention_mask,
            special_tokens_mask,
            token_offsets,
        ):
            if int(mask_value) == 0:
                flush_current_entity()
                continue

            if int(special_token) == 1:
                flush_current_entity()
                continue

            start = int(start)
            end = int(end)
            if start == end:
                flush_current_entity()
                continue

            if start < 0 or end > len(text) or start >= end:
                flush_current_entity()
                continue

            bio_label = id2bio_label.get(int(pred_id))
            if bio_label is None:
                raise ValueError(f"预测标签 id={pred_id} 未在 BIO_ID_TO_LABEL 中声明")

            if bio_label == "O":
                flush_current_entity()
                continue

            prefix, entity_name = bio_label.split("-", 1)
            if prefix == "B":
                flush_current_entity()
                current_entity = {
                    "entity_name": entity_name,
                    "start": start,
                    "end": end,
                    "scores": [float(pred_score)],
                }
                continue

            if (
                current_entity is not None
                and str(current_entity["entity_name"]) == entity_name
            ):
                current_entity["end"] = max(int(current_entity["end"]), end)
                current_entity["scores"].append(float(pred_score))
                continue

            flush_current_entity()
            current_entity = {
                "entity_name": entity_name,
                "start": start,
                "end": end,
                "scores": [float(pred_score)],
            }

        flush_current_entity()
        return results


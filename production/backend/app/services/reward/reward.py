import re
from typing import Any

from app.schemas.reward import RewardRequest, RewardResponse


class RewardService:
    """Default reward scorer for external training reward callbacks."""

    def score(self, request: RewardRequest) -> RewardResponse:
        prediction = self._resolve_prediction(request)
        reference_answer = self._resolve_reference_answer(request.ground_truth)

        score = 0.0
        if prediction is not None and reference_answer is not None:
            score = (
                1.0
                if self._normalize_answer(prediction) == self._normalize_answer(reference_answer)
                else 0.0
            )

        return RewardResponse(
            score=score,
            prediction=prediction,
            ground_truth=reference_answer,
            data_source=request.data_source,
            reward_model="exact_match",
        )

    @classmethod
    def _resolve_prediction(cls, request: RewardRequest) -> str | None:
        if request.prediction is not None:
            return str(request.prediction)
        return cls._extract_final_answer(request.solution_str)

    @staticmethod
    def _resolve_reference_answer(ground_truth: Any) -> str | None:
        if ground_truth is None:
            return None
        if isinstance(ground_truth, dict):
            for key in ("answer", "expected_answer", "ground_truth", "label"):
                if key in ground_truth:
                    return str(ground_truth[key])
        return str(ground_truth)

    @staticmethod
    def _extract_final_answer(text: str) -> str | None:
        matches = re.findall(r"####\s*([^\n\r]+)", text or "")
        if not matches:
            return None
        return matches[-1]

    @staticmethod
    def _normalize_answer(value: str) -> str:
        return value.strip().replace(",", "").replace("$", "")

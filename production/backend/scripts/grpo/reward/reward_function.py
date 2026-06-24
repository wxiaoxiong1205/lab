"""Sample GRPO reward function backed by an external HTTP service.

Upload this file through the chunk upload API and pass the returned upload_id
as reward_function_upload_id when creating a GRPO training task.

External service contract used by this demo:
- Request: POST JSON with data_source, solution_str, prediction, ground_truth, extra_info.
- Response option 1: {"score": 1.0}
- Response option 2: {"answer": "72"} or {"expected_answer": "72"}.
"""

import json
import logging
import os
import re
import urllib.error
import urllib.request
from typing import Any, Optional

DEFAULT_REWARD_API_URL = os.getenv("REWARD_API_URL", "http://deepai-lab-backend/api/v1/reward/score")
logger = logging.getLogger(__name__)


def _extract_final_answer(text: str) -> Optional[str]:
    """Extract the final answer after ####, compatible with GSM8K-style data."""
    matches = re.findall(r"####\s*([^\n\r]+)", text or "")
    if not matches:
        return None
    return matches[-1].strip().replace(",", "").replace("$", "")


def _normalize_answer(value: Any) -> str:
    return str(value).strip().replace(",", "").replace("$", "")


def _resolve_reward_api_url(extra_info: Optional[dict[str, Any]], kwargs: dict[str, Any]) -> str:
    """Allow the reward service URL to be configured by verl reward_kwargs or sample extra_info."""
    if kwargs.get("reward_api_url"):
        return str(kwargs["reward_api_url"])
    if extra_info and extra_info.get("reward_api_url"):
        return str(extra_info["reward_api_url"])
    return DEFAULT_REWARD_API_URL


def _json_default(value: Any) -> Any:
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    if hasattr(value, "tolist"):
        try:
            return value.tolist()
        except (TypeError, ValueError):
            pass
    return str(value)


def _request_external_reward(payload: dict[str, Any], reward_api_url: str, timeout: float) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False, default=_json_default).encode("utf-8")
    request = urllib.request.Request(
        reward_api_url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        response_body = response.read().decode("utf-8")
    return json.loads(response_body)


def compute_score(
    data_source: str,
    solution_str: str,
    ground_truth: str,
    extra_info: Optional[dict[str, Any]] = None,
    **kwargs: Any,
) -> float:
    """Return a scalar reward by calling an external HTTP service.

    Args:
        data_source: Dataset source from the sample, such as "openai/gsm8k".
        solution_str: Model generated text.
        ground_truth: Expected answer from reward_model.ground_truth.
        extra_info: Optional sample metadata.
        **kwargs: Additional arguments injected by verl reward config.
            reward_api_url: Optional external scoring endpoint.
            reward_api_timeout: Optional request timeout in seconds.

    Returns:
        External score if response contains "score"; otherwise 1.0 for an exact
        prediction/response answer match, 0.0 for mismatch or request failure.
    """
    prediction = _extract_final_answer(solution_str)
    if prediction is None:
        return 0.0

    extra_info = extra_info or {}
    reward_api_url = _resolve_reward_api_url(extra_info, kwargs)
    timeout = float(kwargs.get("reward_api_timeout", 5.0))
    payload = {
        "data_source": data_source,
        "solution_str": solution_str,
        "prediction": prediction,
        "ground_truth": ground_truth,
        "extra_info": extra_info,
    }

    try:
        result = _request_external_reward(payload, reward_api_url, timeout)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        logger.exception(
            "GRPO external reward request failed: url=%s, data_source=%s, prediction=%s, error=%s",
            reward_api_url,
            data_source,
            prediction,
            exc,
        )
        return 0.0

    if "score" in result:
        return float(result["score"])

    reference_answer = (
        result.get("answer")
        or result.get("expected_answer")
        or result.get("ground_truth")
        or ground_truth
    )
    return 1.0 if _normalize_answer(prediction) == _normalize_answer(reference_answer) else 0.0

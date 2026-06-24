from fastapi import APIRouter

from app.schemas.reward import RewardRequest, RewardResponse
from app.services.reward import RewardService

router = APIRouter(tags=["reward"])
reward_service = RewardService()


@router.post("/api/v1/rewards/score", response_model=RewardResponse)
async def score_reward(request: RewardRequest) -> RewardResponse:
    """Default exact-match reward scorer for GRPO external reward callbacks."""
    return reward_service.score(request)

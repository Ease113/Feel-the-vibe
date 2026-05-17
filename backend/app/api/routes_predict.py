"""추천/현재 순서 비교 예측 라우터."""

from fastapi import APIRouter

from app.schemas.sequence import PredictRequest
from app.services.optimizer import SequenceEvaluator

router = APIRouter(tags=["predict"])


@router.post("/predict")
def predict(request: PredictRequest) -> dict:
    """추천 순서와 현재 순서를 비교해 objectiveScore 차이와 전환 비용 분석을 반환한다."""
    evaluator = SequenceEvaluator()
    return evaluator.compare(
        plan_id=request.plan_id,
        recommended_sequence=request.recommended_sequence,
        current_sequence=request.current_sequence,
        priority_profile=request.priority_profile,
    )

from fastapi import APIRouter

from app.schemas.sequence import PredictRequest
from app.services.optimizer import SequenceEvaluator

router = APIRouter(tags=["predict"])


@router.post("/predict")
def predict(request: PredictRequest) -> dict:
    evaluator = SequenceEvaluator()
    return evaluator.compare(
        plan_id=request.plan_id,
        recommended_sequence=request.recommended_sequence,
        current_sequence=request.current_sequence,
        priority_profile=request.priority_profile,
    )

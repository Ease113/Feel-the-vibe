from fastapi import APIRouter

from app.schemas.sequence import ExplainRequest
from app.services.explanation_service import ExplanationService

router = APIRouter(tags=["explain"])


@router.post("/explain")
def explain(request: ExplainRequest) -> dict:
    return {"explanation": ExplanationService().explain(request.model_dump())}

"""한국어 설명 생성 라우터."""

from fastapi import APIRouter

from app.schemas.sequence import ExplainRequest
from app.services.explanation_service import ExplanationService

router = APIRouter(tags=["explain"])


@router.post("/explain")
def explain(request: ExplainRequest) -> dict:
    """비교 결과와 경고 내용을 바탕으로 한국어 요약 설명 문자열을 반환한다."""
    return {"explanation": ExplanationService().explain(request.model_dump())}

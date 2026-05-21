"""한국어 설명 생성 라우터."""

from fastapi import APIRouter

from app.schemas.sequence import ExplainRequest, ExplainResponse
from app.services.explanation_service import ExplanationService

router = APIRouter(tags=["explain"])


@router.post("/explain", response_model=ExplainResponse)
def explain(request: ExplainRequest) -> ExplainResponse:
    """비교 결과와 경고 내용을 바탕으로 한국어 요약 설명과 provenance를 반환한다."""
    return ExplainResponse.model_validate(ExplanationService().explain(request.model_dump()))

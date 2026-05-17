"""확정 의사결정 CRUD 라우터."""

from fastapi import APIRouter, HTTPException

from app.schemas.decision import DecisionCreateRequest, ReviewedUpdateRequest
from app.services.decision_logger import DecisionLogger

router = APIRouter(tags=["decisions"])


@router.post("/decisions")
def create_decision(request: DecisionCreateRequest) -> dict:
    """확정 순서를 평가·저장하고 생성된 decision_id를 반환한다."""
    logger = DecisionLogger()
    return logger.save_decision(request)


@router.get("/decisions/{decision_id}")
def get_decision(decision_id: str) -> dict:
    """decision_id로 단건 의사결정 레코드를 조회한다. 없으면 404를 반환한다."""
    logger = DecisionLogger()
    decision = logger.get_decision(decision_id)
    if decision is None:
        raise HTTPException(status_code=404, detail=f"Decision not found: {decision_id}")
    return decision


@router.patch("/decisions/{decision_id}/reviewed")
def update_reviewed(decision_id: str, request: ReviewedUpdateRequest) -> dict:
    """관리자 검토 완료 여부를 업데이트한다. 레코드가 없으면 404를 반환한다."""
    logger = DecisionLogger()
    updated = logger.update_reviewed(decision_id, request.reviewed)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Decision not found: {decision_id}")
    return {"decision_id": decision_id, "reviewed": request.reviewed}

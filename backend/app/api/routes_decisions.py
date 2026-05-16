from fastapi import APIRouter, HTTPException

from app.schemas.decision import DecisionCreateRequest, ReviewedUpdateRequest
from app.services.decision_logger import DecisionLogger

router = APIRouter(tags=["decisions"])


@router.post("/decisions")
def create_decision(request: DecisionCreateRequest) -> dict:
    logger = DecisionLogger()
    return logger.save_decision(request)


@router.get("/decisions/{decision_id}")
def get_decision(decision_id: str) -> dict:
    logger = DecisionLogger()
    decision = logger.get_decision(decision_id)
    if decision is None:
        raise HTTPException(status_code=404, detail=f"Decision not found: {decision_id}")
    return decision


@router.patch("/decisions/{decision_id}/reviewed")
def update_reviewed(decision_id: str, request: ReviewedUpdateRequest) -> dict:
    logger = DecisionLogger()
    updated = logger.update_reviewed(decision_id, request.reviewed)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Decision not found: {decision_id}")
    return {"decision_id": decision_id, "reviewed": request.reviewed}

from fastapi import APIRouter, HTTPException

from app.services.data_loader import DataLoader
from app.services.priority import default_priority_profile

router = APIRouter(tags=["plans"])


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str) -> dict:
    loader = DataLoader()
    try:
        plan_items = loader.get_plan_items(plan_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not plan_items:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    return {
        "plan_id": plan_id,
        "plan_items": plan_items,
        "operating_context": loader.get_plan_context(plan_id),
        "default_priority_profile": default_priority_profile(),
    }

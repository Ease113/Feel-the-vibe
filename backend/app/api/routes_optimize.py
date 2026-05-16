from fastapi import APIRouter

from app.schemas.sequence import OptimizeRequest
from app.services.optimizer import Optimizer

router = APIRouter(tags=["optimize"])


@router.post("/optimize")
def optimize(request: OptimizeRequest) -> dict:
    optimizer = Optimizer()
    return optimizer.optimize(
        plan_id=request.plan_id,
        plan_item_ids=request.plan_item_ids,
        priority_profile=request.priority_profile,
    )

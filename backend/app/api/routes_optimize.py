"""순서 최적화 라우터."""

from fastapi import APIRouter

from app.schemas.sequence import OptimizeRequest
from app.services.optimizer import Optimizer

router = APIRouter(tags=["optimize"])


@router.post("/optimize")
def optimize(request: OptimizeRequest) -> dict:
    """plan_item_ids의 objectiveScore 최소 순서를 탐색해 recommended_sequence와 비용 분석을 반환한다."""
    optimizer = Optimizer()
    override = (
        request.operating_context.model_dump(exclude_none=True)
        if request.operating_context is not None
        else None
    )
    operating_context = optimizer.loader.merge_operating_context(request.plan_id, override)
    return optimizer.optimize(
        plan_id=request.plan_id,
        plan_item_ids=request.plan_item_ids,
        priority_profile=request.priority_profile,
        operating_context=operating_context,
    )

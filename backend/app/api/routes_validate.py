from fastapi import APIRouter

from app.schemas.sequence import ValidateRequest
from app.services.data_loader import DataLoader
from app.services.rule_engine import RuleEngine

router = APIRouter(tags=["validate"])


@router.post("/validate")
def validate(request: ValidateRequest) -> dict:
    loader = DataLoader()
    rule_engine = RuleEngine()
    plan_item_map = loader.get_plan_item_map(request.plan_id)
    sku_map = loader.get_sku_map()
    warnings = []

    for from_id, to_id in zip(request.current_sequence, request.current_sequence[1:]):
        from_item = plan_item_map[from_id]
        to_item = plan_item_map[to_id]
        result = rule_engine.evaluate_transition(
            sku_map[from_item["sku_id"]],
            sku_map[to_item["sku_id"]],
            from_id,
            to_id,
        )
        if result["warning"]:
            warnings.append(result["warning"])

    return {"violation_count": len(warnings), "warnings": warnings}

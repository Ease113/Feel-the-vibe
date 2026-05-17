"""생산 계획 관련 Pydantic 스키마."""

from pydantic import BaseModel


class PlanItem(BaseModel):
    """daily_plan.csv의 단일 생산 계획 항목."""

    plan_id: str
    plan_item_id: str
    plan_date: str
    sku_id: str
    quantity: float
    package_size: str
    due_priority: int
    line_id: str

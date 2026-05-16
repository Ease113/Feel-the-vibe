from pydantic import BaseModel


class PlanItem(BaseModel):
    plan_id: str
    plan_item_id: str
    plan_date: str
    sku_id: str
    quantity: float
    package_size: str
    due_priority: int
    line_id: str

from pydantic import BaseModel


class PrioritySetting(BaseModel):
    label: str = "NORMAL"
    multiplier: float = 1.0


class CostVector(BaseModel):
    setup_time: float = 0.0
    labor_cost: float = 0.0
    material_loss: float = 0.0
    wash_cost: float = 0.0
    downtime: float = 0.0
    sequence_risk: float = 0.0
    packaging_time: float = 0.0

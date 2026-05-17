"""비용 차원 및 우선순위 설정 Pydantic 스키마."""

from pydantic import BaseModel


class PrioritySetting(BaseModel):
    """단일 비용 차원의 우선순위 레이블과 가중치 배수."""

    label: str = "NORMAL"
    multiplier: float = 1.0


class CostVector(BaseModel):
    """7개 비용 차원의 집계 값을 담는 벡터."""

    setup_time: float = 0.0
    labor_cost: float = 0.0
    material_loss: float = 0.0
    wash_cost: float = 0.0
    downtime: float = 0.0
    sequence_risk: float = 0.0
    packaging_time: float = 0.0

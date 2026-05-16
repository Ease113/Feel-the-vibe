from pydantic import BaseModel


class DashboardSummary(BaseModel):
    decision_count: int
    average_objective_score: float
    high_risk_transition_count: int

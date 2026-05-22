"""대시보드 응답 스키마."""

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    """KPI 요약 지표 (결정 건수, 평균 종합 점수, 고위험 전환 수)."""

    decision_count: int
    average_objective_score: float
    high_risk_transition_count: int

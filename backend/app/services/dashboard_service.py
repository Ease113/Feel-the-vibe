from statistics import mean
from typing import Any

from app.services.decision_logger import DecisionLogger


class DashboardService:
    """Builds KPI dashboard data from saved decision logs."""

    def get_dashboard(self) -> dict[str, Any]:
        decisions = DecisionLogger().list_decisions()
        objective_scores = [
            decision["confirmed_cost"].get("objective_score", 0.0)
            for decision in decisions
        ]
        high_risk_count = sum(
            1
            for decision in decisions
            for warning in decision["violation_details"]
            if warning.get("severity") == "HIGH"
        )
        trend = [
            {
                "decision_id": decision["decision_id"],
                "confirmed_at": decision["confirmed_at"],
                "objective_score": decision["confirmed_cost"].get("objective_score", 0.0),
                "wash_cost": decision["confirmed_cost"].get("aggregated_cost", {}).get("wash_cost", 0.0),
                "sequence_risk": decision["confirmed_cost"].get("aggregated_cost", {}).get("sequence_risk", 0.0),
            }
            for decision in reversed(decisions)
        ]
        recent = [
            {
                "decision_id": decision["decision_id"],
                "plan_id": decision["plan_id"],
                "objective_score": decision["confirmed_cost"].get("objective_score", 0.0),
                "risk_warning_count": len(decision["violation_details"]),
                "reviewed": decision["reviewed"],
                "confirmed_at": decision["confirmed_at"],
            }
            for decision in decisions[:5]
        ]
        return {
            "dashboard_summary": {
                "decision_count": len(decisions),
                "average_objective_score": round(mean(objective_scores), 2) if objective_scores else 0.0,
                "high_risk_transition_count": high_risk_count,
            },
            "kpi_trend": trend,
            "risk_patterns": self._risk_patterns(decisions),
            "recent_decisions": recent,
            "weekly_summary": self._weekly_summary(len(decisions), high_risk_count),
        }

    @staticmethod
    def _risk_patterns(decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        for decision in decisions:
            for warning in decision["violation_details"]:
                rule_id = warning.get("rule_id", "UNKNOWN")
                counts[rule_id] = counts.get(rule_id, 0) + 1
        return [
            {"rule_id": rule_id, "count": count}
            for rule_id, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
        ]

    @staticmethod
    def _weekly_summary(decision_count: int, high_risk_count: int) -> str:
        if decision_count == 0:
            return "아직 저장된 확정 로그가 없습니다. 첫 생산순서를 확정하면 KPI가 생성됩니다."
        return (
            f"이번 기간에는 {decision_count}건의 생산순서 결정이 저장되었고, "
            f"고위험 색상 전환은 {high_risk_count}건 감지되었습니다."
        )

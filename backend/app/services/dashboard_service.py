"""저장된 의사결정 로그를 집계해 KPI 대시보드 데이터를 생성하는 서비스."""

import math
from statistics import mean
from typing import Any

from app.services.decision_logger import DecisionLogger


class DashboardService:
    """Builds KPI dashboard data from saved decision logs."""

    def get_dashboard(
        self,
        recent_page: int = 1,
        recent_page_size: int = 5,
    ) -> dict[str, Any]:
        """저장된 전체 의사결정 로그를 읽어 KPI 집계, 트렌드, 위험 패턴을 반환한다.

        결정 건수가 0일 때도 빈 값으로 안전하게 응답한다.
        recent_decisions는 confirmed_at 내림차순 기준으로 페이지 단위로 잘라 반환한다.

        Args:
            recent_page: 최근 확정 결정 목록 페이지 (1부터 시작).
            recent_page_size: 페이지당 최근 결정 건수.

        Returns:
            dashboard_summary, kpi_trend, risk_patterns, recent_decisions,
            recent_decisions_meta, weekly_summary를 담은 딕셔너리.
        """
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
                **{
                    dim: decision["confirmed_cost"].get("aggregated_cost", {}).get(dim, 0.0)
                    for dim in (
                        "setup_time", "labor_cost", "material_loss",
                        "wash_cost", "downtime", "packaging_time", "sequence_risk",
                    )
                },
            }
            for decision in reversed(decisions)
        ]
        total_recent = len(decisions)
        total_pages = max(1, math.ceil(total_recent / recent_page_size)) if total_recent else 0
        page = min(max(1, recent_page), total_pages) if total_pages else 1
        start = (page - 1) * recent_page_size
        end = start + recent_page_size
        recent = [
            {
                "decision_id": decision["decision_id"],
                "plan_id": decision["plan_id"],
                "objective_score": decision["confirmed_cost"].get("objective_score", 0.0),
                "risk_warning_count": len(decision["violation_details"]),
                "reviewed": decision["reviewed"],
                "confirmed_at": decision["confirmed_at"],
            }
            for decision in decisions[start:end]
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
            "recent_decisions_meta": {
                "page": page,
                "page_size": recent_page_size,
                "total": total_recent,
                "total_pages": total_pages,
            },
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

"""저장된 의사결정 로그를 집계해 KPI 대시보드 데이터를 생성하는 서비스.

`weekly_summary` 한 줄과 `weekly_report` 본문은 본 서비스에서 LLM을 호출하지 않고
`weekly_report_cache` row를 그대로 조회만 한다. 명시 endpoint(``/reports/weekly-summary``,
``/reports/weekly``)가 호출되기 전에는 둘 다 ``None``으로 노출된다(roadmap §13의
"LLM 자동 호출 금지" 정합).
"""

import math
from statistics import mean
from typing import Any

from app.db import weekly_report_repo
from app.services.decision_logger import DecisionLogger
from app.services.weekly_report_service import iso_week_in_progress


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
        `weekly_summary`/`weekly_report`는 `weekly_report_cache`의 캐시 값만 반영하며
        본 서비스 자체는 LLM을 호출하지 않는다.

        Args:
            recent_page: 최근 확정 결정 목록 페이지 (1부터 시작).
            recent_page_size: 페이지당 최근 결정 건수.

        Returns:
            dashboard_summary, kpi_trend, risk_patterns, recent_decisions,
            recent_decisions_meta, weekly_summary, weekly_report를 담은 딕셔너리.
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
        weekly_summary, weekly_report = self._weekly_cache_view()
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
            "weekly_summary": weekly_summary,
            "weekly_report": weekly_report,
        }

    @staticmethod
    def _weekly_cache_view() -> tuple[str | None, dict[str, Any] | None]:
        """현재 진행 중 ISO 주 cache row를 조회해 (한 줄 요약, 본문 dict) 튜플로 반환한다.

        cache가 없으면 (None, None). 한 줄 요약만 있고 본문이 없으면 (str, None).
        본문이 있으면 (str, dict). LLM 호출은 하지 않는다.
        """
        period_start, period_end = iso_week_in_progress()
        row = weekly_report_repo.get_for_period(period_start, period_end)
        if row is None:
            return None, None

        weekly_summary = row.get("llm_summary")
        key_findings = row.get("llm_key_findings")
        recommendations = row.get("llm_recommendations")
        if key_findings is None and recommendations is None:
            return weekly_summary, None

        weekly_report = {
            "period_start": row["period_start"],
            "period_end": row["period_end"],
            "summary": weekly_summary or "",
            "key_findings": key_findings or [],
            "recommendations": recommendations or [],
            "kpi_snapshot": row.get("kpi_snapshot", {}),
            "cost_summary": row.get("cost_summary", {}),
            "risk_summary": row.get("risk_summary", {}),
            "model_version": row["model_version"],
            "prompt_version": row["prompt_version"],
            "generation_mode": row["generation_mode"],
            "generated_at": row["generated_at"],
        }
        return weekly_summary, weekly_report

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

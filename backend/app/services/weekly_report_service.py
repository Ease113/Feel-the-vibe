"""ISO 주 in-progress 기간 계산 + decisions aggregation + LLM 호출 + cache UPSERT."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.core.config import RULE_VERSION
from app.db import weekly_report_repo
from app.services.decision_logger import DecisionLogger
from app.services.llm_client import LLMClient

# KST(UTC+9) 고정. 시연 환경이 한국이라 ISO 주 경계 혼동을 줄이기 위해 명시 지정.
_KST = timezone(timedelta(hours=9))

_DECISION_TYPE = dict[str, Any]


def iso_week_in_progress(reference_date: date | None = None) -> tuple[date, date]:
    """``reference_date``가 포함된 ISO 주의 월요일과 ``reference_date``를 반환한다.

    수요일이면 (월요일, 수요일)로 in-progress 주 범위가 된다. ``reference_date``가
    None이면 KST 기준 오늘을 사용한다.

    Args:
        reference_date: 기준일. None이면 현재 시각의 KST 날짜.

    Returns:
        (period_start, period_end) 튜플. period_end >= period_start, 같은 ISO 주.
    """
    if reference_date is None:
        reference_date = datetime.now(_KST).date()
    monday = reference_date - timedelta(days=reference_date.weekday())
    return monday, reference_date


class WeeklyReportService:
    """주간 요약·보고서 생성을 orchestration한다."""

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        """LLM client를 주입받거나 기본 인스턴스를 생성한다.

        Args:
            llm_client: 테스트에서 mock 주입용. None이면 기본 LLMClient.
        """
        self.llm_client = llm_client or LLMClient()

    def generate_summary(self, reference_date: date | None = None) -> dict[str, Any]:
        """주간 한 줄 요약을 생성·캐시하고 응답 dict를 반환한다.

        Args:
            reference_date: 기준일. None이면 오늘(KST).

        Returns:
            period_start/end, summary, kpi_snapshot, provenance 4종, generated_at.
        """
        period_start, period_end = iso_week_in_progress(reference_date)
        aggregation = self._aggregate(period_start, period_end)
        payload = self._llm_payload(period_start, period_end, aggregation)

        if aggregation["kpi_snapshot"]["decision_count"] == 0:
            content, mode, model_version, prompt_version = self._template_payload(
                "weekly-summary-v1", payload
            )
        else:
            result = self.llm_client.generate("weekly-summary-v1", payload)
            content = result.content
            mode = result.generation_mode
            model_version = result.model_version
            prompt_version = result.prompt_version

        generated_at = datetime.now(timezone.utc).isoformat()
        weekly_report_repo.upsert_summary(
            period_start=period_start,
            period_end=period_end,
            source_decision_ids=aggregation["source_decision_ids"],
            kpi_snapshot=aggregation["kpi_snapshot"],
            cost_summary=aggregation["cost_summary"],
            risk_summary=aggregation["risk_summary"],
            llm_summary=content["summary"],
            prompt_version=prompt_version,
            model_version=model_version,
            rule_version=RULE_VERSION,
            generation_mode=mode,
            generated_at=generated_at,
        )

        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "summary": content["summary"],
            "kpi_snapshot": aggregation["kpi_snapshot"],
            "model_version": model_version,
            "prompt_version": prompt_version,
            "generation_mode": mode,
            "generated_at": generated_at,
        }

    def generate_full_report(self, reference_date: date | None = None) -> dict[str, Any]:
        """주간 보고서 본문(summary + key_findings + recommendations)을 생성·캐시한다."""
        period_start, period_end = iso_week_in_progress(reference_date)
        aggregation = self._aggregate(period_start, period_end)
        payload = self._llm_payload(period_start, period_end, aggregation)

        if aggregation["kpi_snapshot"]["decision_count"] == 0:
            content, mode, model_version, prompt_version = self._template_payload(
                "weekly-report-v1", payload
            )
        else:
            result = self.llm_client.generate("weekly-report-v1", payload)
            content = result.content
            mode = result.generation_mode
            model_version = result.model_version
            prompt_version = result.prompt_version

        generated_at = datetime.now(timezone.utc).isoformat()
        weekly_report_repo.upsert_full_report(
            period_start=period_start,
            period_end=period_end,
            source_decision_ids=aggregation["source_decision_ids"],
            kpi_snapshot=aggregation["kpi_snapshot"],
            cost_summary=aggregation["cost_summary"],
            risk_summary=aggregation["risk_summary"],
            llm_summary=content["summary"],
            llm_key_findings=list(content["key_findings"]),
            llm_recommendations=list(content["recommendations"]),
            prompt_version=prompt_version,
            model_version=model_version,
            rule_version=RULE_VERSION,
            generation_mode=mode,
            generated_at=generated_at,
        )

        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "summary": content["summary"],
            "key_findings": list(content["key_findings"]),
            "recommendations": list(content["recommendations"]),
            "kpi_snapshot": aggregation["kpi_snapshot"],
            "cost_summary": aggregation["cost_summary"],
            "risk_summary": aggregation["risk_summary"],
            "model_version": model_version,
            "prompt_version": prompt_version,
            "generation_mode": mode,
            "generated_at": generated_at,
        }

    # ------------------------------------------------------------------
    # aggregation
    # ------------------------------------------------------------------

    def _aggregate(self, period_start: date, period_end: date) -> dict[str, Any]:
        """기간 내 confirmed decisions를 모아 snapshot 3종을 반환한다."""
        decisions = self._decisions_in_period(period_start, period_end)
        kpi_snapshot = _kpi_snapshot(decisions)
        cost_summary = _cost_summary(decisions)
        risk_summary = _risk_summary(decisions)
        source_ids = [d["decision_id"] for d in decisions]
        return {
            "source_decision_ids": source_ids,
            "kpi_snapshot": kpi_snapshot,
            "cost_summary": cost_summary,
            "risk_summary": risk_summary,
        }

    @staticmethod
    def _decisions_in_period(
        period_start: date, period_end: date
    ) -> list[_DECISION_TYPE]:
        """confirmed_at이 [period_start, period_end] 범위에 속하는 decisions를 반환한다."""
        all_decisions = DecisionLogger().list_decisions()
        return [d for d in all_decisions if _is_in_period(d, period_start, period_end)]

    @staticmethod
    def _llm_payload(
        period_start: date, period_end: date, aggregation: dict[str, Any]
    ) -> dict[str, Any]:
        """LLM prompt 함수 및 template fallback 함수가 공통으로 받는 payload."""
        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "kpi_snapshot": aggregation["kpi_snapshot"],
            "cost_summary": aggregation["cost_summary"],
            "risk_summary": aggregation["risk_summary"],
        }

    @staticmethod
    def _template_payload(
        prompt_id: str, payload: dict[str, Any]
    ) -> tuple[dict[str, Any], str, str, str]:
        """0건 케이스 등 LLM을 건너뛸 때 template fallback을 즉시 호출한다."""
        from app.services.prompts import get_prompt

        prompt = get_prompt(prompt_id)
        content = prompt.template_fallback_fn(payload)
        return content, "template", "template-v1", prompt.prompt_version


# ---------------------------------------------------------------------
# free functions used for aggregation
# ---------------------------------------------------------------------

def _is_in_period(
    decision: _DECISION_TYPE, period_start: date, period_end: date
) -> bool:
    """confirmed_at 문자열을 KST 날짜로 변환해 기간 포함 여부를 판정한다."""
    raw = decision.get("confirmed_at")
    if not raw:
        return False
    try:
        confirmed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return False
    if confirmed.tzinfo is None:
        confirmed = confirmed.replace(tzinfo=timezone.utc)
    confirmed_kst_date = confirmed.astimezone(_KST).date()
    return period_start <= confirmed_kst_date <= period_end


def _kpi_snapshot(decisions: list[_DECISION_TYPE]) -> dict[str, Any]:
    """Decisions 리스트로부터 KPI 3종을 산출한다."""
    if not decisions:
        return {
            "decision_count": 0,
            "average_objective_score": 0.0,
            "high_risk_transition_count": 0,
        }
    scores = [
        d.get("confirmed_cost", {}).get("objective_score", 0.0) for d in decisions
    ]
    high_risk = sum(
        1
        for d in decisions
        for warning in d.get("violation_details", [])
        if warning.get("severity") == "HIGH"
    )
    return {
        "decision_count": len(decisions),
        "average_objective_score": round(sum(scores) / len(decisions), 2),
        "high_risk_transition_count": high_risk,
    }


def _cost_summary(decisions: list[_DECISION_TYPE]) -> dict[str, float]:
    """7차원(6차원 + sequence_risk) 평균 cost를 산출한다."""
    keys = (
        "setup_time",
        "labor_cost",
        "material_loss",
        "wash_cost",
        "downtime",
        "packaging_time",
        "sequence_risk",
    )
    if not decisions:
        return {key: 0.0 for key in keys}
    totals = {key: 0.0 for key in keys}
    for d in decisions:
        aggregated = d.get("confirmed_cost", {}).get("aggregated_cost", {})
        for key in keys:
            totals[key] += float(aggregated.get(key, 0.0))
    return {key: round(totals[key] / len(decisions), 2) for key in keys}


def _risk_summary(decisions: list[_DECISION_TYPE]) -> dict[str, int]:
    """rule_id별 발생 카운트를 반환한다."""
    counts: dict[str, int] = {}
    for d in decisions:
        for warning in d.get("violation_details", []):
            rule_id = warning.get("rule_id") or "UNKNOWN"
            counts[rule_id] = counts.get(rule_id, 0) + 1
    return counts

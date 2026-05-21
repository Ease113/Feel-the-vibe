"""LLM 호출지점별 prompt 정의와 template fallback 함수 레지스트리.

`PROMPT_REGISTRY`에 등록된 prompt_id를 LLMClient가 조회해 다음을 사용한다:

- ``system_prompt`` / ``user_prompt_fn``: LLM 호출용 문안 생성
- ``output_schema``: JSON 응답 키 검증
- ``template_fallback_fn``: LLM 실패 시 동일 payload로부터 합성하는 한국어 응답
- ``prompt_version``: cache provenance 기록용
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class PromptDef:
    """단일 prompt_id의 LLM/template 메타데이터."""

    prompt_id: str
    prompt_version: str
    system_prompt: str
    user_prompt_fn: Callable[[dict[str, Any]], str]
    output_schema: dict[str, type]
    template_fallback_fn: Callable[[dict[str, Any]], dict[str, Any]]


# -------------------------------------------------------------------
# explain-v1 — workbench AI 요약
# -------------------------------------------------------------------

def _explain_user_prompt(payload: dict[str, Any]) -> str:
    """`/explain` 호출 payload를 Gemini용 user prompt 한 덩어리로 직렬화한다."""
    comparison = payload.get("comparison_state", {})
    warnings = payload.get("risk_warnings", [])
    summary = payload.get("comparison_summary", "")
    priority = payload.get("priority_profile", {})
    return (
        "다음 비교 결과와 색상 전환 경고를 검토하고, 운영자에게 보낼 한국어 요약 1~3문장을 "
        "작성해 주세요.\n\n"
        f"비교 요약: {summary}\n"
        f"comparison_state: {comparison}\n"
        f"risk_warnings: {warnings}\n"
        f"priority_profile: {priority}\n\n"
        '응답은 JSON 형식 {"explanation": "..."} 하나만 반환합니다.'
    )


def _explain_template_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """`/explain` LLM 실패 시 사용하는 기존 template 로직과 동일한 응답."""
    warnings = payload.get("risk_warnings", [])
    comparison = payload.get("comparison_state", {})
    priority = payload.get("priority_profile", {})

    lines: list[str] = []
    objective_delta = comparison.get("objective_delta")
    if objective_delta is not None:
        if objective_delta > 0:
            lines.append(f"현재 순서는 추천안보다 목적 점수가 {objective_delta:.2f} 높습니다.")
        elif objective_delta < 0:
            lines.append(
                f"현재 순서는 추천안보다 목적 점수가 {abs(objective_delta):.2f} 낮습니다."
            )
        else:
            lines.append("현재 순서는 추천안과 목적 점수가 동일합니다.")

    high_warning = next(
        (warning for warning in warnings if warning.get("severity") == "HIGH"),
        None,
    )
    if high_warning:
        lines.append(high_warning.get("message", "고위험 전환이 감지되었습니다."))
    elif warnings:
        lines.append("일부 색상 전환 구간에서 세척 확인이 필요한 warning이 감지되었습니다.")

    priorities = priority.get("priorities", priority) if isinstance(priority, dict) else {}
    wash_priority = priorities.get("wash_cost", {}) if isinstance(priorities, dict) else {}
    wash_label = wash_priority.get("label") if isinstance(wash_priority, dict) else wash_priority
    if wash_label in {"HIGH", "VERY_HIGH"}:
        lines.append(
            "세척 비용 우선순위가 높게 설정되어 유사 색상군을 연속 배치하는 방향이 유리합니다."
        )

    if not lines:
        lines.append("현재 순서는 큰 색상 전환 리스크 없이 안정적인 기준으로 평가되었습니다.")
    return {"explanation": " ".join(lines)}


# -------------------------------------------------------------------
# weekly-summary-v1 — dashboard 한 줄 요약
# -------------------------------------------------------------------

def _weekly_summary_user_prompt(payload: dict[str, Any]) -> str:
    """주간 한 줄 요약 prompt — KPI snapshot을 그대로 전달한다."""
    snapshot = payload.get("kpi_snapshot", {})
    risk = payload.get("risk_summary", {})
    period = (
        f"{payload.get('period_start', '?')} ~ {payload.get('period_end', '?')}"
    )
    return (
        "다음 주간 운영 KPI를 한 줄 요약(최대 200자)으로 작성해 주세요. "
        "운영자에게 즉시 가독성 있는 문장이어야 합니다.\n\n"
        f"기간: {period}\n"
        f"kpi_snapshot: {snapshot}\n"
        f"risk_summary: {risk}\n\n"
        '응답은 JSON 형식 {"summary": "..."} 하나만 반환합니다.'
    )


def _weekly_summary_template_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """주간 한 줄 요약 template fallback."""
    snapshot = payload.get("kpi_snapshot", {})
    count = snapshot.get("decision_count", 0)
    if count == 0:
        return {
            "summary": (
                "이번 주에는 아직 저장된 확정 결정이 없습니다. 첫 확정 후 KPI가 갱신됩니다."
            )
        }
    high = snapshot.get("high_risk_transition_count", 0)
    avg = snapshot.get("average_objective_score", 0.0)
    return {
        "summary": (
            f"이번 주 {count}건의 결정이 저장되었고 평균 목적 점수는 {avg:.2f}입니다. "
            f"고위험 색상 전환은 {high}건 감지되었습니다."
        )
    }


# -------------------------------------------------------------------
# weekly-report-v1 — 주간 보고서 본문(3면)
# -------------------------------------------------------------------

def _weekly_report_user_prompt(payload: dict[str, Any]) -> str:
    """주간 보고서 prompt — KPI/cost/risk snapshot 3종 모두 전달한다."""
    return (
        "다음 주간 운영 데이터를 바탕으로 한국어 보고서 본문을 작성해 주세요. "
        "summary는 3~5문장, key_findings와 recommendations는 각각 3~5건의 짧은 문장 리스트.\n\n"
        f"기간: {payload.get('period_start', '?')} ~ {payload.get('period_end', '?')}\n"
        f"kpi_snapshot: {payload.get('kpi_snapshot', {})}\n"
        f"cost_summary: {payload.get('cost_summary', {})}\n"
        f"risk_summary: {payload.get('risk_summary', {})}\n\n"
        "응답은 JSON 형식 "
        '{"summary": "...", "key_findings": ["..."], "recommendations": ["..."]} '
        "하나만 반환합니다."
    )


def _weekly_report_template_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """주간 보고서 template fallback — snapshot을 그대로 문장화한다."""
    snapshot = payload.get("kpi_snapshot", {})
    cost = payload.get("cost_summary", {})
    risk = payload.get("risk_summary", {})
    count = snapshot.get("decision_count", 0)

    if count == 0:
        return {
            "summary": "이번 주에는 확정된 결정이 없어 KPI를 산출할 수 없습니다.",
            "key_findings": [],
            "recommendations": [
                "최소 1건의 생산순서를 확정한 뒤 보고서를 재생성해 주세요.",
            ],
        }

    high = snapshot.get("high_risk_transition_count", 0)
    avg = snapshot.get("average_objective_score", 0.0)
    top_risk = sorted(risk.items(), key=lambda item: item[1], reverse=True)[:3]
    findings: list[str] = [
        f"이번 주 {count}건의 결정이 확정되었고 평균 목적 점수는 {avg:.2f}입니다.",
    ]
    if high > 0:
        findings.append(f"고위험 색상 전환이 {high}건 감지되었습니다.")
    if top_risk:
        findings.append(
            "가장 자주 발생한 규칙: " + ", ".join(f"{rid}({cnt})" for rid, cnt in top_risk)
        )

    recommendations = [
        "유사 색상군을 연속 배치해 세척 비용을 절감해 보세요.",
        "고위험 전환 구간은 작업 시작 전 추가 점검 절차를 적용해 보세요.",
    ]
    if cost.get("wash_cost"):
        recommendations.append(
            f"평균 세척 비용 {cost['wash_cost']:.2f} 기준 우선순위 슬라이더를 점검해 보세요."
        )

    return {
        "summary": (
            f"이번 주 {count}건의 결정이 확정되었고 평균 목적 점수는 {avg:.2f}, "
            f"고위험 전환은 {high}건입니다. 세부 발견과 권장 사항은 아래를 참고해 주세요."
        ),
        "key_findings": findings,
        "recommendations": recommendations,
    }


# -------------------------------------------------------------------
# Registry
# -------------------------------------------------------------------

PROMPT_REGISTRY: dict[str, PromptDef] = {
    "explain-v1": PromptDef(
        prompt_id="explain-v1",
        prompt_version="explain-v1",
        system_prompt=(
            "당신은 도료 제조 공장의 생산순서 결정을 검토하는 운영 분석가입니다. "
            "반드시 JSON으로만 응답하세요."
        ),
        user_prompt_fn=_explain_user_prompt,
        output_schema={"explanation": str},
        template_fallback_fn=_explain_template_fallback,
    ),
    "weekly-summary-v1": PromptDef(
        prompt_id="weekly-summary-v1",
        prompt_version="weekly-summary-v1",
        system_prompt=(
            "당신은 주간 운영 KPI를 한 문장으로 요약하는 분석가입니다. JSON으로만 응답하세요."
        ),
        user_prompt_fn=_weekly_summary_user_prompt,
        output_schema={"summary": str},
        template_fallback_fn=_weekly_summary_template_fallback,
    ),
    "weekly-report-v1": PromptDef(
        prompt_id="weekly-report-v1",
        prompt_version="weekly-report-v1",
        system_prompt=(
            "당신은 주간 운영 보고서를 작성하는 도료 제조 운영 분석가입니다. "
            "summary/key_findings/recommendations 키만 포함한 JSON으로 응답하세요."
        ),
        user_prompt_fn=_weekly_report_user_prompt,
        output_schema={
            "summary": str,
            "key_findings": list,
            "recommendations": list,
        },
        template_fallback_fn=_weekly_report_template_fallback,
    ),
}


def get_prompt(prompt_id: str) -> PromptDef:
    """등록된 prompt_id에 대응하는 PromptDef를 반환한다.

    Args:
        prompt_id: PROMPT_REGISTRY에 등록된 식별자.

    Returns:
        해당 PromptDef.

    Raises:
        KeyError: 등록되지 않은 prompt_id가 전달된 경우 (caller 버그).
    """
    if prompt_id not in PROMPT_REGISTRY:
        raise KeyError(f"Unknown prompt_id: {prompt_id}")
    return PROMPT_REGISTRY[prompt_id]

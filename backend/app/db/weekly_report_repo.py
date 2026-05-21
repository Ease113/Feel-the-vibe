"""weekly_report_cache 테이블에 대한 UPSERT/SELECT helper."""

from __future__ import annotations

import json
import uuid
from datetime import date
from typing import Any

from app.db.sqlite import get_connection, initialize_database


def upsert_summary(
    *,
    period_start: date,
    period_end: date,
    source_decision_ids: list[str],
    kpi_snapshot: dict[str, Any],
    cost_summary: dict[str, Any],
    risk_summary: dict[str, Any],
    llm_summary: str,
    prompt_version: str,
    model_version: str,
    rule_version: str,
    generation_mode: str,
    generated_at: str,
) -> dict[str, Any]:
    """주간 한 줄 요약을 UPSERT한다. 본문(key_findings/recommendations)은 보존한다.

    Args:
        period_start: ISO 주 월요일.
        period_end: 보고 기준일.
        source_decision_ids: 집계에 포함된 decision_id 목록.
        kpi_snapshot: decision_count/average_objective_score/high_risk_transition_count.
        cost_summary: 7차원 평균 cost.
        risk_summary: rule_id별 카운트.
        llm_summary: LLM 또는 template이 생성한 한 줄 요약.
        prompt_version: 호출 시점 prompt 버전.
        model_version: 사용된 모델 식별자.
        rule_version: aggregation에 사용된 rule engine 버전.
        generation_mode: "gemini" / "cli" / "template" 중 하나.
        generated_at: UPSERT 시점 ISO datetime.

    Returns:
        저장된 row의 dict 표현.
    """
    initialize_database()
    return _upsert(
        period_start=period_start,
        period_end=period_end,
        source_decision_ids=source_decision_ids,
        kpi_snapshot=kpi_snapshot,
        cost_summary=cost_summary,
        risk_summary=risk_summary,
        llm_summary=llm_summary,
        llm_key_findings=None,
        llm_recommendations=None,
        prompt_version=prompt_version,
        model_version=model_version,
        rule_version=rule_version,
        generation_mode=generation_mode,
        generated_at=generated_at,
        only_summary=True,
    )


def upsert_full_report(
    *,
    period_start: date,
    period_end: date,
    source_decision_ids: list[str],
    kpi_snapshot: dict[str, Any],
    cost_summary: dict[str, Any],
    risk_summary: dict[str, Any],
    llm_summary: str,
    llm_key_findings: list[str],
    llm_recommendations: list[str],
    prompt_version: str,
    model_version: str,
    rule_version: str,
    generation_mode: str,
    generated_at: str,
) -> dict[str, Any]:
    """주간 보고서 본문 3면을 UPSERT한다."""
    initialize_database()
    return _upsert(
        period_start=period_start,
        period_end=period_end,
        source_decision_ids=source_decision_ids,
        kpi_snapshot=kpi_snapshot,
        cost_summary=cost_summary,
        risk_summary=risk_summary,
        llm_summary=llm_summary,
        llm_key_findings=llm_key_findings,
        llm_recommendations=llm_recommendations,
        prompt_version=prompt_version,
        model_version=model_version,
        rule_version=rule_version,
        generation_mode=generation_mode,
        generated_at=generated_at,
        only_summary=False,
    )


def get_for_period(period_start: date, period_end: date) -> dict[str, Any] | None:
    """``(period_start, period_end)`` 정확히 일치하는 row 1건을 반환한다.

    Args:
        period_start: ISO date.
        period_end: ISO date.

    Returns:
        없으면 None. 있으면 JSON 컬럼들이 dict/list로 deserialize된 dict.
    """
    initialize_database()
    with get_connection() as connection:
        row = connection.execute(
            (
                "SELECT * FROM weekly_report_cache "
                "WHERE period_start = ? AND period_end = ? "
                "ORDER BY generated_at DESC LIMIT 1"
            ),
            (period_start.isoformat(), period_end.isoformat()),
        ).fetchone()
    if row is None:
        return None
    return _row_to_dict(row)


def get_latest() -> dict[str, Any] | None:
    """가장 최근 generated_at의 row 1건을 반환한다."""
    initialize_database()
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM weekly_report_cache ORDER BY generated_at DESC LIMIT 1"
        ).fetchone()
    if row is None:
        return None
    return _row_to_dict(row)


# ---------------------------------------------------------------------
# internals
# ---------------------------------------------------------------------

def _upsert(
    *,
    period_start: date,
    period_end: date,
    source_decision_ids: list[str],
    kpi_snapshot: dict[str, Any],
    cost_summary: dict[str, Any],
    risk_summary: dict[str, Any],
    llm_summary: str,
    llm_key_findings: list[str] | None,
    llm_recommendations: list[str] | None,
    prompt_version: str,
    model_version: str,
    rule_version: str,
    generation_mode: str,
    generated_at: str,
    only_summary: bool,
) -> dict[str, Any]:
    """`(period_start, period_end)` 기준 단일 row UPSERT.

    `only_summary=True`이면 본문 컬럼(key_findings/recommendations)을 변경하지 않는다.
    """
    with get_connection() as connection:
        existing = connection.execute(
            (
                "SELECT report_id FROM weekly_report_cache "
                "WHERE period_start = ? AND period_end = ? LIMIT 1"
            ),
            (period_start.isoformat(), period_end.isoformat()),
        ).fetchone()

        if existing is None:
            report_id = f"WR-{uuid.uuid4().hex[:12].upper()}"
            connection.execute(
                (
                    "INSERT INTO weekly_report_cache ("
                    "report_id, period_start, period_end, source_decision_ids, "
                    "kpi_snapshot, cost_summary, risk_summary, llm_summary, "
                    "llm_key_findings, llm_recommendations, "
                    "prompt_version, model_version, rule_version, "
                    "generation_mode, generated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ),
                (
                    report_id,
                    period_start.isoformat(),
                    period_end.isoformat(),
                    json.dumps(source_decision_ids, ensure_ascii=False),
                    json.dumps(kpi_snapshot, ensure_ascii=False),
                    json.dumps(cost_summary, ensure_ascii=False),
                    json.dumps(risk_summary, ensure_ascii=False),
                    llm_summary,
                    json.dumps(llm_key_findings, ensure_ascii=False) if llm_key_findings is not None else None,
                    json.dumps(llm_recommendations, ensure_ascii=False) if llm_recommendations is not None else None,
                    prompt_version,
                    model_version,
                    rule_version,
                    generation_mode,
                    generated_at,
                ),
            )
        else:
            if only_summary:
                connection.execute(
                    (
                        "UPDATE weekly_report_cache SET "
                        "source_decision_ids = ?, kpi_snapshot = ?, "
                        "cost_summary = ?, risk_summary = ?, llm_summary = ?, "
                        "prompt_version = ?, model_version = ?, rule_version = ?, "
                        "generation_mode = ?, generated_at = ? "
                        "WHERE period_start = ? AND period_end = ?"
                    ),
                    (
                        json.dumps(source_decision_ids, ensure_ascii=False),
                        json.dumps(kpi_snapshot, ensure_ascii=False),
                        json.dumps(cost_summary, ensure_ascii=False),
                        json.dumps(risk_summary, ensure_ascii=False),
                        llm_summary,
                        prompt_version,
                        model_version,
                        rule_version,
                        generation_mode,
                        generated_at,
                        period_start.isoformat(),
                        period_end.isoformat(),
                    ),
                )
            else:
                connection.execute(
                    (
                        "UPDATE weekly_report_cache SET "
                        "source_decision_ids = ?, kpi_snapshot = ?, "
                        "cost_summary = ?, risk_summary = ?, llm_summary = ?, "
                        "llm_key_findings = ?, llm_recommendations = ?, "
                        "prompt_version = ?, model_version = ?, rule_version = ?, "
                        "generation_mode = ?, generated_at = ? "
                        "WHERE period_start = ? AND period_end = ?"
                    ),
                    (
                        json.dumps(source_decision_ids, ensure_ascii=False),
                        json.dumps(kpi_snapshot, ensure_ascii=False),
                        json.dumps(cost_summary, ensure_ascii=False),
                        json.dumps(risk_summary, ensure_ascii=False),
                        llm_summary,
                        json.dumps(llm_key_findings, ensure_ascii=False),
                        json.dumps(llm_recommendations, ensure_ascii=False),
                        prompt_version,
                        model_version,
                        rule_version,
                        generation_mode,
                        generated_at,
                        period_start.isoformat(),
                        period_end.isoformat(),
                    ),
                )

        connection.commit()

    fetched = get_for_period(period_start, period_end)
    assert fetched is not None  # 방금 UPSERT한 row는 반드시 존재
    return fetched


def _row_to_dict(row: Any) -> dict[str, Any]:
    """sqlite3.Row를 JSON 컬럼 deserialize 포함한 dict로 변환한다."""
    return {
        "report_id": row["report_id"],
        "period_start": row["period_start"],
        "period_end": row["period_end"],
        "source_decision_ids": json.loads(row["source_decision_ids"] or "[]"),
        "kpi_snapshot": json.loads(row["kpi_snapshot"] or "{}"),
        "cost_summary": json.loads(row["cost_summary"] or "{}"),
        "risk_summary": json.loads(row["risk_summary"] or "{}"),
        "llm_summary": row["llm_summary"],
        "llm_key_findings": json.loads(row["llm_key_findings"]) if row["llm_key_findings"] else None,
        "llm_recommendations": (
            json.loads(row["llm_recommendations"]) if row["llm_recommendations"] else None
        ),
        "prompt_version": row["prompt_version"],
        "model_version": row["model_version"],
        "rule_version": row["rule_version"],
        "generation_mode": row["generation_mode"],
        "generated_at": row["generated_at"],
    }

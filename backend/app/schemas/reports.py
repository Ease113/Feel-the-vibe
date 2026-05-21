"""POST /reports/* 응답 및 /dashboard.weekly_report 본문 스키마."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class WeeklyKpiSnapshot(BaseModel):
    """주간 KPI 3종 요약 — decision_count, average_objective_score, high_risk_transition_count."""

    decision_count: int
    average_objective_score: float
    high_risk_transition_count: int


class WeeklySummaryResponse(BaseModel):
    """POST /reports/weekly-summary 응답 — 한 줄 요약과 provenance만 동봉한다."""

    period_start: str
    period_end: str
    summary: str
    kpi_snapshot: WeeklyKpiSnapshot
    model_version: str
    prompt_version: str
    generation_mode: Literal["gemini", "cli", "template"]
    generated_at: str


class WeeklyReportResponse(BaseModel):
    """POST /reports/weekly 응답 — summary + key_findings + recommendations 3면."""

    period_start: str
    period_end: str
    summary: str
    key_findings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    kpi_snapshot: WeeklyKpiSnapshot
    cost_summary: dict[str, float]
    risk_summary: dict[str, int]
    model_version: str
    prompt_version: str
    generation_mode: Literal["gemini", "cli", "template"]
    generated_at: str


class WeeklyReportPayload(BaseModel):
    """GET /dashboard.weekly_report 응답 본문 (cache row 1건의 가공된 형태)."""

    period_start: str
    period_end: str
    summary: str
    key_findings: list[str] | None = None
    recommendations: list[str] | None = None
    kpi_snapshot: dict[str, Any]
    cost_summary: dict[str, Any]
    risk_summary: dict[str, Any]
    model_version: str
    prompt_version: str
    generation_mode: Literal["gemini", "cli", "template"]
    generated_at: str

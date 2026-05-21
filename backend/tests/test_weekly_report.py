"""주간 보고서 backend 회귀 테스트.

- iso_week_in_progress: 월/수/일 경계 케이스
- aggregation: 0건 / 다건 케이스
- cache UPSERT: weekly-summary → weekly 순으로 같은 row에 누적
- POST /reports/* smoke
- /dashboard cache 조회: 호출 후 weekly_report 본문 존재, 미호출 시 null
- /dashboard LLM 자동 호출 없음
"""

from __future__ import annotations

from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import SQLITE_PATH
from app.db import weekly_report_repo
from app.db.sqlite import initialize_database
from app.main import app
from app.services.weekly_report_service import (
    WeeklyReportService,
    iso_week_in_progress,
)

client = TestClient(app)


# ---------------------------------------------------------------------
# iso_week_in_progress
# ---------------------------------------------------------------------

def test_iso_week_in_progress_wednesday():
    """수요일 기준이면 (월, 수)."""
    wed = date(2026, 5, 20)  # 수요일
    start, end = iso_week_in_progress(wed)
    assert start == date(2026, 5, 18)
    assert end == wed


def test_iso_week_in_progress_monday():
    """월요일 기준이면 (월, 월) — 같은 날짜."""
    mon = date(2026, 5, 18)
    start, end = iso_week_in_progress(mon)
    assert start == mon
    assert end == mon


def test_iso_week_in_progress_sunday():
    """일요일 기준이면 (월, 일) — ISO 주 마지막 날."""
    sun = date(2026, 5, 24)
    start, end = iso_week_in_progress(sun)
    assert start == date(2026, 5, 18)
    assert end == sun


# ---------------------------------------------------------------------
# 0건 케이스 + cache UPSERT
# ---------------------------------------------------------------------

def _seed_clean_db() -> None:
    SQLITE_PATH.unlink(missing_ok=True)
    initialize_database()


def test_generate_summary_zero_decisions_uses_template_and_writes_cache():
    """이번 주 decisions가 0건이면 LLM을 호출하지 않고 template으로 채워 cache에 저장한다."""
    _seed_clean_db()
    service = WeeklyReportService()

    result = service.generate_summary()

    assert result["generation_mode"] == "template"
    assert result["kpi_snapshot"]["decision_count"] == 0
    assert "결정이 없습니다" in result["summary"]

    period_start, period_end = iso_week_in_progress()
    row = weekly_report_repo.get_for_period(period_start, period_end)
    assert row is not None
    assert row["llm_summary"] == result["summary"]
    assert row["llm_key_findings"] is None  # weekly-summary만 호출했으므로 본문 없음.


def test_upsert_preserves_other_columns_when_summary_then_full_report():
    """weekly-summary 호출 후 weekly 호출 → row 1개 유지, 본문 3컬럼 모두 채워짐."""
    _seed_clean_db()
    service = WeeklyReportService()

    service.generate_summary()
    service.generate_full_report()

    period_start, period_end = iso_week_in_progress()
    row = weekly_report_repo.get_for_period(period_start, period_end)
    assert row is not None
    assert row["llm_summary"]
    assert row["llm_key_findings"] is not None
    assert row["llm_recommendations"] is not None


# ---------------------------------------------------------------------
# Routes smoke
# ---------------------------------------------------------------------

def test_post_reports_weekly_summary_smoke():
    """POST /reports/weekly-summary 200 + cache row 1건."""
    _seed_clean_db()
    response = client.post("/reports/weekly-summary")
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] in {"gemini", "cli", "template"}
    assert body["prompt_version"] == "weekly-summary-v1"
    period_start, period_end = iso_week_in_progress()
    cached = weekly_report_repo.get_for_period(period_start, period_end)
    assert cached is not None


def test_post_reports_weekly_smoke_with_decisions():
    """seed decisions 후 POST /reports/weekly → 200 + 본문 3면 + cache 적재."""
    _seed_clean_db()
    decision_payload = {
        "plan_id": "demo-plan-001",
        "recommended_sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
        "confirmed_sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
        "priority_profile": {},
    }
    for _ in range(2):
        assert client.post("/decisions", json=decision_payload).status_code == 200

    response = client.post("/reports/weekly")
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]
    assert isinstance(body["key_findings"], list)
    assert isinstance(body["recommendations"], list)
    assert body["kpi_snapshot"]["decision_count"] >= 2


# ---------------------------------------------------------------------
# /dashboard cache 노출
# ---------------------------------------------------------------------

def test_dashboard_reflects_weekly_report_cache_after_post():
    """POST /reports/weekly 호출 후 /dashboard.weekly_report 본문이 노출된다."""
    _seed_clean_db()
    client.post("/reports/weekly")

    dashboard = client.get("/dashboard")
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["weekly_report"] is not None
    assert "summary" in body["weekly_report"]
    assert body["weekly_summary"] is not None


def test_dashboard_returns_null_weekly_when_no_cache():
    """cache 미생성 상태에서 /dashboard는 weekly_summary/weekly_report 모두 null을 반환한다."""
    _seed_clean_db()

    dashboard = client.get("/dashboard")
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["weekly_summary"] is None
    assert body["weekly_report"] is None


def test_dashboard_does_not_call_llm():
    """/dashboard 경로에서는 LLMClient.generate가 호출되지 않는다 (자동 호출 금지)."""
    _seed_clean_db()
    # 사전에 캐시 한 번 생성(이때는 LLM 호출 허용).
    client.post("/reports/weekly")

    with patch("app.services.llm_client.LLMClient.generate") as mock_generate:
        response = client.get("/dashboard")
    assert response.status_code == 200
    assert mock_generate.call_count == 0

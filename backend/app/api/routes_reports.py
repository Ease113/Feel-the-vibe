"""주간 보고서 명시 생성 라우터.

자동 호출 금지 원칙(roadmap §13)에 따라 각 엔드포인트는 프론트 명시 버튼에서만 호출된다.
"""

from fastapi import APIRouter

from app.schemas.reports import WeeklyReportResponse, WeeklySummaryResponse
from app.services.weekly_report_service import WeeklyReportService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/weekly-summary", response_model=WeeklySummaryResponse)
def post_weekly_summary() -> WeeklySummaryResponse:
    """현재 진행 중인 ISO 주(월요일~오늘)의 한 줄 요약을 LLM/template으로 생성·캐시한다."""
    return WeeklySummaryResponse.model_validate(WeeklyReportService().generate_summary())


@router.post("/weekly", response_model=WeeklyReportResponse)
def post_weekly_report() -> WeeklyReportResponse:
    """현재 진행 중인 ISO 주의 본문(summary + key_findings + recommendations)을 생성·캐시한다."""
    return WeeklyReportResponse.model_validate(WeeklyReportService().generate_full_report())

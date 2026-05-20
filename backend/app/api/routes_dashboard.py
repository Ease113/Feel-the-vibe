"""KPI 대시보드 조회 라우터."""

from fastapi import APIRouter, Query

from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(
    recent_page: int = Query(1, ge=1, description="최근 확정 결정 목록 페이지 (1부터)"),
    recent_page_size: int = Query(5, ge=1, le=50, description="최근 확정 결정 페이지당 건수"),
) -> dict:
    """저장된 의사결정 로그를 집계해 KPI 요약, 트렌드, 위험 패턴을 반환한다."""
    return DashboardService().get_dashboard(
        recent_page=recent_page,
        recent_page_size=recent_page_size,
    )

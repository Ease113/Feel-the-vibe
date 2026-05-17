"""KPI 대시보드 조회 라우터."""

from fastapi import APIRouter

from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard() -> dict:
    """저장된 의사결정 로그를 집계해 KPI 요약, 트렌드, 위험 패턴을 반환한다."""
    return DashboardService().get_dashboard()

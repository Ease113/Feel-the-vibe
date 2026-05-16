from fastapi import APIRouter

from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard() -> dict:
    return DashboardService().get_dashboard()

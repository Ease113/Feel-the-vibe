"""FastAPI 애플리케이션 팩토리 및 진입점."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    routes_dashboard,
    routes_decisions,
    routes_explain,
    routes_health,
    routes_optimize,
    routes_plans,
    routes_predict,
    routes_reports,
    routes_validate,
)
from app.db.sqlite import initialize_database


def create_app() -> FastAPI:
    """CORS 설정과 모든 라우터를 포함한 FastAPI 인스턴스를 생성하고 반환한다.

    Returns:
        시작 시 DB를 초기화하는 이벤트 핸들러가 등록된 FastAPI 앱 인스턴스.
    """
    app = FastAPI(title="SmartFactoryV2 API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(routes_health.router)
    app.include_router(routes_plans.router)
    app.include_router(routes_optimize.router)
    app.include_router(routes_predict.router)
    app.include_router(routes_validate.router)
    app.include_router(routes_decisions.router)
    app.include_router(routes_dashboard.router)
    app.include_router(routes_explain.router)
    app.include_router(routes_reports.router)

    @app.on_event("startup")
    def startup() -> None:
        """앱 기동 시 SQLite 스키마를 초기화한다."""
        initialize_database()

    return app


app = create_app()

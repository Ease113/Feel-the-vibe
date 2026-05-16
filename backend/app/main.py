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
    routes_validate,
)
from app.db.sqlite import initialize_database


def create_app() -> FastAPI:
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

    @app.on_event("startup")
    def startup() -> None:
        initialize_database()

    return app


app = create_app()

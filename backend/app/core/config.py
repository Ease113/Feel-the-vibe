"""프로젝트 전역 경로 상수 및 버전 식별자."""

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = APP_DIR.parents[0]
PROJECT_ROOT = BACKEND_DIR.parents[0]

DATA_RAW_DIR = APP_DIR / "data" / "raw"
# SMARTFACTORY_MODEL_DIR로 오버라이드 가능 — XGBoost 모델 파일 경로. 테스트에서 빈 디렉토리를
# 가리키게 하면 CostPredictor가 heuristic으로 자동 fallback 한다.
DATA_MODEL_DIR = Path(
    os.environ.get("SMARTFACTORY_MODEL_DIR", APP_DIR / "data" / "models")
)
# SMARTFACTORY_DB_PATH로 오버라이드 가능 — 테스트 격리와 CI 배포 경로 분리용.
SQLITE_PATH = Path(
    os.environ.get("SMARTFACTORY_DB_PATH", APP_DIR / "data" / "smartfactory.sqlite3")
)
SCHEMA_PATH = APP_DIR / "db" / "schema.sql"

MODEL_VERSION = "heuristic-v1"
RULE_VERSION = "rules-2026.05.v1"

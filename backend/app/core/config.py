"""프로젝트 전역 경로 상수 및 버전 식별자."""

from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = APP_DIR.parents[0]
PROJECT_ROOT = BACKEND_DIR.parents[0]

DATA_RAW_DIR = APP_DIR / "data" / "raw"
DATA_MODEL_DIR = APP_DIR / "data" / "models"
SQLITE_PATH = APP_DIR / "data" / "smartfactory.sqlite3"
SCHEMA_PATH = APP_DIR / "db" / "schema.sql"

MODEL_VERSION = "heuristic-v1"
RULE_VERSION = "rules-2026.05.v1"

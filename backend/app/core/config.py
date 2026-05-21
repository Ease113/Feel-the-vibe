"""프로젝트 전역 경로 상수 및 버전 식별자."""

import os
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = APP_DIR.parents[0]
PROJECT_ROOT = BACKEND_DIR.parents[0]

# `backend/.env`를 로드한다. 이미 설정된 env var는 override 하지 않는다 — 테스트
# (conftest.py)가 미리 세팅한 값을 보존하기 위함. uvicorn 자체는 .env를 자동 로드하지
# 않으므로 본 모듈 import 시점에 명시적으로 처리한다.
load_dotenv(dotenv_path=BACKEND_DIR / ".env", override=False)

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

# LLM client settings. 모두 미설정 가능하며 graceful degradation으로 동작한다.
# 평문 API key는 코드/문서에 남기지 않는다 — `.env`로만 관리.
LLM_API_KEY = (os.environ.get("SMARTFACTORY_LLM_API_KEY") or "").strip() or None
LLM_MODEL = os.environ.get("SMARTFACTORY_LLM_MODEL", "gemini-flash-latest")
LLM_TIMEOUT_SEC = float(os.environ.get("SMARTFACTORY_LLM_TIMEOUT_SEC", "10"))
LLM_CLI_TIMEOUT_SEC = float(os.environ.get("SMARTFACTORY_LLM_CLI_TIMEOUT_SEC", "15"))

#!/usr/bin/env bash
# SmartFactoryV2 통합 실행기.
# venv 준비 → 합성 데이터 → XGBoost 학습 → backend/frontend 동시 기동까지 한 번에 처리한다.
# 두 서버는 백그라운드에서 병렬 실행되며 Ctrl+C 한 번으로 함께 종료된다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FRESH=0
RETRAIN=0
NO_TRAIN=0

for arg in "$@"; do
  case "$arg" in
    --fresh)    FRESH=1 ;;
    --retrain)  RETRAIN=1 ;;
    --no-train) NO_TRAIN=1 ;;
    -h|--help)
      cat <<USAGE
사용: ./run.sh [옵션]

옵션:
  --fresh      합성 데이터를 재생성합니다 (기본: 기존 데이터 유지)
  --retrain    XGBoost 모델 6개를 다시 학습합니다 (기본: 모델 파일이 있으면 skip)
  --no-train   학습 단계를 건너뜁니다 (heuristic fallback로 동작)
  -h, --help   이 도움말을 표시합니다

수행 단계:
  1) backend/.venv 생성 및 활성화 (없을 때만)
  2) backend 의존성 설치 (pip install -e backend)
  3) backend/.env 준비 (없으면 .env.example 복사)
  4) 합성 데이터 생성 (scripts/seed_data.py)
  5) XGBoost 모델 학습 (필요할 때만)
  6) FastAPI 서버 기동  → http://localhost:8000
  7) Vite dev server 기동 → http://localhost:5173

두 서버는 병렬로 실행되며, Ctrl+C 한 번으로 함께 종료됩니다.
USAGE
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $arg" >&2
      echo "도움말: ./run.sh --help" >&2
      exit 1
      ;;
  esac
done

log() { printf '\033[1;36m[run]\033[0m %s\n' "$*"; }

# 1) venv
if [ ! -d backend/.venv ]; then
  log "backend 가상환경 생성: backend/.venv"
  python3 -m venv backend/.venv
fi
# shellcheck disable=SC1091
source backend/.venv/bin/activate

# 2) backend 의존성. 이미 설치되어 있어도 비용이 작아 매번 실행한다.
log "backend 의존성 확인 (pip install -e backend)"
pip install -q -e backend

# 3) .env
if [ ! -f backend/.env ]; then
  log ".env 파일 생성 (backend/.env.example → backend/.env)"
  cp backend/.env.example backend/.env
fi

# 4) 합성 데이터
RAW_DIR="backend/app/data/raw"
if [ "$FRESH" = "1" ] || [ ! -d "$RAW_DIR" ] || [ -z "$(ls -A "$RAW_DIR" 2>/dev/null)" ]; then
  log "합성 데이터 생성: scripts/seed_data.py"
  python scripts/seed_data.py
else
  log "합성 데이터 존재 — 생성 skip (--fresh 로 강제 재생성)"
fi

# 5) XGBoost 학습
MODELS_DIR="backend/app/data/models"
MODEL_FILES=(setup_time.json labor_cost.json material_loss.json wash_cost.json downtime.json packaging_time.json)
has_models=1
for f in "${MODEL_FILES[@]}"; do
  if [ ! -f "$MODELS_DIR/$f" ]; then has_models=0; break; fi
done

if [ "$NO_TRAIN" = "1" ]; then
  log "모델 학습 skip (--no-train) — heuristic fallback 사용"
elif [ "$RETRAIN" = "1" ] || [ "$has_models" = "0" ]; then
  log "XGBoost 모델 학습 (6개 차원)"
  ( cd backend && python -m app.ml.train_xgboost )
else
  log "모델 파일 존재 — 학습 skip (--retrain 으로 강제 재학습)"
fi

# 6) frontend 의존성. 서버 기동 전에 한 번만 확인한다.
if [ ! -d frontend/node_modules ]; then
  log "frontend 의존성 설치 (npm install)"
  ( cd frontend && npm install )
fi

# 7) 서버 동시 기동.
BACK_PID=""
FRONT_PID=""
CLEANED=0

cleanup() {
  if [ "$CLEANED" = "1" ]; then return; fi
  CLEANED=1
  echo
  log "서버 종료 중…"
  if [ -n "$FRONT_PID" ] && kill -0 "$FRONT_PID" 2>/dev/null; then
    kill "$FRONT_PID" 2>/dev/null || true
  fi
  if [ -n "$BACK_PID" ] && kill -0 "$BACK_PID" 2>/dev/null; then
    kill "$BACK_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  log "종료 완료."
}
trap cleanup INT TERM EXIT

log "FastAPI 기동 → http://localhost:8000"
( cd backend && exec python -m uvicorn app.main:app --reload --port 8000 ) &
BACK_PID=$!

log "Vite dev server 기동 → http://localhost:5173"
( cd frontend && exec npm run dev ) &
FRONT_PID=$!

# 둘 중 하나가 죽으면 루프 탈출 → trap이 나머지를 정리한다.
# `wait -n`은 bash 4.3+ 전용이라 macOS 기본 bash 3.2에서 동작하지 않아 폴링 사용.
while kill -0 "$BACK_PID" 2>/dev/null && kill -0 "$FRONT_PID" 2>/dev/null; do
  sleep 1
done

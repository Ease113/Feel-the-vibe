# SmartFactoryV2 구현 로그

## 2026-05-17 초기화

### 생성/정리한 항목

- 모노레포 폴더 구조를 생성했습니다.
- `docs/source/roadmap.jpeg`, `docs/source/DB_state_v1.3.md`, `docs/source/final_proposal.pdf`가 이미 존재함을 확인했습니다.
- `docs/roadmap.md`가 이미 존재하며 구현 기준 문서로 사용할 수 있음을 확인했습니다.
- README, 프로젝트 AGENTS, API 계약, DB 스키마, 데이터 스키마, 데모 흐름, 아키텍처 문서를 추가했습니다.
- FastAPI 백엔드 skeleton, SQLite schema, seed data generator, fallback-safe service skeleton을 추가했습니다.
- React/Vite 프론트엔드 skeleton을 추가했습니다.
- `scripts/seed_data.py`로 `sku_master.csv`, `daily_plan.csv`, `transition_history.csv`, `sequence_rules.json`, `plan_context.json`을 생성했습니다.
- `.gitignore`를 추가해 Python cache, SQLite runtime DB, `node_modules`, `dist`를 제외했습니다.

### fallback 기록

- XGBoost 모델은 초기화 단계에서 실제 학습을 강제하지 않습니다. 모델 파일이 없으면 heuristic predictor를 사용합니다.
- OR-tools는 코드 경로를 남기되, 초기 demo size에서는 brute-force fallback이 기본적으로 동작합니다.
- 설명 생성은 실제 LLM 호출 없이 template 기반으로 시작합니다.
- 현재 설치 환경에서는 OR-tools 패키지가 설치되어 있지만 demo size 5에서는 `ortools-present-bruteforce-demo` 경로로 동작합니다.

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `python3 scripts/seed_data.py` | 성공 |
| `python3 -m pip install -e .` | 성공. 최초 sandbox 네트워크 제한 후 승인된 네트워크 실행으로 설치 |
| FastAPI import | 성공 |
| TestClient `/health`, `/plans/demo-plan-001`, `/optimize` | 성공 |
| TestClient `/predict`, `/decisions`, `/dashboard` | 성공 |
| `python3 -m pytest backend/tests` | 성공. 2 passed, FastAPI `on_event` deprecation warning 2건 |
| `python3 -m uvicorn app.main:app --port 8000` | 승인된 localhost bind에서 성공 |
| `curl -s http://127.0.0.1:8000/health` | 성공 |
| `npm install` | 성공. 2건의 moderate audit warning 존재 |
| `npm run build` | 성공 |
| `npm run dev -- --host 127.0.0.1` | 승인된 localhost bind에서 성공 |

### 남은 작업

- P0 API 전체 smoke test를 확대해야 합니다.
- 프론트엔드 Drag & Drop UI는 다음 단계에서 dnd-kit으로 구현해야 합니다.
- XGBoost 학습 스크립트는 현재 placeholder 수준이며, transition history 기반 학습 저장을 보강해야 합니다.
- OR-tools 최적화는 설치 가능 환경에서 실제 routing 모델 경로를 검증해야 합니다.

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

## 2026-05-17 API 명세 정합성 수정 (DB_state v1.3 정렬)

### 배경

다른 세션 검토와 본 세션 진단을 통해 API 응답이 DB_state v1.3 정본과 어긋난 4건을 식별했습니다. 모든 변경은 정본 계약 회복 방향이며 새 drift를 만들지 않습니다.

### 변경 내용

| 항목 | 파일 | 변경 |
|---|---|---|
| `comparison_state` core 필드 누락 | `backend/app/services/optimizer.py` | `SequenceEvaluator.compare()`에 `basis`, `recommended`, `current`, `diff`, `diff_rate` 5필드 추가. 기존 `objective_delta` 등 확장 필드는 하위 호환 유지 |
| 타임스탬프 필드명 혼용 (`committed_at`/`confirmed_at`/`created_at`) | `backend/app/services/decision_logger.py`, `backend/app/services/dashboard_service.py` | `confirmed_at`으로 통일. `_row_to_decision`에서 `created_at` legacy 채우기 제거, `list_decisions` ORDER BY를 `confirmed_at` 고정, dashboard trend/recent 항목 키를 `confirmed_at`으로 변경. POST `/decisions` 응답의 `committed_at`은 DB_state §13 표기를 따라 유지 |
| SR-000 sentinel 사용 | `backend/app/services/rule_engine.py` | 매칭 룰 없는 케이스를 `rule_id=None, severity=None`으로 반환 (DB_state §12 `ruleId: string \| null` 부합) |
| 문서 동기화 | `docs/api_contract.md` | 모든 예시에서 SR-000을 `null`로 교체, `created_at` 라인 제거, TransitionCost DTO에 no-rule 케이스 설명 한 줄 추가 |

### DB_state v1.3 출처 매핑

- `comparison_state` 구조: §6.8, §7.1, §12 line 815-821
- `confirmed_at`: §6 line 361, §13 line 834, `schema.sql:166`
- `ruleId: string \| null`: §12 line 802

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `python3 -m pytest tests/` | 5 passed (`test_health`, `test_rule_engine_black_to_white`, `test_rule_engine_metal_to_light`, `test_ortools_open_path_does_not_pay_return_arc`, `test_optimize_returns_plan_item_permutation`) |
| `SequenceEvaluator.compare()` 직접 호출 | `comparison_state.basis == "objectiveScore"`, 5 core 필드 모두 존재 |
| `RuleEngine.evaluate_transition()` no-rule 경로 | `SKU-BLACK-001 -> SKU-METAL-001` 전환에서 `rule_id=None, severity=None` 확인 |

### 보류 항목 (별도 결정 필요)

- `sequence_risk` continuous score(1/18/35) → DB_state `sequenceViolation` binary(0/1) 정렬: ML 학습 데이터, aggregated_cost, dashboard KPI 모두 영향
- `Warning.type`, `Warning.commitBlocking` 필드 추가: DB_state §12 정의 부합용
- `TransitionCost.warnings` 배열화: DB_state §12 정의 부합용

위 3건은 api_contract.md가 의도적으로 단순화를 선언한 영역(line 89 등)이므로 명시적 재결정 필요.

# SmartFactoryV2 구현 로그

## 2026-05-21 LLM 분기 + 주간 보고서 백엔드 통합

### 배경

`docs/design/mvp-completion-plan.md` 잔여 P1 작업 중 LLM 호출지점 3곳(`/explain`, 주간 요약, 주간 보고서)이 모두 template-only로 남아 있어 시연 완성도가 낮았습니다. 설계 가이드는 `docs/design/llm-integration-and-weekly-report.md`. 핵심 원칙은 (a) LLM 자동 호출 금지(roadmap §13), (b) provider chain Gemini → claude CLI → template, (c) 주간 기간은 in-progress ISO 주(월~기준일), (d) `weekly_report_cache` UPSERT로 한 줄 요약과 본문 3면 누적 저장입니다.

### 변경 내용

| 항목 | 파일 | 변경 |
|---|---|---|
| LLM provider chain | `backend/app/services/llm_client.py` (신설) | `LLMClient.generate(prompt_id, payload) -> LLMResult` 단일 진입점. Gemini SDK → `claude --print` CLI → template fallback. timeout·예외·JSON 파싱·schema 검증 일괄 처리, caller에 예외 미전파. |
| prompt 레지스트리 | `backend/app/services/prompts.py` (신설) | `PROMPT_REGISTRY`에 `explain-v1`/`weekly-summary-v1`/`weekly-report-v1` 3건 등록. 각 항목은 (system_prompt, user_prompt_fn, output_schema, template_fallback_fn, prompt_version)로 구성. |
| 주간 보고서 서비스 | `backend/app/services/weekly_report_service.py` (신설) | `iso_week_in_progress(date)` (월요일~기준일), `_kpi_snapshot`/`_cost_summary`/`_risk_summary` aggregation, decisions 0건 시 LLM 호출 skip + template으로 cache row 채움. |
| cache 저장소 | `backend/app/db/weekly_report_repo.py` (신설) | `upsert_summary`(`llm_summary` + 본문 보존), `upsert_full_report`(본문 3컬럼 갱신), `get_for_period`, `get_latest`. SQLite single-writer 가정의 SELECT-then-INSERT/UPDATE UPSERT. |
| 라우터 | `backend/app/api/routes_reports.py` (신설) | `POST /reports/weekly-summary`, `POST /reports/weekly` 두 endpoint. request body 없음 — 서버가 오늘 기준 in-progress 주 자동 계산. |
| 응답 schema | `backend/app/schemas/reports.py` (신설) | `WeeklySummaryResponse`, `WeeklyReportResponse`, `WeeklyReportPayload` Pydantic 모델. `generation_mode`는 `Literal["gemini", "cli", "template"]`. |
| `/explain` LLM 분기 | `backend/app/services/explanation_service.py` | template-only 로직을 `LLMClient.generate("explain-v1", payload)`로 교체. fallback 함수는 `prompts.py`에 이관. 응답에 `model_version`/`prompt_version`/`generation_mode` 추가. |
| `/explain` 응답 schema | `backend/app/schemas/sequence.py`, `backend/app/api/routes_explain.py` | `ExplainResponse` Pydantic 모델 추가, 라우터에 `response_model` 지정. |
| 대시보드 cache 노출 | `backend/app/services/dashboard_service.py` | 하드코딩된 `_weekly_summary` 제거 → `weekly_report_repo.get_for_period`로 cache 조회. cache 없으면 `weekly_summary`/`weekly_report` 둘 다 `null`. LLM 호출 코드 0회. |
| env var · 설정 | `backend/app/core/config.py`, `backend/.env.example` | `SMARTFACTORY_LLM_API_KEY`/`SMARTFACTORY_LLM_MODEL`/`SMARTFACTORY_LLM_TIMEOUT_SEC`/`SMARTFACTORY_LLM_CLI_TIMEOUT_SEC` 정의. `.env.example`은 placeholder만. |
| SQLite legacy 복구 | `backend/app/db/schema.sql`, `backend/app/db/sqlite.py` | `generation_mode` CHECK 제약을 `(gemini, cli, template)`으로 갱신. 구 enum(`live`/`cached`/`template`) 테이블이 잔존하면 `_recreate_weekly_report_cache_if_legacy`가 DROP + WARNING 후 재생성. |
| 라우터 등록 | `backend/app/main.py` | `routes_reports` include. |
| 의존성 | `backend/pyproject.toml` | `google-genai>=0.3` 추가. SDK 호출 + JSON 응답 파싱은 `LLMClient`가 책임. |
| 보안/gitignore | `.gitignore` | `.env`, `backend/.env`, sqlite WAL/SHM 파일 제외. |
| 테스트 격리 | `backend/tests/conftest.py` | `SMARTFACTORY_LLM_API_KEY` env를 강제 unset해 테스트가 외부 네트워크/CLI에 의존하지 않도록 격리. |
| LLM client 테스트 | `backend/tests/test_llm_client.py` (신설) | (a) template-only, (b) Gemini mock 성공, (c) Gemini 실패 → fallback, (d) CLI code-fence 추출, (e) CLI 실패 → fallback, (f) Gemini schema 위반 → fallback, (g) 미등록 prompt_id KeyError. |
| 주간 보고서 테스트 | `backend/tests/test_weekly_report.py` (신설) | iso_week 월/수/일, 0건 케이스 template + cache 적재, summary→weekly 순서로 UPSERT시 본문 누적, POST endpoint smoke 2건, /dashboard cache 노출/null 처리, /dashboard LLM 자동 호출 없음 검증(`LLMClient.generate` mock call_count == 0). |
| 문서 | `docs/api_contract.md`, `docs/source/DB_state_v1.3.md`, `docs/design/llm-integration-and-weekly-report.md` (신설) | `/dashboard`에 `weekly_report` 필드 추가, `/explain`에 provenance 3 필드 추가, `POST /reports/weekly-summary`·`POST /reports/weekly` 신규 명세, `generation_mode` enum을 `(gemini, cli, template)`로 갱신. |

### Fallback 검증

| 시나리오 | 기대 동작 | 확인 |
|---|---|---|
| `SMARTFACTORY_LLM_API_KEY` 미설정 + `claude` CLI 미감지 | template fallback, `generation_mode == "template"` | ✓ `test_template_fallback_when_no_provider` |
| Gemini SDK 정상 JSON 응답 | `generation_mode == "gemini"`, model_version은 모델명 | ✓ `test_gemini_path_success` |
| Gemini 예외 발생 | WARNING 로그 + CLI → template으로 graceful degradation | ✓ `test_gemini_path_failure_falls_back_to_template` |
| Gemini가 schema 미준수 JSON 반환 | WARNING + template으로 fallback | ✓ `test_gemini_schema_violation_falls_back` |
| `claude` CLI가 markdown fence로 감싼 JSON 반환 | code fence 추출 후 JSON 파싱 성공 | ✓ `test_cli_path_with_code_fence` |
| `claude` CLI exit non-zero | WARNING + template | ✓ `test_cli_failure_falls_back_to_template` |
| 주간 decisions 0건 | LLM 호출 skip, template으로 cache row 채움 | ✓ `test_generate_summary_zero_decisions_uses_template_and_writes_cache` |
| 같은 주에 summary → weekly 순으로 호출 | row 1개 UPSERT, 본문 3컬럼 누적 | ✓ `test_upsert_preserves_other_columns_when_summary_then_full_report` |
| `/dashboard` 진입 | LLMClient.generate 호출 0회 | ✓ `test_dashboard_does_not_call_llm` |

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `pip install -e .` | 성공 (`google-genai 2.5.0` 외 의존성 8개 신규 설치) |
| `ruff check app/ tests/` | All checks passed |
| `python -m pytest tests/ -q` | 35 passed (기존 17 + 신규 18), 5 warnings (FastAPI `on_event` deprecation 잔존 — cleanup PR 별도) |
| `POST /reports/weekly-summary` (decisions 0건) | 200 + `generation_mode == "template"`, cache row 1건 적재 |
| `POST /reports/weekly` (decisions 2건) | 200 + summary/key_findings/recommendations 3면, cache UPSERT 정상 |
| `GET /dashboard` (cache 없음) | `weekly_summary == null`, `weekly_report == null`, LLM 호출 0회 |
| `GET /dashboard` (cache 있음) | cache의 `llm_summary` 및 본문이 응답에 반영 |

### 보안 / 운영

사용자가 채팅으로 평문 전달한 Gemini API key는 본 PR 코드·문서·로그 어디에도 기록하지 않았습니다. `.env` 로컬 사용으로만 다루며 `.gitignore`에 포함되어 있습니다. **시연 종료 후 즉시 key rotate를 권장합니다**.

### 남은 작업 (분리 PR)

- 프론트엔드: `weekly_summary` 타입을 `string`에서 `string | null`로 변경, 명시 호출 버튼 3개(AI 요약/주간 요약/주간 보고서) UI 구현, `/dashboard.weekly_report` 본문 렌더 (별도 design doc 선행)
- 프론트엔드: SkuCard 속성 표시 (P1 #8, 별도 hand-off)
- 프론트엔드: Dashboard 7차원 차트 보강 (P1 #9, 별도 hand-off)
- 백엔드 chore: `@app.on_event("startup")` → `lifespan` 마이그레이션, 학습 모델 파일 `.gitignore` 정책 재정리
- `/optimize`에 LLM 도입 여부: 별도 ADR (현재는 명시적 Out of Scope)

## 2026-05-20 XGBoost 비용 예측 도입 + 학습/발표 자료

### 배경

`docs/design/p1-backend-sequencing.md`에서 합의된 순서대로 kpi_trend 7차원 확장 다음 P1 작업입니다. 설계 가이드는 `docs/design/xgboost-cost-predictor-adoption.md` (사용자 학습용 가이드)이며, AGENTS.md fallback 정책상 모델이 없거나 로드 실패 시 heuristic으로 자동 떨어지는 구조를 유지합니다. 사용자가 발표에서 직접 설명할 수 있게 코드 워크스루 문서를 별도로 작성했습니다.

선행 정리: working tree의 `backend/app/data/raw/sequence_rules.json`이 다른 repo fetch 과정에서 의도치 않게 10/6/7/8로 회귀해 있었습니다. commit `8b08850`의 35/30/18/32가 정본이라 `git restore`로 복구했습니다 (FastAPI startup이 raw JSON을 만질 수 있는 코드 경로는 없음을 함께 검증).

### 변경 내용

| 항목 | 파일 | 변경 |
|---|---|---|
| 학습/추론 공통 feature 단일 출처 | `backend/app/ml/features.py` (신설) | `FEATURE_COLUMNS` (12개) 상수 + `build_features_from_history` (학습용 DataFrame), `build_features_for_transition` (추론용 1행 DataFrame). heuristic과 동일한 `*_gap`/`*_changed` 식 사용 |
| 모델 디렉토리 + 로더 + 모듈 캐시 | `backend/app/ml/model_registry.py` | `get_model_dir`, `get_model_path(dim)`, `load_models(force_reload)` 추가. 6개 차원 모두 존재해야 성공, 부분 fallback 금지. 모듈 캐시는 디렉토리 경로 기준 무효화 |
| 모델 디렉토리 env 오버라이드 | `backend/app/core/config.py` | `SMARTFACTORY_MODEL_DIR`로 `DATA_MODEL_DIR` 오버라이드. 테스트 격리·CI 분리 목적 |
| 실제 학습 파이프라인 | `backend/app/ml/train_xgboost.py` (재작성) | `xgb.train(...)` low-level API로 sklearn 의존 회피. 6개 차원 독립 회귀, native JSON 저장, XGBoost vs heuristic MAE 리포트 생성 (`training_report.txt`) |
| CostPredictor 분기 도입 | `backend/app/services/cost_predictor.py` | `_predict_xgboost` (DMatrix 경로) + `_predict_heuristic` (기존 식 그대로) 분리. 3단 게이트: no model → heuristic / model+예외 → heuristic / model+정상 → xgb. `CostPredictor.heuristic_only()` classmethod로 학습 baseline 비교 인스턴스 노출 |
| 동적 model_version 전파 | `backend/app/services/optimizer.py`, `backend/app/services/decision_logger.py` | 전역 상수 `MODEL_VERSION` 대신 `self.predictor.model_version`을 응답에 노출. decision_logger도 `confirmed_cost`의 `model_version`을 우선 사용 |
| 테스트 격리 (XGBoost) | `backend/tests/conftest.py` | `SMARTFACTORY_MODEL_DIR`을 빈 임시 디렉토리로 강제. 학습 산출물이 commit되어 있어도 기존 smoke 테스트는 heuristic 경로로 결정적으로 동작 |
| XGBoost 회귀 테스트 3건 | `backend/tests/test_xgboost.py` (신설) | (a) fallback when model missing, (b) xgb path when model present (fixture로 미니 booster 학습 후 cleanup), (c) feature shape consistency train vs inference (drift 회귀 방지) |
| 학습 산출물 commit | `backend/app/data/models/*.json`, `training_report.txt` | 6개 booster JSON + MAE 리포트. **실 시연 직전 별도 PR로 제거 예정** (out-of-scope 메모) |
| 학습/발표 자료 | `docs/learning/xgboost-cost-predictor-walkthrough.md` (신설) | 11개 섹션: 문제 정의, 데이터, feature engineering, 학습 코드 walkthrough, 저장/로드, 추론 분기/fallback, 평가 비교, 3분 발표 스크립트, 예상 질문 4건, 한계 |

### Fallback 검증

| 시나리오 | 기대 동작 | 확인 |
|---|---|---|
| 모델 6개 모두 있음 | `model_version="xgboost-v1"`, xgb 경로 | ✓ (e2e smoke + `test_cost_predictor_uses_xgboost_when_model_present`) |
| 모델 디렉토리 빈 | `model_version="heuristic-v1"`, heuristic 경로 | ✓ (`SMARTFACTORY_MODEL_DIR=/tmp/empty` 환경 변수 + `test_cost_predictor_falls_back_when_model_missing`) |
| xgboost import 실패 | warning log + None 반환 → heuristic | ✓ (`load_models` try/except, libomp 미설치 환경에서 검증) |
| 단일 예측 예외 | 그 호출만 heuristic, 다른 호출은 xgb 유지 | ✓ (`predict_transition` try/except) |

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `python -m app.ml.train_xgboost` | 6개 모델 학습 + MAE 리포트 생성 (모든 차원 42~82% 개선) |
| `python -m pytest tests/ -q` | 17 passed (기존 14 + 신규 3), 5 warnings (FastAPI on_event deprecation 잔존) |
| `ruff check app/ tests/` | All checks passed |
| `POST /optimize`로 `model_version` 확인 | `"xgboost-v1"` (objective_score 71797.43, 기존 heuristic 76155.71 대비 변화) |
| `SMARTFACTORY_MODEL_DIR=<empty>` 강제 후 `CostPredictor()` | `model_version == "heuristic-v1"` |

### MAE 비교 (training_report.txt)

| dimension | mae_xgboost | mae_heuristic | 상대 개선 |
|---|---:|---:|---:|
| setup_time | 2.54 | 14.06 | 81.9% |
| labor_cost | 6,556.12 | 29,771.06 | 78.0% |
| material_loss | 0.25 | 1.38 | 81.6% |
| wash_cost | 4,581.70 | 18,093.25 | 74.7% |
| downtime | 1.76 | 4.30 | 59.1% |
| packaging_time | 1.74 | 3.05 | 42.9% |

### 환경 요구사항

macOS XGBoost 동작에 `libomp`가 필요해 `brew install libomp`로 시스템 전역 설치했습니다 (Apple Silicon: `/opt/homebrew/opt/libomp/lib/libomp.dylib`). 다른 머신에서 학습 재실행 시 동일 셋업 필요.

### 남은 작업 (분리 PR)

- 시연 직전 `backend/app/data/models/*.json`, `training_report.txt` git에서 제거 + `.gitignore`에 `backend/app/data/models/` 추가
- 런타임 SQLite 부수 파일 (`smartfactory.sqlite3-shm`, `-wal`) `.gitignore` 추가
- FastAPI `@app.on_event("startup")` → `lifespan` 마이그레이션 (DeprecationWarning 잔존)
- 프론트엔드 `model_version` 표시 (어느 모델로 산출했는지 운영자에게 노출)
- `sequence_risk` continuous(1/18/35) → binary(0/1) 정렬 (DB_state §6.4 기준, 2026-05-17부터 보류 중)
- `Warning.type`, `Warning.commitBlocking` 필드 추가 + `TransitionCost.warnings` 배열화 (DB_state §12)
- `backend/app/schemas/` 미사용 모델 정리 (`docs/design/schemas-cleanup-followup.md` 합의대로 trigger 기반 deferred 유지)

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
- OR-tools는 정상 설치 환경에서 실제로 동작하며 `optimizer_backend: "ortools-routing-open-path"`를 반환합니다. OR-tools가 없거나 실패하면 8개 이하 항목은 brute-force, 9개 이상은 nearest-neighbor로 fallback합니다.
- 설명 생성은 실제 LLM 호출 없이 template 기반으로 시작합니다.

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
- ~~OR-tools 최적화는 설치 가능 환경에서 실제 routing 모델 경로를 검증해야 합니다.~~ 2026-05-17 검증 완료.

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

## 2026-05-17 OR-tools 실제 동작 검증 + 진단 개선

### 배경

초기화 로그에 "demo size 5에서는 brute-force 경로로 동작"이라는 기록이 있었습니다. 현재 환경에서 검증한 결과, OR-tools는 정상 동작하며 `optimizer_backend: "ortools-routing-open-path"`를 반환합니다. 초기 로그는 다른 실행 환경(sandbox)에서 기록된 것으로, 현재 코드와 일치하지 않는 레이블(`ortools-present-bruteforce-demo`)을 참조하고 있었습니다.

### 변경 내용

| 항목 | 파일 | 변경 |
|---|---|---|
| silent except 개선 | `backend/app/services/optimizer.py` | `except Exception: return None` → `except Exception as exc: _log.warning(...)` 로 변경. OR-tools 실패 시 원인을 WARNING 레벨로 기록합니다. |
| OR-tools 동작 검증 테스트 추가 | `backend/tests/test_smoke.py` | `test_optimize_uses_ortools_when_available` 추가. OR-tools 설치 환경에서 `optimizer_backend == "ortools-routing-open-path"`를 어설션합니다. |

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `python3 -m pytest tests/` | 6 passed (`test_health`, `test_rule_engine_black_to_white`, `test_rule_engine_metal_to_light`, `test_ortools_open_path_does_not_pay_return_arc`, **`test_optimize_uses_ortools_when_available`**, `test_optimize_returns_plan_item_permutation`) |
| `POST /optimize` `optimizer_backend` | `"ortools-routing-open-path"` 확인 |

## 2026-05-19 DB 초기화 idempotency + 테스트 격리

### 배경

`schema.sql`이 decisions 테이블을 새 스키마(`confirmed_at`, `applied_weights`, `context_snapshot`, `confirmed_cost_vector`)로 정의하지만, 2026-05-17 명세 정합성 수정 이전에 만들어진 legacy DB 파일(`created_at` + 14컬럼)이 잔존할 경우 `CREATE TABLE IF NOT EXISTS`가 무시되어 이후 `CREATE INDEX ON decisions (confirmed_at)`이 `OperationalError: no such column: confirmed_at`으로 깨졌습니다. 실DB(`backend/app/data/smartfactory.sqlite3`)에서 라이브 재현 확인. 기존 smoke test가 `/decisions`를 호출하지 않아 회귀를 잡지 못했습니다.

설계 문서: `docs/design/db-init-idempotency.md`.

### 변경 내용

| 항목 | 파일 | 변경 |
|---|---|---|
| `SQLITE_PATH` env 오버라이드 | `backend/app/core/config.py` | `SMARTFACTORY_DB_PATH` 환경변수로 SQLite 경로 오버라이드. 기본값은 기존 경로 유지 |
| legacy 스키마 자동 복구 | `backend/app/db/sqlite.py` | `initialize_database()`에 sentinel 컬럼(`confirmed_at`, `applied_weights`, `context_snapshot`, `confirmed_cost_vector`) 검사 + `DROP TABLE decisions` + WARNING 로그(`data loss: N rows`) 추가 |
| 테스트 DB 격리 | `backend/tests/conftest.py` (신규) | module-level에서 `tempfile.mkdtemp` + `os.environ["SMARTFACTORY_DB_PATH"]` 세팅. app import 이전에 실행되도록 보장 |
| smoke test 2건 추가 | `backend/tests/test_smoke.py` | `test_initialize_database_recovers_from_legacy_decisions_schema` (legacy 스키마 강제 생성 후 자동 복구 검증) + `test_decisions_lifecycle_post_get_patch_dashboard` (POST → GET → PATCH reviewed → /dashboard 라이프사이클 전체 검증) |

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `python3 -m pytest tests/ -v` | 8 passed (기존 6 + 신규 2) |
| `ruff check app/ tests/` | All checks passed |
| 실DB `backend/app/data/smartfactory.sqlite3` mtime | 테스트 전후 동일 — 격리 확인 |
| `$TMPDIR/smartfactory-test-*` 임시 디렉토리 | 테스트마다 생성됨 (예: `smartfactory-test-jxjsqnhs`) |
| 라이브 reproduce: legacy DB로 `/decisions` POST | 수정 전 500 → 수정 후 200 |

### 후속 작업

- `priority_profile` contract 정합 (nested `{base_weight_profile_id, priorities}` 수용 + `applied_weights` 재정규화 + `sequence_risk` multiplier 제외): 별도 design 문서로 진행 예정.
- 프론트엔드 D&D + API client `/optimize`, `/predict`, `/decisions`, `/validate`, `/explain` 추가.
- XGBoost 학습 스크립트 보강.
- `@app.on_event("startup")` deprecation 해소 (lifespan 마이그레이션) — 별도 분리.

## 2026-05-19 priority_profile contract 정합 + sequence_penalty 재조정

### 배경

라이브 reproduce(2026-05-18)에서 `priority_profile`이 contract(`docs/source/DB_state_v1.3.md` §6.1-6.2, `docs/api_contract.md` §29-77)와 어긋난 3건을 식별했습니다.

1. **구조 불일치**: 코드는 flat `{dimension: {label, multiplier}}`만 인식 → contract nested 형식으로 호출하면 모든 차원이 NORMAL로 silently fallback (사용자 슬라이더 무력화).
2. **applied_weights 의미 불일치**: 정본은 "공장 base × multiplier 재정규화(합=1), 6차원, sequence_risk 제외"인데 코드는 raw multiplier 7차원 (합=7.15 등).
3. **total_weighted_cost 범위**: DB_state §74는 XGBoost 6차원에만 적용인데 코드는 sequence_risk × multiplier도 합산해 이중 계산.

spec 적용에 따라 HIGH 전환 단독 objective 기여도가 45 → 10으로 축소되는 부작용이 있어 sequence_rules.json penalty 값도 함께 재조정했습니다.

설계 문서: `docs/design/priority-profile-contract.md`.

### 변경 내용

| 항목 | 파일 | 변경 |
|---|---|---|
| 새 상수 + nested/flat 흡수 normalize | `backend/app/services/priority.py` | `BASE_WEIGHT_DIMENSIONS`(6), `OPERATOR_PRIORITY_DIMENSIONS`(5), `FACTORY_DEFAULT_V1_BASE_WEIGHTS` (contract §6.2 역산값) 추가. `default_priority_profile()` 반환을 nested 정본 형식으로 변경. `normalize_priority_profile()`이 nested + flat + None 입력을 모두 graceful 수용하며 6차원 합=1 `applied_weights` 반환 |
| `total_weighted_cost` 합산 범위 한정 | `backend/app/services/optimizer.py` | `evaluate()`와 `_build_score_matrix()`의 weighted sum을 `BASE_WEIGHT_DIMENSIONS` 6차원으로 한정. `sequence_risk`는 `aggregated_cost` 7차원 display에만 잔존 |
| nested priority_profile 인식 | `backend/app/services/explanation_service.py` | `profile.get("priorities", profile)` 패턴으로 양쪽 형식 처리 |
| penalty 재조정 | `backend/app/data/raw/sequence_rules.json` | SR-001 10→35, SR-002 6→30, SR-003 7→18, SR-004 8→32 (severity-tier 기준, 기존 상대 순서 보존) |
| smoke test 5건 추가 | `backend/tests/test_smoke.py` | nested 입력 정합 / flat graceful / `/plans` nested 응답 / `/optimize` HIGH 영향 / aggregated_cost sequence_risk 보존 |
| contract 예시 갱신 | `docs/api_contract.md` | total_weighted_cost 404349.64→76155.71, 478030.01→89942.18, objective_score / recommended / current / diff / diff_rate / comparison_summary / sequence_penalty / penalty 값 일괄 갱신 |

### Frontend 변경은 별도 담당자에게 hand-off

사용자 요청으로 `frontend/src/api/types.ts`는 본 작업에서 변경하지 않았습니다. 필요한 변경 사항은 `docs/design/priority-profile-contract.md`의 "Frontend Hand-off Note" 절에 명시 (OperatorPriorityDimension 타입, PriorityProfile 인터페이스, PlanResponse 갱신).

backend는 nested + flat 둘 다 받으므로 frontend 변경 전에도 동작은 정상. 단 slider가 contract대로 효과를 내려면 nested 형식으로 보내야 함.

### 검증 결과

| 명령/확인 | 결과 |
|---|---|
| `python3 -m pytest tests/ -v` | 13 passed (기존 8 + 신규 5) |
| `ruff check app/ tests/` | All checks passed |
| `/optimize` with contract nested (wash=HIGH) | `objective_score = 76155.71`, `optimizer_backend = "ortools-routing-open-path"` |
| `/optimize` empty profile | 76155.71 (HIGH 적용으로 점수 차이 발생 확인) |
| `/predict` 위반 sequence | `current.sequence_penalty = 53.0` (SR-001 35 + SR-003 18), `objective_delta = 13839.47` |
| `/validate` BLACK→WHITE 전환 | `penalty: 35.0` (재조정 반영) |
| `applied_weights` (contract priority) | `{setup:0.134, wash:0.232, downtime:0.232, material:0.134, packaging:0.089, labor:0.179}` — contract §6.2 정확히 일치 |
| `applied_weights`에 `sequence_risk` | 미포함 (spec 부합) |
| `aggregated_cost`에 `sequence_risk` | 포함 (display 유지) |

### 후속 작업

- **Frontend**: `frontend/src/api/types.ts` 갱신 + `PriorityProfilePanel` 슬라이더 구현 (별도 담당자).
- `sequence_risk` continuous(1/18/35) → binary(0/1) 정렬 (DB_state §6.4): implementation_log 2026-05-17 보류 항목과 묶어 별도 task.
- 프론트엔드 D&D + API client `/optimize`, `/predict`, `/decisions` 추가 (Task #3).
- XGBoost 학습 스크립트 보강 (Task #4).

# Operating Context Cost Multiplier & Explicit Recompute Design Document

> Status: Implemented (통합 시연 검증 대기)
> Created: 2026-05-21
> Updated: 2026-05-21
> Owner: Ease113

## Context

> **이력:** 아래 단락은 작업 전 문제 정의입니다. B1~B8·F1~F6 구현은 2026-05-21 완료 — 현재 상태는 [Implementation Status](#implementation-status-2026-05-21) 참고.

`EvaluationConditionsPanel`은 wireframe v5 시점에 draft / apply 패턴으로 만들어졌고, "평가 조건 적용" 버튼(`eval-apply-btn`)이 이미 존재합니다 (`EvaluationConditionsPanel.tsx:429-436`). 다만 현재 hook(`useDecisionPage.handleApplyEvaluationConditions`)은 우선순위 변경 시에만 `/predict`를 호출하고 `/optimize`는 호출하지 않아 추천 순서가 갱신되지 않습니다. `operatingContext`는 어떤 요청 바디에도 실리지 않아 백엔드의 `plan_context.json` 고정값(LINE-01 / day / 3명)으로만 비용이 계산됩니다. 패널 UI 텍스트도 "추천 순서는 바뀌지 않고 KPI·비교 결과에만 반영됩니다"라고 명시되어 있습니다. 이번 작업으로 운영 컨텍스트는 절대 비용을 균일 곱셈으로 보정하는 신호로, 운영 우선순위는 추천 순서를 재구성하는 신호로 역할을 분리하고, 양쪽 모두 "평가 조건 적용" 클릭으로 반영되도록 백엔드 계약·hook·UI 텍스트를 정합화합니다. 미수행 시 dropdown과 우선순위 슬라이더가 시연 신뢰성을 흐리며, 향후 작업자 뷰(P2) 확장 시 같은 단절을 다시 처리해야 합니다.

## Goals & Non-Goals

### Goals

| Goal | Description |
|---|---|
| 운영 컨텍스트 → 절대 비용 반영 | shift, crewSize 변경이 6개 비용 차원에 균일 곱셈으로 적용되어 추천 순서는 보존하되 절대 비용은 변동합니다. |
| 운영 우선순위 → 추천 순서 변경 | priority_profile 변경 시 `/optimize` 재호출로 추천 순서가 갱신되어 "AI/ML이 우선순위 신호에 반응한다"는 시연 메시지를 표현합니다. |
| 단일 진입점 UX | 이미 존재하는 "평가 조건 적용" 버튼을 그대로 사용하고, 클릭 시 변경된 항목에 따라 `/predict` 단독 또는 `/optimize + /predict`를 묶어 호출합니다. |
| heuristic·XGBoost 경로 일관성 | `CostPredictor` 내부에서 baseline 입력 후 균일 배수를 곱하는 단일 진실원천 패턴으로 두 경로 모두 동일 비율을 적용합니다. |
| 확정 스냅샷 정합성 | 확정 시점의 dropdown 값이 `visible.shift` / `visible.crewSize`로 SQLite에 기록됩니다. |

### Non-Goals

| Non-Goal | Reason |
|---|---|
| shift별 비균일 비용 모델 (옵션 C) | 현장 인터뷰·근거가 부족하고 시연 메시지를 흐립니다. |
| dropdown 변경 시 자동 재요청 | 이미 draft / apply 패턴이 자리잡혀 있으므로 동일 UX를 유지합니다. |
| 작업자 뷰·다중 라인 (P2) | LINE-01 단일 라인 범위로 한정합니다. |
| XGBoost 재학습 | 학습 모델은 그대로 두고 추론 시 균일 배수만 post-hoc 적용합니다. |
| 새 컴포넌트 도입 | 기존 패널·hook 구조를 재사용하고, "재계산" 버튼을 신설하지 않습니다. |

## Architecture

```mermaid
graph LR
  Panel[EvaluationConditionsPanel<br/>draft state + apply button] -->|onApply payload| Hook
  Hook[useDecisionPage<br/>handleApplyEvaluationConditions] -->|context changed?| PredictCall
  Hook -->|priority changed?| OptimizeCall
  PredictCall[POST /predict<br/>+ operating_context] --> Predictor
  OptimizeCall[POST /optimize<br/>+ operating_context] --> Optimizer
  Optimizer[OptimizerService] --> Predictor
  Predictor[CostPredictor<br/>baseline + uniform multiplier]
  Hook -.확정.-> DecisionsCall[POST /decisions<br/>+ operating_context]
  DecisionsCall --> Logger[DecisionLogger<br/>visible.shift / crewSize 기록]
```

| 컴포넌트 | 책임 | 경계 |
|---|---|---|
| `EvaluationConditionsPanel` | shift·crewSize·priority dropdown 렌더, draft state 보유, "평가 조건 적용" 버튼 노출 | dirty 판정만 자체 계산, API 호출은 부모에 위임 |
| `useDecisionPage` | `operatingContext` / `priorityProfile` 상태 보유, `handleApplyEvaluationConditions`에서 변경 항목에 따라 `/optimize`·`/predict` 오케스트레이션 | 비즈니스 규칙은 백엔드 위임 |
| `routes_predict` / `routes_optimize` / `routes_decisions` | 요청 바디 검증, `plan_context.json` 기본값과 merge | merge 후 predictor·optimizer·logger 호출 |
| `OptimizerService` | merge된 context로 predictor를 호출해 비용 행렬·추천 순서 산출 | 자체적으로 배수를 적용하지 않음 |
| `CostPredictor` | 내부 호출 시 baseline context로 6차원 비용을 산출하고 균일 배수를 곱해 반환 | heuristic·XGBoost 양 경로의 단일 진실원천 |
| `DecisionLogger` | 확정 요청의 context를 merge해 `visible.shift` / `visible.crewSize`에 기록 | 추가 audit 테이블은 도입하지 않음 |

## Sequence / Flow

### 정상 흐름 — "평가 조건 적용" 클릭

```mermaid
sequenceDiagram
  participant User
  participant Panel as EvaluationConditionsPanel
  participant Hook as useDecisionPage
  participant Optimize as POST /optimize
  participant Predict as POST /predict
  participant Predictor as CostPredictor

  User->>Panel: shift / crewSize / priority 변경 (draft)
  Panel-->>Panel: isDirty = true
  User->>Panel: 평가 조건 적용 클릭
  Panel->>Hook: onApply({ operatingContext, priorityProfile })
  alt priority 변경됨
    Hook->>Optimize: { plan_id, priority_profile, operating_context }
    Optimize->>Predictor: predict_transition (baseline + multiplier)
    Predictor-->>Optimize: cost matrix
    Optimize-->>Hook: recommendedSequence + objectiveScore
  end
  Hook->>Predict: { sequence, priority_profile, operating_context }
  Predict->>Predictor: predict_transition
  Predictor-->>Predict: 6-dim cost
  Predict-->>Hook: cost dict
  Hook-->>Panel: 갱신된 비용·순서·KPI
```

| Step | Description |
|---:|---|
| 1 | dropdown / Likert 변경은 draft state에만 반영됩니다. |
| 2 | 사용자가 "평가 조건 적용"을 클릭합니다 (`isDirty && !isPredicting` 일 때만 활성). |
| 3 | hook이 변경 종류를 판정합니다. priority가 바뀌었으면 `/optimize`를 먼저 호출해 추천 순서를 갱신합니다. |
| 4 | `/predict`로 현재 sequence의 6차원 비용을 갱신합니다. 두 호출 모두 `operating_context`를 포함합니다. |
| 5 | `CostPredictor`는 내부적으로 baseline context로 비용을 계산한 뒤 균일 배수를 곱해 반환하므로, 두 경로 모두 컨텍스트 변경은 절대 비용만 흔들고 순위에는 영향을 주지 않습니다. |

### 주요 에러 흐름

```mermaid
flowchart TD
  Start([평가 조건 적용 클릭]) --> Validate{operating_context 형식 valid?}
  Validate -->|No| Error400[400: invalid operating_context]
  Validate -->|Yes| Branch{priority changed?}
  Branch -->|Yes| Optimize[/POST /optimize/]
  Branch -->|No| Predict[/POST /predict/]
  Optimize -->|503 or network error| Toast[isPredicting 해제 + 토스트]
  Optimize -->|200| Predict
  Predict -->|503 or network error| Toast
  Predict -->|200| Apply[상태 갱신]
```

| Case | Handling |
|---|---|
| `shift`에 허용되지 않은 값 | Pydantic `Literal["day","night"]` 검증으로 400 반환 |
| `crew_size`가 정수가 아님 / 범위 밖 | `ge=1, le=6` 검증으로 400 반환. 프론트는 select 옵션으로 2~5로 제약 |
| `/optimize` 실패 후 `/predict` 미호출 | 기존 추천 순서 유지, hook의 `isPredicting` 플래그 해제 |
| `/optimize` 성공 후 `/predict` 실패 | 추천 순서는 갱신되었지만 cost는 이전 값. `isPredicting` 해제 + 경고 표시 |
| XGBoost 추론 실패 | 기존 heuristic fallback. 균일 배수는 동일하게 적용 |

## Decisions & Rationale

### Decision 1: 운영 컨텍스트는 균일 곱셈으로 절대 비용에만 반영

| Item | Description |
|---|---|
| Decision | `CostPredictor.predict_transition` 내부에서 baseline (`shift=day`, `crew_size=3`)으로 6차원 비용을 계산하고, 결과 dict 전체에 `_operating_context_multiplier(context)`를 곱해 반환합니다. |
| Alternatives | (A) shift complexity 가산만 적용 — crew는 여전히 비균일. (B) complexity 곱셈 — 비균일 잔존. (C) 차원별 비균일 가중치 — 근거 약하고 시연 메시지 흐림. |
| Rationale | "우선순위가 순서를 결정한다"는 시연 메시지를 보호하려면 컨텍스트는 순위에 영향을 주지 않아야 합니다. 균일 배수는 결정론적으로 순위 보존을 보장하고 heuristic·XGBoost 양 경로에 동일하게 적용됩니다. |
| Impact | 기존 `_predict_heuristic`의 `labor_cost = setup_time * crew_size * 850` 식은 `setup_time * CREW_BASELINE * 850`으로 바뀌고, crew 영향은 외부 배수로만 들어갑니다. |

### Decision 2: 우선순위 변경 시 `/optimize` 재호출, 컨텍스트만 변경되면 `/predict`만

| Item | Description |
|---|---|
| Decision | `handleApplyEvaluationConditions`에서 priority 변경 여부에 따라 `/optimize`를 조건부 호출하고, `/predict`는 무조건 호출합니다. |
| Alternatives | (A) 항상 `/optimize + /predict` 호출 — 컨텍스트만 바뀐 경우 불필요한 optimize. (B) priority 변경만 `/predict` 호출 — 컨텍스트 변경 시 cost가 갱신되지 않음. |
| Rationale | 컨텍스트는 순위에 영향 없으므로 `/optimize`가 불필요합니다. priority는 `objectiveScore` 가중치를 바꾸므로 `/optimize`로 추천 순서를 재계산해야 합니다. |
| Impact | hook 코드에 priority 변경 분기 추가. 기존 `priorityChanged` 판정 로직 재사용. |

### Decision 3: 기존 "평가 조건 적용" 버튼·draft 패턴 유지

| Item | Description |
|---|---|
| Decision | 이미 구현된 `eval-apply-btn`과 `draftContext` / `draftPriority` 상태를 그대로 사용합니다. 새 버튼이나 별도 dirty 인디케이터를 도입하지 않습니다. |
| Alternatives | (A) "재계산" 버튼 신설 — 중복 UX. (B) dropdown 변경 시 자동 호출 — 시연 흐름 흐림. |
| Rationale | 패널에 draft / dirty / apply 패턴이 이미 자리잡고 있으며 사용자 흐름이 일관됩니다. UI 텍스트 일부만 의미가 달라진 동작에 맞춰 수정합니다. |
| Impact | "추천 순서는 바뀌지 않고 KPI·비교 결과에만 반영됩니다" 문구를 "우선순위는 추천 순서를, 운영 컨텍스트는 절대 비용을 갱신합니다" 류로 수정. |

### Decision 4: shift·crew 배수 상수의 수치

| Item | Description |
|---|---|
| Decision | `NIGHT_SHIFT_MULTIPLIER = 1.15`, `CREW_BASELINE = 3`, `CREW_PER_PERSON_DELTA = 0.10`. |
| Alternatives | (A) shift 1.20, crew 0.05. (B) shift 1.10, crew 0.15. |
| Rationale | shift 1.15는 `seed_data.py:119` 기존 `shift_factor`와 일치시켜 학습 분포와 정합. crew 0.10/명은 2~5명 범위에서 시각적으로 인지 가능하면서 비현실적 외삽 없는 중간값. |
| Impact | 시연 리허설 후 두 상수만 조정해 튜닝 가능. 모듈 상단에 두어 가시성을 확보합니다. |

## Edge Cases & Error Handling

| Case | Handling | Impact |
|---|---|---|
| `operating_context` 필드 없음 | `loader.get_plan_context`의 기본값 사용 | 기존 호출자는 호환 유지 |
| 일부 필드만 옴 | merge 시 누락 필드는 plan_context 값으로 채움 | 부분 갱신 허용 |
| `crew_size = 0` 또는 음수 | `ge=1, le=6` 검증으로 400 | 비현실 입력 차단 |
| 적용 중 중복 클릭 | `disabled={!isDirty || isPredicting}` (현재 동작) | 중복 요청 방지 |
| `/optimize` 성공, `/predict` 실패 | 추천 순서는 갱신, cost는 이전 값 유지, `isPredicting` 해제 | 부분 갱신 상태가 KPI 영역에 노출되지만 클릭 재시도로 회복 |
| context 배수 0 이하 | `max(0.1, multiplier)` 클램프 | 음수 비용 방지 |

---

## Data Model

| Field | Type | Required | Default | Description |
|---|---|---:|---|---|
| `shift` | `Literal["day","night"]` | No | `day` | 작업 시기 |
| `crew_size` | int (1~6) | No | 3 | 라인 작업 인원수 |

```mermaid
erDiagram
  PLAN_CONTEXT_JSON ||--|| OPERATING_CONTEXT : "default values"
  REQUEST_BODY ||--|| OPERATING_CONTEXT : "override fields"
  DECISIONS ||--|| OPERATING_CONTEXT : "stored as visible.shift / visible.crewSize"
```

신규 테이블 없이 SQLite `decisions.visible_json`에 동일 구조로 직렬화됩니다.

## API / Interface

| Method | Path | 변경 |
|---|---|---|
| POST | `/predict` | request에 optional `operating_context: { shift?, crew_size? }` 추가. response 변경 없음 |
| POST | `/optimize` | 동일 |
| POST | `/decisions` | 동일. merge 결과를 `visible.shift` / `visible.crewSize`에 저장 |
| GET | `/plans/{id}` | 변경 없음 (기존 `operating_context` 응답 유지) |

호환성: 모든 신규 필드는 optional이며 누락 시 `plan_context.json`의 값을 사용합니다. 기존 클라이언트는 변경 없이 동작합니다.

## Workflow

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Dirty: dropdown / Likert 변경
  Dirty --> Applying: 평가 조건 적용 클릭
  Applying --> Idle: /optimize (조건부) + /predict 성공
  Applying --> Error: 어느 한쪽 실패
  Error --> Dirty: draft 유지, 사용자 재클릭 가능
```

## Performance

| Item | Target |
|---|---|
| `/predict` p95 | 100ms 미만 (heuristic), 300ms 미만 (XGBoost) |
| `/optimize` p95 | 500ms 미만 (MVP 합성 plan 규모 ≤ 12개) |
| 평가 조건 적용 한 사이클 | 1초 이내 화면 갱신 |

균일 배수 적용은 dict 6개 항목 곱셈이므로 무시 가능한 비용입니다.

## Security

_해당없음_ — 인증·권한 변경 없음. 입력 검증은 Pydantic 범위 검증으로 처리합니다.

## Observability

| 항목 | 설명 |
|---|---|
| logs | `routes_predict` / `routes_optimize` / `routes_decisions`에서 `plan_id`, merged context, fallback 발생 여부를 INFO 로그로 남깁니다. |
| audit records | 확정 시 `visible.shift` / `visible.crewSize`가 기록되어 사후 검토 가능합니다. |
| failure signals | XGBoost fallback 발생 시 기존 `logger.warning` 신호 유지. |

## Migration / Rollback

| 항목 | 설명 |
|---|---|
| migration steps | 백엔드 배포 후 프론트 배포. 백엔드는 신규 필드를 optional로 받아 기존 프론트와 호환됩니다. |
| backward compatibility | `operating_context` 누락 시 기존 동작과 동일하므로 무중단 배포 가능합니다. |
| rollback method | 균일 배수만 비활성화하려면 `_operating_context_multiplier`가 항상 1.0을 반환하도록 한 줄 수정. 라우트 변경은 그대로 둬도 무해합니다. |
| data recovery concerns | SQLite `visible_json` 스키마는 기존 키만 사용하므로 마이그레이션 불필요. |

---

## Implementation Status (2026-05-21)

| Part | 범위 | 상태 |
|---|---|---|
| 백엔드 (B1~B8) | `cost_predictor`, routes, optimizer, decision_logger, tests | **완료** |
| 프론트엔드 (F1~F6) | types, mappers, client, `useDecisionPage`, `EvaluationConditionsPanel` | **완료** |
| 자동화 검증 | pytest multiplier + routes, `npm run build` | **통과** (아래 Verification) |
| 통합·시연 검증 | dev 서버 수동 시나리오 | **대기** |

### 구현 후 프론트 동작 요약

| 항목 | 상태 |
|---|---|
| draft / apply 패턴 | `EvaluationConditionsPanel` — dropdown·Likert는 draft만, 「평가 조건 적용」 시 부모 hook 호출 |
| `handleApplyEvaluationConditions` | priority 변경 → `/optimize` + `/predict`; context만 변경 → `/predict` 1회; 둘 다 `operating_context` 전파 |
| `operatingContext` 요청 전파 | `postOptimize`·`postPredict`·`postDecisions` + 진입·D&D·초기화·확정 경로 |
| UI 안내 텍스트 | 우선순위=추천 순서, 컨텍스트=절대 비용 보정 문구로 갱신 |
| `crew_size` 옵션 | 2~5명 — 백엔드 `ge=1, le=6`와 정합 |

## Ownership

| Part | Owner | 상태 |
|---|---|---|
| 백엔드 (B1~B8) | 백엔드 담당 | **완료** |
| 프론트엔드 (F1~F6) | 프론트엔드 담당 | **완료** (2026-05-21) |
| 통합 검증 | 양측 합류 | 자동화 통과 — **수동 시연 리허설 대기** |

신규 필드는 모두 optional이므로 `operating_context` 미전송 시 `plan_context.json` 기본값으로 계산됩니다 (하위 호환 유지).

## Backend Tasks (B1~B8)

| # | 상태 | 파일 | 변경 내용 |
|---:|:---:|---|---|
| B1 | ✓ | `backend/app/services/cost_predictor.py` | `NIGHT_SHIFT_MULTIPLIER`, `CREW_BASELINE`, `CREW_PER_PERSON_DELTA`, `_operating_context_multiplier`, baseline 치환 후 6차원 균일 배수 |
| B2 | ✓ | `backend/app/api/routes_predict.py` | optional `operating_context` + merge |
| B3 | ✓ | `backend/app/api/routes_optimize.py` | 동일 |
| B4 | ✓ | `backend/app/services/optimizer.py` | `operating_context` 인자 전파 |
| B5 | ✓ | `backend/app/services/decision_logger.py` | 확정 스냅샷 `visible.shift` / `visible.crewSize` |
| B6 | ✓ | `backend/app/data/seed_data.py` | `NIGHT_SHIFT_MULTIPLIER` import |
| B7 | ✓ | `backend/tests/test_cost_predictor.py` | multiplier 회귀 |
| B8 | ✓ | `backend/tests/test_operating_context_routes.py` | 순서 보존·스냅샷·호환·검증 400 |

## Frontend Tasks (F1~F6)

| # | 상태 | 파일 | 변경 내용 |
|---:|:---:|---|---|
| F1 | ✓ | `frontend/src/api/types.ts` | `OperatingContextOverride` + optimize/predict/decisions 요청 필드 |
| F2 | ✓ | `frontend/src/api/mappers.ts` | `toOperatingContextOverrideRaw`, `to*Request` 직렬화 |
| F3 | ✓ | `frontend/src/api/client.ts` | `postOptimize` / `postPredict` / `postDecisions` |
| F4 | ✓ | `frontend/src/hooks/useDecisionPage.ts` | apply 분기, `runPredict`·진입·D&D·확정에 context 전파; 우선순위 재적용 시 `currentSequence` 보존 |
| F5 | ✓ | `frontend/src/api/mappers.ts` | `applyOptimizeResponse` / `applyPredictResponse` — KPI·비용 갱신 경로 확인 |
| F6 | ✓ | `frontend/src/components/EvaluationConditionsPanel.tsx` | InfoTip·footer 문구 |
| — | ✓ | `frontend/src/utils/operatingContext.ts` | `operatingContextEqual`, `toOperatingContextOverride` (공통 유틸) |

### 프론트엔드 인계 시 백엔드가 제공하는 계약 요약

| 항목 | 보장 |
|---|---|
| 요청 필드 | `operating_context` (snake_case)는 optional. 누락 시 `plan_context.json` 기본값 사용 |
| 부분 필드 | `shift`만 또는 `crew_size`만 보내도 됨. 누락 필드는 서버에서 기본값으로 채움 |
| 응답 스키마 | 기존 응답 형태 동일. 신규 필드 없음 |
| 순서 보존 | `priority_profile` 동일·`operating_context`만 변경 시 `/optimize` 응답의 `plan_item_id[]`는 baseline과 완전히 동일 |
| 절대 비용 | 6개 비용 차원 모두 동일 배수 (`NIGHT_SHIFT_MULTIPLIER × (1 + 0.10 × (crew_size - 3))`) 적용 |
| 확정 스냅샷 | `POST /decisions` 요청의 `operating_context`가 그대로 `visible.shift` / `visible.crewSize`에 기록됨 |

## Verification

### 백엔드 (자동화 — 2026-05-21 통과)

| 검증 항목 | 방법 | 기대 결과 | 결과 |
|---|---|---|---|
| heuristic 균일 배수 | `pytest tests/test_cost_predictor.py -k multiplier` | night ×1.15, crew 5 ×1.20, 조합 ×1.38 | ✓ |
| 순서 보존 | `pytest tests/test_operating_context_routes.py` | context만 변경 시 `plan_item_id[]` 동일 | ✓ |
| 확정 스냅샷 정합성 | 동일 파일 `test_decisions_round_trip_*` | `visible.shift` / `visible.crewSize` 일치 | ✓ |
| 호환성 | `test_optimize_without_operating_context` | `plan_context.json` 기본값 | ✓ |
| invalid context 400 | shift/crew 범위 밖 | 400 | ✓ |
| XGBoost 균일 배수 | 모델 로드 환경에서 동일 케이스 | heuristic과 동일 비율 | 수동 (선택) |
| 우선순위 변경 시 순서 변동 | routes 또는 dev smoke | `plan_item_id[]` 변동 가능 | 수동 (시연) |

```bash
cd backend && source .venv/bin/activate
pytest tests/test_cost_predictor.py -k multiplier tests/test_operating_context_routes.py -q
# 10 passed (2026-05-21)
```

### 프론트엔드

| 검증 항목 | 방법 | 기대 결과 | 결과 |
|---|---|---|---|
| 빌드 | `cd frontend && npm run build` | tsc + vite 성공 | ✓ (2026-05-21) |
| 프론트 UX | dev 서버 수동 | draft / apply, 순서·비용 분리 반영 | **대기** |
| 통합 시나리오 | FE+BE dev 연결 후 1회 리허설 | KPI/순서/스냅샷 일관 | **대기** |

## Open Questions

| Question | Owner | Blocking? | Notes |
|---|---|---:|---|
| 시연 리허설 후 `CREW_PER_PERSON_DELTA = 0.10`의 시각적 효과 적정성 | 도메인 책임자 | No | ±0.05 범위 내 미세 조정 가능 |
| `/optimize` 실패 시 사용자 피드백 UX | 프론트 담당 | No | 토스트·재시도 버튼 어느 쪽이든 첫 구현은 토스트로 |

## Out of Scope

| Item | Reason |
|---|---|
| 다중 라인 (LINE-02 이상) | P2 범위 |
| XGBoost 재학습 | post-hoc 배수로 충분 |
| shift별 비균일 비용 모델 | Decision 1 참조 |
| 운영 컨텍스트 변경 이력 audit log | 확정 스냅샷에 기록되는 것으로 충분 |
| "재계산" 별도 버튼 신설 | 기존 "평가 조건 적용" 재사용 |

# SmartFactoryV2 구현 로드맵

> 목적: 이 문서는 해커톤 MVP 구현을 Codex가 바로 따라갈 수 있도록 정리한 실행 기준 문서입니다.  
> 원본 기준: `docs/source/roadmap.jpeg`  
> 적용 범위: FastAPI 백엔드, React 프론트엔드, 합성 데이터, XGBoost, OR-tools, SQLite 로그, KPI 대시보드

---

## 1. 전체 구현 원칙

SmartFactoryV2는 다품종 도료 제조 공장의 생산 순서 의사결정 시스템 MVP입니다. 핵심은 복잡한 제조 시스템 전체를 구현하는 것이 아니라, **생산 순서 추천 → 사용자의 what-if 수정 → 비용/위험 재계산 → 최종 확정 → KPI 반영** 흐름을 실제로 동작하게 만드는 것입니다.

| 원칙 | 내용 |
|---|---|
| MVP 우선 | 완성도 높은 일부 흐름을 먼저 구현합니다. 전체 기능을 얕게 만드는 방식은 피합니다. |
| 수직 슬라이스 우선 | 데이터 생성, 백엔드 API, 최적화, 예측, UI, 저장, 대시보드까지 한 흐름을 연결합니다. |
| fallback 필수 | XGBoost, OR-tools, LLM이 실패해도 API와 시연 흐름은 깨지지 않아야 합니다. |
| 과설계 금지 | 다중 라인, 납기 제약, MES/ERP 연동, 권한/로그인, 운영자 관리 화면은 제외합니다. |
| 기준 문서 우선 | 구현 중 판단이 흔들리면 `docs/roadmap.md`, `docs/api_contract.md`, `docs/db_schema.md`를 우선합니다. |

---

## 2. MVP 핵심 시연 흐름

```text
[페이지 진입]
  ↓
GET /plans/{planId}
  ↓
POST /optimize
  ↓
AI 추천 순서 recommendedSequence 표시
  ↓
사용자 Drag & Drop으로 currentSequence 변경
  ↓
POST /predict
  ↓
추천안 대비 현재안 비용/위험 비교
  ↓
POST /decisions
  ↓
SQLite 의사결정 로그 저장
  ↓
GET /dashboard
  ↓
KPI 대시보드 반영
```

---

## 3. 우선순위 범위

| 구분 | 범위 | 구현 기준 |
|---|---|---|
| P0 | 합성 데이터, XGBoost 비용 예측, OR-tools 최적화, D&D UI, sequence risk validation, priority profile, SQLite 저장 | 실시간 동작 필수 |
| P1 | LLM-style 설명, KPI 대시보드 차트, 7차원 비용 추이, 주간 요약 | 시연 포함. 단, template/cache fallback 허용 |
| P2 | 작업자 뷰, 품질 영향 예측, 실 MES/ERP 연동, 다중 라인 최적화, 실시간 설비 로그 | 이번 MVP에서는 구현하지 않음 |

---

## 4. Day 1 — 문서 스키마 확정 + 합성 데이터 생성

Day 1의 목표는 **실행 가능한 물리 기준을 만드는 것**입니다. 설계 문서를 더 늘리는 단계가 아니라, 이후 코드가 참조할 DDL, CSV, JSON, 데이터 생성 스크립트를 확정합니다.

| 영역 | 작업 | 완료 기준 |
|---|---|---|
| SQL | SQLite 중심의 실행 가능한 초기 DDL 작성 | `backend/app/db/schema.sql` 생성. `decisions`, `plan_context`, `weekly_report_cache` 포함 |
| SQL | DB_state v1.3의 논리 스키마를 물리 스키마로 변환 | `TEXT`, `INTEGER`, `REAL`, `NOT NULL`, `DEFAULT`, `CHECK` 제약 정리 |
| CSV/JSON | 합성 데이터 기준 파일 생성 | `sku_master.csv`, `daily_plan.csv`, `transition_history.csv`, `sequence_rules.json` 생성 |
| Python | 합성 데이터 생성 스크립트 작성 | 고정 seed 기반으로 재현 가능한 데이터 생성 |
| Python | XGBoost 학습용 데이터 분할 기준 마련 | train/test 분리 가능 구조 준비 |

### Day 1 세부 기준

| 파일 | 역할 |
|---|---|
| `backend/app/data/raw/sku_master.csv` | 12개 색상 SKU 기준정보 |
| `backend/app/data/raw/daily_plan.csv` | 기본 시연용 생산계획. 화면에는 5개 항목부터 표시 가능 |
| `backend/app/data/raw/transition_history.csv` | XGBoost 학습용 전환 이력 |
| `backend/app/data/raw/sequence_rules.json` | 색상 전환 penalty 및 risk warning 룰 |
| `scripts/seed_data.py` | 위 파일들을 재생성하는 스크립트 |
| `backend/app/db/schema.sql` | SQLite 초기 물리 스키마 |

### Day 1 주의사항

`sku_master`는 전체 SKU 기준정보이고, 실제 최적화 대상은 `daily_plan`의 `plan_item_id`입니다. 따라서 추천 순서, 현재 순서, 확정 순서는 모두 `sku_id[]`가 아니라 `plan_item_id[]`로 관리합니다.

---

## 5. Day 2 — FastAPI 및 AI 엔진 골격 + XGBoost 1차

Day 2의 목표는 **백엔드 API와 AI 계산 엔진의 최소 동작 버전**을 만드는 것입니다.

| 영역 | 작업 | 완료 기준 |
|---|---|---|
| FastAPI | API 라우터와 Pydantic 모델 구성 | 주요 엔드포인트가 200 응답 또는 실제 결과를 반환 |
| FastAPI | 폴더/라우터/서비스 분리 | route handler와 service logic 분리 |
| ML | XGBoost 학습 스크립트 작성 | `transition_history.csv`로 모델 학습 가능 |
| ML | 모델 저장/로드 구조 작성 | `model.pkl` 또는 유사 파일을 저장하고 API에서 로드 |
| OR-tools | 최적화 함수 작성 | plan item sequence를 받아 최소 비용 순서를 반환 |
| Fallback | ML/OR-tools 실패 대비 | heuristic predictor와 brute-force optimizer 준비 |

### Day 2 API skeleton

| API | 목적 | Day 2 기준 |
|---|---|---|
| `GET /health` | 서버 상태 확인 | 실제 동작 |
| `GET /plans/{planId}` | 생산계획 조회 | 합성 CSV 기반 응답 |
| `POST /optimize` | 추천 순서 생성 | OR-tools 또는 fallback으로 결과 반환 |
| `POST /predict` | 현재 순서 비용 평가 | XGBoost 또는 heuristic으로 결과 반환 |
| `POST /validate` | 색상 전환 위험 검증 | Rule Engine 기반 경고 반환 |
| `POST /decisions` | 확정 로그 저장 | SQLite 저장 가능 |
| `GET /dashboard` | KPI 집계 조회 | 저장 로그 기반 최소 응답 |
| `POST /explain` | 설명 생성 | template 기반 응답 우선 |

---

## 6. Day 3 — React UI 골격 + D&D 연결

Day 3의 목표는 **사용자가 실제로 순서를 바꾸고 비용 변화를 볼 수 있는 화면**을 만드는 것입니다.

| 영역 | 작업 | 완료 기준 |
|---|---|---|
| React | Decision page 구성 | 생산계획 카드와 추천/현재 순서 표시 |
| React | dnd-kit 연결 | Drag & Drop으로 `currentSequence` 변경 가능 |
| React | `/predict` 연동 | 드롭 완료 후 비용/위험 재계산 |
| React | 우선순위 패널 | 5단계 라벨 선택 UI 구현 |
| React | 비교 패널 | `objectiveScore`, cost breakdown, risk warnings 표시 |
| React | 설명 버튼 | 클릭 시 `/explain` 호출. 자동 호출 금지 |

### Day 3 화면 State 기준

| State | 설명 |
|---|---|
| `planItems` | 화면 카드 렌더링 기준 |
| `recommendedSequence` | 최초 추천 기준선. 페이지 진입 시 `/optimize` 결과로 고정 |
| `currentSequence` | 사용자가 D&D로 조정하는 현재 순서 |
| `priorityProfile` | 5단계 라벨 기반 운영 우선순위 |
| `currentEvaluation` | 현재 순서의 비용/위험 평가 |
| `baselineEvaluation` | 추천 기준선의 비용/위험 평가 |
| `comparisonState` | 추천안 대비 현재안 비교 결과 |
| `comparisonSummary` | rule/template 기반 한 줄 요약 |
| `selectedTransition` | 사용자가 선택한 전환 구간 |
| `riskWarnings` | soft warning 목록 |
| `isExplanationStale` | 순서/우선순위 변경 후 설명이 오래되었는지 여부 |

---

## 7. Day 4 — 핵심 로직 완성 + 로그 DB

Day 4의 목표는 **추천/현재안 비교 계산의 기준을 통일하고, 확정 결과를 신뢰 가능한 로그로 저장하는 것**입니다.

| 영역 | 작업 | 완료 기준 |
|---|---|---|
| FastAPI | `/predict` 완성 | 추천안과 현재안을 동일 기준으로 평가 |
| FastAPI | 비용 계산 통합 | `totalWeightedCost + sequencePenalty = objectiveScore` 적용 |
| FastAPI | `/decisions` 저장 완성 | 서버 재계산 후 SQLite 저장 |
| SQLite | 로그 필드 정리 | priority, applied weights, context snapshot, comparison, risk warnings 저장 |
| LLM/P1 | 설명 생성 구조 작성 | template fallback 우선. 실제 LLM은 선택 사항 |

### Day 4 계산 기준

```text
objectiveScore = totalWeightedCost + sequencePenalty
```

| 값 | 의미 |
|---|---|
| `totalWeightedCost` | XGBoost 또는 fallback predictor가 계산한 6차원 비용에 applied weight를 적용한 값 |
| `sequencePenalty` | Rule Engine이 계산한 색상 전환 penalty |
| `objectiveScore` | 추천안/현재안 비교 및 OR-tools 최적화의 최종 기준 점수 |

### `/decisions` 저장 정책

프론트엔드가 보낸 마지막 계산 결과를 그대로 저장하지 않습니다. 서버는 확정 시점에 `confirmedSequence`를 다시 평가하고, 재계산된 결과를 SQLite에 저장합니다.

---

## 8. Day 5 — KPI 대시보드 + 보고

Day 5의 목표는 **저장된 의사결정 로그를 운영 리뷰 화면으로 연결하는 것**입니다.

| 영역 | 작업 | 완료 기준 |
|---|---|---|
| Backend | `GET /dashboard` 집계 로직 | decisions 로그 기반 KPI 반환 |
| Frontend | Dashboard page 구성 | KPI 카드와 차트 표시 |
| Chart | Recharts 적용 | LineChart, BarChart 등 최소 차트 표시 |
| Report | weekly summary | template 기반 주간 요약 생성 |
| Review | reviewed toggle | recent decisions에 검토 여부 표시 |

### Day 5 대시보드 항목

| 항목 | 설명 |
|---|---|
| decision count | 저장된 의사결정 건수 |
| average objective score | 평균 최종 목적 점수 |
| high-risk transition count | 고위험 전환 발생 횟수 |
| cost trend | 날짜/결정별 비용 추이 |
| risk patterns | 반복 발생하는 위험 전환 패턴 |
| recent decisions | 최근 확정 로그 목록 |
| weekly summary | 주간 운영비/다운타임/리스크 요약 |

---

## 9. Day 6~7 — 통합 시연 + fallback 점검

Day 6~7의 목표는 **심사/시연 중 깨지지 않는 전체 흐름**을 만드는 것입니다.

| 영역 | 작업 | 완료 기준 |
|---|---|---|
| 시연 | 전체 시나리오 리허설 | 페이지 진입부터 KPI 반영까지 끊김 없이 동작 |
| 안정화 | fallback 점검 | XGBoost/OR-tools/LLM 실패 시에도 결과 반환 |
| 성능 | 응답 지연 점검 | `/predict`가 UI 조작 흐름을 방해하지 않음 |
| 문서 | README 보강 | 실행 방법, 시연 순서, known limitations 정리 |
| QA | 최소 테스트 | 주요 API와 rule engine 테스트 |

### 통합 시연 시나리오

```text
1. Decision page 진입
2. GET /plans/{planId} 호출
3. POST /optimize 호출
4. recommendedSequence 표시
5. 사용자가 D&D로 순서 변경
6. POST /predict 호출
7. 비용/위험/summary 변경 확인
8. 설명 생성 버튼 클릭
9. POST /explain 호출
10. 최종 확정
11. POST /decisions 저장
12. Dashboard page 이동
13. GET /dashboard 호출
14. KPI에 방금 저장한 결정이 반영되는지 확인
```

---

## 10. API 구현 우선순위

| 순서 | API | 우선순위 | 구현 기준 |
|---:|---|---|---|
| 1 | `GET /health` | P0 | 서버 실행 확인 |
| 2 | `GET /plans/{planId}` | P0 | 합성 생산계획 로드 |
| 3 | `POST /optimize` | P0 | 추천 순서 생성 |
| 4 | `POST /predict` | P0 | 현재안/추천안 동일 기준 평가 |
| 5 | `POST /validate` | P0 | Rule Engine 경고 반환 |
| 6 | `POST /decisions` | P0 | SQLite 저장 |
| 7 | `GET /decisions/{decisionId}` | P0/P1 | 확정 로그 조회 |
| 8 | `GET /dashboard` | P1 | KPI 집계 |
| 9 | `POST /explain` | P1 | template 또는 LLM 설명 |
| 10 | `PATCH /decisions/{decisionId}/reviewed` | P1 | KPI 리뷰 처리 |

---

## 11. Codex 작업 순서

처음부터 전체 MVP를 한 번에 만들지 않습니다. 다음 순서로 진행합니다.

| Step | Codex 작업 | 산출물 |
|---:|---|---|
| 1 | repo 구조 초기화 | monorepo folder, README, AGENTS, docs |
| 2 | roadmap 문서화 | `docs/roadmap.md`, `docs/demo_flow.md` |
| 3 | DB 물리 스키마 작성 | `backend/app/db/schema.sql` |
| 4 | 합성 데이터 생성 | `scripts/seed_data.py`, raw CSV/JSON |
| 5 | FastAPI skeleton | `/health`, router/service 구조 |
| 6 | P0 backend vertical slice | `/plans`, `/optimize`, `/predict`, `/validate`, `/decisions` |
| 7 | React decision page | D&D, cost panel, warning panel |
| 8 | dashboard | KPI API + Recharts page |
| 9 | explanation | template fallback 기반 `/explain` |
| 10 | demo hardening | fallback, README, 테스트, 시연 스크립트 |

---

## 12. 초기 Definition of Done

초기화 단계는 아래 조건을 만족하면 완료입니다.

| 완료 조건 | 기준 |
|---|---|
| repo 구조 존재 | backend/frontend/docs/scripts 폴더 생성 |
| 기준 문서 존재 | README, AGENTS, roadmap, API contract, DB schema 작성 |
| backend 실행 가능 | FastAPI가 시작되고 `/health`가 OK 반환 |
| synthetic data 생성 가능 | seed script 실행 시 CSV/JSON 생성 |
| SQLite schema 존재 | `schema.sql` 작성 완료 |
| service skeleton 존재 | predictor, optimizer, rule engine, decision logger 파일 생성 |
| frontend 실행 가능 | Vite React 앱이 시작되거나 setup 방법 문서화 |
| 구현 로그 존재 | `docs/implementation_log.md`에 현재 상태 기록 |

---

## 13. 구현 중 금지 사항

| 금지 항목 | 이유 |
|---|---|
| 다중 라인 최적화 구현 | MVP 범위 초과 |
| 납기/시간창/선후행 강제 제약 추가 | OR-tools 모델 복잡도 증가 |
| 로그인/권한 기능 추가 | 시연 핵심 흐름과 무관 |
| 실 MES/ERP 연동 | 해커톤 MVP 범위 초과 |
| LLM 자동 호출 남발 | 비용, 지연, 불안정성 증가 |
| 프론트 디자인 과몰입 | 핵심 계산 흐름보다 우선순위 낮음 |
| 완벽한 ML 성능 추구 | 시연에는 안정적이고 설명 가능한 결과가 더 중요 |

---

## 14. 다음 작업 지시 기준

Codex가 다음 작업을 이어갈 때는 항상 아래 형식으로 진행합니다.

```text
1. 현재 구현 상태를 확인한다.
2. docs/roadmap.md와 docs/implementation_log.md를 먼저 읽는다.
3. 이번 작업 범위를 P0/P1/P2 중 어디에 해당하는지 명시한다.
4. 필요한 파일만 수정한다.
5. fallback이 필요한 외부 의존성은 반드시 fallback path를 둔다.
6. 작업 후 실행 방법과 남은 한계를 docs/implementation_log.md에 기록한다.
```

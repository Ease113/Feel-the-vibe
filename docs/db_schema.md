# SmartFactoryV2 DB 스키마

P0에서는 합성 데이터의 원천을 CSV/JSON으로 유지하되, `docs/source/DB_state_v1.3.md`의 논리 스키마를 실행 가능한 SQLite 물리 스키마로 반영합니다. 실제 DDL 기준 파일은 `backend/app/db/schema.sql`입니다.

## 테이블 개요

| 테이블 | 우선순위 | 역할 |
|---|---|---|
| `sku_master` | P0 기준정보 | 색상 SKU 기준정보. 현재는 CSV 원천이며 SQLite 적재 확장용 테이블을 둡니다. |
| `sequence_rules` | P0 기준정보 | 색상 전환 penalty와 soft warning rule. 현재 JSON 룰과 DB_state v1.3 표현을 모두 수용합니다. |
| `daily_plan` | P0 계획 | 생산계획 항목. sequence stable key는 `plan_item_id`입니다. |
| `plan_context` | P0 권장 | 계획별 운영 context. 화면 노출값과 서버 보정 피처를 함께 저장할 수 있습니다. |
| `decisions` | P0 핵심 로그 | 최종 확정된 생산순서 의사결정 로그와 KPI 집계 원천입니다. |
| `weekly_report_cache` | P1 | 주간 요약 cache입니다. |

## 핵심 정책

- 추천/현재/확정 순서는 모두 `plan_item_id[]` JSON 배열로 저장합니다.
- `daily_plan`은 `(plan_id, plan_item_id)` 복합 PK입니다. 하나의 `plan_id`에 여러 항목이 들어가므로 `plan_id` 단독 UNIQUE 제약을 두지 않습니다.
- CSV/JSON 기반 MVP 흐름을 유지하기 위해 `plan_context`, `decisions`는 `daily_plan.plan_id`에 FK를 강제하지 않고 논리 참조로 관리합니다.
- `decisions`는 프론트엔드가 보낸 비용 값을 신뢰하지 않고 서버 재계산 결과를 저장합니다.
- 최종 비교 기준은 `objective_score = total_weighted_cost + sequence_penalty`입니다.

## `decisions` 주요 컬럼

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `decision_id` | TEXT PRIMARY KEY | decision 식별자 |
| `plan_id` | TEXT NOT NULL | 생산계획 ID |
| `recommended_sequence` | TEXT NOT NULL | JSON text, 추천 `plan_item_id[]` |
| `confirmed_sequence` | TEXT NOT NULL | JSON text, 확정 `plan_item_id[]` |
| `priority_profile` | TEXT NOT NULL | JSON text, 운영자 우선순위 라벨 |
| `applied_weights` | TEXT NOT NULL | JSON text, multiplier 적용 후 재정규화된 가중치 |
| `context_snapshot` | TEXT NOT NULL | JSON text, visible/resolved 운영 조건 |
| `recommended_cost_vector` | TEXT | JSON text, 추천안 평가 결과 |
| `confirmed_cost_vector` | TEXT NOT NULL | JSON text, 확정안 평가 결과 |
| `transition_costs` | TEXT | JSON text, 전환별 비용 상세 |
| `total_weighted_cost` | REAL NOT NULL | 확정안의 순수 가중합 비용 |
| `sequence_penalty` | REAL NOT NULL | 색상 전환 penalty 합계 |
| `objective_score` | REAL NOT NULL | 확정안 최종 목적 점수 |
| `comparison_state` | TEXT NOT NULL | JSON text, 추천안 대비 확정안 비교 |
| `comparison_summary` | TEXT NOT NULL | rule/template 기반 한 줄 요약 |
| `violation_count` | INTEGER NOT NULL | 색상 전환 warning 건수 |
| `violation_details` | TEXT NOT NULL | JSON text, warning 상세 |
| `reviewed` | INTEGER NOT NULL DEFAULT 0 | KPI 검토 여부 |
| `model_version` | TEXT NOT NULL | 비용 예측 모델 버전 |
| `rule_version` | TEXT NOT NULL | rule engine 버전 |
| `confirmed_at` | TEXT NOT NULL | ISO datetime |

## 호환성 메모

기존 demo DB 파일이 구형 `decisions.recommended_cost`, `confirmed_cost`, `created_at` 컬럼을 가지고 있을 수 있습니다. 런타임 저장 로직은 신형 스키마와 구형 demo DB를 모두 처리하지만, 새 물리 스키마를 완전히 적용하려면 demo DB를 재생성해야 합니다.

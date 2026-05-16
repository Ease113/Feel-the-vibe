# SmartFactoryV2 DB 스키마

P0에서는 기준정보와 학습 데이터는 CSV/JSON으로 유지하고, 최종 의사결정 로그와 KPI 집계 원천만 SQLite에 저장합니다.

## 테이블 개요

| 테이블 | 우선순위 | 역할 |
|---|---|---|
| `decisions` | P0 | 최종 확정된 생산순서 의사결정 로그 |
| `plan_context` | P0 권장 | 계획별 운영 context snapshot |
| `weekly_report_cache` | P1 | 주간 요약 cache |

## `decisions`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `decision_id` | TEXT PRIMARY KEY | decision 식별자 |
| `plan_id` | TEXT NOT NULL | 생산계획 ID |
| `recommended_sequence` | TEXT NOT NULL | JSON text, `plan_item_id[]` |
| `confirmed_sequence` | TEXT NOT NULL | JSON text, `plan_item_id[]` |
| `priority_profile` | TEXT NOT NULL | JSON text |
| `recommended_cost` | TEXT NOT NULL | JSON text |
| `confirmed_cost` | TEXT NOT NULL | JSON text |
| `comparison_state` | TEXT NOT NULL | JSON text |
| `violation_details` | TEXT NOT NULL | JSON text |
| `decision_memo` | TEXT | 사용자 메모 |
| `reviewed` | INTEGER NOT NULL DEFAULT 0 | KPI 검토 여부 |
| `model_version` | TEXT NOT NULL | 비용 예측 모델 버전 |
| `rule_version` | TEXT NOT NULL | rule engine 버전 |
| `created_at` | TEXT NOT NULL | ISO datetime |

## 저장 정책

- `POST /decisions`는 프론트엔드가 보낸 비용 값을 신뢰하지 않고 서버에서 재계산한 값을 저장합니다.
- JSON 컬럼은 MVP 단순성을 위해 `TEXT`로 저장합니다.
- KPI 대시보드는 `decisions.confirmed_cost`, `comparison_state`, `violation_details`를 읽어 집계합니다.

## 물리 DDL

실제 DDL은 `backend/app/db/schema.sql`을 기준으로 합니다.

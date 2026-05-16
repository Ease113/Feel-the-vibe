# SmartFactoryV2 API 계약

이 문서는 P0/P1 MVP에서 프론트엔드와 백엔드가 공유하는 API 계약입니다. 모든 sequence 필드는 `sku_id[]`가 아니라 `plan_item_id[]`입니다.

## 공통 계산 기준

```text
objectiveScore = totalWeightedCost + sequencePenalty
```

| 항목 | 설명 |
|---|---|
| `transition_costs` | 인접 생산 항목 전환별 7차원 비용과 warning |
| `aggregated_cost` | sequence 전체의 7차원 비용 합계 |
| `total_weighted_cost` | priority profile multiplier를 적용한 비용 |
| `sequence_penalty` | 색상 전환 rule penalty 합계 |
| `objective_score` | 추천/현재안 비교 기준 점수 |

## GET `/health`

서버 상태를 확인합니다.

```json
{
  "status": "ok",
  "service": "SmartFactoryV2"
}
```

## GET `/plans/{plan_id}`

오늘 생산계획과 화면 초기 context를 반환합니다.

```json
{
  "plan_id": "demo-plan-001",
  "plan_items": [],
  "operating_context": {
    "line_id": "LINE-01",
    "shift": "day",
    "crew_size": 3
  },
  "default_priority_profile": {
    "setup_time": {"label": "NORMAL", "multiplier": 1.0}
  }
}
```

## POST `/optimize`

추천 sequence를 생성합니다.

Request:

```json
{
  "plan_id": "demo-plan-001",
  "plan_item_ids": ["PI-001", "PI-002"],
  "priority_profile": {}
}
```

Response:

```json
{
  "recommended_sequence": ["PI-001", "PI-002"],
  "transition_costs": [],
  "aggregated_cost": {},
  "total_weighted_cost": 0,
  "sequence_penalty": 0,
  "objective_score": 0,
  "risk_warnings": [],
  "model_version": "heuristic-v1",
  "rule_version": "rules-2026.05.v1"
}
```

## POST `/predict`

추천 기준선과 현재 사용자가 편집한 sequence를 같은 기준으로 평가합니다.

Request:

```json
{
  "plan_id": "demo-plan-001",
  "recommended_sequence": ["PI-001"],
  "current_sequence": ["PI-001"],
  "priority_profile": {}
}
```

Response:

```json
{
  "current_evaluation": {},
  "baseline_evaluation": {},
  "comparison_state": {
    "objective_delta": 0,
    "is_better_than_baseline": false
  },
  "comparison_summary": "현재 순서는 추천안과 동일합니다.",
  "applied_weights": {}
}
```

## POST `/validate`

현재 sequence의 색상 전환 warning을 반환합니다. P0에서는 확정 차단 없이 soft warning만 사용합니다.

## POST `/decisions`

최종 확정 sequence를 SQLite에 저장합니다. 서버는 저장 전에 확정 sequence와 추천 sequence를 다시 평가합니다.

## GET `/decisions/{decision_id}`

저장된 의사결정 로그를 조회합니다.

## GET `/dashboard`

SQLite `decisions` 로그 기반 KPI 요약, 추이, 최근 결정을 반환합니다.

## POST `/explain`

현재 비교 상태와 warning 기반의 한국어 template 설명을 반환합니다. 실제 LLM 호출은 P1 이후 선택 사항입니다.

## PATCH `/decisions/{decision_id}/reviewed`

저장된 decision의 검토 여부를 변경합니다. P1 범위입니다.

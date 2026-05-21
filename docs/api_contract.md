# SmartFactoryV2 API 계약

이 문서는 P0/P1 MVP에서 프론트엔드와 백엔드가 공유하는 API 계약입니다. 모든 sequence 필드는 `sku_id[]`가 아니라 `plan_item_id[]`입니다.

## 공통 sequence 및 데모 기준

기본 시연 생산계획은 `demo-plan-001`이며, 초기 화면과 API smoke test는 `PI-001`~`PI-005`를 기준으로 합니다.

```json
["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"]
```

추천 순서, 현재 순서, 확정 순서는 모두 `plan_item_id[]`입니다. 프론트엔드 D&D key와 백엔드 평가 key는 `sku_id[]`가 아니라 항상 `plan_item_id[]`를 사용합니다.

## 공통 계산 기준

```text
objectiveScore = totalWeightedCost + sequencePenalty
```

| 항목 | 설명 |
|---|---|
| `transition_costs` | 인접 생산 항목 전환별 7차원 비용과 warning |
| `aggregated_cost` | sequence 전체의 7차원 비용 합계 |
| `total_weighted_cost` | 서버가 계산한 `applied_weights`를 연속 비용 차원에 적용한 비용 |
| `sequence_penalty` | 색상 전환 rule penalty 합계 |
| `objective_score` | 추천/현재안 비교 기준 점수 |

## 공통 `priority_profile` 구조

`priority_profile`은 DB State 기준의 운영자 우선순위 입력입니다. API wire format은 `snake_case`를 사용하지만 의미 구조는 `base_weight_profile_id`와 `priorities`로 고정합니다.

운영자가 조정하는 항목은 `wash_cost`, `downtime`, `material_loss`, `packaging_time`, `labor_cost` 5개입니다. `setup_time`은 UI 선택 대상에서 제외하지만 서버 기본 가중치에는 포함합니다. `sequence_risk`는 우선순위 항목이 아니라 Rule Engine 결과로만 계산합니다.

허용 라벨과 multiplier는 아래 값으로 고정합니다.

| label | multiplier |
|---|---:|
| `VERY_LOW` | `0.70` |
| `LOW` | `0.85` |
| `NORMAL` | `1.00` |
| `HIGH` | `1.15` |
| `VERY_HIGH` | `1.30` |

예시:

```json
{
  "base_weight_profile_id": "factory_default_v1",
  "priorities": {
    "wash_cost": {"label": "HIGH", "multiplier": 1.15},
    "downtime": {"label": "NORMAL", "multiplier": 1.0},
    "material_loss": {"label": "NORMAL", "multiplier": 1.0},
    "packaging_time": {"label": "LOW", "multiplier": 0.85},
    "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
  }
}
```

## 공통 `applied_weights` 구조

`applied_weights`는 multiplier가 아닙니다. 서버가 공장 기본 가중치에 `priority_profile.priorities`의 multiplier를 적용한 뒤 합계가 1이 되도록 재정규화한 최종 비율입니다.

`applied_weights`에는 `setup_time`, `wash_cost`, `downtime`, `material_loss`, `packaging_time`, `labor_cost`만 포함합니다. `sequence_risk`는 Rule Engine 평가 보조값이므로 `applied_weights`에 포함하지 않습니다.

예시:

```json
{
  "setup_time": 0.134,
  "wash_cost": 0.232,
  "downtime": 0.232,
  "material_loss": 0.134,
  "packaging_time": 0.089,
  "labor_cost": 0.179
}
```

## fallback 기준

비용 예측 모델을 사용할 수 없으면 deterministic heuristic 비용 예측을 사용합니다. 최적화는 OR-tools 경로를 먼저 시도하고, 실패하거나 사용할 수 없으면 8개 이하 plan item은 brute-force 순열 탐색, 9개 이상은 nearest-neighbor fallback을 사용합니다.

## 공통 DTO

### `CostVector`

7개 비용 차원입니다. `aggregated_cost`, `cost_dimensions`는 아래 key를 사용합니다. `sequence_risk`는 Rule Engine severity를 수치화한 평가 보조값이며, priority multiplier 대상이 아닙니다. `sequence_penalty`는 objective에 별도로 더하는 rule penalty입니다.

DB/프론트 문서의 `sequenceViolation` 또는 `sequence_violation` 개념은 API 응답에서 `sequence_risk`와 `sequence_penalty`로 분리해 표현합니다.

```json
{
  "setup_time": 32.32,
  "labor_cost": 82410.9,
  "material_loss": 4.41,
  "wash_cost": 47632.0,
  "downtime": 14.69,
  "sequence_risk": 35.0,
  "packaging_time": 12.94
}
```

### `RiskWarning`

색상 전환 rule이 매칭될 때 생성되는 soft warning입니다. 확정 차단에는 사용하지 않습니다.

```json
{
  "rule_id": "SR-001",
  "severity": "HIGH",
  "from_plan_item_id": "PI-001",
  "to_plan_item_id": "PI-002",
  "penalty": 35.0,
  "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
  "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
}
```

`severity`는 `LOW`, `MEDIUM`, `HIGH` 중 하나입니다. `message`는 `sequence_rules.json`의 `reason`을 응답용으로 전달한 값입니다.

### `TransitionCost`

인접한 두 `plan_item_id` 사이의 전환 비용입니다. `warning`은 `RiskWarning` 또는 `null`입니다. 매칭된 색상 전환 룰이 없는 전환은 `rule_id`, `severity`, `warning`이 모두 `null`이며 `sequence_penalty`는 `0.0`입니다. 이 경우에도 `cost_dimensions.sequence_risk`는 no-rule baseline 값 `1.0`을 가집니다.

```json
{
  "from_plan_item_id": "PI-001",
  "to_plan_item_id": "PI-002",
  "from_sku_id": "SKU-BLACK-001",
  "to_sku_id": "SKU-WHITE-001",
  "cost_dimensions": {
    "setup_time": 32.32,
    "labor_cost": 82410.9,
    "material_loss": 4.41,
    "wash_cost": 47632.0,
    "downtime": 14.69,
    "packaging_time": 12.94,
    "sequence_risk": 35.0
  },
  "rule_id": "SR-001",
  "severity": "HIGH",
  "sequence_penalty": 35.0,
  "warning": {
    "rule_id": "SR-001",
    "severity": "HIGH",
    "from_plan_item_id": "PI-001",
    "to_plan_item_id": "PI-002",
    "penalty": 35.0,
    "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
    "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
  }
}
```

### `SequenceEvaluation`

하나의 sequence를 평가한 결과입니다. `/predict`의 `current_evaluation`, `baseline_evaluation`은 이 구조를 그대로 사용합니다.

```json
{
  "sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
  "transition_costs": [
    {
      "from_plan_item_id": "PI-001",
      "to_plan_item_id": "PI-002",
      "from_sku_id": "SKU-BLACK-001",
      "to_sku_id": "SKU-WHITE-001",
      "cost_dimensions": {
        "setup_time": 32.32,
        "labor_cost": 82410.9,
        "material_loss": 4.41,
        "wash_cost": 47632.0,
        "downtime": 14.69,
        "packaging_time": 12.94,
        "sequence_risk": 35.0
      },
      "rule_id": "SR-001",
      "severity": "HIGH",
      "sequence_penalty": 35.0,
      "warning": {
        "rule_id": "SR-001",
        "severity": "HIGH",
        "from_plan_item_id": "PI-001",
        "to_plan_item_id": "PI-002",
        "penalty": 35.0,
        "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
        "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
      }
    }
  ],
  "aggregated_cost": {
    "setup_time": 111.58,
    "labor_cost": 284529.85,
    "material_loss": 13.95,
    "wash_cost": 168011.33,
    "downtime": 50.71,
    "sequence_risk": 55.0,
    "packaging_time": 46.34
  },
  "total_weighted_cost": 89942.18,
  "sequence_penalty": 53.0,
  "objective_score": 89995.18,
  "risk_warnings": [
    {
      "rule_id": "SR-001",
      "severity": "HIGH",
      "from_plan_item_id": "PI-001",
      "to_plan_item_id": "PI-002",
      "penalty": 35.0,
      "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
      "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
    }
  ],
  "priority_profile": {
    "base_weight_profile_id": "factory_default_v1",
    "priorities": {
      "wash_cost": {"label": "HIGH", "multiplier": 1.15},
      "downtime": {"label": "NORMAL", "multiplier": 1.0},
      "material_loss": {"label": "NORMAL", "multiplier": 1.0},
      "packaging_time": {"label": "LOW", "multiplier": 0.85},
      "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
    }
  },
  "applied_weights": {
    "setup_time": 0.134,
    "wash_cost": 0.232,
    "downtime": 0.232,
    "material_loss": 0.134,
    "packaging_time": 0.089,
    "labor_cost": 0.179
  },
  "model_version": "heuristic-v1",
  "rule_version": "rules-2026.05.v1"
}
```

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
    "base_weight_profile_id": "factory_default_v1",
    "priorities": {
      "wash_cost": {"label": "NORMAL", "multiplier": 1.0},
      "downtime": {"label": "NORMAL", "multiplier": 1.0},
      "material_loss": {"label": "NORMAL", "multiplier": 1.0},
      "packaging_time": {"label": "NORMAL", "multiplier": 1.0},
      "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
    }
  }
}
```

## POST `/optimize`

추천 sequence를 생성합니다.

Request:

```json
{
  "plan_id": "demo-plan-001",
  "plan_item_ids": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
  "priority_profile": {
    "base_weight_profile_id": "factory_default_v1",
    "priorities": {
      "wash_cost": {"label": "HIGH", "multiplier": 1.15},
      "downtime": {"label": "NORMAL", "multiplier": 1.0},
      "material_loss": {"label": "NORMAL", "multiplier": 1.0},
      "packaging_time": {"label": "LOW", "multiplier": 0.85},
      "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
    }
  }
}
```

Response:

```json
{
  "recommended_sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
  "transition_costs": [
    {
      "from_plan_item_id": "PI-003",
      "to_plan_item_id": "PI-001",
      "from_sku_id": "SKU-METAL-001",
      "to_sku_id": "SKU-BLACK-001",
      "cost_dimensions": {
        "setup_time": 27.09,
        "labor_cost": 69087.15,
        "material_loss": 3.18,
        "wash_cost": 40982.0,
        "downtime": 12.32,
        "packaging_time": 12.46,
        "sequence_risk": 1.0
      },
      "rule_id": null,
      "severity": null,
      "sequence_penalty": 0.0,
      "warning": null
    }
  ],
  "aggregated_cost": {
    "setup_time": 93.24,
    "labor_cost": 237779.85,
    "material_loss": 11.29,
    "wash_cost": 144678.0,
    "downtime": 42.39,
    "sequence_risk": 4.0,
    "packaging_time": 44.67
  },
  "total_weighted_cost": 76155.71,
  "sequence_penalty": 0.0,
  "objective_score": 76155.71,
  "risk_warnings": [],
  "model_version": "heuristic-v1",
  "rule_version": "rules-2026.05.v1",
  "optimizer_backend": "ortools-routing-open-path"
}
```

`optimizer_backend`는 `trivial`, `ortools-routing-open-path`, `brute-force-fallback`, `nearest-neighbor-fallback` 중 하나입니다. 그 외 필드는 `SequenceEvaluation`에서 `sequence`, `priority_profile`, `applied_weights`를 제외하고 `recommended_sequence`를 추가한 구조입니다.

## POST `/predict`

추천 기준선과 현재 사용자가 편집한 sequence를 같은 기준으로 평가합니다.

Request:

```json
{
  "plan_id": "demo-plan-001",
  "recommended_sequence": ["PI-002", "PI-005", "PI-004", "PI-003", "PI-001"],
  "current_sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
  "priority_profile": {
    "base_weight_profile_id": "factory_default_v1",
    "priorities": {
      "wash_cost": {"label": "HIGH", "multiplier": 1.15},
      "downtime": {"label": "NORMAL", "multiplier": 1.0},
      "material_loss": {"label": "NORMAL", "multiplier": 1.0},
      "packaging_time": {"label": "LOW", "multiplier": 0.85},
      "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
    }
  }
}
```

Response:

```json
{
  "current_evaluation": {
    "sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
    "transition_costs": [
      {
        "from_plan_item_id": "PI-001",
        "to_plan_item_id": "PI-002",
        "from_sku_id": "SKU-BLACK-001",
        "to_sku_id": "SKU-WHITE-001",
        "cost_dimensions": {
          "setup_time": 32.32,
          "labor_cost": 82410.9,
          "material_loss": 4.41,
          "wash_cost": 47632.0,
          "downtime": 14.69,
          "packaging_time": 12.94,
          "sequence_risk": 35.0
        },
        "rule_id": "SR-001",
        "severity": "HIGH",
        "sequence_penalty": 35.0,
        "warning": {
          "rule_id": "SR-001",
          "severity": "HIGH",
          "from_plan_item_id": "PI-001",
          "to_plan_item_id": "PI-002",
          "penalty": 35.0,
          "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
          "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
        }
      }
    ],
    "aggregated_cost": {
      "setup_time": 111.58,
      "labor_cost": 284529.85,
      "material_loss": 13.95,
      "wash_cost": 168011.33,
      "downtime": 50.71,
      "sequence_risk": 55.0,
      "packaging_time": 46.34
    },
    "total_weighted_cost": 89942.18,
    "sequence_penalty": 53.0,
    "objective_score": 89995.18,
    "risk_warnings": [
      {
        "rule_id": "SR-001",
        "severity": "HIGH",
        "from_plan_item_id": "PI-001",
        "to_plan_item_id": "PI-002",
        "penalty": 35.0,
        "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
        "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
      }
    ],
    "priority_profile": {
      "base_weight_profile_id": "factory_default_v1",
      "priorities": {
        "wash_cost": {"label": "HIGH", "multiplier": 1.15},
        "downtime": {"label": "NORMAL", "multiplier": 1.0},
        "material_loss": {"label": "NORMAL", "multiplier": 1.0},
        "packaging_time": {"label": "LOW", "multiplier": 0.85},
        "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
      }
    },
    "applied_weights": {
      "setup_time": 0.134,
      "wash_cost": 0.232,
      "downtime": 0.232,
      "material_loss": 0.134,
      "packaging_time": 0.089,
      "labor_cost": 0.179
    },
    "model_version": "heuristic-v1",
    "rule_version": "rules-2026.05.v1"
  },
  "baseline_evaluation": {
    "sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
    "transition_costs": [
      {
        "from_plan_item_id": "PI-003",
        "to_plan_item_id": "PI-001",
        "from_sku_id": "SKU-METAL-001",
        "to_sku_id": "SKU-BLACK-001",
        "cost_dimensions": {
          "setup_time": 27.09,
          "labor_cost": 69087.15,
          "material_loss": 3.18,
          "wash_cost": 40982.0,
          "downtime": 12.32,
          "packaging_time": 12.46,
          "sequence_risk": 1.0
        },
        "rule_id": null,
        "severity": null,
        "sequence_penalty": 0.0,
        "warning": null
      }
    ],
    "aggregated_cost": {
      "setup_time": 93.24,
      "labor_cost": 237779.85,
      "material_loss": 11.29,
      "wash_cost": 144678.0,
      "downtime": 42.39,
      "sequence_risk": 4.0,
      "packaging_time": 44.67
    },
    "total_weighted_cost": 76155.71,
    "sequence_penalty": 0.0,
    "objective_score": 76155.71,
    "risk_warnings": [],
    "priority_profile": {
      "base_weight_profile_id": "factory_default_v1",
      "priorities": {
        "wash_cost": {"label": "HIGH", "multiplier": 1.15},
        "downtime": {"label": "NORMAL", "multiplier": 1.0},
        "material_loss": {"label": "NORMAL", "multiplier": 1.0},
        "packaging_time": {"label": "LOW", "multiplier": 0.85},
        "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
      }
    },
    "applied_weights": {
      "setup_time": 0.134,
      "wash_cost": 0.232,
      "downtime": 0.232,
      "material_loss": 0.134,
      "packaging_time": 0.089,
      "labor_cost": 0.179
    },
    "model_version": "heuristic-v1",
    "rule_version": "rules-2026.05.v1"
  },
  "comparison_state": {
    "basis": "objectiveScore",
    "recommended": 76155.71,
    "current": 89995.18,
    "diff": 13839.47,
    "diff_rate": 0.1817
  },
  "comparison_summary": "현재 순서는 추천안보다 목적 점수가 13839.47 높습니다.",
  "applied_weights": {
    "setup_time": 0.134,
    "wash_cost": 0.232,
    "downtime": 0.232,
    "material_loss": 0.134,
    "packaging_time": 0.089,
    "labor_cost": 0.179
  }
}
```

`current_evaluation`과 `baseline_evaluation`은 모두 `SequenceEvaluation`입니다. `comparison_state.diff`는 `current - recommended`입니다. `objective_delta`, `total_weighted_cost_delta`, `sequence_penalty_delta`, `risk_warning_delta`, `is_better_than_baseline`은 구현 편의를 위한 optional 확장 필드로만 사용할 수 있으며 핵심 계약은 `basis`, `recommended`, `current`, `diff`, `diff_rate`입니다.

## POST `/validate`

현재 sequence의 색상 전환 warning을 반환합니다. P0에서는 확정 차단 없이 soft warning만 사용합니다.

Request:

```json
{
  "plan_id": "demo-plan-001",
  "current_sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"]
}
```

Response:

```json
{
  "violation_count": 2,
  "warnings": [
    {
      "rule_id": "SR-001",
      "severity": "HIGH",
      "from_plan_item_id": "PI-001",
      "to_plan_item_id": "PI-002",
      "penalty": 35.0,
      "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
      "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
    },
    {
      "rule_id": "SR-003",
      "severity": "MEDIUM",
      "from_plan_item_id": "PI-003",
      "to_plan_item_id": "PI-004",
      "penalty": 18.0,
      "message": "메탈/특수광택 이후 일반색(mid) 생산은 광택 잔류 리스크가 있습니다.",
      "recommendation": "일반색을 먼저 생산하거나, 세척 시 광택 잔류 여부를 추가 확인하세요."
    }
  ]
}
```

`message`는 `sequence_rules.json`의 `reason` 문구를 응답용으로 전달한 값입니다. MVP의 `/validate`는 soft warning만 반환하며 확정 차단 필드는 응답하지 않습니다.

## POST `/decisions`

최종 확정 sequence를 SQLite에 저장합니다. 서버는 저장 전에 확정 sequence와 추천 sequence를 다시 평가합니다.

Request:

```json
{
  "plan_id": "demo-plan-001",
  "recommended_sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
  "confirmed_sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
  "priority_profile": {
    "base_weight_profile_id": "factory_default_v1",
    "priorities": {
      "wash_cost": {"label": "HIGH", "multiplier": 1.15},
      "downtime": {"label": "NORMAL", "multiplier": 1.0},
      "material_loss": {"label": "NORMAL", "multiplier": 1.0},
      "packaging_time": {"label": "LOW", "multiplier": 0.85},
      "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
    }
  },
  "decision_memo": "시연용 확정 순서"
}
```

`recommended_cost`, `confirmed_cost`, `comparison_state`, `violation_details`는 request schema에 남아 있지만 저장 시 서버가 재계산하므로 신규 프론트엔드는 의존하지 않습니다.

Response:

```json
{
  "decision_id": "DEC-ABC123DEF456",
  "committed_at": "2026-05-17T10:30:00.000000+00:00"
}
```

## GET `/decisions/{decision_id}`

저장된 의사결정 로그를 조회합니다.

Response:

```json
{
  "decision_id": "DEC-ABC123DEF456",
  "plan_id": "demo-plan-001",
  "user_id": "demo-manager",
  "recommended_sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
  "confirmed_sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
  "priority_profile": {
    "base_weight_profile_id": "factory_default_v1",
    "priorities": {
      "wash_cost": {"label": "HIGH", "multiplier": 1.15},
      "downtime": {"label": "NORMAL", "multiplier": 1.0},
      "material_loss": {"label": "NORMAL", "multiplier": 1.0},
      "packaging_time": {"label": "LOW", "multiplier": 0.85},
      "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
    }
  },
  "applied_weights": {
    "setup_time": 0.134,
    "wash_cost": 0.232,
    "downtime": 0.232,
    "material_loss": 0.134,
    "packaging_time": 0.089,
    "labor_cost": 0.179
  },
  "context_snapshot": {
    "visible": {
      "lineId": "LINE-01",
      "shift": "day",
      "crewSize": 3
    },
    "resolved": {
      "workerSkill": 0.6,
      "equipmentCondition": 0.7,
      "daysSinceLastClean": 2,
      "dayOfWeek": 4,
      "contextVersion": "context-v1"
    }
  },
  "recommended_cost_vector": {
    "sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
    "transition_costs": [
      {
        "from_plan_item_id": "PI-003",
        "to_plan_item_id": "PI-001",
        "from_sku_id": "SKU-METAL-001",
        "to_sku_id": "SKU-BLACK-001",
        "cost_dimensions": {
          "setup_time": 27.09,
          "labor_cost": 69087.15,
          "material_loss": 3.18,
          "wash_cost": 40982.0,
          "downtime": 12.32,
          "packaging_time": 12.46,
          "sequence_risk": 1.0
        },
        "rule_id": null,
        "severity": null,
        "sequence_penalty": 0.0,
        "warning": null
      }
    ],
    "aggregated_cost": {
      "setup_time": 93.24,
      "labor_cost": 237779.85,
      "material_loss": 11.29,
      "wash_cost": 144678.0,
      "downtime": 42.39,
      "sequence_risk": 4.0,
      "packaging_time": 44.67
    },
    "total_weighted_cost": 76155.71,
    "sequence_penalty": 0.0,
    "objective_score": 76155.71,
    "risk_warnings": [],
    "priority_profile": {
      "base_weight_profile_id": "factory_default_v1",
      "priorities": {
        "wash_cost": {"label": "HIGH", "multiplier": 1.15},
        "downtime": {"label": "NORMAL", "multiplier": 1.0},
        "material_loss": {"label": "NORMAL", "multiplier": 1.0},
        "packaging_time": {"label": "LOW", "multiplier": 0.85},
        "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
      }
    },
    "applied_weights": {
      "setup_time": 0.134,
      "wash_cost": 0.232,
      "downtime": 0.232,
      "material_loss": 0.134,
      "packaging_time": 0.089,
      "labor_cost": 0.179
    },
    "model_version": "heuristic-v1",
    "rule_version": "rules-2026.05.v1"
  },
  "confirmed_cost_vector": {
    "sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
    "transition_costs": [
      {
        "from_plan_item_id": "PI-001",
        "to_plan_item_id": "PI-002",
        "from_sku_id": "SKU-BLACK-001",
        "to_sku_id": "SKU-WHITE-001",
        "cost_dimensions": {
          "setup_time": 32.32,
          "labor_cost": 82410.9,
          "material_loss": 4.41,
          "wash_cost": 47632.0,
          "downtime": 14.69,
          "packaging_time": 12.94,
          "sequence_risk": 35.0
        },
        "rule_id": "SR-001",
        "severity": "HIGH",
        "sequence_penalty": 35.0,
        "warning": {
          "rule_id": "SR-001",
          "severity": "HIGH",
          "from_plan_item_id": "PI-001",
          "to_plan_item_id": "PI-002",
          "penalty": 35.0,
          "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
          "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
        }
      }
    ],
    "aggregated_cost": {
      "setup_time": 111.58,
      "labor_cost": 284529.85,
      "material_loss": 13.95,
      "wash_cost": 168011.33,
      "downtime": 50.71,
      "sequence_risk": 55.0,
      "packaging_time": 46.34
    },
    "total_weighted_cost": 89942.18,
    "sequence_penalty": 53.0,
    "objective_score": 89995.18,
    "risk_warnings": [
      {
        "rule_id": "SR-001",
        "severity": "HIGH",
        "from_plan_item_id": "PI-001",
        "to_plan_item_id": "PI-002",
        "penalty": 35.0,
        "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
        "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
      }
    ],
    "priority_profile": {
      "base_weight_profile_id": "factory_default_v1",
      "priorities": {
        "wash_cost": {"label": "HIGH", "multiplier": 1.15},
        "downtime": {"label": "NORMAL", "multiplier": 1.0},
        "material_loss": {"label": "NORMAL", "multiplier": 1.0},
        "packaging_time": {"label": "LOW", "multiplier": 0.85},
        "labor_cost": {"label": "NORMAL", "multiplier": 1.0}
      }
    },
    "applied_weights": {
      "setup_time": 0.134,
      "wash_cost": 0.232,
      "downtime": 0.232,
      "material_loss": 0.134,
      "packaging_time": 0.089,
      "labor_cost": 0.179
    },
    "model_version": "heuristic-v1",
    "rule_version": "rules-2026.05.v1"
  },
  "transition_costs": [
    {
      "from_plan_item_id": "PI-001",
      "to_plan_item_id": "PI-002",
      "from_sku_id": "SKU-BLACK-001",
      "to_sku_id": "SKU-WHITE-001",
      "cost_dimensions": {
        "setup_time": 32.32,
        "labor_cost": 82410.9,
        "material_loss": 4.41,
        "wash_cost": 47632.0,
        "downtime": 14.69,
        "packaging_time": 12.94,
        "sequence_risk": 35.0
      },
      "rule_id": "SR-001",
      "severity": "HIGH",
      "sequence_penalty": 35.0,
      "warning": {
        "rule_id": "SR-001",
        "severity": "HIGH",
        "from_plan_item_id": "PI-001",
        "to_plan_item_id": "PI-002",
        "penalty": 35.0,
        "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
        "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
      }
    }
  ],
  "total_weighted_cost": 89942.18,
  "sequence_penalty": 53.0,
  "objective_score": 89995.18,
  "comparison_state": {
    "basis": "objectiveScore",
    "recommended": 76155.71,
    "current": 89995.18,
    "diff": 13839.47,
    "diff_rate": 0.1817
  },
  "comparison_summary": "현재 순서는 추천안보다 목적 점수가 13839.47 높습니다.",
  "cost_delta_vs_recommended": {
    "downtime": 8.32,
    "labor_cost": 46750.0,
    "material_loss": 2.66,
    "packaging_time": 1.67,
    "sequence_risk": 51.0,
    "setup_time": 18.34,
    "wash_cost": 23333.33
  },
  "violation_count": 2,
  "violation_details": [
    {
      "rule_id": "SR-001",
      "severity": "HIGH",
      "from_plan_item_id": "PI-001",
      "to_plan_item_id": "PI-002",
      "penalty": 35.0,
      "message": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
      "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요."
    }
  ],
  "decision_memo": "시연용 확정 순서",
  "reviewed": false,
  "model_version": "heuristic-v1",
  "rule_version": "rules-2026.05.v1",
  "confirmed_at": "2026-05-17T10:30:00.000000+00:00",
  "recommended_cost": {
    "sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"]
  },
  "confirmed_cost": {
    "sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"]
  }
}
```

타임스탬프는 `confirmed_at` 하나로 통일합니다. (POST 응답의 `committed_at`은 DB_state v1.3 §13 표기를 따른 동일 값입니다.) 신규 프론트엔드는 `recommended_cost_vector`, `confirmed_cost_vector`, `confirmed_at`을 우선 사용합니다. `recommended_cost`, `confirmed_cost`는 기존 demo DB 호환 필드이며 신규 의존 대상이 아닙니다. 존재하지 않는 `decision_id`는 404를 반환합니다.

## GET `/dashboard`

SQLite `decisions` 로그 기반 KPI 요약, 추이, 최근 결정을 반환합니다.

Query (optional):

| Param | Type | Default | Description |
|---|---|---|---|
| `recent_page` | integer ≥ 1 | `1` | 최근 확정 결정 목록 페이지 (1부터) |
| `recent_page_size` | integer 1–50 | `5` | 페이지당 최근 결정 건수 |

Response:

```json
{
  "dashboard_summary": {
    "decision_count": 3,
    "average_objective_score": 82145.36,
    "high_risk_transition_count": 4
  },
  "kpi_trend": [
    {
      "decision_id": "DEC-ABC123DEF456",
      "confirmed_at": "2026-05-17T10:30:00.000000+00:00",
      "objective_score": 89995.18,
      "setup_time": 88.0,
      "labor_cost": 326000.0,
      "material_loss": 15.1,
      "wash_cost": 168011.33,
      "downtime": 61.0,
      "packaging_time": 32.0,
      "sequence_risk": 55.0
    }
  ],
  "risk_patterns": [
    {
      "rule_id": "SR-001",
      "count": 2
    }
  ],
  "recent_decisions": [
    {
      "decision_id": "DEC-ABC123DEF456",
      "plan_id": "demo-plan-001",
      "objective_score": 89995.18,
      "risk_warning_count": 2,
      "reviewed": false,
      "confirmed_at": "2026-05-17T10:30:00.000000+00:00"
    }
  ],
  "recent_decisions_meta": {
    "page": 1,
    "page_size": 5,
    "total": 3,
    "total_pages": 1
  },
  "weekly_summary": "이번 기간에는 3건의 생산순서 결정이 저장되었고, 고위험 색상 전환은 4건 감지되었습니다.",
  "weekly_report": {
    "period_start": "2026-05-18",
    "period_end": "2026-05-21",
    "summary": "이번 주 ...",
    "key_findings": ["..."],
    "recommendations": ["..."],
    "kpi_snapshot": {"decision_count": 3, "average_objective_score": 76012.3, "high_risk_transition_count": 4},
    "cost_summary": {"setup_time": 12.4, "labor_cost": 7203.1, "material_loss": 0.3, "wash_cost": 4521.0, "downtime": 1.7, "packaging_time": 1.5, "sequence_risk": 0.5},
    "risk_summary": {"SR-001": 2, "SR-003": 1},
    "model_version": "gemini-flash-latest",
    "prompt_version": "weekly-report-v1",
    "generation_mode": "gemini",
    "generated_at": "2026-05-21T01:24:11+00:00"
  }
}
```

`weekly_summary`와 `weekly_report`는 `weekly_report_cache`의 캐시 row를 그대로 노출합니다. 명시 endpoint(`POST /reports/weekly-summary`, `POST /reports/weekly`)가 호출되기 전에는 둘 다 `null`입니다. `/dashboard` 자체는 LLM을 호출하지 않습니다(roadmap §13의 "LLM 자동 호출 금지" 정합).

저장된 결정이 없으면 `decision_count`, `average_objective_score`, `high_risk_transition_count`는 `0`이고, `kpi_trend`, `risk_patterns`, `recent_decisions`는 빈 배열이며 `recent_decisions_meta`는 `{ "page": 1, "page_size": 5, "total": 0, "total_pages": 0 }`입니다.

## POST `/explain`

현재 비교 상태와 warning을 기반으로 한국어 설명을 생성합니다. provider chain은 Gemini API → 로컬 `claude` CLI → template fallback 순서이며, 응답에는 어느 경로로 생성되었는지를 가시화하는 provenance 3 필드(`model_version`, `prompt_version`, `generation_mode`)가 동봉됩니다. `generation_mode`는 `"gemini"`, `"cli"`, `"template"` 중 하나입니다.

```json
{
  "explanation": "현재 순서는 추천안보다 목적 점수가 12.34 높습니다. BLACK→WHITE 위험이 감지되었습니다.",
  "model_version": "gemini-flash-latest",
  "prompt_version": "explain-v1",
  "generation_mode": "gemini"
}
```

## POST `/reports/weekly-summary`

현재 진행 중인 ISO 주(월요일~기준일까지)의 한 줄 요약을 생성·캐시합니다. request body는 없으며 서버가 KST 기준 오늘 날짜로 in-progress 주를 자동 계산합니다. 호출 시점이 수요일이면 월·화·수 데이터로 집계합니다. cache는 `weekly_report_cache` 단일 row에 UPSERT됩니다.

```json
{
  "period_start": "2026-05-18",
  "period_end": "2026-05-21",
  "summary": "이번 주 3건의 결정이 저장되었고 평균 목적 점수는 76012.30입니다. 고위험 색상 전환은 4건 감지되었습니다.",
  "kpi_snapshot": {"decision_count": 3, "average_objective_score": 76012.3, "high_risk_transition_count": 4},
  "model_version": "gemini-flash-latest",
  "prompt_version": "weekly-summary-v1",
  "generation_mode": "gemini",
  "generated_at": "2026-05-21T01:23:45+00:00"
}
```

## POST `/reports/weekly`

`/reports/weekly-summary`와 동일한 기간 계산을 수행하고, 본문(summary + key_findings + recommendations)을 생성·캐시합니다. weekly-summary와 같은 row를 공유하며 본문 3컬럼을 함께 갱신합니다.

```json
{
  "period_start": "2026-05-18",
  "period_end": "2026-05-21",
  "summary": "이번 주는 ...",
  "key_findings": ["블랙→화이트 전환이 2회로 가장 빈번", "..."],
  "recommendations": ["수요일 오전에 블랙 계열을 연속 배치 권장", "..."],
  "kpi_snapshot": {"decision_count": 3, "average_objective_score": 76012.3, "high_risk_transition_count": 4},
  "cost_summary": {"setup_time": 12.4, "labor_cost": 7203.1, "material_loss": 0.3, "wash_cost": 4521.0, "downtime": 1.7, "packaging_time": 1.5, "sequence_risk": 0.5},
  "risk_summary": {"SR-001": 2, "SR-003": 1},
  "model_version": "gemini-flash-latest",
  "prompt_version": "weekly-report-v1",
  "generation_mode": "gemini",
  "generated_at": "2026-05-21T01:24:11+00:00"
}
```

LLM 환경(API key·CLI)이 모두 없으면 자동으로 template fallback이 동작하며 `generation_mode == "template"`이 됩니다. 어떤 경우에도 200 응답을 반환합니다.

## PATCH `/decisions/{decision_id}/reviewed`

저장된 decision의 검토 여부를 변경합니다. P1 범위입니다.

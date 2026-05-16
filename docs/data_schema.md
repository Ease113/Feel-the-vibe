# SmartFactoryV2 데이터 스키마

합성 데이터는 `scripts/seed_data.py`로 재생성합니다. P0에서는 CSV/JSON 파일을 단순 원천 데이터로 사용하고, SQLite에는 최종 decision 로그만 저장합니다.

## `sku_master.csv`

12개 도료 SKU 기준정보입니다.

| 컬럼 | 설명 |
|---|---|
| `sku_id` | SKU 식별자 |
| `sku_name` | 화면 표시 이름 |
| `color_family` | 유사 색상군 |
| `color_hex` | UI 색상칩 hex |
| `category` | `light`, `mid`, `dark`, `metal`, `normal`, `special` |
| `is_metallic` | `0` 또는 `1` |
| `brightness_level` | 0~100 |
| `viscosity_level` | 0~100 |

## `daily_plan.csv`

최적화와 D&D의 기준입니다. 같은 SKU가 여러 번 등장할 수 있으므로 sequence key는 반드시 `plan_item_id`입니다.

| 컬럼 | 설명 |
|---|---|
| `plan_id` | 생산계획 ID |
| `plan_item_id` | 계획 내 개별 항목 ID |
| `plan_date` | 생산일 |
| `sku_id` | 생산 대상 SKU |
| `quantity` | 생산량 |
| `package_size` | `1L`, `4L`, `18L` |
| `due_priority` | 표시용 우선순위 |
| `line_id` | MVP에서는 `LINE-01` |

## `transition_history.csv`

XGBoost 학습 또는 검증용 합성 전환 이력입니다. 모델이 없으면 heuristic fallback을 사용합니다.

필수 target:

- `setup_time`
- `labor_cost`
- `material_loss`
- `wash_cost`
- `downtime`
- `packaging_time`

검증용 rule 참조:

- `sequence_violation_ref`

## `sequence_rules.json`

P0 rule engine이 사용하는 명시적 색상 전환 rule입니다.

| rule | 설명 |
|---|---|
| `SR-001` | black -> white 고위험 |
| `SR-002` | dark -> light brightness gap 기반 중/고위험 |
| `SR-003` | metallic -> non-metallic 중/고위험 |
| `SR-004` | 같은 SKU 또는 같은 color family 저위험 |

# 스마트공장 MVP 화면 State · DB 스키마 · 색상 제약 통합 정의서 v1.3

> 목적: 이후 **API 설계, FastAPI 백엔드 구현, React 프론트엔드 구현, 합성 데이터 생성**에 공통 기준으로 사용할 화면 State와 DB 스키마를 한 문서로 통합합니다.  
> 기준: 기존 DB 스키마 v1.0, 화면 State v3, API-ready v1.1을 유지하되, MVP 범위에 맞춰 **OR-tools 제약을 색상 전환 penalty만으로 제한**합니다.
>
> **v1.3 변경 사항**  
> 1. `worker_skill`, `equipment_condition` 타입을 `enum/float` 이중 표기에서 `REAL (0.0~1.0)`으로 단일화. enum 레이블 매핑 규칙 추가.  
> 2. `quantity` 타입을 `int/float`에서 `REAL`로 단일화.  
> 3. `transition_id` 필드를 `string`으로 단일화하고 필수 여부를 `Y`로 격상.  
> 4. `day_of_week` 필수 여부를 `Y(학습 필수)`로 격상.  
> 5. `color_family` 타입을 `string/enum`에서 `string`으로 단일화.  
> 6. **섹션 20 신규 추가**: 합성 데이터 생성 명세 (1,500건 생성 기준, 컨텍스트 조합, 노이즈 규칙, 검증 기준).

---

## 0. 최종 반영 원칙

| 구분 | 최종 결정 |
|---|---|
| 생산 카드 기준 | `skuList`가 아니라 `planItems`입니다. 화면에는 SKU 카드처럼 보이지만 실제 드래그앤드롭 기준은 `plan_item_id`입니다. |
| Sequence 기준 | `recommendedSequence`, `currentSequence`, `committedSequence`는 모두 `plan_item_id[]`입니다. |
| `/optimize` 정책 | 페이지 진입 시 1회 호출하여 AI 추천 기준선을 생성합니다. MVP에서는 재추천 버튼을 두지 않습니다. |
| `/predict` 정책 | 드래그앤드롭 완료, 운영 우선순위 변경 시 호출합니다. `currentSequence`와 `baselineSequence`를 같은 기준으로 평가합니다. |
| OR-tools P0 제약 | **색상 전환 penalty만 적용**합니다. 검정→흰색, 어두운색→밝은색, 메탈/특수광택→일반색 등 직관적 색상 전환 리스크만 반영합니다. |
| 제외 제약 | 납기 우선, 선후행 강제, 시간창, 최대 전환 횟수, 다중 라인 제약은 MVP에서 제외하고 향후 확장으로 둡니다. |
| Objective 기준 | `objectiveScore = totalWeightedCost + sequencePenalty`입니다. OR-tools는 `objectiveScore`가 낮은 순서를 추천합니다. |
| 사용자 확정 정책 | 사용자가 고위험 전환이 포함된 순서를 만들더라도 확정은 차단하지 않습니다. `riskWarnings`로 표시하고 로그에 저장합니다. |
| 운영 컨텍스트 화면 범위 | 화면에는 `lineId`, `shift`, `crewSize`만 둡니다. `lineId`는 MVP 단일 라인 표시값이며, `shift`, `crewSize`만 운영자가 선택합니다. |
| 숨김 모델 피처 | `workerSkill`, `equipmentCondition`, `daysSinceLastClean`, `dayOfWeek`는 화면 State로 만들지 않습니다. 서버 내부 기본 컨텍스트와 합성 데이터 검증 요소로 유지합니다. |
| 민감도 검증 처리 | 작업자 숙련도·설비 상태·마지막 세척 후 경과일 변화에 따른 비용 민감도는 별도 화면 기능이 아니라 합성 데이터 검증 및 시연 스크립트에서 설명합니다. |
| Priority 정책 | 숫자 슬라이더 대신 5단계 라벨 + multiplier 구조를 사용합니다. multiplier 적용 후 `appliedWeights`는 재정규화합니다. |
| `setupTime` 처리 | 운영자 선택 항목에서는 제외하지만, 내부 `appliedWeights`와 비용 계산에는 포함합니다. |
| `comparisonState` | 서버가 계산하여 응답하고, 확정 시 `decisions`에 저장합니다. 비교 기준은 `objectiveScore`입니다. |
| `comparisonSummary` | LLM이 아니라 rule/template 기반 자동 한 줄 요약입니다. |
| `llmExplanation` | 사용자가 설명 생성 버튼을 클릭할 때만 `/explain`로 생성합니다. 드래그나 우선순위 변경 시 자동 재생성하지 않습니다. |
| 리스크 경고 | `riskWarnings`는 soft warning입니다. 확정 차단은 `commitBlockReason`만 담당합니다. |
| KPI reviewed | MVP에서는 `decisions.reviewed BOOLEAN`으로 관리합니다. 별도 리뷰 테이블은 만들지 않습니다. |

---

## 1. MVP 제약 범위 확정

### 1.1 P0에서 구현하는 제약

MVP의 OR-tools 제약은 **색상 전환 penalty**로 제한합니다. 복잡한 생산 제약을 만들지 않고, 도료 공정에서 가장 직관적으로 설명 가능한 색상 전환 리스크만 반영합니다.

| Rule | 조건 | 처리 | 화면 표시 | 확정 차단 |
|---|---|---|---|---|
| `SR-001` | 검정 → 흰색 | high penalty | high warning | N |
| `SR-002` | 어두운색 → 밝은색 | medium/high penalty | high warning | N |
| `SR-003` | 메탈/특수광택 → 일반색 | medium penalty | mid warning | N |
| `SR-004` | 유사 색상 전환 | penalty 없음 또는 낮은 기본 전환 비용 | warning 없음 | N |

`SR-004`의 유사 색상 전환은 “제약 penalty”라기보다 합성 데이터와 비용 예측에서 낮은 전환 비용으로 반영하는 쪽이 자연스럽습니다.

### 1.2 P0에서 제외하는 제약

| 제약 | MVP 처리 | 사유 |
|---|---|---|
| 납기 우선 | 제외 | `duePriority`는 남겨둘 수 있지만 OR-tools 목적함수에는 넣지 않습니다. |
| 특정 SKU 선후행 강제 | 제외 | API, UI, OR-tools 모델이 복잡해집니다. |
| 최대 위험 전환 횟수 | 제외 | 시연 핵심이 아니며 튜닝 부담이 큽니다. |
| 시간창 제약 | 제외 | 생산계획 시간 슬롯 데이터가 필요합니다. |
| 다중 라인 제약 | 제외 | MVP는 `LINE-01` 단일 라인입니다. |

### 1.3 OR-tools 목적함수

```text
objectiveScore = totalWeightedCost + sequencePenalty
```

| 값 | 의미 |
|---|---|
| `totalWeightedCost` | XGBoost 6차원 비용 예측값에 `appliedWeights`를 적용한 순수 비용 점수입니다. |
| `sequencePenalty` | 색상 전환 rule에서 발생한 penalty 합계입니다. |
| `objectiveScore` | OR-tools가 최소화하는 최종 점수입니다. 추천안/현재안 비교의 기본 기준입니다. |

OR-tools는 모든 `plan_item_id`가 정확히 한 번씩 포함되는 순서 중 `objectiveScore`가 낮은 순서를 추천합니다.

---

## 2. MVP 화면에서 사용하는 운영 컨텍스트 확정안

### 2.1 화면 노출 범위

| 필드 | 화면 처리 | API 요청 포함 | 설명 |
|---|---|---:|---|
| `lineId` | 표시 | Y | MVP 단일 라인 기준 표시값입니다. 예: `LINE-01` |
| `shift` | 입력 | Y | 운영자가 주간/야간 등 교대 조건을 선택합니다. |
| `crewSize` | 입력 | Y | 운영자가 투입 인원 수를 선택합니다. |
| `workerSkill` | 비노출 | N | 서버 내부 기본 컨텍스트 및 합성 데이터 검증 요소입니다. |
| `equipmentCondition` | 비노출 | N | 서버 내부 기본 컨텍스트 및 합성 데이터 검증 요소입니다. |
| `daysSinceLastClean` | 비노출 | N | 서버 내부 기본 컨텍스트 및 합성 데이터 검증 요소입니다. |
| `dayOfWeek` | 비노출 | N | `planDate` 기준으로 서버에서 계산합니다. |

### 2.2 문서 반영 문장

MVP 메인 화면의 운영 컨텍스트는 단일 생산 라인 기준의 `lineId` 표시값, 운영자가 선택하는 `shift`, `crewSize`로 제한합니다. 작업자 숙련도, 설비 상태, 마지막 세척 후 경과일, 요일은 화면 입력값으로 제공하지 않고, XGBoost 비용 예측의 내부 보정 피처와 합성 데이터 검증 요소로 유지합니다.

따라서 운영자는 화면에서 교대와 투입 인원만 조정하고, 시스템은 서버 내부 컨텍스트를 결합해 같은 전환 쌍이라도 현장 조건에 따라 비용이 달라질 수 있도록 계산합니다. 작업자 숙련도·설비 상태·세척 경과일에 따른 민감도 확인은 별도 화면 기능이 아니라, 합성 데이터 검증 및 시연 스크립트에서 설명하는 범위로 둡니다.

---

## 3. 전체 테이블/데이터 구성

| 테이블/데이터 | 저장 형태 | 역할 | MVP 구분 |
|---|---|---|---|
| `sku_master` | CSV / 기준정보 | 색상 SKU의 기준정보입니다. UI 색상 카드 렌더링과 비용 예측 피처 생성의 기준으로 사용합니다. | P0 |
| `daily_plan` | CSV 또는 API Body / 생산계획 | 오늘 생산할 개별 항목 목록입니다. 추천/확정 순서의 기준은 반드시 `plan_item_id`입니다. | P0 |
| `plan_context` | SQLite / API Body / CSV | 해당 생산계획이 실행되는 운영 조건입니다. 화면 노출값과 서버 내부 보정 피처를 함께 표현할 수 있습니다. | P0 권장 |
| `transition_history` | CSV / 학습·검증 데이터 | XGBoost 학습/검증용 전환 이력입니다. 화면 표시용 원천이 아니라 전환 비용 예측 모델의 학습 데이터입니다. | P0 |
| `sequence_rules` | JSON / Rule Engine | 색상 전환 penalty와 risk warning을 판단하는 룰입니다. 기존 `violation_rules`의 역할을 MVP 색상 전환 범위로 좁힌 이름입니다. | P0 |
| `decisions` | SQLite / 핵심 로그 테이블 | 최종 확정된 의사결정 로그입니다. 의사결정 화면과 KPI 대시보드를 연결하는 핵심 테이블입니다. | P0 |
| `weekly_report_cache` | SQLite / P1 캐시 테이블 | 주간 리스크/비용 요약 결과를 저장하는 캐시입니다. 정규 운영 테이블이 아니라 P1 시연용 저장소입니다. | P1 |

---

## 4. 테이블 관계 구조

```text
sku_master
  PK sku_id
     ├── daily_plan.sku_id
     ├── transition_history.from_sku
     └── transition_history.to_sku

daily_plan
  PK plan_id + plan_item_id
     ├── plan_context.plan_id
     └── decisions.plan_id
          ├── recommended_sequence: plan_item_id[]
          ├── confirmed_sequence: plan_item_id[]
          └── weekly_report_cache.source_decision_ids[]

sku_master.category / sku_id
  └── sequence_rules.from_* / to_*
       └── decisions.violation_details / risk_warnings
```

| From | To | 관계 | 의미 |
|---|---|---|---|
| `sku_master.sku_id` | `daily_plan.sku_id` | 1:N | 생산계획 항목은 하나의 SKU를 참조합니다. |
| `sku_master.sku_id` | `transition_history.from_sku / to_sku` | 1:N | 전환 이력의 시작/대상 SKU는 기준 SKU를 참조합니다. |
| `daily_plan.plan_id` | `plan_context.plan_id` | 1:1 또는 1:N | 생산계획별 운영 조건을 제공합니다. |
| `daily_plan.plan_id` | `decisions.plan_id` | 1:N | 하나의 생산계획에서 여러 확정 로그가 생성될 수 있습니다. |
| `daily_plan.plan_item_id` | `decisions.recommended_sequence / confirmed_sequence` | logical | 추천/확정 순서는 `plan_item_id[]` 배열로 저장됩니다. |
| `sku_master.sku_id/category` | `sequence_rules.from / to` | logical | SKU ID 또는 색상군 기반으로 색상 전환 penalty 룰을 매칭합니다. |
| `sequence_rules.rule_id` | `decisions.violation_details` | logical | 적용된 룰 결과가 위반/경고 상세에 저장됩니다. |
| `decisions.decision_id` | `weekly_report_cache.source_decision_ids` | N:1 aggregate | 주간 보고는 여러 의사결정 로그를 집계합니다. |

---
## 5. DB 스키마 정의

### 5.1 `sku_master`

**역할:** 색상 SKU의 기준정보입니다. UI 색상 카드 렌더링과 비용 예측 피처 생성, 색상 전환 rule matching의 기준으로 사용합니다.  
**저장 형태:** CSV / 기준정보

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `sku_id` | string | PK | Y | SKU 고유 식별자 | `SKU-WHITE-001`, `SKU-BLACK-001` |
| `sku_name` | string | - | Y | 화면에 표시할 색상명 | 흰색, 검정, 금속색 |
| `category` | enum | - | Y | 색상군/전환 룰 매칭 기준 | `light`, `mid`, `dark`, `metal`, `special`, `normal` |
| `color_family` | string | - | 권장 | 유사 색상 판단용 그룹. 자유 문자열로 저장하고 rule matching은 `category`로 수행 | `white`, `gray`, `blue`, `red` |
| `pigment_intensity` | float | - | Y | 안료 강도. 전환 비용 예측 피처 | `0.0~1.0` |
| `gloss_level` | float | - | Y | 광택도. 전환 비용 예측 피처 | `0.0~1.0` |
| `viscosity` | float | - | Y | 점도. 전환 비용 예측 피처 | `0.35`, `0.72` |
| `hex_code` | string | - | Y | UI 색상칩 렌더링 값 | `#FFFFFF`, `#111111` |

`package_size`는 SKU 고유 속성이 아니므로 이 테이블에 두지 않습니다.

### 5.2 `daily_plan`

**역할:** 오늘 생산할 개별 항목 목록입니다. 추천/확정 순서의 기준은 반드시 `plan_item_id`입니다.  
**저장 형태:** CSV 또는 API Body / 생산계획

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `plan_id` | string | PK part | Y | 생산계획 ID | `PLAN-2026-0515-A` |
| `plan_item_id` | string | PK part | Y | 생산계획 내 개별 항목 ID. D&D 카드 stable key | `PI-001`, `PI-002` |
| `plan_date` | date | - | Y | 생산일. 일/주 단위 집계 기준 | `2026-05-15` |
| `sku_id` | string | FK | Y | 생산 대상 SKU | `SKU-WHITE-001` |
| `quantity` | REAL | - | Y | 생산량. 소수점 허용 (예: 250.5L). SQLite REAL, Python float로 처리 | `100.0`, `250.5` |
| `package_size` | enum | - | Y | 패키지 조건. 패키징 전환 시간 예측에 사용 | `1L`, `4L`, `18L` |
| `due_priority` | int/enum | - | N | 납기 우선순위. MVP P0 최적화에는 사용하지 않고 향후 확장/표시용으로만 둡니다. | `1~5` 또는 `high/mid/low` |
| `line_id` | string/null | - | N | 다중 라인 확장용. MVP에서는 `LINE-01` 고정 | `LINE-01`, `null` |

같은 SKU가 수량·패키지 조건별로 여러 번 등장할 수 있으므로 sequence는 `sku_id[]`가 아니라 `plan_item_id[]`로 저장합니다.

### 5.3 `plan_context`

**역할:** 해당 생산계획이 실행되는 운영 조건입니다. 화면에 노출되는 최소 운영 컨텍스트와 서버 내부 비용 보정 피처를 분리해서 다룹니다.  
**저장 형태:** SQLite / API Body / CSV

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `plan_id` | string | FK | Y | 대상 생산계획 ID | `PLAN-2026-0515-A` |
| `line_id` | string | - | Y | 화면에 표시되는 생산 라인. MVP 단일 라인 | `LINE-01` |
| `shift` | enum | - | Y | 화면에서 선택하는 교대 정보 | `day`, `night` |
| `crew_size` | int | - | Y | 화면에서 선택하는 투입 인원 수 | `2`, `3`, `4` |
| `worker_skill` | REAL | - | Y | 내부 비용 보정 피처. 화면에는 노출하지 않음. Low=0.3 / Mid=0.6 / High=0.9로 매핑 후 저장 | `0.3`, `0.6`, `0.9` |
| `days_since_last_clean` | int | - | Y | 내부 비용 보정 피처. 화면에는 노출하지 않음 | `0~7` |
| `equipment_condition` | REAL | - | Y | 내부 비용 보정 피처. 화면에는 노출하지 않음. Poor=0.3 / Normal=0.7 / Good=1.0으로 매핑 후 저장 | `0.3`, `0.7`, `1.0` |
| `day_of_week` | int | - | Y(학습 필수) | `plan_date`에서 서버가 계산하는 요일. XGBoost 피처로 사용되므로 누락 불가. 월=0, 일=6 | `0~6` |
| `context_version` | string | - | N | 컨텍스트/합성 데이터 생성 버전 | `context-v1` |

`plan_context`의 전체 필드는 모델 입력과 검증을 위한 구조입니다. 프론트 화면 State는 `lineId`, `shift`, `crewSize`만 관리합니다.

**enum → REAL 매핑 규칙 (서버 context resolver 적용 기준)**

| 필드 | 레이블 | REAL 값 |
|---|---|---:|
| `worker_skill` | Low | `0.3` |
| `worker_skill` | Mid | `0.6` |
| `worker_skill` | High | `0.9` |
| `equipment_condition` | Poor | `0.3` |
| `equipment_condition` | Normal | `0.7` |
| `equipment_condition` | Good | `1.0` |

XGBoost 모델은 REAL 값만 입력으로 받습니다. enum 레이블은 시연 스크립트와 로그 표시용으로만 사용하고, 서버 context resolver에서 위 표 기준으로 변환 후 모델에 전달합니다.

### 5.4 `transition_history`

**역할:** XGBoost 학습/검증용 전환 이력입니다. 화면 표시용 원천이 아니라 전환 비용 예측 모델의 학습 데이터입니다.  
**저장 형태:** CSV / 학습·검증 데이터

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `transition_id` | string | PK | Y | 전환 이력 row 식별자. 합성 데이터 생성 시 `TR-{0001~1500}` 형식으로 부여 | `TR-0001` |
| `transition_date` | date | - | Y(학습 필수) | 전환 발생일. `day_of_week` 파생 기준. 누락 시 요일 피처 계산 불가 | `2026-05-15` |
| `from_sku` | string | FK | Y | 직전 생산 SKU | `SKU-BLACK-001` |
| `to_sku` | string | FK | Y | 다음 생산 SKU | `SKU-WHITE-001` |
| `from_package_size` | enum | - | Y | 직전 패키지 조건 | `1L`, `4L`, `18L` |
| `to_package_size` | enum | - | Y | 다음 패키지 조건 | `1L`, `4L`, `18L` |
| `worker_skill` | REAL | - | Y(학습 필수) | 작업자 숙련도. Low=0.3 / Mid=0.6 / High=0.9. XGBoost 피처 | `0.3`, `0.6`, `0.9` |
| `crew_size` | int | - | Y | 투입 인원 수. 모델 학습/검증 피처 | `2~5` |
| `days_since_last_clean` | int | - | Y(학습 필수) | 마지막 세척 후 경과일. XGBoost 피처 | `0~7` |
| `equipment_condition` | REAL | - | Y(학습 필수) | 설비 상태. Poor=0.3 / Normal=0.7 / Good=1.0. XGBoost 피처 | `0.3`, `0.7`, `1.0` |
| `shift` | enum | - | Y(학습 필수) | 운영 컨텍스트. XGBoost 피처로 사용되므로 누락 불가 | `day`, `night` |
| `day_of_week` | int | - | Y(학습 필수) | 요일 피처. `transition_date`에서 파생. 월=0, 일=6. XGBoost 피처 | `0~6` |
| `setup_time` | REAL | - | Y | 셋업 시간. 6D target. 분 단위 | `15.0`, `32.5` |
| `labor_cost` | REAL | - | Y | 작업자 비용. 6D target. 원 단위 | `72000.0` |
| `material_loss` | REAL | - | Y | 원자재 손실. 6D target. kg 또는 L 단위 | `3.4` |
| `wash_cost` | REAL | - | Y | 세척 비용. 6D target. 원 단위 | `36000.0` |
| `packaging_time` | REAL | - | Y | 패키징 전환 시간. 6D target. 분 단위 | `8.0` |
| `downtime` | REAL | - | Y | 라인 정지 시간. 6D target. 분 단위 | `12.5` |
| `sequence_violation_ref` | int | - | Y(검증용) | 색상 전환 rule 검증용 참조값. ML target 아님. 0 또는 1 | `0`, `1` |

`intensity_delta`, `gloss_delta`, `viscosity_delta` 등 파생 피처는 저장하지 않고 학습 파이프라인에서 `sku_master`를 조인해 생성합니다.

### 5.5 `sequence_rules`

**역할:** 색상 전환 penalty 및 risk warning을 판단하는 명시적 룰입니다. `/optimize`, `/predict`, UI 경고 카드, LLM 설명 입력에 재사용합니다.  
**저장 형태:** JSON / Rule Engine

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `rule_id` | string | PK | Y | 룰 ID | `SR-001` |
| `rule_version` | string | - | 권장 | 룰 버전 | `rules-2026.05.v1` |
| `rule_type` | enum | - | Y | 룰 유형. MVP에서는 색상 전환만 사용 | `color_transition` |
| `from_sku_id` | string/null | - | N | 특정 시작 SKU 조건 | `SKU-BLACK-001` |
| `to_sku_id` | string/null | - | N | 특정 대상 SKU 조건 | `SKU-WHITE-001` |
| `from_category` | enum/null | - | N | 시작 색상군 조건 | `dark`, `metal`, `special` |
| `to_category` | enum/null | - | N | 대상 색상군 조건 | `light`, `normal` |
| `from_category_in` | array/null | - | N | 복수 시작 색상군 조건 | `["metal", "special"]` |
| `to_category_in` | array/null | - | N | 복수 대상 색상군 조건 | `["light", "normal"]` |
| `penalty` | float | - | Y | OR-tools objective에 더하는 색상 전환 penalty | `10`, `7`, `5` |
| `risk` | enum | - | Y | 리스크 수준 | `low`, `mid`, `high` |
| `commit_blocking` | boolean | - | Y | 확정 차단 여부. MVP에서는 항상 false | `false` |
| `reason` | string | - | Y | 경고 사유 | 검정 이후 흰색 생산은 잔류 안료 리스크가 큽니다. |
| `recommendation` | string | - | Y | 권장 조치 | 밝은색을 먼저 생산하거나 중간 세척을 검토합니다. |

#### `sequence_rules.json` seed 예시

```json
[
  {
    "rule_id": "SR-001",
    "rule_version": "rules-2026.05.v1",
    "rule_type": "color_transition",
    "from_sku_id": "SKU-BLACK-001",
    "to_sku_id": "SKU-WHITE-001",
    "penalty": 10,
    "risk": "high",
    "commit_blocking": false,
    "reason": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 큽니다.",
    "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 고려하세요."
  },
  {
    "rule_id": "SR-002",
    "rule_version": "rules-2026.05.v1",
    "rule_type": "color_transition",
    "from_category": "dark",
    "to_category": "light",
    "penalty": 6,
    "risk": "high",
    "commit_blocking": false,
    "reason": "어두운색 이후 밝은색 생산은 잔류 안료 리스크가 있습니다.",
    "recommendation": "가능하면 밝은색을 먼저 생산하세요."
  },
  {
    "rule_id": "SR-003",
    "rule_version": "rules-2026.05.v1",
    "rule_type": "color_transition",
    "from_category_in": ["metal", "special"],
    "to_category": "normal",
    "penalty": 7,
    "risk": "mid",
    "commit_blocking": false,
    "reason": "메탈/특수광택 이후 일반색 생산은 광택 잔류 리스크가 있습니다.",
    "recommendation": "일반색을 먼저 생산하거나 세척 강도를 높이세요."
  }
]
```

MVP에서는 `hard`, `soft`, `warn` 같은 복수 constraint type을 운영하지 않습니다. 모두 **색상 전환 penalty + soft warning**입니다.

### 5.6 `decisions`

**역할:** 최종 확정된 의사결정 로그입니다. 의사결정 화면과 KPI 대시보드를 연결하는 핵심 테이블입니다.  
**저장 형태:** SQLite / 핵심 로그 테이블

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `decision_id` | text | PK | Y | 의사결정 로그 ID | UUID |
| `plan_id` | text | FK | Y | 생산계획 ID | `PLAN-2026-0515-A` |
| `user_id` | text | - | N | 확정 사용자 | `demo-manager` |
| `recommended_sequence` | json/text | - | Y | AI 추천 `plan_item_id` 배열 | `["PI-001", "PI-004"]` |
| `confirmed_sequence` | json/text | - | Y | 최종 확정 `plan_item_id` 배열 | `["PI-001", "PI-002"]` |
| `priority_profile` | json/text | - | Y | 운영자 우선순위 라벨 및 multiplier | `washCost: HIGH` |
| `applied_weights` | json/text | - | Y | multiplier 적용 후 재정규화된 최종 가중치 | `{ "setupTime": 0.14, ... }` |
| `context_snapshot` | json/text | - | Y | 확정 당시 운영 조건. 화면 노출값과 서버 보정값을 함께 저장 | `visible`, `resolved` |
| `recommended_cost_vector` | json/text | - | 권장 | 추천안 기준 비용 벡터 | 6D cost + `sequenceViolation` |
| `confirmed_cost_vector` | json/text | - | Y | 확정안 기준 비용 벡터 | 6D cost + `sequenceViolation` |
| `transition_costs` | json/text | - | 권장 | 전환별 비용 상세 | from/to item, 6D cost, rule risk, penalty |
| `total_weighted_cost` | real | - | Y | 확정안의 순수 가중합 비용 | `74.1` |
| `sequence_penalty` | real | - | Y | 확정안의 색상 전환 penalty 합계 | `10` |
| `objective_score` | real | - | Y | 확정안의 최종 평가 점수 | `84.1` |
| `comparison_state` | json/text | - | Y | 추천안 대비 현재안 비교값. `objectiveScore` 기준 | `{ "recommended": 70.2, "current": 84.1, "diff": 13.9 }` |
| `comparison_summary` | text | - | Y | rule/template 기반 한 줄 요약 | 현재안은 고위험 전환 penalty로 추천안보다 점수가 높습니다. |
| `cost_delta_vs_recommended` | json/text | - | 권장 | 추천안 대비 운영자 수정 효과 | `{ "washCost": 7000, "downtime": 2.5 }` |
| `violation_count` | integer | - | Y | 색상 전환 warning 건수 | `0`, `1`, `2` |
| `violation_details` | json/text | - | Y | 색상 전환 warning 상세 | rule_id, from_item_id, to_item_id, penalty, reason |
| `explanation_summary` | text | - | N | LLM 상세 설명. 버튼 클릭 시 생성된 경우 저장 | 이번 순서는 세척 비용을 줄이는 대신 다운타임이 증가했습니다. |
| `decision_memo` | text | - | N | 운영자 메모 / 선택 이유 | 납기상 PI-003을 앞당김 |
| `reviewed` | boolean/integer | - | Y | KPI 리뷰 화면에서 검토 여부 관리 | `0`, `1` |
| `model_version` | text | - | Y | 비용 예측 모델 버전 | `xgb-cost-2026.05.v1` |
| `rule_version` | text | - | Y | 색상 전환 룰 버전 | `rules-2026.05.v1` |
| `confirmed_at` | datetime/text | - | Y | 확정 시각 | `2026-05-15T09:30:00+09:00` |

`recommended_sequence`와 `confirmed_sequence`는 모두 `plan_item_id[]`입니다. `weights`라는 단순 필드는 사용하지 않고, `priority_profile`과 `applied_weights`로 분리합니다.

### 5.7 `weekly_report_cache`

**역할:** 주간 리스크/비용 요약 결과를 저장하는 캐시입니다. 정규 운영 테이블이 아니라 P1 시연용 저장소로 봅니다.  
**저장 형태:** SQLite / P1 캐시 테이블

| 필드 | 타입 | Key | 필수 | 의미 | 예상 값 |
|---|---|---|---:|---|---|
| `report_id` | text | PK | Y | 주간 보고 ID | `WR-2026-W20` |
| `period_start` | date | - | Y | 분석 시작일 | `2026-05-11` |
| `period_end` | date | - | Y | 분석 종료일 | `2026-05-15` |
| `source_decision_ids` | json/text | - | Y | 집계에 사용된 `decision_id` 배열 | `["DEC-001", "DEC-002"]` |
| `kpi_snapshot` | json/text | - | Y | 주간 KPI 집계 결과 | cost_trend, risk_trend, decision_count |
| `cost_summary` | json/text | - | Y | 비용 항목별 증감 요약 | wash_cost, downtime 등 |
| `risk_summary` | json/text | - | Y | 색상 전환 리스크 유형별 요약 | dark_to_light_count 등 |
| `llm_summary` | text | - | Y | LLM 주간 요약 본문 | 이번 주 세척 비용 감소의 주요 원인은... |
| `llm_key_findings` | json/text | - | N | 주요 원인 목록 | `["세척 비용 감소", "위험 전환 증가"]` |
| `llm_recommendations` | json/text | - | N | 다음 주 권장사항 | `["밝은색 선행 생산 검토"]` |
| `prompt_version` | text | - | 권장 | LLM 프롬프트 버전 | `weekly-prompt-v1` |
| `model_version` | text | - | 권장 | 비용 예측 모델 버전 | `xgb-cost-2026.05.v1` |
| `rule_version` | text | - | 권장 | 룰 버전 | `rules-2026.05.v1` |
| `generation_mode` | enum | - | N | 생성 방식 | `live`, `cached`, `template` |
| `generated_at` | datetime/text | - | Y | 생성 시각 | `2026-05-15T17:00:00+09:00` |

P0 필수 테이블은 아니며, KPI 대시보드 이후 주간 요약 시연을 위한 P1 캐시입니다.

---

## 6. 핵심 JSON 필드 구조

### 6.1 `priority_profile`

```json
{
  "baseWeightProfileId": "factory_default_v1",
  "priorities": {
    "washCost": { "label": "HIGH", "multiplier": 1.15 },
    "downtime": { "label": "NORMAL", "multiplier": 1.0 },
    "materialLoss": { "label": "NORMAL", "multiplier": 1.0 },
    "packagingTime": { "label": "LOW", "multiplier": 0.85 },
    "laborCost": { "label": "NORMAL", "multiplier": 1.0 }
  }
}
```

운영자가 선택하는 항목은 `washCost`, `downtime`, `materialLoss`, `packagingTime`, `laborCost`입니다. `setupTime`은 UI 선택 대상에서 제외하지만 계산에는 포함합니다.

### 6.2 `applied_weights`

```json
{
  "setupTime": 0.134,
  "washCost": 0.232,
  "downtime": 0.232,
  "materialLoss": 0.134,
  "packagingTime": 0.089,
  "laborCost": 0.179
}
```

`applied_weights`는 공장 기본 가중치에 multiplier를 적용한 뒤 합계가 1이 되도록 재정규화한 값입니다.

### 6.3 `context_snapshot`

```json
{
  "visible": {
    "lineId": "LINE-01",
    "shift": "day",
    "crewSize": 3
  },
  "resolved": {
    "workerSkill": 4,
    "equipmentCondition": 0.85,
    "daysSinceLastClean": 2,
    "dayOfWeek": 6
  }
}
```

`visible`은 화면에서 표출/입력된 값입니다. `resolved`는 서버가 내부적으로 보강한 모델 입력값입니다.

### 6.4 `aggregatedCost` / `confirmed_cost_vector`

```json
{
  "setupTime": 88.0,
  "laborCost": 326000,
  "materialLoss": 15.1,
  "washCost": 192000,
  "packagingTime": 32.0,
  "downtime": 61.0,
  "sequenceViolation": 1
}
```

6차원 연속 비용은 XGBoost가 예측하고, `sequenceViolation`은 Rule Engine 결과입니다.

### 6.5 `evaluationScore`

```json
{
  "totalWeightedCost": 74.1,
  "sequencePenalty": 10,
  "objectiveScore": 84.1
}
```

`totalWeightedCost`는 비용 가중합, `sequencePenalty`는 색상 전환 penalty, `objectiveScore`는 두 값을 합친 최종 평가 점수입니다.

### 6.6 `transition_costs`

```json
[
  {
    "fromPlanItemId": "PI-001",
    "toPlanItemId": "PI-004",
    "fromSkuId": "SKU-BLACK-001",
    "toSkuId": "SKU-WHITE-001",
    "costVector": {
      "setupTime": 18.0,
      "laborCost": 72000,
      "materialLoss": 3.4,
      "washCost": 36000,
      "packagingTime": 8.0,
      "downtime": 12.5,
      "sequenceViolation": 1
    },
    "weightedCost": 18.4,
    "sequencePenalty": 10,
    "objectiveCost": 28.4,
    "ruleRisk": {
      "violation": true,
      "risk": "high",
      "ruleId": "SR-001",
      "penalty": 10
    },
    "warnings": []
  }
]
```

전환별 UI와 선택 전환 상세 패널은 `transitionCosts`를 기준으로 표시합니다.

### 6.7 `riskWarnings` / `violation_details`

```json
[
  {
    "ruleId": "SR-001",
    "type": "color_transition",
    "fromPlanItemId": "PI-004",
    "toPlanItemId": "PI-003",
    "risk": "high",
    "penalty": 10,
    "commitBlocking": false,
    "reason": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 큽니다.",
    "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 고려하세요."
  }
]
```

`riskWarnings`가 있어도 `commitBlockReason`이 `null`이면 확정 가능합니다.

### 6.8 `comparison_state`

```json
{
  "basis": "objectiveScore",
  "recommended": 70.2,
  "current": 84.1,
  "diff": 13.9,
  "diffRate": 19.8
}
```

서버가 `baselineSequence`와 `currentSequence`를 같은 `priorityProfile` 및 같은 `sequence_rules` 기준으로 평가해 계산합니다. 비교 기준은 `objectiveScore`입니다.

---

## 7. 화면 State 정의

### 7.1 운영 의사결정 메인 화면

| 상태값 | 타입 | 설명 | 분류 | 반영 상태 |
|---|---|---|---|---|
| `planItems` | `PlanItemView[]` | 오늘 생산할 생산계획 항목 목록입니다. 기존 `skuList`를 대체합니다. 화면에는 SKU 카드처럼 보이지만 실제 식별자는 `planItemId`입니다. | Data | 수정 |
| `operatingContext` | `{ lineId: string, shift: string, crewSize: number }` | 화면에서 다루는 최소 운영 컨텍스트입니다. `lineId`는 MVP 단일 라인 표시값이며, `shift`, `crewSize`만 운영자가 선택합니다. | Data | 수정 |
| `recommendedSequence` | `string[]` | `/optimize`가 페이지 진입 시 1회 생성한 AI 추천 초기 생산 순서입니다. `plan_item_id[]`입니다. | Data | 유지 |
| `currentSequence` | `string[]` | 운영자가 현재 수정 중인 순서입니다. 드래그앤드롭 대상이며 `plan_item_id[]`입니다. | Data | 유지 |
| `transitionCosts` | `TransitionCost[]` | 전환 쌍별 7차원 비용, 색상 penalty, warning 배열입니다. | Data | 수정 |
| `aggregatedCost` | `CostVector` | 전체 순서의 7차원 비용 합산값입니다. breakdown 차트 표시용입니다. | Data | 유지 |
| `totalWeightedCost` | `number` | 가중치 적용 후 순수 비용 스칼라입니다. | Data | 유지 |
| `sequencePenalty` | `number` | 현재 순서의 색상 전환 penalty 합계입니다. | Data | 추가 |
| `objectiveScore` | `number` | `totalWeightedCost + sequencePenalty`입니다. 추천/비교의 최종 점수입니다. | Data | 추가 |
| `priorityProfile` | `PriorityProfile` | 운영 우선순위 설정값입니다. 5단계 라벨과 multiplier를 함께 보관합니다. `setupTime`은 UI 선택 항목에는 없지만 `appliedWeights`에는 포함합니다. | Data | 수정 |
| `appliedWeights` | `AppliedWeights` | 서버가 계산한 최종 가중치입니다. multiplier 적용 후 재정규화된 값입니다. | Data | 추가 |
| `riskWarnings` | `Warning[]` | 고위험 색상 전환 경고 목록입니다. 소프트 경고이며 확정 차단과 무관하게 독립 관리합니다. | Data | 수정 |
| `comparisonState` | `{ basis: 'objectiveScore', recommended: number, current: number, diff: number, diffRate: number }` | 추천안 vs 현재안 비교입니다. 서버가 계산합니다. | Data | 수정 |
| `comparisonSummary` | `string` | 추천안 vs 현재안 차이에 대한 rule/template 기반 한 줄 요약입니다. LLM 결과가 아닙니다. | Data | 수정 |
| `llmExplanation` | `string \| null` | 버튼 클릭으로 생성된 LLM 비용 차이 설명 텍스트입니다. 드래그앤드롭이나 우선순위 변경 시 자동 재생성하지 않습니다. | Data | 유지 |
| `workflowState` | `'draft' \| 'validated' \| 'committed'` | 의사결정 단일 흐름 상태입니다. KPI 리뷰 여부는 여기에 넣지 않습니다. | Business | 유지 |
| `commitBlockReason` | `string \| null` | 시스템 hard block 사유입니다. 필수 입력 누락, API 오류 등만 포함합니다. `riskWarnings`와 무관합니다. | UI Control | 유지 |
| `canCommit` | `boolean computed` | `commitBlockReason === null`에서 파생합니다. 별도 상태로 저장하지 않습니다. | UI Control | computed |
| `selectedTransition` | `{ from: string, to: string } \| null` | 전환 쌍 클릭 선택 상태입니다. `null`이면 기본/전체 비교 표시입니다. | UI Control | 유지 |
| `isExplanationStale` | `boolean` | 현재 `llmExplanation`이 최신 순서/우선순위 기준인지 여부입니다. 드롭 완료 또는 우선순위 변경 시 `true`, 설명 재생성 성공 시 `false`입니다. | UI Control | 유지 |
| `isOptimizing` | `boolean` | 페이지 최초 진입 시 `/optimize` 호출 중 여부입니다. MVP에서는 재추천 버튼을 두지 않으므로 초기 로딩 중심입니다. | Interaction | 수정 |
| `isPredicting` | `boolean` | 드롭 완료 또는 운영 우선순위 변경 후 `/predict` 호출 중 여부입니다. | Interaction | 유지 |
| `isExplaining` | `boolean` | 설명 생성 버튼 클릭 시 `/explain` 호출 중 여부입니다. | Interaction | 유지 |
| `isDragging` | `boolean` | 드래그 상태 여부입니다. 드래그 중에는 비용 재계산하지 않고, 드롭 완료 시 `/predict`를 호출합니다. | Interaction | 유지 |

### 7.2 운영 의사결정 메인 화면 API 호출 규칙

| 이벤트 | 호출 API | 상태 변화 |
|---|---|---|
| 페이지 진입 | `/optimize` 1회 | `recommendedSequence`, `currentSequence`, 초기 비용 기준선 생성 |
| 드래그 시작 | 없음 | `isDragging = true` |
| 드롭 완료 | `/predict` | `currentSequence`, `transitionCosts`, `aggregatedCost`, `totalWeightedCost`, `sequencePenalty`, `objectiveScore`, `comparisonState`, `comparisonSummary`, `riskWarnings` 갱신 |
| 우선순위 변경 | `/predict` | `priorityProfile`, `appliedWeights`, 비용/penalty/비교/경고 갱신 |
| 설명 생성 버튼 | `/explain` | `llmExplanation`, `isExplanationStale = false` |
| 최종 확정 | `/decisions` | `workflowState = committed`, `decisionId` 생성 |

### 7.3 운영 우선순위 5단계 구조

| 단계 | label | multiplier |
|---|---|---:|
| 아주 덜 중요 | `VERY_LOW` | `0.70` |
| 덜 중요 | `LOW` | `0.85` |
| 보통 | `NORMAL` | `1.00` |
| 중요 | `HIGH` | `1.15` |
| 아주 중요 | `VERY_HIGH` | `1.30` |

운영자는 숫자를 직접 입력하지 않고 항목별로 5단계 중요도를 선택합니다. 선택값은 공장 기본 가중치에 곱해진 뒤 합계 1로 재정규화되어 `appliedWeights`가 됩니다.

| 선택 가능 항목 | 선택 제외 항목 |
|---|---|
| 세척 자원 절감 / 다운타임 최소화 / 원자재 손실 최소화 / 패키징 전환 최소화 / 작업자 투입 최소화 | 셋업 시간, 색상 전환 penalty, 품질 리스크 |

`setupTime`은 선택 항목에서는 제외하지만, 내부 기본 가중치를 통해 `appliedWeights`와 총 비용 계산에 포함합니다. 색상 전환 penalty는 우선순위 가중치가 아니라 Rule Engine 결과로 처리합니다.

### 7.4 LLM 설명 생성 규칙

`/explain`은 설명 생성 버튼 클릭 시에만 호출합니다. 드롭 완료 또는 우선순위 변경 시 자동 호출하지 않고 `isExplanationStale = true`로 전환합니다. UI에는 “현재 순서와 맞지 않는 설명입니다. 재생성하려면 버튼을 누르세요.” 안내를 표시하고, 설명 재생성 성공 시 `isExplanationStale = false`로 갱신합니다.

`comparisonSummary`는 `/predict` 응답에 포함되는 rule/template 기반 한 줄 요약입니다. `llmExplanation`과 역할을 분리합니다.

### 7.5 canCommit 처리 규칙

`canCommit`은 별도 상태로 두지 않습니다. 컴포넌트에서 `const canCommit = commitBlockReason === null`로 파생해 사용합니다. `riskWarnings`가 있어도 `commitBlockReason`이 `null`이면 확정 가능합니다. 운영자가 경고를 인지하고 확정할 수 있는 구조입니다.

---
## 8. 최종 확정 상태 화면

| 상태값 | 타입 | 설명 | 분류 | 반영 상태 |
|---|---|---|---|---|
| `committedSequence` | `string[]` | 최종 확정된 생산 순서입니다. `plan_item_id[]`입니다. | Data | 유지 |
| `committedCost` | `CostVector` | 확정 시점 7차원 비용 합산입니다. | Data | 유지 |
| `sequencePenalty` | `number` | 확정 시점 색상 전환 penalty 합계입니다. | Data | 추가 |
| `objectiveScore` | `number` | 확정 시점 최종 평가 점수입니다. | Data | 추가 |
| `committedAt` | `string` | 확정 시각입니다. ISO 8601 timestamp입니다. | Data | 유지 |
| `decisionId` | `string` | SQLite에 저장된 의사결정 ID입니다. 재편집 시 신규 ID를 발급하고 기존 레코드는 덮어쓰지 않습니다. | Data | 유지 |
| `saveStatus` | `'idle' \| 'saving' \| 'success' \| 'error'` | 저장 상태입니다. | UI Control | 유지 |
| `decisionMemo` | `string` | 운영자 메모 / 선택 이유입니다. | Data | 유지 |

`comparisonSnapshot`은 별도 화면 State로 관리하지 않습니다. 확정 시점의 `comparisonState`, `comparisonSummary`, 비용 벡터, 색상 penalty, 우선순위, 운영 컨텍스트는 `decisions` 로그에 함께 저장하고, 확정 화면은 `decisionId` 기준 로그를 조회해 표시합니다.

재편집 정책은 `committed → draft` 복귀 시 기존 `decisionId`는 보존하고 신규 `decisionId`를 발급하는 것입니다. SQLite 레코드 덮어쓰기는 하지 않아 감사 이력이 유지됩니다.

---

## 9. KPI 리뷰 화면

| 상태값 | 타입 | 설명 | 분류 | 반영 상태 |
|---|---|---|---|---|
| `dashboardSummary` | `{ weeklyOperatingCost: number, totalDowntime: number, solventUsage: number, sequenceViolationCount: number }` | KPI 요약값입니다. 주간 예상 운영비, 총 다운타임, 시너 사용량, 시퀀스 warning 건수를 포함합니다. | Data | 유지 |
| `kpiTrend` | `{ date: string, totalCost: number, downtime: number, solventUsage: number, violationCount: number }[]` | 일별 비용 / 다운타임 추이 데이터입니다. 차트 x축 기준입니다. | Data | 유지 |
| `riskPatterns` | `{ from: string, to: string, count: number, level: 'high'\|'mid'\|'low', reason: string }[]` | 반복 위험 색상 전환 패턴 목록입니다. | Data | 수정 |
| `recentDecisions` | `Decision[]` | 최근 저장된 의사결정 로그입니다. 각 항목에 `reviewed: boolean` 필드를 포함합니다. | Data | 유지 |
| `weeklySummary` | `string \| null` | LLM 기반 주간 요약 텍스트입니다. P1 범위입니다. | Data | 유지 |
| `dateRange` | `{ from: string, to: string }` | 조회 기간 필터입니다. | UI Control | 유지 |
| `selectedShift` | `string \| null` | 교대조 필터입니다. | UI Control | 유지 |
| `selectedLine` | `string \| null` | 생산 라인 필터입니다. MVP는 단일 라인 고정값이고, Phase 2에서 드롭다운 활성화 가능합니다. | UI Control | 유지 |

KPI 리뷰는 `workflowState`에 `reviewed`를 추가하지 않고 `recentDecisions[n].reviewed` 또는 `decisions.reviewed`로 관리합니다.

---

## 10. 상태 분류 전체 정리

| 분류 | 상태값 | 비고 |
|---|---|---|
| Business State | `workflowState` | `'draft' \| 'validated' \| 'committed'`. `reviewed`는 미포함입니다. |
| Data State | `planItems` | 기존 `skuList` 대체입니다. |
| Data State | `operatingContext` | 화면 노출값은 `lineId`, `shift`, `crewSize`만 포함합니다. |
| Data State | `recommendedSequence` | AI 추천 기준선입니다. |
| Data State | `currentSequence` | 운영자가 수정 중인 현재 순서입니다. |
| Data State | `transitionCosts` | 전환 쌍별 7차원 비용 + 색상 penalty입니다. |
| Data State | `aggregatedCost` | 7차원 합산 비용입니다. |
| Data State | `totalWeightedCost` | 순수 비용 스칼라입니다. `aggregatedCost` 내부에 중첩하지 않습니다. |
| Data State | `sequencePenalty` | 색상 전환 rule penalty 합계입니다. |
| Data State | `objectiveScore` | `totalWeightedCost + sequencePenalty`입니다. |
| Data State | `priorityProfile` | 5단계 중요도 라벨 + multiplier 구조입니다. |
| Data State | `appliedWeights` | 서버가 재정규화한 최종 가중치입니다. |
| Data State | `riskWarnings` | 색상 전환 soft warning입니다. 확정 차단과 무관합니다. |
| Data State | `comparisonState` | `{ basis, recommended, current, diff, diffRate }` 구조입니다. 서버 계산값입니다. |
| Data State | `comparisonSummary` | 추천안 vs 현재안 한 줄 요약입니다. Rule/template 기반입니다. |
| Data State | `llmExplanation` | P1 설명 버튼 호출 결과입니다. |
| Data State | `committedSequence` | 확정 순서입니다. |
| Data State | `committedCost` | 확정 비용 벡터입니다. |
| Data State | `committedAt` | 확정 시각입니다. |
| Data State | `decisionId` | 재편집 시 신규 발급합니다. |
| Data State | `decisionMemo` | 운영자 메모입니다. |
| Removed State | `comparisonSnapshot` | 별도 상태 제거. 확정 시점 비교값은 SQLite 로그에서 조회합니다. |
| Interaction State | `isOptimizing` | 최초 `/optimize` 호출 중입니다. |
| Interaction State | `isPredicting` | `/predict` 호출 중입니다. |
| Interaction State | `isExplaining` | `/explain` 호출 중입니다. |
| Interaction State | `isDragging` | 드래그 중입니다. 드래그 중 재계산 없음, 드롭 후 재계산합니다. |
| UI Control State | `commitBlockReason` | hard block 전용입니다. |
| Computed State | `canCommit` | `commitBlockReason === null` 파생값입니다. |
| UI Control State | `selectedTransition` | 전환 pair 선택 상태입니다. |
| UI Control State | `isExplanationStale` | 현재 설명과 최신 순서/우선순위 불일치 여부입니다. |
| UI Control State | `saveStatus` | 저장 상태입니다. |
| UI Control State | `dateRange` | KPI 조회 기간 필터입니다. |
| UI Control State | `selectedShift` | KPI 교대조 필터입니다. |
| UI Control State | `selectedLine` | MVP 고정, Phase 2 활성화 대상입니다. |

---

## 11. 전체 운영 상태 흐름

| 운영 상태 | 내부 인터랙션 상태 | 비고 |
|---|---|---|
| `draft` | 최초 진입 / drag 중 / 드롭 후 비용 재계산 / 우선순위 변경 후 비용 재계산 / 설명 stale 가능 | 초기 진입 및 재편집 복귀 상태입니다. 드래그 중에는 비용 재계산하지 않고, 드롭 완료 후 `/predict`를 호출합니다. |
| `validated` | 검증 완료 | `riskWarnings` 확인 후 상태입니다. 소프트 경고는 확정 차단 조건이 아닙니다. |
| `committed` | 최종 저장 완료 | SQLite 기록, KPI 반영. 확정 시점의 비교값은 별도 snapshot state가 아니라 로그에서 조회합니다. |
| `draft` 재진입 | committed 이후 재편집 | 신규 `decisionId`를 발급하고 기존 레코드를 보존합니다. |

---

## 12. 공통 타입 정의 초안

```ts
type PlanItemView = {
  planItemId: string;
  planId: string;
  skuId: string;
  skuName: string;
  category: 'light' | 'mid' | 'dark' | 'metal' | 'special' | 'normal';
  colorFamily?: string;
  hexCode: string;
  quantity: number;
  packageSize: '1L' | '4L' | '18L';
  duePriority?: number; // MVP P0 최적화에는 사용하지 않음
};

type OperatingContextState = {
  lineId: string;
  shift: 'day' | 'night';
  crewSize: number;
};

type ModelOperatingContext = {
  lineId: string;
  shift: 'day' | 'night';
  crewSize: number;
  workerSkill: number;
  equipmentCondition: number;
  daysSinceLastClean: number;
  dayOfWeek: number;
};

type PriorityLevel = 'VERY_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'VERY_HIGH';

type PrioritySetting = {
  label: PriorityLevel;
  multiplier: number;
};

type PriorityProfile = {
  baseWeightProfileId: string;
  priorities: {
    washCost: PrioritySetting;
    downtime: PrioritySetting;
    materialLoss: PrioritySetting;
    packagingTime: PrioritySetting;
    laborCost: PrioritySetting;
  };
};

type AppliedWeights = {
  setupTime: number;
  washCost: number;
  downtime: number;
  materialLoss: number;
  packagingTime: number;
  laborCost: number;
};

type CostVector = {
  setupTime: number;
  laborCost: number;
  materialLoss: number;
  washCost: number;
  packagingTime: number;
  downtime: number;
  sequenceViolation: number;
};

type EvaluationScore = {
  totalWeightedCost: number;
  sequencePenalty: number;
  objectiveScore: number;
};

type Warning = {
  ruleId: string;
  type: 'color_transition';
  fromPlanItemId: string;
  toPlanItemId: string;
  risk: 'low' | 'mid' | 'high';
  penalty: number;
  commitBlocking: false;
  reason: string;
  recommendation: string;
};

type TransitionCost = {
  fromPlanItemId: string;
  toPlanItemId: string;
  fromSkuId: string;
  toSkuId: string;
  costVector: CostVector;
  weightedCost: number;
  sequencePenalty: number;
  objectiveCost: number;
  ruleRisk: {
    violation: boolean;
    risk: 'low' | 'mid' | 'high';
    ruleId: string | null;
    penalty: number;
  };
  warnings: Warning[];
};

type SequenceEvaluation = EvaluationScore & {
  sequence: string[];
  transitionCosts: TransitionCost[];
  aggregatedCost: CostVector;
  riskWarnings: Warning[];
};

type ComparisonState = {
  basis: 'objectiveScore';
  recommended: number;
  current: number;
  diff: number;
  diffRate: number;
};
```

---

## 13. API 설계 전제

| API | 호출 시점 | 핵심 역할 | 주요 반환값 |
|---|---|---|---|
| `GET /plans/{planId}` | 페이지 진입 준비 | 생산계획 항목과 기본 화면 컨텍스트 조회 | `planItems`, `operatingContext`, 기본 `priorityProfile` |
| `POST /optimize` | 페이지 진입 시 1회 | AI 추천 기준선 생성. 색상 전환 penalty를 반영해 `objectiveScore`가 낮은 순서 산출 | `recommendedSequence`, `transitionCosts`, `aggregatedCost`, `totalWeightedCost`, `sequencePenalty`, `objectiveScore`, `riskWarnings` |
| `POST /predict` | 드롭 완료, 우선순위 변경 | 현재안과 추천 기준선을 동일 기준으로 평가 | `currentEvaluation`, `baselineEvaluation`, `comparisonState`, `comparisonSummary`, `appliedWeights` |
| `POST /explain` | 설명 버튼 클릭 | 상세 설명 생성 | `llmExplanation` |
| `POST /decisions` | 최종 확정 | 의사결정 로그 저장. 서버가 확정 전 최신 비용을 재계산 후 저장 | `decisionId`, `committedAt` |
| `GET /decisions/{decisionId}` | 확정 화면 진입 | 저장된 확정 로그 조회 | `committedSequence`, `committedCost`, `sequencePenalty`, `objectiveScore`, `comparisonState`, `decisionMemo` |
| `GET /dashboard` | KPI 리뷰 화면 진입 | 저장된 의사결정 로그 집계 | `dashboardSummary`, `kpiTrend`, `riskPatterns`, `recentDecisions`, `weeklySummary` |
| `PATCH /decisions/{decisionId}/reviewed` | KPI 리뷰 처리 | 검토 여부 갱신 | `reviewed` |

---

## 14. `/optimize` Request / Response 기준 예시

### Request

```json
{
  "planId": "PLAN-20260516-001",
  "operatingContext": {
    "lineId": "LINE-01",
    "shift": "day",
    "crewSize": 3
  },
  "priorityProfile": {
    "baseWeightProfileId": "factory_default_v1",
    "priorities": {
      "washCost": { "label": "HIGH", "multiplier": 1.15 },
      "downtime": { "label": "NORMAL", "multiplier": 1.0 },
      "materialLoss": { "label": "NORMAL", "multiplier": 1.0 },
      "packagingTime": { "label": "LOW", "multiplier": 0.85 },
      "laborCost": { "label": "NORMAL", "multiplier": 1.0 }
    }
  }
}
```

### Response

```json
{
  "planId": "PLAN-20260516-001",
  "recommendedSequence": ["PI-001", "PI-003", "PI-004"],
  "appliedWeights": {
    "setupTime": 0.134,
    "washCost": 0.232,
    "downtime": 0.232,
    "materialLoss": 0.134,
    "packagingTime": 0.089,
    "laborCost": 0.179
  },
  "evaluation": {
    "sequence": ["PI-001", "PI-003", "PI-004"],
    "transitionCosts": [],
    "aggregatedCost": {
      "setupTime": 78.0,
      "laborCost": 292000,
      "materialLoss": 12.7,
      "washCost": 164000,
      "packagingTime": 29.0,
      "downtime": 52.0,
      "sequenceViolation": 0
    },
    "totalWeightedCost": 70.2,
    "sequencePenalty": 0,
    "objectiveScore": 70.2,
    "riskWarnings": []
  },
  "modelVersion": "xgb-cost-2026.05.v1",
  "ruleVersion": "rules-2026.05.v1"
}
```

---

## 15. `/predict` Request / Response 기준 예시

### Request

```json
{
  "planId": "PLAN-20260516-001",
  "currentSequence": ["PI-004", "PI-001", "PI-003"],
  "baselineSequence": ["PI-001", "PI-003", "PI-004"],
  "operatingContext": {
    "lineId": "LINE-01",
    "shift": "day",
    "crewSize": 3
  },
  "priorityProfile": {
    "baseWeightProfileId": "factory_default_v1",
    "priorities": {
      "washCost": { "label": "HIGH", "multiplier": 1.15 },
      "downtime": { "label": "NORMAL", "multiplier": 1.0 },
      "materialLoss": { "label": "NORMAL", "multiplier": 1.0 },
      "packagingTime": { "label": "LOW", "multiplier": 0.85 },
      "laborCost": { "label": "NORMAL", "multiplier": 1.0 }
    }
  }
}
```

### Response

```json
{
  "planId": "PLAN-20260516-001",
  "appliedWeights": {
    "setupTime": 0.134,
    "washCost": 0.232,
    "downtime": 0.232,
    "materialLoss": 0.134,
    "packagingTime": 0.089,
    "laborCost": 0.179
  },
  "currentEvaluation": {
    "sequence": ["PI-004", "PI-001", "PI-003"],
    "transitionCosts": [],
    "aggregatedCost": {
      "setupTime": 88.0,
      "laborCost": 326000,
      "materialLoss": 15.1,
      "washCost": 192000,
      "packagingTime": 32.0,
      "downtime": 61.0,
      "sequenceViolation": 1
    },
    "totalWeightedCost": 74.1,
    "sequencePenalty": 10,
    "objectiveScore": 84.1,
    "riskWarnings": [
      {
        "ruleId": "SR-001",
        "type": "color_transition",
        "fromPlanItemId": "PI-004",
        "toPlanItemId": "PI-001",
        "risk": "high",
        "penalty": 10,
        "commitBlocking": false,
        "reason": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 큽니다.",
        "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 고려하세요."
      }
    ]
  },
  "baselineEvaluation": {
    "sequence": ["PI-001", "PI-003", "PI-004"],
    "totalWeightedCost": 70.2,
    "sequencePenalty": 0,
    "objectiveScore": 70.2
  },
  "comparisonState": {
    "basis": "objectiveScore",
    "recommended": 70.2,
    "current": 84.1,
    "diff": 13.9,
    "diffRate": 19.8
  },
  "comparisonSummary": "현재안은 검정→흰색 전환 penalty로 추천안보다 최종 점수가 높습니다. 경고를 확인한 뒤 확정할 수 있습니다.",
  "modelVersion": "xgb-cost-2026.05.v1",
  "ruleVersion": "rules-2026.05.v1"
}
```

---

## 16. `/decisions` 저장 정책

최종 확정 시 프론트가 마지막 `/predict` 결과를 그대로 보내더라도, 서버는 저장 직전 `confirmedSequence`, `operatingContext`, `priorityProfile`, `sequence_rules` 기준으로 비용과 penalty를 한 번 더 재계산합니다. 저장 기준은 서버 재계산 결과입니다.

| 정책 | 결정 |
|---|---|
| 저장 기준 | 서버 재계산 결과 |
| 저장 대상 | `confirmedSequence`, `priorityProfile`, `appliedWeights`, `contextSnapshot`, `confirmedCostVector`, `transitionCosts`, `totalWeightedCost`, `sequencePenalty`, `objectiveScore`, `comparisonState`, `riskWarnings`, `decisionMemo` |
| 프론트 계산값 신뢰 | 화면 표시용으로만 사용하고, DB 저장 기준으로는 사용하지 않습니다. |
| KPI 집계 기준 | `decisions`에 저장된 서버 재계산 결과 |

---

## 17. 개발 적용 메모

| 영역 | 적용 메모 |
|---|---|
| 프론트엔드 | `planItems`를 카드 렌더링 기준으로 사용합니다. 카드 key와 sequence 값은 반드시 `planItemId`입니다. |
| 프론트엔드 | `operatingContext`에는 `lineId`, `shift`, `crewSize`만 둡니다. workerSkill 등 hidden 피처를 화면 상태로 만들지 않습니다. |
| 프론트엔드 | 드래그 중에는 API를 호출하지 않습니다. 드롭 완료 시 `/predict`를 호출합니다. |
| 프론트엔드 | 우선순위 변경 시 `/predict`를 호출하되 `/optimize`는 재호출하지 않습니다. |
| 프론트엔드 | `totalWeightedCost`, `sequencePenalty`, `objectiveScore`를 분리해서 표시할 수 있도록 둡니다. |
| 프론트엔드 | `comparisonSummary`와 `llmExplanation`을 분리 표시합니다. |
| 백엔드 | `/predict`에서 `priorityProfile`을 `appliedWeights`로 변환하고 재정규화합니다. |
| 백엔드 | `/predict`에서 `currentSequence`와 `baselineSequence`를 동일 `appliedWeights`, 동일 `sequence_rules` 기준으로 평가합니다. |
| 백엔드 | `workerSkill`, `equipmentCondition`, `daysSinceLastClean`, `dayOfWeek`는 서버 내부 context resolver에서 채웁니다. |
| 백엔드 | `sequenceViolation`은 XGBoost 결과가 아니라 Rule Engine 결과로 결합합니다. |
| 백엔드 | 색상 전환 penalty만 OR-tools objective에 더합니다. 납기·선후행·시간창 penalty는 구현하지 않습니다. |
| DB | `decisions`에는 priority, applied weights, context snapshot, comparison, memo, reviewed, sequence penalty, objective score를 함께 저장합니다. |

---

## 18. 시연 스크립트 반영 문장

운영 화면은 단순하게 유지하기 위해 생산 라인, 교대, 투입 인원만 노출합니다. 다만 모델 내부에서는 작업자 숙련도, 설비 상태, 마지막 세척 후 경과일 같은 세부 조건을 합성 데이터와 서버 컨텍스트에 반영하여, 같은 색상 전환이라도 현장 조건에 따라 비용이 달라질 수 있도록 설계했습니다.

OR-tools는 복잡한 선후행이나 시간창 제약까지 구현하지 않고, MVP에서는 검정→흰색, 어두운색→밝은색, 메탈/특수광택→일반색처럼 도료 공정에서 직관적으로 설명 가능한 색상 전환 penalty만 반영합니다. 사용자가 직접 위험 전환이 포함된 순서를 만들면 확정은 막지 않고 경고와 penalty를 보여주며, 최종 의사결정 로그에 함께 저장합니다.

---

## 19. 다음 설계 시작 프롬프트

아래 프롬프트를 새 챗 또는 다음 작업 단계에서 사용합니다.

```md
첨부한 문서는 스마트공장 해커톤 MVP의 화면 State, DB 스키마, 색상 전환 제약, API 설계 전제를 통합한 최종 기준 문서입니다.

이 문서를 기준으로 다음 단계인 **API request/response 전체 명세**를 설계해주세요. 목표는 FastAPI Pydantic 모델과 React TypeScript 타입으로 바로 이어질 수 있는 수준의 API 계약서를 만드는 것입니다.

## 반드시 지켜야 할 MVP 결정

| 항목 | 결정 |
|---|---|
| 생산 항목 | `planItems` 기준, sequence는 전부 `plan_item_id[]` |
| `/optimize` | 페이지 진입 시 1회 호출, AI 추천 기준선 생성 |
| `/predict` | 드롭 완료 / 우선순위 변경 시 현재안과 추천 기준선을 동일 기준으로 평가 |
| OR-tools 제약 | 색상 전환 penalty만 P0 구현 |
| 제외 제약 | 납기 우선, 선후행, 시간창, 최대 전환 횟수, 다중 라인 제약은 제외 |
| 목적함수 | `objectiveScore = totalWeightedCost + sequencePenalty` |
| 사용자 확정 | 색상 warning이 있어도 확정 가능, `commitBlockReason`만 확정 차단 |
| 운영 컨텍스트 | 화면에는 `lineId`, `shift`, `crewSize`만 노출 |
| hidden 피처 | `workerSkill`, `equipmentCondition`, `daysSinceLastClean`, `dayOfWeek`는 서버 내부에서 보강 |
| 우선순위 | 5단계 label + multiplier, `appliedWeights`는 재정규화 |
| `setupTime` | UI 선택 제외, 내부 계산 포함 |
| 비교 기준 | `comparisonState`는 서버 계산, 기준은 `objectiveScore` |
| 요약 | `comparisonSummary`는 rule/template 기반, `llmExplanation`은 버튼 클릭 LLM 설명 |
| 저장 | `/decisions`는 서버가 확정 전 비용/penalty를 재계산한 결과를 저장 |

## 설계해야 할 API

1. `GET /plans/{planId}`
2. `POST /optimize`
3. `POST /predict`
4. `POST /explain`
5. `POST /decisions`
6. `GET /decisions/{decisionId}`
7. `GET /dashboard`
8. `PATCH /decisions/{decisionId}/reviewed`

## 산출물 요구사항

각 API마다 아래를 작성해주세요.

1. 목적
2. 호출 시점
3. Request Body 또는 Query Params
4. Response Body
5. 오류 케이스
6. 프론트엔드 State 업데이트 대상
7. 백엔드 처리 로직 요약
8. Pydantic 모델 초안
9. React TypeScript 타입 초안

## 특히 주의할 점

- `totalWeightedCost`, `sequencePenalty`, `objectiveScore`를 절대 섞지 마세요.
- `/optimize`는 재추천 API가 아니라 초기 기준선 생성 API입니다.
- `/predict`는 현재안과 추천 기준선을 같은 `priorityProfile`과 같은 `sequence_rules`로 평가해야 합니다.
- 색상 전환 rule은 `riskWarnings`로 반환하되 확정 차단하지 않습니다.
- `comparisonState.recommended`와 `comparisonState.current`는 `objectiveScore` 기준입니다.
- `/decisions`는 프론트가 보낸 마지막 결과를 그대로 저장하지 말고 서버 재계산 결과를 저장합니다.
- 납기 우선, 선후행, 시간창, 최대 전환 횟수는 이번 API 명세에 넣지 마세요. 향후 확장 항목으로만 언급하세요.

최종 응답은 개발자가 그대로 구현을 시작할 수 있도록 구조화된 표와 JSON 예시 중심으로 작성해주세요.
```

---

## 20. 합성 데이터 생성 명세

### 20.1 목적과 원칙

합성 데이터는 XGBoost 비용 예측 모델의 학습·검증 데이터이자 시연용 전환 이력입니다. 목표는 **실제 도료 공장의 전환 비용 패턴을 시뮬레이션**하여, "같은 색상 전환이라도 운영 컨텍스트에 따라 비용이 달라진다"는 구조적 특성이 데이터에 반영되도록 합니다.

| 원칙 | 내용 |
|---|---|
| 재현 가능성 | `random_seed = 42`로 고정. 팀원 누가 실행해도 동일한 CSV 생성 |
| 구조적 현실성 | 어두운색→밝은색 전환의 `wash_cost`, `setup_time`이 유사 색상 전환보다 높게 생성되어야 함 |
| 컨텍스트 민감도 | `worker_skill`, `equipment_condition`, `days_since_last_clean`이 비용에 영향을 주어야 함 |
| 분할 기준 | 학습 1,200건 / 검증 300건. 전환 패턴별 균등 분포 유지 |

### 20.2 전환 패턴 구성

12개 대표 SKU × 12 = 144개 전환 쌍(자기→자기 포함). 합성 데이터는 이 144패턴을 기준으로 생성합니다.

**12개 대표 SKU 목록**

| sku_id | sku_name | category | pigment_intensity | gloss_level |
|---|---|---|---:|---:|
| `SKU-WHITE-001` | 흰색 | `light` | 0.1 | 0.8 |
| `SKU-IVORY-001` | 아이보리 | `light` | 0.2 | 0.7 |
| `SKU-LGRAY-001` | 연회색 | `light` | 0.3 | 0.6 |
| `SKU-GRAY-001` | 회색 | `mid` | 0.5 | 0.5 |
| `SKU-BLUE-001` | 파랑 | `mid` | 0.6 | 0.5 |
| `SKU-RED-001` | 빨강 | `mid` | 0.65 | 0.5 |
| `SKU-GREEN-001` | 녹색 | `mid` | 0.6 | 0.5 |
| `SKU-BROWN-001` | 갈색 | `dark` | 0.7 | 0.4 |
| `SKU-DGRAY-001` | 진회색 | `dark` | 0.75 | 0.4 |
| `SKU-BLACK-001` | 검정 | `dark` | 0.9 | 0.3 |
| `SKU-METAL-001` | 금속색 | `metal` | 0.7 | 0.95 |
| `SKU-SPECIAL-001` | 특수광택 | `special` | 0.6 | 0.98 |

### 20.3 컨텍스트 조합 설계

비용 변동성 시뮬레이션을 위해 아래 컨텍스트 변수를 조합합니다. 전체 조합은 **3 × 3 × 4 × 2 = 72가지**이며, 144패턴 × 약 10.4건 = 1,500건을 채웁니다.

| 변수 | 레벨 수 | 값 |
|---|---:|---|
| `worker_skill` | 3 | Low=0.3 / Mid=0.6 / High=0.9 |
| `equipment_condition` | 3 | Poor=0.3 / Normal=0.7 / Good=1.0 |
| `days_since_last_clean` | 4 | 0일 / 1일 / 3일 / 7일 |
| `shift` | 2 | day / night |

패턴당 건수 배분: 전체 1,500건을 144패턴에 균등 배분(패턴당 약 10~11건). 나머지 건수는 `sequence_rule`에서 `high risk`로 분류된 패턴(SR-001, SR-002)에 추가 배분합니다.

### 20.4 비용 생성 규칙

각 target 컬럼은 아래 공식으로 생성합니다. 노이즈는 정규분포 `N(0, σ)`를 사용하며 음수는 0으로 클리핑합니다.

**베이스 비용 산출 공식**

```python
# pigment_delta: 전환 전후 안료 강도 차이의 절댓값
pigment_delta = abs(from_sku.pigment_intensity - to_sku.pigment_intensity)

# gloss_delta: 전환 전후 광택도 차이의 절댓값
gloss_delta   = abs(from_sku.gloss_level - to_sku.gloss_level)

# 컨텍스트 보정 계수
skill_factor    = 1.5 - worker_skill          # High=0.6, Mid=0.9, Low=1.2
equip_factor    = 1.4 - equipment_condition   # Good=0.4, Normal=0.7, Poor=1.1
clean_factor    = 1.0 + days_since_last_clean * 0.08  # 0일=1.0, 7일=1.56
shift_factor    = 1.15 if shift == "night" else 1.0

# 6D 타겟 생성 (단위: 분, 원, kg/L)
setup_time     = max(0, (10 + pigment_delta * 30) * skill_factor * equip_factor + N(0, 3))
wash_cost      = max(0, (20000 + pigment_delta * 80000 + gloss_delta * 40000) * clean_factor * equip_factor + N(0, 5000))
labor_cost     = max(0, (50000 + pigment_delta * 60000) * skill_factor * shift_factor + N(0, 8000))
material_loss  = max(0, (1.0 + pigment_delta * 6.0) * equip_factor + N(0, 0.3))
packaging_time = max(0, (5 if from_package_size == to_package_size else 15) + N(0, 2))
downtime       = max(0, (8 + pigment_delta * 20 + gloss_delta * 10) * equip_factor + N(0, 2))
```

**sequence_violation_ref 생성 기준**

`sequence_rules.json`의 rule 조건과 동일하게 판정합니다.

```python
def get_violation_ref(from_sku, to_sku):
    # SR-001: 검정 → 흰색
    if from_sku.sku_id == "SKU-BLACK-001" and to_sku.sku_id == "SKU-WHITE-001":
        return 1
    # SR-002: 어두운색 → 밝은색
    if from_sku.category == "dark" and to_sku.category == "light":
        return 1
    # SR-003: 메탈/특수광택 → 일반색
    if from_sku.category in ("metal", "special") and to_sku.category == "normal":
        return 1
    return 0
```

### 20.5 패키지 조건 배분

`from_package_size`와 `to_package_size`는 각 row마다 아래 비율로 랜덤 배분합니다.

| package_size | 비율 |
|---|---:|
| `1L` | 40% |
| `4L` | 40% |
| `18L` | 20% |

### 20.6 날짜 및 요일 생성

`transition_date`는 2025-11-01 ~ 2026-04-30 범위에서 균등 샘플링합니다. `day_of_week`는 `transition_date`에서 파생합니다(`weekday()`, 월=0, 일=6).

### 20.7 transition_id 부여 규칙

```
TR-{0001~1500}  # 4자리 제로패딩, 생성 순서대로 부여
```

### 20.8 데이터 분할

```python
train_df = transition_df.sample(frac=0.8, random_state=42)   # 1,200건
test_df  = transition_df.drop(train_df.index)                  # 300건
```

전환 패턴(`from_sku` + `to_sku`)이 train/test 양쪽에 분포하도록 stratified split을 권장합니다.

### 20.9 생성 결과 검증 기준

생성 후 아래 항목을 체크하여 구조적 현실성을 확인합니다.

| 검증 항목 | 기준 |
|---|---|
| 고위험 패턴의 `wash_cost` 평균 > 일반 패턴 평균 | SR-001/002/003 해당 패턴의 `wash_cost` 평균이 전체 평균보다 30% 이상 높아야 함 |
| `worker_skill` 구간별 `setup_time` 차이 | High 구간의 `setup_time` 평균이 Low 구간보다 낮아야 함 |
| `sequence_violation_ref` 비율 | 전체 중 15~25% 수준이어야 함 (144패턴 중 고위험 패턴 비율에 비례) |
| 결측값 없음 | 모든 Y 필드 결측 0건 |
| 음수값 없음 | 6D target 및 `days_since_last_clean` 음수 0건 |

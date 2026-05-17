# Frontend MVP Decision — `/decision` 화면 구조 설계 (v3.6)

> 목적: 기존 JSX 프로토타입을 바로 수정하기 전에, 프론트엔드 구현 기준을 문서로 고정한다.  
> 범위: P0에서는 `/decision` 단일 화면만 구현하고, 확정 완료는 같은 화면 안의 패널/모달로 처리한다.  
> 기준 문서: `api_contract.md`, `DB_state_v1.3.md` (API 필드명·응답 shape는 `api_contract.md` 우선)  
>
> v3.6 변경 (`DB_state_v1.3` 정합):
> - `POST /predict` 요청의 `recommended_sequence` = DB_state의 `baselineSequence` 개념 (동일 값, API 명칭만 다름)
> - `risk_warnings[].severity` 사용 (`DB_state` 저장 스키마·타입 초안의 `risk: mid`와 별개. UI·집계는 API `severity` 기준)
> - `comparison_summary`는 `ComparisonPanel` 상단 전용. `KpiSummaryBar` 히어로에는 objective 분해·`diff_rate` 배지만
> - 초기화 CTA는 `ActionFooter` 1곳만 (워크스페이스 중복 버튼 없음)
>
> v3.5 변경 (KPI·위험 전환 정합):
> - `objective_score`와 `total_weighted_cost`를 UI에서 분리 표시 (축약 시에도 동일 k단위로 합치지 않음)
> - 라이브 KPI·헤더·확정 체크박스의 위험 건수 = `risk_warnings` 기준. `violation_count`는 P0 미사용
> - `TransitionAnalysisTable` 행 수·severity 뱃지 ≠ 위험 전환 KPI
>
> v3.4 변경 (UI 레이아웃):
> - `EvaluationConditionsPanel`: 헤더 접기/펼치기. `OperationContextBar` + `PriorityPanel` 통합 UI (state·API는 분리 유지)
> - `KpiSummaryBar` 사이드 상단 `평가 요약`: 종합 점수 히어로 + 4지표 2×2 카드 (추천안 대비 변화 위)
> - `DecisionWorkspace` 2열 + 현재안 카드 사이 `TransitionSlot` (화살표 열 제거)
> - 사이드: `ComparisonPanel` → `WarningPanel` → `CommitSection` (우선순위 제거)
>
> v3.3 변경 (api_contract · DB_state 정합 반영):
> - 진입 시퀀스에 `GET /plans/{plan_id}` 명시
> - `초기화` 정책 통일: `/optimize` 없음, 리셋 후 `/predict` 1회
> - `KpiSummaryBar` 5칸 구조, `DecisionWorkspace` 4컬럼(화살표 열) 반영
> - `ComparisonPanel` 데이터 소스 분리 (`comparison_state` / `comparisonDiffs` / 차원 델타)
> - 상태 표에 `isOptimizing`, `workflowState`, `commitBlockReason` 등 추가
> - severity UI `MED` ↔ API `MEDIUM` 매핑, P0 `/validate` 미사용 명시
> - ActionFooter·확정 버튼 배치 정리, `CommitResultModal` 스펙 추가

---

# 1. 최종 결정 요약

| 항목 | 결정 |
|---|---|
| MVP 라우팅 | `/decision` 단일 화면 우선 |
| `/dashboard` | P1로 보류 |
| `/decision/:decisionId` | MVP에서는 제외 |
| 확정 결과 | 별도 페이지 이동 없이 `/decision` 내부 `CommitResultModal`로 처리 |
| 프론트 상태 관리 | 초기 구현은 local state 가능, 이후 Zustand 전환 고려 |
| 페이지 진입 API | `GET /plans/{plan_id}` → `POST /optimize` 1회 |
| D&D 기준 키 | `plan_item_id` |
| D&D API 호출 시점 | 드래그 중 없음, 드롭 완료 후 `/predict` 호출 |
| `/validate` | P0 미사용. 경고는 `/predict`의 `risk_warnings` 사용 |
| 핵심 구현 목표 | 추천 → 수정 → 비교 → 경고 → 확정 저장 |
| 순서 비교 레이아웃 | 추천안 \| 현재안 2열. 현재안 카드 사이 `TransitionSlot` |
| 비용 단위 | 원화(₩) 미사용, 점수(pt) 기반 |
| objectiveScore 방향 | 낮을수록 좋음. ▲는 비용 증가(나쁨), ▼는 비용 감소(좋음) |
| Transition 분석 | compact table 항상 노출 + row expand |
| EvaluationConditionsPanel | 헤더 `<details>` 접기/펼치기. 요약 칩(교대·인원·주요 우선순위). 내부: `OperationContextSection` + `PriorityPanel` |
| OperationContextBar | `lineId` 표시, `shift` / `crewSize` 입력 (`EvaluationConditionsPanel` 내) |
| PriorityPanel | 5축 × 5단계 (`EvaluationConditionsPanel` 내). API `priority_profile` |
| 평가 조건 변경 효과 | 교대·인원·우선순위 변경 시 `/predict` 재호출. `recommendedSequence`·`/optimize` 변경 없음 |
| `isEvaluationPanelExpanded` | UI Control. 접혀도 `operatingContext`·`priorityProfile` state 유지 |
| `comparisonDiffs` | frontend computed (sequence 전환 추가/제거) |
| 초기화 버튼 | `currentSequence ← recommendedSequence`. `/optimize` 없음, 이후 `/predict` 1회 |
| 확정·초기화 배치 | 메인 `ActionFooter`: 초기화만. 사이드: 확정 메모 + 최종 확정 (중복 버튼 금지) |
| CommitResultModal 이후 | 모달 닫으면 `workflowState = draft` 복귀. 다음 확정 시 신규 `decisionId` (기존 SQLite 레코드 보존) |
| severity 표기 | UI `HIGH`/`MED`/`LOW` ↔ API `severity`: `HIGH`/`MEDIUM`/`LOW` (`risk_warnings`, `transition_costs`) |
| `/predict` baseline | 요청 `recommended_sequence` = DB_state §0·§15의 `baselineSequence`. 응답 비교 기준선 = `baseline_evaluation` |
| `comparison_summary` 배치 | `ComparisonPanel` 최상단. `KpiSummaryBar`에 두지 않음 |

---

# 2. 핵심 UX 흐름

```text
GET /plans/{plan_id}
  → planItems, operatingContext, default_priority_profile 로드
POST /optimize (페이지 진입 시 1회)
  → recommendedSequence, currentSequence 초기값, baseline 비용
운영자가 drag & drop 수정
  → 드롭 완료 후 POST /predict → 점수/리스크/비교 갱신
transition 분석 · 추천안 vs 현재안 비교
POST /decisions (최종 확정)
  → CommitResultModal (decision_id, committed_at 표시)
모달 닫기 → workflowState = draft (재편집 가능, 다음 확정 시 신규 decisionId)
```

---

# 3. 화면 트리

```text
/decision
├─ DecisionPage
│  ├─ DecisionHeader          (제목, workflowState 배지)
│  ├─ EvaluationConditionsPanel  (접기/펼치기)
│  │  ├─ OperationContextSection (lineId, shift, crewSize)
│  │  └─ PriorityPanel           (5축 우선순위)
│  ├─ PageBody                (2열 grid: main | side)
│  │  ├─ MainColumn
│  │  │  ├─ DecisionWorkspace
│  │  │  │  ├─ RecommendedSequencePanel
│  │  │  │  └─ CurrentSequencePanel (D&D + TransitionSlot)
│  │  │  ├─ TransitionAnalysisTable
│  │  │  └─ ActionFooter        (초기화만)
│  │  └─ SideInsightPanel
│  │     ├─ KpiSummaryBar       (평가 요약 · 히어로+2×2)
│  │     ├─ ComparisonPanel
│  │     ├─ WarningPanel
│  │     ├─ ExplanationPanel    (P1)
│  │     └─ CommitSection       (decision_memo + 최종 확정)
│  └─ CommitResultModal
```

---

# 4. `/decision` 레이아웃

| 영역 | 구성 |
|---|---|
| 상단 | `DecisionHeader`, `EvaluationConditionsPanel` (접기/펼치기) |
| 본문 | 2열 grid: `MainColumn` \| `SideInsightPanel` |
| MainColumn | `DecisionWorkspace`(추천안·현재안), `TransitionAnalysisTable`, `ActionFooter` |
| SideInsightPanel | `KpiSummaryBar`, `ComparisonPanel`, `WarningPanel`, `CommitSection` |
| 오버레이 | `CommitResultModal` — 닫기 시 `workflowState = draft` |

### KpiSummaryBar 필드

| 칸 | 데이터 소스 |
|---|---|
| Objective Score | `current_evaluation.objective_score` |
| Total Weighted Cost | `current_evaluation.total_weighted_cost` |
| Sequence Penalty | `current_evaluation.sequence_penalty` |
| 세척 비용 | `current_evaluation.aggregated_cost.wash_cost` (pt 포맷) |
| 위험 전환 | `current_evaluation.risk_warnings.length` + severity별 서브라벨 |

Objective Score(히어로) 셀에만 `comparison_state.diff_rate` 기준 ▲/▼ 배지를 표시한다. `comparison_state.basis`는 `objectiveScore`이다.

`comparison_summary`(rule/template 한 줄)는 **이 패널에 넣지 않는다**. `ComparisonPanel` §14를 따른다.

**사이드 좁은 폭 레이아웃:** 5칸 가로 막대 대신 **히어로 1칸(종합 점수·가중/패널티 분해·비교 배지)** + **2×2 카드(나머지 4지표)**. 라벨·수치·부가 문구·▲/HIGH 문구는 동일 규칙으로 유지한다.

### 종합 점수 vs 가중 총비용 (표시 분리)

`api_contract.md`와 동일하게 `objective_score = total_weighted_cost + sequence_penalty`이다. 두 값을 같은 칸·같은 축약 숫자로 보이게 하지 않는다.

| UI 라벨 | API 필드 | 데모 값 (pt) | 포맷 규칙 |
|---|---|---:|---|
| 종합 비용 점수 (히어로) | `objective_score` | 478,047 | `formatPt(objective_score)`. 부가 문구: `{total_weighted_cost} 가중 비용 + {sequence_penalty} 순서 패널티`만 |
| 가중 총비용 (2×2) | `total_weighted_cost` | 478,030 | `formatPt(total_weighted_cost)`. **종합 점수와 동일 k단위(478k)로 합치지 않음** |
| 순서 패널티 (2×2) | `sequence_penalty` | 17 | 정수 pt |
| AI 추천안 / 현재안 열 헤더 | 각 시퀀스의 `objective_score` | 404,350 / 478,047 | 비교·정렬 기준은 항상 objective |

구현 예: 히어로 `478,047 pt`, 부가 `478,030 가중 비용 + 17 순서 패널티`, 미니 카드 `478,030 pt` / `17 pt`.

### 위험 전환 · 고위험 카운트

라이브 `/decision` 화면은 `/predict`의 `risk_warnings`만 사용한다. `POST /validate`의 `violation_count`, 확정 로그의 `violation_count`는 **P0 UI에 표시하지 않는다**.

| UI 위치 | 데이터 소스 | 집계 규칙 |
|---|---|---|
| `KpiSummaryBar` 「위험 전환」 | `risk_warnings` | **건수** = `risk_warnings.length`. **서브라벨** = severity별 (예: `HIGH 1건`) |
| `DecisionHeader` 「고위험 전환」 | `risk_warnings` | `severity === 'HIGH'` 인 항목만 카운트 |
| `CommitSection` 확인 체크박스 | `risk_warnings` | 헤더와 동일: HIGH 건수. 0건이면 체크박스 숨김 |
| `WarningPanel` | `risk_warnings` | HIGH·MEDIUM(`UI: MED`)만 리스트. LOW는 패널 제외 |
| `TransitionAnalysisTable` | `transition_costs` | 인접 전환 **전체** 행. `severity` 뱃지는 전환별 평가값이며 KPI 건수와 무관 |
| `TransitionAnalysisTable` 푸터 | `transition_costs` + `risk_warnings` | 예: `인접 전환 N건 · 표시 M행 · rule 경고 K건` (`K = risk_warnings.length`) |

**혼동 방지:** 테이블에 HIGH/MED/LOW 행이 3개 있어도 KPI 「위험 전환」이 3이 되면 안 된다. MED 행은 `transition_costs`의 위험도 표시일 뿐, `risk_warnings`에 없으면 KPI에 포함하지 않는다.

**API vs DB_state:** 라이브 UI·집계는 `api_contract.md`의 `RiskWarning.severity`(`HIGH`/`MEDIUM`/`LOW`)를 사용한다. `DB_state_v1.3.md` §12 타입 초안의 `risk: 'mid'` 또는 `sequence_rules.json`의 `risk: "mid"`는 DB·룰 저장 표기이며, 프론트는 응답의 `severity`만 본다.

---

# 5. 상태 구조

| 상태 | 역할 |
|---|---|
| `planItems` | `GET /plans/{plan_id}` 결과. 카드 렌더·D&D key=`planItemId`·`comparisonDiffs` 조인 |
| `operatingContext` | `{ lineId, shift, crewSize }` |
| `recommendedSequence` | `/optimize` 1회 생성. 우선순위 변경 시에도 유지 |
| `currentSequence` | D&D 대상 `plan_item_id[]` |
| `priorityProfile` | 5축 우선순위 (`priority_profile` wire format) |
| `appliedWeights` | `/predict` 응답의 `applied_weights` |
| `transitionCosts` | `current_evaluation.transition_costs` |
| `aggregatedCost` | `current_evaluation.aggregated_cost` |
| `totalWeightedCost` | `current_evaluation.total_weighted_cost` |
| `sequencePenalty` | `current_evaluation.sequence_penalty` |
| `objectiveScore` | `current_evaluation.objective_score` |
| `riskWarnings` | `current_evaluation.risk_warnings` (각 항목 `severity`, `penalty`, `message`/`recommendation`) |
| `comparisonState` | `/predict`의 `comparison_state` |
| `comparisonSummary` | `/predict`의 `comparison_summary` |
| `comparisonDiffs` | frontend computed (§11) |
| `selectedTransition` | `TransitionAnalysisTable` expand row |
| `workflowState` | `'draft' \| 'committed'` (MVP에서 `validated` 생략 가능) |
| `decisionId` | 마지막 확정 ID. 재편집 후 다음 확정 시 교체 |
| `decisionMemo` | `POST /decisions`의 `decision_memo` |
| `commitBlockReason` | hard block 사유. `null`이면 확정 가능 |
| `isOptimizing` | 진입 `/optimize` 중 |
| `isPredicting` | `/predict` 중. KPI·Comparison 로딩 |
| `isDragging` | 드래그 중. API 호출 없음 |
| `isExplaining` | P1 `/explain` 중 |
| `isExplanationStale` | P1. 순서/우선순위 변경 후 설명 무효 |
| `llmExplanation` | P1 `/explain` 결과 |

`canCommit`은 상태로 두지 않고 `commitBlockReason === null`로 파생한다.  
`riskWarnings`가 있어도 확정 차단하지 않는다 (`DB_state_v1.3.md` §7.5).

---

# 6. D&D 동작 정책

| 단계 | 상태 | API 호출 |
|---|---|---|
| 드래그 중 | `isDragging = true` | 없음. 카드 위치만 변경 |
| 드롭 완료 | `isDragging = false` | `POST /predict` (`current_sequence` 갱신) |

`POST /predict` 요청:

| 필드 (`api_contract`) | 프론트 state | DB_state 대응 |
|---|---|---|
| `recommended_sequence` | `recommendedSequence` | §0·§15의 `baselineSequence`와 동일 의미 |
| `current_sequence` | `currentSequence` | `currentSequence` |
| `priority_profile` | `priorityProfile` | `priorityProfile` |
| `operating_context` | `operatingContext` | 화면 노출: `lineId`, `shift`, `crewSize` |

`recommended_sequence`는 페이지 진입 시 `/optimize`로 고정된 값을 그대로 보낸다. 우선순위 변경만으로는 바뀌지 않는다.  
응답의 `baseline_evaluation`이 추천 기준선이며, `comparison_state.recommended`는 그 `objective_score`이다.

드롭 완료 후 `isPredicting = true` 동안:

- `KpiSummaryBar`, `ComparisonPanel` → 로딩
- `CurrentSequencePanel` → 드롭 순서 즉시 반영 (낙관적 업데이트)
- `RecommendedSequencePanel` → 변경 없음

`TransitionSlot`은 현재안 카드 사이 인접 전환에 `sequence_penalty` 또는 `risk_warnings`를 뱃지로 표시한다.

---

# 7. 초기화 버튼 정책

| 항목 | 처리 |
|---|---|
| `/optimize` | 호출하지 않음 |
| 리셋 | `currentSequence ← recommendedSequence` (프론트 상태만) |
| 리셋 직후 | `POST /predict` 1회 → KPI·비교·경고·transition 테이블 갱신 |
| `recommendedSequence` | 변경 없음 |

> 초기화 = "AI 추천 순서로 되돌리기". 페이지 전체 reload가 아니다.

---

# 8. CommitResultModal 이후 상태 흐름

| 단계 | 처리 |
|---|---|
| `POST /decisions` 성공 | `workflowState = committed`, `decisionId`·`committedAt` 저장, 모달 표시 |
| 모달 닫기 | `workflowState = draft`. 화면은 편집 계속 가능 |
| `decisionId` | 방금 확정한 ID는 메모리에 유지. **다음 확정** 시 서버가 **신규** `decision_id` 발급 |
| SQLite | 기존 레코드 덮어쓰기 없음 (`DB_state_v1.3.md` §8) |
| `currentSequence` | 확정 순서 유지. 초기화로 추천안 복귀 가능 |
| `recommendedSequence` | 변경 없음 |

`CommitResultModal`은 오버레이 컴포넌트로 구현한다 (`decision_id`, `committed_at`, 요약 표시).

---

# 9. objectiveScore 표시 방향 정책

`objectiveScore`는 낮을수록 좋다. `comparison_state.diff` = `current - recommended` (양수면 현재안이 더 나쁨).

| 방향 | 의미 | 색상 |
|---|---|---|
| `▲ +N%` | 현재안이 추천안보다 비용 높음 (나쁨) | 적색 |
| `▼ -N%` | 현재안이 추천안보다 비용 낮음 (좋음) | 녹색 |
| `= 0%` | 동일 | 기본색 |

`diff_rate`는 API의 `comparison_state.diff_rate` (예: `0.1823` → `+18.2%`)를 사용한다.

---

# 10. WarningPanel vs TransitionAnalysisTable

| 컴포넌트 | 역할 | 표시 범위 |
|---|---|---|
| `WarningPanel` | **HIGH / MEDIUM** (`UI: MED`) 경고만 즉각 인지 | `risk_warnings` 배열 (rule engine warning) |
| `TransitionAnalysisTable` | 전체 전환 상세 분석 | `transition_costs` 전체, row expand |

데이터 소스는 모두 `current_evaluation`이지만 **집계 단위가 다르다**. `risk_warnings`는 rule 위반 목록, `transition_costs[].severity`는 전환별 위험도 뱃지이다.

### severity 매핑

| API (`severity`) | UI 표기 |
|---|---|
| `HIGH` | HIGH |
| `MEDIUM` | MED |
| `LOW` | LOW |

---

# 11. comparisonDiffs 정책

`comparisonDiffs`는 API 필드가 아니다. frontend가 `recommendedSequence`와 `currentSequence`를 비교해 전환 쌍의 추가/제거를 계산한다.

```ts
const comparisonDiffs = deriveSequenceDiffs(
  recommendedSequence,
  currentSequence,
  planItems // planItemId → skuName 조인
)
```

예시 출력:

```text
- 검정 → 흰색 추가
- 메탈 → 일반색 제거
```

---

# 12. TransitionAnalysisTable 정책

| 항목 | 규칙 |
|---|---|
| 데이터 | `current_evaluation.transition_costs` |
| 기본 | compact 리스트 항상 노출 |
| row 클릭 | expand (`cost_dimensions`, `warning.recommendation` 등) |
| 다른 row 클릭 | 기존 expand 닫힘 |
| 동일 row 재클릭 | collapse |
| 푸터 문구 | `인접 전환 {transition_costs.length}건` · (요약 시) `표시 M행` · `rule 경고 {risk_warnings.length}건`. **「고위험·중위험 N건」처럼 KPI와 다른 숫자를 쓰지 않음** |

푸터는 항상 실제 `transition_costs.length`와 `risk_warnings.length`를 반영한다 (행 수 축약 시에도).

---

# 13. EvaluationConditionsPanel · PriorityPanel 정책

`EvaluationConditionsPanel`은 UI 컨테이너입니다. React state는 `operatingContext`와 `priorityProfile`을 **분리** 유지하고, 요청 시 각각 `operating_context` / `priority_profile`로 전달합니다. 접힘(`isEvaluationPanelExpanded`)은 표시만 바꿉니다.

| UI Label | API Key (`priorities`) |
|---|---|
| 세척 비용 | `wash_cost` |
| 다운타임 | `downtime` |
| 원자재 손실 | `material_loss` |
| 패키징 전환 | `packaging_time` |
| 작업자 비용 | `labor_cost` |

| UI 단계 | API `label` |
|---|---|
| 최저 | `VERY_LOW` |
| 낮음 | `LOW` |
| 보통 | `NORMAL` |
| 높음 | `HIGH` |
| 최고 | `VERY_HIGH` |

우선순위 변경 시 `POST /predict`만 호출한다. `recommendedSequence`와 `/optimize`는 재호출하지 않는다.

`setup_time`은 UI 선택 항목에서 제외하나 `applied_weights`·비용 계산에는 포함된다.

---

# 14. ComparisonPanel 정책

라이브 편집 화면의 데이터 소스를 아래처럼 분리한다. **표시 순서**는 위에서 아래로 고정한다.

| 순서 | 요소 | 출처 | 비고 |
|---:|---|---|---|
| 1 | 한 줄 요약 | `comparison_summary` (`/predict`) | rule/template. LLM 아님. 패널 최상단 블록 |
| 2 | sequence diff | `comparisonDiffs` (frontend) | §11 |
| 3 | 차원별 델타 (세척·인건 등) | `baseline_evaluation.aggregated_cost` vs `current_evaluation.aggregated_cost` | frontend diff, 차원별 ▲/▼ |
| 4 | risk 변화 (선택) | `risk_warnings` / `transition_costs.severity` | HIGH·MEDIUM 건수 변화 |
| — | 점수 비교 · ▲/▼ % | `comparison_state` | **패널 본문에 중복 금지**. 헤더·`KpiSummaryBar` 히어로만. `basis: objectiveScore` |

**사용하지 않는 것 (라이브 화면):**

- `cost_delta_vs_recommended` — `GET /decisions/{decision_id}` 저장 로그 전용. `/predict` 응답에 없음.

---

# 15. 비용 단위 정책

| 항목 | 처리 |
|---|---|
| 원화(₩) | UI에 직접 표시 금지 |
| 점수 | `478,047 pt` 또는 `478k pt` 등 축약 포맷. **동일 화면에서 `objective_score`와 `total_weighted_cost`를 둘 다 `478k`로 표기하지 않음** (§4 KpiSummaryBar) |
| 시간 차원 (`setup_time`, `downtime` 등) | Transition expand에서 `min` 단위 허용 |
| 비교율 | `comparison_state.diff_rate` 기반 ▲/▼ (`objective_score` 기준) |

---

# 16. API 호출 요약 (P0)

| 이벤트 | API | 비고 |
|---|---|---|
| 페이지 진입 | `GET /plans/{plan_id}` | `planItems`, context, default priority |
| 진입 직후 | `POST /optimize` | 1회만. `recommendedSequence` 고정 |
| 드롭 완료 | `POST /predict` | `recommended_sequence` + `current_sequence` |
| 우선순위 변경 | `POST /predict` | `recommended_sequence` 고정 |
| 초기화 후 | `POST /predict` | `/optimize` 없음. `current_sequence ← recommended_sequence` 후 1회 |
| 최종 확정 | `POST /decisions` | 서버 재계산 후 저장 |
| 설명 생성 (P1) | `POST /explain` | 버튼 클릭 시만 |
| 색상 검증 | `POST /validate` | **P0 미사용** |

---

# 17. 구현 우선순위

| 우선순위 | 구현 내용 |
|---|---|
| 1 | `GET /plans/{plan_id}` + `/optimize` 진입 플로우 |
| 2 | 2열 `DecisionWorkspace` + `TransitionSlot` + D&D |
| 3 | `EvaluationConditionsPanel` + `KpiSummaryBar`(평가 요약) + `isPredicting` |
| 4 | `ComparisonPanel` (`comparison_summary` + `comparisonDiffs` + 차원 델타) |
| 5 | `WarningPanel` + severity 매핑 |
| 6 | `TransitionAnalysisTable` + row expand |
| 7 | `PriorityPanel` + `/predict` 연동 |
| 8 | `CommitSection` + `CommitResultModal` + 재편집 정책 |
| 9 | 초기화 (`/predict` 1회) |
| 10 | `ExplanationPanel` (P1) |

---

# 18. 제외 범위

| 제외 | 이유 |
|---|---|
| `/dashboard` | P1 |
| `/decision/:id` | MVP 필수 아님 |
| `POST /validate` | P0는 `/predict`의 `risk_warnings`로 충분 |
| chart 시각화 | 숫자/텍스트로 충분 |
| 자동 LLM 재생성 | 비용 큼 |
| 다중 라인 | MVP 단일 라인 |
| 복잡한 권한 관리 | 데모 기준 |

---

# 19. 현재 MVP 핵심 철학

```text
AI가 자동으로 정답을 결정한다
❌

운영자가
비용·리스크·trade-off를 비교하며
최종 결정을 내린다
⭕
```

---

# 20. `DB_state_v1.3` · `api_contract` 필드 매핑 (프론트 참고)

| 개념 (DB_state) | 프론트 / API (`api_contract`) | 비고 |
|---|---|---|
| `planItems` / `plan_item_id` | `planItems[].planItemId`, sequence 배열 | 카드는 SKU명 표시, key·D&D는 `plan_item_id` |
| `baselineSequence` | `POST /predict` → `recommended_sequence` | 이름만 다름 |
| `comparisonState.basis` | `comparison_state.basis` = `objectiveScore` | |
| `riskWarnings[].risk` (DB 타입 초안) | `risk_warnings[].severity` | UI 집계·WarningPanel은 `severity` |
| `sequence_rules.risk: "mid"` | API `severity: "MEDIUM"` → UI `MED` | |
| `violation_count` | P0 UI 미표시 | KPI는 `risk_warnings.length` |
| `workflowState: validated` | MVP UI 생략 가능 | `draft` ↔ `committed` 중심 |

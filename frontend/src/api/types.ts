/**
 * SmartFactoryV2 — Frontend TypeScript Type Definitions
 *
 * 기준 문서
 *   - api_contract.md          (API wire format, snake_case)
 *   - DB_state_v1_3.md         (화면 State, DB 스키마)
 *   - docs/design/priority-profile-contract.md  (priority_profile nested 계약)
 *   - frontend_mvp_decision_structure_v3_2.md  (§4–§15)
 *
 * 네이밍 규칙
 *   - API 응답 타입 (raw)  : 접미사 `Raw`         예) PlanItemRaw
 *   - 프론트 도메인 타입   : 접미사 없음           예) PlanItem
 *   - API 요청 body        : 접미사 `Request`      예) OptimizeRequest
 *   - API 응답 body        : 접미사 `Response`     예) OptimizeResponse
 *   - 화면 State           : DecisionPageState
 */

// ============================================================
// 0. 공통 리터럴 타입
// ============================================================

/** 우선순위 라벨 — API wire format */
export type PriorityLabel = 'VERY_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'VERY_HIGH';

/** 우선순위 multiplier — 라벨과 1:1 대응 */
export type PriorityMultiplier = 0.70 | 0.85 | 1.00 | 1.15 | 1.30;

/**
 * RiskWarning severity — API wire format
 * UI 표기: HIGH → "HIGH", MEDIUM → "MED", LOW → "LOW"
 */
export type WarningSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

/** UI 표기용 severity (MEDIUM → MED) */
export type WarningSeverityUI = 'HIGH' | 'MED' | 'LOW';

/** 교대 조건 */
export type Shift = 'day' | 'night';

/** 패키지 조건 */
export type PackageSize = '1L' | '4L' | '18L';

/** SKU 색상군 — DB sku_master.category */
export type SkuCategory = 'light' | 'mid' | 'dark' | 'metal' | 'special' | 'normal';

/** 워크플로우 상태 — MVP: validated 생략 가능 */
export type WorkflowState = 'draft' | 'committed';

/** 확정 저장 상태 */
export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

/** /optimize optimizer_backend */
export type OptimizerBackend =
  | 'trivial'
  | 'ortools-routing-open-path'
  | 'brute-force-fallback'
  | 'nearest-neighbor-fallback';

// ============================================================
// 1. 공통 DTO — API wire format (snake_case)
// ============================================================

/**
 * CostVector — 7차원 비용
 * aggregated_cost, cost_dimensions 에 사용
 * sequence_risk 는 Rule Engine 평가 보조값 (priority multiplier 대상 아님)
 */
export interface CostVectorRaw {
  setup_time: number;
  labor_cost: number;
  material_loss: number;
  wash_cost: number;
  downtime: number;
  sequence_risk: number;
  packaging_time: number;
}

/**
 * AppliedWeights — 재정규화된 최종 가중치 (합계 = 1)
 * setup_time 포함, sequence_risk 제외
 */
export interface AppliedWeightsRaw {
  setup_time: number;
  wash_cost: number;
  downtime: number;
  material_loss: number;
  packaging_time: number;
  labor_cost: number;
}

/** PriorityEntry — 우선순위 항목 하나 (API wire) */
export interface PriorityEntryRaw {
  label: PriorityLabel;
  multiplier: PriorityMultiplier;
}

/**
 * 운영자 UI·API 요청이 조절하는 5개 비용 차원 (snake_case wire).
 * @see docs/design/priority-profile-contract.md § Frontend Hand-off
 */
export type OperatorPriorityDimension =
  | 'wash_cost'
  | 'downtime'
  | 'material_loss'
  | 'packaging_time'
  | 'labor_cost';

/** OPERATOR_PRIORITY_DIMENSIONS — wire 축 순서 (mapper·요청 body 공통) */
export const OPERATOR_PRIORITY_DIMENSIONS: readonly OperatorPriorityDimension[] = [
  'wash_cost',
  'downtime',
  'material_loss',
  'packaging_time',
  'labor_cost',
] as const;

/**
 * PriorityProfileRaw — nested 정본 (api_contract §29, DB_state §6.1)
 * setup_time · sequence_risk 는 priorities 에 포함하지 않음
 */
export interface PriorityProfileRaw {
  base_weight_profile_id: string;
  priorities: Record<OperatorPriorityDimension, PriorityEntryRaw>;
}

/**
 * @deprecated 구버전 flat 응답 호환. 신규 API는 nested PriorityProfileRaw.
 * setup_time · sequence_risk 키는 무시한다.
 */
export type LegacyFlatPriorityProfileRaw = Partial<
  Record<OperatorPriorityDimension | 'setup_time' | 'sequence_risk', PriorityEntryRaw>
>;

/** @deprecated LegacyFlatPriorityProfileRaw 사용 권장 */
export type NormalizedPriorityProfileRaw = LegacyFlatPriorityProfileRaw;

/**
 * RiskWarning — 색상 전환 rule soft warning
 * 확정 차단 아님. riskWarnings 배열 원소
 */
export interface RiskWarningRaw {
  rule_id: string;
  severity: WarningSeverity;
  from_plan_item_id: string;
  to_plan_item_id: string;
  penalty: number;
  message: string;
  recommendation: string;
}

/**
 * TransitionCost — 인접 plan_item_id 쌍의 전환 비용
 * warning 은 RiskWarningRaw | null
 */
export interface TransitionCostRaw {
  from_plan_item_id: string;
  to_plan_item_id: string;
  from_sku_id: string;
  to_sku_id: string;
  cost_dimensions: CostVectorRaw;
  rule_id: string | null;
  severity: WarningSeverity | null;
  sequence_penalty: number;
  warning: RiskWarningRaw | null;
}

/**
 * SequenceEvaluation — 하나의 sequence 전체 평가 결과
 * /predict 의 current_evaluation, baseline_evaluation 에 사용
 */
export interface SequenceEvaluationRaw {
  sequence: string[];
  transition_costs: TransitionCostRaw[];
  aggregated_cost: CostVectorRaw;
  total_weighted_cost: number;
  sequence_penalty: number;
  objective_score: number;
  risk_warnings: RiskWarningRaw[];
  priority_profile: PriorityProfileRaw;
  applied_weights: AppliedWeightsRaw;
  model_version: string;
  rule_version: string;
}

/**
 * ComparisonState — 추천안 vs 현재안 비교
 * basis 는 항상 'objectiveScore'
 * diff = current - recommended (양수 → 현재안이 더 나쁨)
 */
export interface ComparisonStateRaw {
  basis: 'objectiveScore';
  recommended: number;
  current: number;
  diff: number;
  diff_rate: number;
}

// ============================================================
// 2. API 응답 Raw 타입
// ============================================================

/** GET /plans/{plan_id} — plan_items 내 nested sku (백엔드 DataLoader 조인) */
export interface PlanItemSkuRaw {
  sku_id: string;
  sku_name: string;
  category: string;
  color_family?: string;
  hex_code: string;
  color_hex?: string;
}

/**
 * GET /plans/{plan_id} — plan_items 원소
 * flat 필드(api_contract) 또는 nested `sku`(현재 백엔드) 모두 허용
 */
export interface PlanItemRaw {
  plan_item_id: string;
  plan_id: string;
  plan_date: string;
  sku_id: string;
  sku_name?: string;
  hex_code?: string;
  category?: SkuCategory;
  color_family?: string;
  quantity: number;
  package_size: string;
  due_priority?: number | null;
  line_id?: string | null;
  sku?: PlanItemSkuRaw;
}

/** GET /plans/{plan_id} — operating_context */
export interface OperatingContextRaw {
  line_id: string;
  shift: Shift;
  crew_size: number;
}

/** GET /plans/{plan_id} Response (hand-off 문서의 PlanResponse) */
export interface GetPlanResponse {
  plan_id: string;
  plan_items: PlanItemRaw[];
  operating_context: OperatingContextRaw;
  default_priority_profile: PriorityProfileRaw;
}

/** @alias GetPlanResponse */
export type PlanResponse = GetPlanResponse;

/** GET /plans/{plan_id} — mapper 적용 후 도메인 응답 */
export interface GetPlanData {
  planId: string;
  planItems: PlanItem[];
  operatingContext: OperatingContext;
  defaultPriorityProfile: PriorityProfile;
}

/** POST /optimize Request */
export interface OptimizeRequest {
  plan_id: string;
  plan_item_ids: string[];
  priority_profile: PriorityProfileRaw;
}

/** POST /optimize Response */
export interface OptimizeResponse {
  recommended_sequence: string[];
  transition_costs: TransitionCostRaw[];
  aggregated_cost: CostVectorRaw;
  total_weighted_cost: number;
  sequence_penalty: number;
  objective_score: number;
  risk_warnings: RiskWarningRaw[];
  model_version: string;
  rule_version: string;
  optimizer_backend: OptimizerBackend;
}

/** POST /predict Request */
export interface PredictRequest {
  plan_id: string;
  recommended_sequence: string[];
  current_sequence: string[];
  priority_profile: PriorityProfileRaw;
}

/** POST /predict Response */
export interface PredictResponse {
  current_evaluation: SequenceEvaluationRaw;
  baseline_evaluation: SequenceEvaluationRaw;
  comparison_state: ComparisonStateRaw;
  comparison_summary: string;
  applied_weights: AppliedWeightsRaw;
}

/** POST /decisions Request */
export interface DecisionsRequest {
  plan_id: string;
  recommended_sequence: string[];
  confirmed_sequence: string[];
  priority_profile: PriorityProfileRaw;
  decision_memo?: string;
}

/** POST /decisions Response */
export interface DecisionsResponse {
  decision_id: string;
  committed_at: string;       // ISO 8601
}

/** POST /explain Request */
export interface ExplainRequest {
  plan_id: string;
  current_sequence: string[];
  comparison_state: ComparisonStateRaw;
  comparison_summary: string;
  risk_warnings: RiskWarningRaw[];
  priority_profile: PriorityProfileRaw;
}

/** POST /explain Response */
export interface ExplainResponse {
  explanation: string;
}

// ============================================================
// 3. 프론트엔드 도메인 타입 (camelCase 변환 완료)
// ============================================================

/** PlanItem — API PlanItemRaw를 camelCase 변환한 도메인 타입 */
export interface PlanItem {
  planItemId: string;
  planId: string;
  planDate: string;
  skuId: string;
  skuName: string;
  hexCode: string;
  category: SkuCategory;
  colorFamily?: string | undefined;
  quantity: number;
  packageSize: PackageSize;
  duePriority?: number | null | undefined;
  lineId?: string | null | undefined;
}

/** OperatingContext — 화면 노출 3개 필드만 */
export interface OperatingContext {
  lineId: string;   // 표시 전용, MVP 단일 라인
  shift: Shift;     // 운영자 선택
  crewSize: number; // 운영자 선택
}

/** PriorityEntry — camelCase (도메인) */
export interface PriorityEntry {
  label: PriorityLabel;
  multiplier: PriorityMultiplier;
}

/** 운영자 UI 5축 (camelCase 도메인) */
export type OperatorPriorityDimensionUI =
  | 'washCost'
  | 'downtime'
  | 'materialLoss'
  | 'packagingTime'
  | 'laborCost';

/** wire 축 → UI 축 */
export const OPERATOR_PRIORITY_DIMENSION_TO_UI: Record<
  OperatorPriorityDimension,
  OperatorPriorityDimensionUI
> = {
  wash_cost:      'washCost',
  downtime:       'downtime',
  material_loss:  'materialLoss',
  packaging_time: 'packagingTime',
  labor_cost:     'laborCost',
};

/**
 * PriorityProfile — camelCase nested 정본
 * UI 선택 5개 축만 포함. setup_time 은 appliedWeights 쪽에서 서버가 처리
 */
export interface PriorityProfile {
  baseWeightProfileId: string;
  priorities: Record<OperatorPriorityDimensionUI, PriorityEntry>;
}

/**
 * AppliedWeights — camelCase
 * setupTime 포함, sequenceRisk 제외
 */
export interface AppliedWeights {
  setupTime: number;
  washCost: number;
  downtime: number;
  materialLoss: number;
  packagingTime: number;
  laborCost: number;
}

/** CostVector — camelCase */
export interface CostVector {
  setupTime: number;
  laborCost: number;
  materialLoss: number;
  washCost: number;
  downtime: number;
  sequenceRisk: number;
  packagingTime: number;
}

/** RiskWarning — camelCase */
export interface RiskWarning {
  ruleId: string;
  severity: WarningSeverity;
  fromPlanItemId: string;
  toPlanItemId: string;
  penalty: number;
  message: string;
  recommendation: string;
}

/** TransitionCost — camelCase */
export interface TransitionCost {
  fromPlanItemId: string;
  toPlanItemId: string;
  fromSkuId: string;
  toSkuId: string;
  costDimensions: CostVector;
  ruleId: string | null;
  severity: WarningSeverity | null;
  sequencePenalty: number;
  warning: RiskWarning | null;
}

/** SequenceEvaluation — camelCase */
export interface SequenceEvaluation {
  sequence: string[];
  transitionCosts: TransitionCost[];
  aggregatedCost: CostVector;
  totalWeightedCost: number;
  sequencePenalty: number;
  objectiveScore: number;
  riskWarnings: RiskWarning[];
  priorityProfile: PriorityProfile;
  appliedWeights: AppliedWeights;
  modelVersion: string;
  ruleVersion: string;
}

/**
 * ComparisonState — camelCase
 * diff = current - recommended (양수 → 현재안 더 나쁨)
 * diffRate 범위: 0.1823 → UI "+18.2%"
 */
export interface ComparisonState {
  basis: 'objectiveScore';
  recommended: number;
  current: number;
  diff: number;
  diffRate: number;
}

/**
 * ComparisonDiff — frontend computed
 * recommendedSequence vs currentSequence 전환 쌍 추가/제거
 * API 필드 아님. deriveSequenceDiffs() 결과
 */
export interface ComparisonDiff {
  type: 'added' | 'removed';
  fromSkuName: string;
  toSkuName: string;
  fromPlanItemId: string;
  toPlanItemId: string;
}

/**
 * CostDelta — frontend computed
 * baseline_evaluation.aggregated_cost vs current_evaluation.aggregated_cost 차이
 * API cost_delta_vs_recommended 는 GET /decisions/{id} 저장 로그 전용 — 라이브 화면에서 미사용
 */
export interface CostDelta {
  setupTime: number;
  laborCost: number;
  materialLoss: number;
  washCost: number;
  downtime: number;
  sequenceRisk: number;
  packagingTime: number;
}

// ============================================================
// 4. 화면 State — DecisionPageState
// ============================================================

/**
 * DecisionPageState — /decision 화면 전체 상태
 * frontend_mvp_decision_structure_v3_2.md §5 기준
 */
export interface DecisionPageState {
  // ── Data: 생산계획 ──────────────────────────────────────────
  /** GET /plans/{plan_id} 결과 */
  planItems: PlanItem[];

  /** 화면 노출 운영 컨텍스트 (lineId 표시 + shift/crewSize 입력) */
  operatingContext: OperatingContext;

  // ── Data: 시퀀스 ─────────────────────────────────────────────
  /**
   * /optimize 1회 생성. 우선순위 변경 시에도 불변.
   * plan_item_id[] 배열
   */
  recommendedSequence: string[];

  /**
   * 운영자 D&D 대상. plan_item_id[] 배열.
   * 초기값 = recommendedSequence
   */
  currentSequence: string[];

  // ── Data: 우선순위 ───────────────────────────────────────────
  /**
   * 운영자 우선순위 5축.
   * 우선순위 변경 → POST /predict (POST /optimize 재호출 없음)
   */
  priorityProfile: PriorityProfile;

  /**
   * /predict 응답의 applied_weights.
   * multiplier 적용 후 합계=1 재정규화 값
   */
  appliedWeights: AppliedWeights | null;

  // ── Data: 비용 평가 ──────────────────────────────────────────
  /** current_evaluation.transition_costs */
  transitionCosts: TransitionCost[];

  /** current_evaluation.aggregated_cost */
  aggregatedCost: CostVector | null;

  /**
   * baseline_evaluation.aggregated_cost (/predict 응답)
   * ComparisonPanel 차원별 델타 계산용. 추천안 기준선
   */
  baselineAggregatedCost: CostVector | null;

  /**
   * current_evaluation.total_weighted_cost
   * objectiveScore 와 별개로 KPI 미니 카드에 표시
   */
  totalWeightedCost: number | null;

  /**
   * current_evaluation.sequence_penalty
   * KPI 미니 카드에 별도 표시
   */
  sequencePenalty: number | null;

  /**
   * current_evaluation.objective_score
   * = totalWeightedCost + sequencePenalty
   * KPI 히어로 카드에 표시
   */
  objectiveScore: number | null;

  /** current_evaluation.risk_warnings — soft warning, 확정 차단 아님 */
  riskWarnings: RiskWarning[];

  // ── Data: 비교 ───────────────────────────────────────────────
  /** /predict 응답의 comparison_state */
  comparisonState: ComparisonState | null;

  /** /predict 응답의 comparison_summary (rule/template 기반, LLM 아님) */
  comparisonSummary: string | null;

  /**
   * frontend computed — §11
   * deriveSequenceDiffs(recommendedSequence, currentSequence, planItems) 결과
   */
  comparisonDiffs: ComparisonDiff[];

  // ── Data: LLM 설명 (P1) ──────────────────────────────────────
  /** POST /explain 결과. 버튼 클릭 시에만 생성 */
  llmExplanation: string | null;

  // ── Data: 확정 ───────────────────────────────────────────────
  /** 운영자 입력 메모. POST /decisions 의 decision_memo */
  decisionMemo: string;

  /** 마지막 확정 decision_id. 재편집 후 다음 확정 시 서버가 신규 발급 */
  decisionId: string | null;

  /** 확정 시각 ISO 8601 */
  committedAt: string | null;

  // ── Business: 워크플로우 ─────────────────────────────────────
  /** MVP: 'draft' | 'committed' */
  workflowState: WorkflowState;

  /**
   * hard block 사유. null 이면 확정 가능.
   * riskWarnings 존재 여부와 무관.
   * canCommit = commitBlockReason === null (파생값, 별도 상태 아님)
   */
  commitBlockReason: string | null;

  /** 확정 저장 상태 */
  saveStatus: SaveStatus;

  // ── UI Control ───────────────────────────────────────────────
  /**
   * TransitionAnalysisTable 펼침 행
   * null → 모두 닫힘
   */
  selectedTransitionKey: string | null; // "{fromPlanItemId}->{toPlanItemId}"

  /** EvaluationConditionsPanel 접기/펼치기 */
  isEvaluationPanelExpanded: boolean;

  // ── Async 로딩 ───────────────────────────────────────────────
  /** GET /plans + POST /optimize 진입 시퀀스 로딩 중 */
  isOptimizing: boolean;

  /** POST /predict 호출 중. KPI·ComparisonPanel 로딩 표시 */
  isPredicting: boolean;

  /** POST /explain 호출 중 (P1) */
  isExplaining: boolean;

  /**
   * D&D 드래그 중.
   * true 동안 API 호출 없음. 드롭 완료 → isPredicting
   */
  isDragging: boolean;
}

// ============================================================
// 5. 파생 유틸리티 타입
// ============================================================

/**
 * 확정 가능 여부 — 별도 상태 아님
 * const canCommit = state.commitBlockReason === null
 */
export type CanCommit = boolean;

/**
 * KpiSummaryBar 에 전달할 집계 데이터
 * 모두 DecisionPageState 필드에서 파생
 */
export interface KpiSummaryData {
  /** KPI 히어로: objective_score */
  objectiveScore: number;
  /** KPI 히어로 부가: total_weighted_cost */
  totalWeightedCost: number;
  /** KPI 히어로 부가: sequence_penalty */
  sequencePenalty: number;
  /** KPI 히어로 배지: comparison_state.diff_rate */
  diffRate: number;
  /** 4-grid: aggregated_cost.wash_cost */
  washCost: number;
  /**
   * 4-grid 「위험 전환」: risk_warnings.length (전체 건수)
   * 헤더·체크박스용 HIGH 건수는 컴포넌트에서 filter
   */
  riskWarningCount: number;
  riskWarnings: RiskWarning[];
}

/**
 * severity UI 표기 변환 헬퍼 타입
 * MEDIUM → MED (UI 표기)
 */
export type SeverityToUI = (severity: WarningSeverity) => WarningSeverityUI;

// ============================================================
// 6. snake_case → camelCase 매핑 함수 시그니처
// ============================================================

export type MapPlanItem      = (raw: PlanItemRaw)           => PlanItem;
export type MapCostVector    = (raw: CostVectorRaw)         => CostVector;
export type MapAppliedWeights= (raw: AppliedWeightsRaw)     => AppliedWeights;
export type MapPriorityProfile=(
  raw: PriorityProfileRaw | LegacyFlatPriorityProfileRaw,
) => PriorityProfile;
export type MapRiskWarning   = (raw: RiskWarningRaw)        => RiskWarning;
export type MapTransitionCost= (raw: TransitionCostRaw)     => TransitionCost;
export type MapSequenceEval  = (raw: SequenceEvaluationRaw) => SequenceEvaluation;
export type MapComparisonState=(raw: ComparisonStateRaw)    => ComparisonState;

// ============================================================
// 7. 초기 상태 상수
// ============================================================

export const DEFAULT_PRIORITY_ENTRY: PriorityEntry = {
  label: 'NORMAL',
  multiplier: 1.00,
};

export const DEFAULT_PRIORITY_PROFILE: PriorityProfile = {
  baseWeightProfileId: 'factory_default_v1',
  priorities: Object.fromEntries(
    OPERATOR_PRIORITY_DIMENSIONS.map(dim => [
      OPERATOR_PRIORITY_DIMENSION_TO_UI[dim],
      { ...DEFAULT_PRIORITY_ENTRY },
    ]),
  ) as Record<OperatorPriorityDimensionUI, PriorityEntry>,
};

export const INITIAL_DECISION_PAGE_STATE: DecisionPageState = {
  planItems:                  [],
  operatingContext:           { lineId: 'LINE-01', shift: 'day', crewSize: 3 },
  recommendedSequence:        [],
  currentSequence:            [],
  priorityProfile:            DEFAULT_PRIORITY_PROFILE,
  appliedWeights:             null,
  transitionCosts:            [],
  aggregatedCost:             null,
  baselineAggregatedCost:     null,
  totalWeightedCost:          null,
  sequencePenalty:            null,
  objectiveScore:             null,
  riskWarnings:               [],
  comparisonState:            null,
  comparisonSummary:          null,
  comparisonDiffs:            [],
  llmExplanation:             null,
  decisionMemo:               '',
  decisionId:                 null,
  committedAt:                null,
  workflowState:              'draft',
  commitBlockReason:          null,
  saveStatus:                 'idle',
  selectedTransitionKey:      null,
  isEvaluationPanelExpanded:  true,
  isOptimizing:               false,
  isPredicting:               false,
  isExplaining:               false,
  isDragging:                 false,
};

// ============================================================
// 8. 우선순위 라벨 상수 매핑
// ============================================================

/** PriorityLabel → multiplier 매핑 */
export const PRIORITY_MULTIPLIER: Record<PriorityLabel, PriorityMultiplier> = {
  VERY_LOW:  0.70,
  LOW:       0.85,
  NORMAL:    1.00,
  HIGH:      1.15,
  VERY_HIGH: 1.30,
};

/** PriorityLabel → UI 표기 (한국어) */
export const PRIORITY_LABEL_KO: Record<PriorityLabel, string> = {
  VERY_LOW:  '최저',
  LOW:       '낮음',
  NORMAL:    '보통',
  HIGH:      '높음',
  VERY_HIGH: '최고',
};

/** WarningSeverity → UI 표기 */
export const SEVERITY_UI: Record<WarningSeverity, WarningSeverityUI> = {
  HIGH:   'HIGH',
  MEDIUM: 'MED',
  LOW:    'LOW',
};

/** PriorityProfile 우선순위 키 → UI 라벨 (한국어) */
export const PRIORITY_AXIS_KO: Record<OperatorPriorityDimensionUI, string> = {
  washCost:      '세척 비용',
  downtime:      '다운타임',
  materialLoss:  '원자재 손실',
  packagingTime: '패키징 전환',
  laborCost:     '작업자 비용',
};

// ============================================================
// 9. Dashboard (P1 — wire format 유지)
// ============================================================

/** GET /dashboard — kpi_trend 항목 (7차원 + objective_score) */
export interface KpiTrendPoint {
  decision_id: string;
  confirmed_at: string;
  objective_score: number;
  setup_time: number;
  labor_cost: number;
  material_loss: number;
  wash_cost: number;
  downtime: number;
  packaging_time: number;
  sequence_risk: number;
}

/** GET /dashboard Response */
export interface DashboardResponse {
  dashboard_summary: {
    decision_count: number;
    average_objective_score: number;
    high_risk_transition_count: number;
  };
  kpi_trend: KpiTrendPoint[];
  risk_patterns: Array<Record<string, unknown>>;
  recent_decisions: Array<Record<string, unknown>>;
  weekly_summary: string;
}

/**
 * SmartFactoryV2 — API Response Mappers
 *
 * 역할: API wire format(snake_case Raw 타입) → 프론트 도메인 타입(camelCase) 변환
 *
 * 설계 원칙
 *   1. 각 mapper는 순수 함수(pure function) — 부수효과 없음
 *   2. Raw 타입의 모든 필드를 빠짐없이 camelCase로 변환
 *   3. optional 필드는 undefined 그대로 유지 (null 강제 변환 없음)
 *   4. 고차 mapper(mapArray)로 배열 변환 중복 제거
 *   5. API 응답 전체를 한 번에 State에 적용하는 apply* 함수 제공
 *
 * 파일 구조
 *   §1  원자 mapper  — CostVector, AppliedWeights, PriorityEntry/Profile
 *   §2  경고 mapper  — RiskWarning
 *   §3  전환 mapper  — TransitionCost
 *   §4  평가 mapper  — SequenceEvaluation, ComparisonState
 *   §5  계획 mapper  — PlanItem, OperatingContext, GetPlanResponse
 *   §6  computed     — deriveSequenceDiffs, deriveCostDelta
 *   §7  apply 함수   — applyOptimizeResponse, applyPredictResponse 등
 */

import { mapSkuPhysicalLevels } from '../utils/skuLevels';
import {
  DEFAULT_PRIORITY_ENTRY,
  OPERATOR_PRIORITY_DIMENSIONS,
  OPERATOR_PRIORITY_DIMENSION_TO_UI,
} from './types';
import type {
  // Raw (API wire)
  CostVectorRaw,
  AppliedWeightsRaw,
  LegacyFlatPriorityProfileRaw,
  PriorityEntryRaw,
  PriorityProfileRaw,
  OperatorPriorityDimensionUI,
  RiskWarningRaw,
  TransitionCostRaw,
  SequenceEvaluationRaw,
  ComparisonStateRaw,
  PlanItemRaw,
  OperatingContextRaw,
  GetPlanResponse,
  GetPlanData,
  OptimizeRequest,
  OptimizeResponse,
  PredictRequest,
  PredictResponse,
  DecisionsRequest,
  DecisionsResponse,
  ExplainRequest,
  ExplainResponse,
  // Domain (camelCase)
  CostVector,
  AppliedWeights,
  PriorityEntry,
  PriorityProfile,
  RiskWarning,
  TransitionCost,
  SequenceEvaluation,
  ComparisonState,
  PlanItem,
  OperatingContext,
  ComparisonDiff,
  CostDelta,
  // State
  DecisionPageState,
} from './types';

// ============================================================
// 유틸리티
// ============================================================

/** 배열 원소 mapper를 배열 전체에 적용 */
function mapArray<R, D>(raw: R[], mapper: (r: R) => D): D[] {
  return raw.map(mapper);
}

// ============================================================
// §1 원자 mapper
// ============================================================

/**
 * CostVector: 7차원 비용 변환
 * sequence_risk → sequenceRisk (Rule Engine 보조값, multiplier 대상 아님)
 */
export function mapCostVector(raw: CostVectorRaw): CostVector {
  return {
    setupTime:      raw.setup_time,
    laborCost:      raw.labor_cost,
    materialLoss:   raw.material_loss,
    washCost:       raw.wash_cost,
    downtime:       raw.downtime,
    sequenceRisk:   raw.sequence_risk,
    packagingTime:  raw.packaging_time,
  };
}

/**
 * AppliedWeights: 재정규화된 최종 가중치 변환
 * setup_time 포함, sequence_risk 제외
 */
export function mapAppliedWeights(raw: AppliedWeightsRaw): AppliedWeights {
  return {
    setupTime:      raw.setup_time,
    washCost:       raw.wash_cost,
    downtime:       raw.downtime,
    materialLoss:   raw.material_loss,
    packagingTime:  raw.packaging_time,
    laborCost:      raw.labor_cost,
  };
}

/**
 * PriorityEntry: 우선순위 항목 하나 변환
 * label · multiplier 는 API 리터럴 그대로 유지
 */
export function mapPriorityEntry(raw: PriorityEntryRaw): PriorityEntry {
  return {
    label:      raw.label,
    multiplier: raw.multiplier,
  };
}

/**
 * PriorityProfile: nested 정본 → camelCase 도메인.
 * legacy flat 응답은 누락 축을 NORMAL로 채운다.
 */
export function mapPriorityProfile(
  raw: PriorityProfileRaw | LegacyFlatPriorityProfileRaw,
): PriorityProfile {
  const isNested = 'priorities' in raw && raw.priorities != null;
  const prioritiesIn: LegacyFlatPriorityProfileRaw | PriorityProfileRaw['priorities'] =
    isNested ? (raw as PriorityProfileRaw).priorities : (raw as LegacyFlatPriorityProfileRaw);
  const baseWeightProfileId =
    'base_weight_profile_id' in raw && raw.base_weight_profile_id
      ? raw.base_weight_profile_id
      : 'factory_default_v1';

  const priorities = {} as Record<OperatorPriorityDimensionUI, PriorityEntry>;
  for (const dim of OPERATOR_PRIORITY_DIMENSIONS) {
    const uiKey = OPERATOR_PRIORITY_DIMENSION_TO_UI[dim];
    const entry = prioritiesIn[dim];
    priorities[uiKey] = entry
      ? mapPriorityEntry(entry)
      : { ...DEFAULT_PRIORITY_ENTRY };
  }

  return { baseWeightProfileId, priorities };
}

// ============================================================
// §2 경고 mapper
// ============================================================

/**
 * RiskWarning: 색상 전환 rule soft warning 변환
 * severity 는 API 리터럴 그대로 유지 (HIGH/MEDIUM/LOW)
 * UI 표기(MED)는 SEVERITY_UI 상수로 컴포넌트에서 처리
 */
export function mapRiskWarning(raw: RiskWarningRaw): RiskWarning {
  return {
    ruleId:           raw.rule_id,
    severity:         raw.severity,
    fromPlanItemId:   raw.from_plan_item_id,
    toPlanItemId:     raw.to_plan_item_id,
    penalty:          raw.penalty,
    message:          raw.message,
    recommendation:   raw.recommendation,
  };
}

// ============================================================
// §3 전환 mapper
// ============================================================

/**
 * TransitionCost: 인접 plan_item_id 쌍의 전환 비용 변환
 * warning: RiskWarningRaw | null → RiskWarning | null
 * cost_dimensions → costDimensions (CostVector)
 */
export function mapTransitionCost(raw: TransitionCostRaw): TransitionCost {
  return {
    fromPlanItemId:  raw.from_plan_item_id,
    toPlanItemId:    raw.to_plan_item_id,
    fromSkuId:       raw.from_sku_id,
    toSkuId:         raw.to_sku_id,
    costDimensions:  mapCostVector(raw.cost_dimensions),
    ruleId:          raw.rule_id,
    severity:        raw.severity,
    sequencePenalty: raw.sequence_penalty,
    warning:         raw.warning !== null ? mapRiskWarning(raw.warning) : null,
  };
}

// ============================================================
// §4 평가 mapper
// ============================================================

/**
 * SequenceEvaluation: sequence 전체 평가 결과 변환
 * /predict 의 current_evaluation, baseline_evaluation 모두 이 함수로 처리
 */
export function mapSequenceEvaluation(raw: SequenceEvaluationRaw): SequenceEvaluation {
  return {
    sequence:          [...raw.sequence],
    transitionCosts:   mapArray(raw.transition_costs, mapTransitionCost),
    aggregatedCost:    mapCostVector(raw.aggregated_cost),
    totalWeightedCost: raw.total_weighted_cost,
    sequencePenalty:   raw.sequence_penalty,
    objectiveScore:    raw.objective_score,
    riskWarnings:      mapArray(raw.risk_warnings, mapRiskWarning),
    priorityProfile:   mapPriorityProfile(raw.priority_profile),
    appliedWeights:    mapAppliedWeights(raw.applied_weights),
    modelVersion:      raw.model_version,
    ruleVersion:       raw.rule_version,
  };
}

/**
 * ComparisonState: 추천안 vs 현재안 비교 변환
 * diff_rate → diffRate (0.1823 → UI "+18.2%"는 컴포넌트에서 처리)
 * basis 는 항상 'objectiveScore' 리터럴 그대로 유지
 */
export function mapComparisonState(raw: ComparisonStateRaw): ComparisonState {
  return {
    basis:       raw.basis,
    recommended: raw.recommended,
    current:     raw.current,
    diff:        raw.diff,
    diffRate:    raw.diff_rate,
  };
}

// ============================================================
// §5 계획 mapper
// ============================================================

/**
 * PlanItem: 생산계획 항목 변환
 * flat(api_contract) 또는 nested `sku`(DataLoader 조인) 모두 처리
 */
export function mapPlanItem(raw: PlanItemRaw): PlanItem {
  const sku = raw.sku;
  const category = (raw.category ?? sku?.category ?? 'normal') as PlanItem['category'];
  const packageSize = raw.package_size as PlanItem['packageSize'];
  const physical = mapSkuPhysicalLevels(sku as Record<string, unknown> | undefined);

  return {
    planItemId:   raw.plan_item_id,
    planId:       raw.plan_id,
    planDate:     raw.plan_date,
    skuId:        raw.sku_id,
    skuName:      raw.sku_name ?? sku?.sku_name ?? raw.sku_id,
    hexCode:      raw.hex_code ?? sku?.hex_code ?? sku?.color_hex ?? '#CCCCCC',
    category,
    colorFamily:  raw.color_family ?? sku?.color_family,
    ...physical,
    quantity:     raw.quantity,
    packageSize,
    duePriority:  raw.due_priority,
    lineId:       raw.line_id,
  };
}

/**
 * OperatingContext: 운영 컨텍스트 변환
 * 화면 노출 3개 필드만 (lineId 표시, shift/crewSize 입력)
 * line_id → lineId, crew_size → crewSize
 */
export function mapOperatingContext(raw: OperatingContextRaw): OperatingContext {
  return {
    lineId:   raw.line_id,
    shift:    raw.shift,
    crewSize: raw.crew_size,
  };
}

/** GET /plans/{plan_id} 전체 응답 → 도메인 */
export function mapGetPlanResponse(raw: GetPlanResponse): GetPlanData {
  return {
    planId: raw.plan_id,
    planItems: mapArray(raw.plan_items, mapPlanItem),
    operatingContext: mapOperatingContext(raw.operating_context),
    defaultPriorityProfile: mapPriorityProfile(raw.default_priority_profile),
  };
}

/** GET /plans 도메인 결과를 DecisionPageState에 병합 */
export function mergeGetPlanData(
  prev: DecisionPageState,
  data: GetPlanData,
): DecisionPageState {
  return {
    ...prev,
    planItems: data.planItems,
    operatingContext: data.operatingContext,
    priorityProfile: data.defaultPriorityProfile,
  };
}

// ============================================================
// §5b domain → API request (camelCase → snake_case)
// ============================================================

/** PriorityEntry → API wire */
export function toPriorityEntryRaw(entry: PriorityEntry): PriorityEntryRaw {
  return { label: entry.label, multiplier: entry.multiplier };
}

/** PriorityProfile nested 정본 → API wire (5축) */
export function toPriorityProfileRaw(profile: PriorityProfile): PriorityProfileRaw {
  const priorities = {} as PriorityProfileRaw['priorities'];
  for (const dim of OPERATOR_PRIORITY_DIMENSIONS) {
    const uiKey = OPERATOR_PRIORITY_DIMENSION_TO_UI[dim];
    priorities[dim] = toPriorityEntryRaw(profile.priorities[uiKey]);
  }
  return {
    base_weight_profile_id: profile.baseWeightProfileId,
    priorities,
  };
}

/** POST /optimize 요청 body */
export function toOptimizeRequest(input: {
  planId: string;
  planItemIds: string[];
  priorityProfile: PriorityProfile;
}): OptimizeRequest {
  return {
    plan_id: input.planId,
    plan_item_ids: input.planItemIds,
    priority_profile: toPriorityProfileRaw(input.priorityProfile),
  };
}

/** POST /predict 요청 body */
export function toPredictRequest(input: {
  planId: string;
  recommendedSequence: string[];
  currentSequence: string[];
  priorityProfile: PriorityProfile;
}): PredictRequest {
  return {
    plan_id: input.planId,
    recommended_sequence: input.recommendedSequence,
    current_sequence: input.currentSequence,
    priority_profile: toPriorityProfileRaw(input.priorityProfile),
  };
}

/** POST /decisions 요청 body */
export function toDecisionsRequest(input: {
  planId: string;
  recommendedSequence: string[];
  confirmedSequence: string[];
  priorityProfile: PriorityProfile;
  decisionMemo?: string;
}): DecisionsRequest {
  return {
    plan_id: input.planId,
    recommended_sequence: input.recommendedSequence,
    confirmed_sequence: input.confirmedSequence,
    priority_profile: toPriorityProfileRaw(input.priorityProfile),
    decision_memo: input.decisionMemo,
  };
}

/** POST /explain 요청 body */
export function toExplainRequest(input: {
  planId: string;
  currentSequence: string[];
  comparisonState: ComparisonState;
  comparisonSummary: string | null;
  riskWarnings: RiskWarning[];
  priorityProfile: PriorityProfile;
}): ExplainRequest {
  return {
    plan_id: input.planId,
    current_sequence: input.currentSequence,
    comparison_state: {
      basis: input.comparisonState.basis,
      recommended: input.comparisonState.recommended,
      current: input.comparisonState.current,
      diff: input.comparisonState.diff,
      diff_rate: input.comparisonState.diffRate,
    },
    comparison_summary: input.comparisonSummary ?? '',
    risk_warnings: input.riskWarnings.map((w) => ({
      rule_id: w.ruleId,
      severity: w.severity,
      from_plan_item_id: w.fromPlanItemId,
      to_plan_item_id: w.toPlanItemId,
      penalty: w.penalty,
      message: w.message,
      recommendation: w.recommendation,
    })),
    priority_profile: toPriorityProfileRaw(input.priorityProfile),
  };
}

// ============================================================
// §6 computed (frontend 계산 함수)
// ============================================================

/**
 * deriveSequenceDiffs: 추천안 vs 현재안 전환 쌍 추가/제거 계산
 *
 * 알고리즘
 *   - 각 sequence에서 인접 쌍(pair) Set 생성 — 키: "{from}->{to}"
 *   - 현재안에만 있는 쌍 → 'added'
 *   - 추천안에만 있는 쌍 → 'removed'
 *   - planItems Map으로 planItemId → skuName 조인
 *
 * §11 frontend_mvp_decision_structure_v3_2.md 기준
 * API cost_delta_vs_recommended 미사용 (GET /decisions/{id} 전용)
 */
export function deriveSequenceDiffs(
  recommendedSequence: string[],
  currentSequence: string[],
  planItems: PlanItem[],
): ComparisonDiff[] {
  // planItemId → PlanItem 룩업 맵
  const itemMap = new Map<string, PlanItem>(
    planItems.map((item) => [item.planItemId, item]),
  );

  // sequence → 인접 쌍 Set
  function toPairSet(seq: string[]): Set<string> {
    const set = new Set<string>();
    for (let i = 0; i < seq.length - 1; i++) {
      set.add(`${seq[i]}->${seq[i + 1]}`);
    }
    return set;
  }

  const recPairs = toPairSet(recommendedSequence);
  const curPairs = toPairSet(currentSequence);

  const diffs: ComparisonDiff[] = [];

  // 현재안에만 있는 쌍 → added
  for (const key of curPairs) {
    if (!recPairs.has(key)) {
      const parts  = key.split('->');
      const fromId = parts[0] as string;
      const toId   = parts[1] as string;
      diffs.push({
        type:            'added',
        fromPlanItemId:  fromId,
        toPlanItemId:    toId,
        fromSkuName:     itemMap.get(fromId)?.skuName ?? fromId,
        toSkuName:       itemMap.get(toId)?.skuName   ?? toId,
      });
    }
  }

  // 추천안에만 있는 쌍 → removed
  for (const key of recPairs) {
    if (!curPairs.has(key)) {
      const parts  = key.split('->');
      const fromId = parts[0] as string;
      const toId   = parts[1] as string;
      diffs.push({
        type:            'removed',
        fromPlanItemId:  fromId,
        toPlanItemId:    toId,
        fromSkuName:     itemMap.get(fromId)?.skuName ?? fromId,
        toSkuName:       itemMap.get(toId)?.skuName   ?? toId,
      });
    }
  }

  // 표시 순서: added 먼저, removed 나중
  diffs.sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === 'added' ? -1 : 1;
  });

  return diffs;
}

/**
 * deriveCostDelta: 비용 항목별 현재안-추천안 차이 계산 (frontend computed)
 *
 * 소스: baseline_evaluation.aggregated_cost vs current_evaluation.aggregated_cost
 * ※ API cost_delta_vs_recommended 는 GET /decisions/{id} 저장 로그 전용 — 라이브 화면 미사용
 *
 * 양수 → 현재안이 더 높음(나쁨), 음수 → 현재안이 더 낮음(좋음)
 */
export function deriveCostDelta(
  current: CostVector,
  baseline: CostVector,
): CostDelta {
  return {
    setupTime:     current.setupTime     - baseline.setupTime,
    laborCost:     current.laborCost     - baseline.laborCost,
    materialLoss:  current.materialLoss  - baseline.materialLoss,
    washCost:      current.washCost      - baseline.washCost,
    downtime:      current.downtime      - baseline.downtime,
    sequenceRisk:  current.sequenceRisk  - baseline.sequenceRisk,
    packagingTime: current.packagingTime - baseline.packagingTime,
  };
}

// ============================================================
// §7 apply 함수 — API 응답 → DecisionPageState 부분 갱신
// ============================================================

/**
 * applyGetPlanResponse
 * GET /plans/{plan_id} 응답을 State 초기값으로 변환
 *
 * 갱신 대상: planItems, operatingContext, priorityProfile
 * 갱신하지 않는 것: sequence, 비용, 비교 (아직 /optimize 전)
 */
export function applyGetPlanResponse(
  prev: DecisionPageState,
  raw: GetPlanResponse,
): DecisionPageState {
  return {
    ...prev,
    planItems:        mapArray(raw.plan_items, mapPlanItem),
    operatingContext: mapOperatingContext(raw.operating_context),
    priorityProfile:  mapPriorityProfile(raw.default_priority_profile),
  };
}

/**
 * applyOptimizeResponse
 * POST /optimize 응답을 State에 적용
 *
 * 갱신 대상
 *   - recommendedSequence (고정값, 이후 변경 없음)
 *   - currentSequence     (초기값 = recommendedSequence)
 *   - transitionCosts, aggregatedCost, totalWeightedCost,
 *     sequencePenalty, objectiveScore, riskWarnings
 *   - appliedWeights (OptimizeResponse 에는 없음 — null 유지)
 *   - comparisonDiffs (초기: recommendedSequence == currentSequence → [])
 *   - isOptimizing: false
 *
 * 갱신하지 않는 것
 *   - comparisonState, comparisonSummary (→ /predict 후 채워짐)
 *   - priorityProfile (→ /optimize 요청 시 사용한 값 유지)
 */
export function applyOptimizeResponse(
  prev: DecisionPageState,
  raw: OptimizeResponse,
): DecisionPageState {
  const transitionCosts = mapArray(raw.transition_costs, mapTransitionCost);
  const aggregatedCost  = mapCostVector(raw.aggregated_cost);
  const riskWarnings    = mapArray(raw.risk_warnings, mapRiskWarning);

  // 초기 진입: recommended == current → diff 없음
  const comparisonDiffs = deriveSequenceDiffs(
    raw.recommended_sequence,
    raw.recommended_sequence,
    prev.planItems,
  );

  return {
    ...prev,
    recommendedSequence: [...raw.recommended_sequence],
    currentSequence:     [...raw.recommended_sequence],
    transitionCosts,
    aggregatedCost,
    totalWeightedCost:   raw.total_weighted_cost,
    sequencePenalty:     raw.sequence_penalty,
    objectiveScore:      raw.objective_score,
    riskWarnings,
    comparisonDiffs,
    isOptimizing:        false,
  };
}

/**
 * applyPredictResponse
 * POST /predict 응답을 State에 적용
 * 드롭 완료 또는 우선순위 변경 시 호출
 *
 * 갱신 대상
 *   - transitionCosts, aggregatedCost, totalWeightedCost,
 *     sequencePenalty, objectiveScore, riskWarnings  (current_evaluation 기준)
 *   - appliedWeights   (응답 최상위 applied_weights)
 *   - comparisonState, comparisonSummary
 *   - comparisonDiffs  (recommendedSequence vs currentSequence)
 *   - isExplanationStale: true  (순서/우선순위 변경됨)
 *   - isPredicting: false
 *
 * 갱신하지 않는 것
 *   - recommendedSequence (불변)
 *   - currentSequence     (드롭 시 이미 낙관적 갱신됨)
 *   - priorityProfile     (호출 측에서 이미 갱신됨)
 */
export function applyPredictResponse(
  prev: DecisionPageState,
  raw: PredictResponse,
): DecisionPageState {
  const current               = mapSequenceEvaluation(raw.current_evaluation);
  const comparisonState       = mapComparisonState(raw.comparison_state);
  const appliedWeights        = mapAppliedWeights(raw.applied_weights);
  const baselineAggregatedCost = mapCostVector(raw.baseline_evaluation.aggregated_cost);

  const comparisonDiffs = deriveSequenceDiffs(
    prev.recommendedSequence,
    prev.currentSequence,
    prev.planItems,
  );

  return {
    ...prev,
    transitionCosts:      current.transitionCosts,
    aggregatedCost:       current.aggregatedCost,
    baselineAggregatedCost,
    totalWeightedCost:    current.totalWeightedCost,
    sequencePenalty:      current.sequencePenalty,
    objectiveScore:       current.objectiveScore,
    riskWarnings:         current.riskWarnings,
    appliedWeights,
    comparisonState,
    comparisonSummary:    raw.comparison_summary,
    comparisonDiffs,
    llmExplanation:       null,
    isPredicting:         false,
  };
}

/**
 * applyDecisionsResponse
 * POST /decisions 응답을 State에 적용
 *
 * 갱신 대상
 *   - decisionId, committedAt
 *   - workflowState: 'committed'
 *   - saveStatus: 'success'
 */
export function applyDecisionsResponse(
  prev: DecisionPageState,
  raw: DecisionsResponse,
): DecisionPageState {
  return {
    ...prev,
    decisionId:    raw.decision_id,
    committedAt:   raw.committed_at,
    workflowState: 'committed',
    saveStatus:    'success',
  };
}

/**
 * applyExplainResponse
 * POST /explain 응답을 State에 적용 (P1)
 *
 * 갱신 대상
 *   - llmExplanation
 *   - isExplanationStale: false
 *   - isExplaining: false
 */
export function applyExplainResponse(
  prev: DecisionPageState,
  raw: ExplainResponse,
): DecisionPageState {
  return {
    ...prev,
    llmExplanation:            raw.explanation,
    explanationGenerationMode: raw.generation_mode,
    isExplaining:              false,
  };
}

/**
 * applyCommitReset
 * CommitResultModal 닫기 → workflowState 'draft' 복귀
 * decisionId, committedAt 은 메모리 유지 (재편집 후 다음 확정 시 서버가 신규 발급)
 */
export function applyCommitReset(prev: DecisionPageState): DecisionPageState {
  return {
    ...prev,
    workflowState: 'draft',
    saveStatus:    'idle',
  };
}

/**
 * applySequenceReset
 * "AI 추천 순서로 되돌리기" — currentSequence ← recommendedSequence
 * /optimize 재호출 없음. 호출 후 /predict 1회 필요
 *
 * 갱신 대상
 *   - currentSequence: recommendedSequence 복사
 *   - comparisonDiffs: [] (동일 순서)
 *   - isPredicting: true (호출 측에서 /predict 바로 디스패치)
 */
export function applySequenceReset(prev: DecisionPageState): DecisionPageState {
  return {
    ...prev,
    currentSequence: [...prev.recommendedSequence],
    comparisonDiffs: [],
    isPredicting:    true,
  };
}

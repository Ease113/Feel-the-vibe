import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPlan,
  postDecisions,
  postExplain,
  postOptimize,
  postPredict,
} from '../api/client';
import {
  applyCommitReset,
  applyDecisionsResponse,
  applyExplainResponse,
  applyOptimizeResponse,
  applyPredictResponse,
  mergeGetPlanData,
} from '../api/mappers';
import type { DecisionPageState, PriorityProfile } from '../api/types';
import { INITIAL_DECISION_PAGE_STATE } from '../api/types';

const DEMO_PLAN_ID = 'demo-plan-001';

/**
 * /decision 화면 전체 상태 및 액션을 관리하는 훅.
 *
 * 진입 플로우: GET /plans → POST /optimize (1회)
 * D&D 완료·우선순위 변경·초기화: POST /predict
 * 확정: POST /decisions
 */
export function useDecisionPage() {
  const [state, setState] = useState<DecisionPageState>(INITIAL_DECISION_PAGE_STATE);

  // 매 렌더 동기 갱신 — 콜백 내부에서 최신 state 참조용
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── 진입 플로우 ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const planData = await getPlan(DEMO_PLAN_ID);
        if (cancelled) return;

        setState(prev => ({ ...mergeGetPlanData(prev, planData), isOptimizing: true }));

        const optimizeResult = await postOptimize({
          planId: DEMO_PLAN_ID,
          planItemIds: planData.planItems.map(i => i.planItemId),
          priorityProfile: planData.defaultPriorityProfile,
        });
        if (cancelled) return;

        setState(prev => {
          try {
            return applyOptimizeResponse(prev, optimizeResult);
          } catch {
            return { ...prev, isOptimizing: false, commitBlockReason: '데이터 처리 오류' };
          }
        });
      } catch (err) {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            isOptimizing: false,
            commitBlockReason: err instanceof Error ? err.message : '초기화 실패',
          }));
        }
      }
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  // ── 공통 predict 호출 ──────────────────────────────────────────
  async function runPredict(
    recommendedSequence: string[],
    currentSequence: string[],
    priorityProfile: PriorityProfile,
  ) {
    try {
      const result = await postPredict({
        planId: DEMO_PLAN_ID,
        recommendedSequence,
        currentSequence,
        priorityProfile,
      });
      // applyPredictResponse를 setState updater 안에서 실행하면 React 렌더 단계에서
      // 에러가 throw될 경우 외부 try/catch에 잡히지 않아 흰 화면이 됩니다.
      // updater 내부에서 직접 catch해 isPredicting을 안전하게 해제합니다.
      setState(prev => {
        try {
          return applyPredictResponse(prev, result);
        } catch {
          return { ...prev, isPredicting: false };
        }
      });
    } catch {
      setState(prev => ({ ...prev, isPredicting: false }));
    }
  }

  // ── D&D ────────────────────────────────────────────────────────

  /** 드래그 시작 — API 호출 없음 */
  const handleDragStart = useCallback(() => {
    setState(prev => ({ ...prev, isDragging: true }));
  }, []);

  /** 드롭 완료 — currentSequence 낙관적 갱신 후 POST /predict */
  const handleDrop = useCallback((nextSequence: string[]) => {
    const { recommendedSequence, priorityProfile } = stateRef.current;
    setState(prev => ({
      ...prev,
      isDragging:      false,
      currentSequence: nextSequence,
      isPredicting:    true,
    }));
    void runPredict(recommendedSequence, nextSequence, priorityProfile);
  }, []);

  // ── 우선순위 변경 ──────────────────────────────────────────────

  /** 5축 우선순위 변경 후 POST /predict (recommendedSequence 불변) */
  const handlePriorityChange = useCallback((profile: PriorityProfile) => {
    const { recommendedSequence, currentSequence } = stateRef.current;
    setState(prev => ({ ...prev, priorityProfile: profile, isPredicting: true }));
    void runPredict(recommendedSequence, currentSequence, profile);
  }, []);

  // ── 확정 ───────────────────────────────────────────────────────

  /** POST /decisions — saveStatus: saving → success/error */
  const handleCommit = useCallback(async () => {
    const { recommendedSequence, currentSequence, priorityProfile, decisionMemo } =
      stateRef.current;
    setState(prev => ({ ...prev, saveStatus: 'saving' }));
    try {
      const result = await postDecisions({
        planId: DEMO_PLAN_ID,
        recommendedSequence,
        confirmedSequence: currentSequence,
        priorityProfile,
        decisionMemo: decisionMemo || undefined,
      });
      setState(prev => applyDecisionsResponse(prev, result));
    } catch (err) {
      setState(prev => ({
        ...prev,
        saveStatus:        'error',
        commitBlockReason: err instanceof Error ? err.message : '확정 저장 실패',
      }));
    }
  }, []);

  // ── AI 설명 ────────────────────────────────────────────────────

  /** POST /explain — isExplaining: true → llmExplanation 갱신 */
  const handleExplain = useCallback(async () => {
    const { currentSequence, comparisonState, comparisonSummary, riskWarnings, priorityProfile } =
      stateRef.current;
    if (!comparisonState) return;
    setState(prev => ({ ...prev, isExplaining: true }));
    try {
      const result = await postExplain({
        planId: DEMO_PLAN_ID,
        currentSequence,
        comparisonState,
        comparisonSummary,
        riskWarnings,
        priorityProfile,
      });
      setState(prev => applyExplainResponse(prev, result));
    } catch {
      setState(prev => ({ ...prev, isExplaining: false }));
    }
  }, []);

  /** 현재 순서를 추천 순서로 초기화 후 POST /predict 1회 */
  const handleReset = useCallback(() => {
    const { recommendedSequence, priorityProfile } = stateRef.current;
    setState(prev => ({
      ...prev,
      currentSequence: recommendedSequence,
      isPredicting: true,
    }));
    void runPredict(recommendedSequence, recommendedSequence, priorityProfile);
  }, []);

  /** CommitResultModal 닫기 → workflowState draft 복귀 */
  const handleCommitClose = useCallback(() => {
    setState(prev => applyCommitReset(prev));
  }, []);

  /** 드래그 취소 또는 제자리 드롭 — isDragging 해제만 */
  const handleDragCancel = useCallback(() => {
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  // ── UI 제어 ────────────────────────────────────────────────────

  const handleMemoChange = useCallback((memo: string) => {
    setState(prev => ({ ...prev, decisionMemo: memo }));
  }, []);

  const handleTransitionSelect = useCallback((key: string | null) => {
    setState(prev => ({ ...prev, selectedTransitionKey: key }));
  }, []);

  const handleEvaluationPanelToggle = useCallback(() => {
    setState(prev => ({
      ...prev,
      isEvaluationPanelExpanded: !prev.isEvaluationPanelExpanded,
    }));
  }, []);

  return {
    state,
    handleDragStart,
    handleDragCancel,
    handleDrop,
    handlePriorityChange,
    handleReset,
    handleCommit,
    handleCommitClose,
    handleExplain,
    handleMemoChange,
    handleTransitionSelect,
    handleEvaluationPanelToggle,
  };
}

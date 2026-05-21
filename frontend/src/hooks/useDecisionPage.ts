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
  deriveSequenceDiffs,
  mergeGetPlanData,
} from '../api/mappers';
import type { DecisionPageState, OperatingContext, PriorityProfile } from '../api/types';
import { INITIAL_DECISION_PAGE_STATE } from '../api/types';
import {
  operatingContextEqual,
  toOperatingContextOverride,
} from '../utils/operatingContext';
import { prioritiesEqual } from '../utils/priorityPresets';

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
          operatingContext: toOperatingContextOverride(planData.operatingContext),
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
    operatingContext: OperatingContext,
  ) {
    try {
      const result = await postPredict({
        planId: DEMO_PLAN_ID,
        recommendedSequence,
        currentSequence,
        priorityProfile,
        operatingContext: toOperatingContextOverride(operatingContext),
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
    const { recommendedSequence, priorityProfile, operatingContext } = stateRef.current;
    setState(prev => ({
      ...prev,
      isDragging:      false,
      currentSequence: nextSequence,
      isPredicting:    true,
    }));
    void runPredict(recommendedSequence, nextSequence, priorityProfile, operatingContext);
  }, []);

  // ── 평가 조건 적용 ─────────────────────────────────────────────

  /**
   * draft 확정 — 우선순위 변경 시 /optimize + /predict,
   * 운영 컨텍스트만 변경 시 /predict 1회.
   */
  const handleApplyEvaluationConditions = useCallback(
    (operatingContext: OperatingContext, priorityProfile: PriorityProfile) => {
      const {
        recommendedSequence,
        currentSequence,
        priorityProfile: prevProfile,
        operatingContext: prevContext,
        planItems,
      } = stateRef.current;

      const priorityChanged = !prioritiesEqual(priorityProfile, prevProfile);
      const contextChanged = !operatingContextEqual(operatingContext, prevContext);

      setState(prev => ({
        ...prev,
        operatingContext,
        priorityProfile,
        isPredicting: priorityChanged || contextChanged,
      }));

      if (!priorityChanged && !contextChanged) return;

      void (async () => {
        try {
          if (priorityChanged) {
            const optimizeResult = await postOptimize({
              planId: DEMO_PLAN_ID,
              planItemIds: planItems.map(i => i.planItemId),
              priorityProfile,
              operatingContext: toOperatingContextOverride(operatingContext),
            });

            let newRecommendedSequence = recommendedSequence;
            setState(prev => {
              try {
                const applied = applyOptimizeResponse(prev, optimizeResult);
                newRecommendedSequence = applied.recommendedSequence;
                const comparisonDiffs = deriveSequenceDiffs(
                  applied.recommendedSequence,
                  prev.currentSequence,
                  prev.planItems,
                );
                return {
                  ...applied,
                  currentSequence: prev.currentSequence,
                  comparisonDiffs,
                };
              } catch {
                return { ...prev, isPredicting: false };
              }
            });

            await runPredict(
              newRecommendedSequence,
              currentSequence,
              priorityProfile,
              operatingContext,
            );
          } else {
            await runPredict(
              recommendedSequence,
              currentSequence,
              priorityProfile,
              operatingContext,
            );
          }
        } catch {
          setState(prev => ({ ...prev, isPredicting: false }));
        }
      })();
    },
    [],
  );

  // ── 확정 ───────────────────────────────────────────────────────

  /** POST /decisions — saveStatus: saving → success/error */
  const handleCommit = useCallback(async () => {
    const {
      recommendedSequence,
      currentSequence,
      priorityProfile,
      operatingContext,
      decisionMemo,
    } = stateRef.current;
    setState(prev => ({ ...prev, saveStatus: 'saving' }));
    try {
      const result = await postDecisions({
        planId: DEMO_PLAN_ID,
        recommendedSequence,
        confirmedSequence: currentSequence,
        priorityProfile,
        operatingContext: toOperatingContextOverride(operatingContext),
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
    const { recommendedSequence, priorityProfile, operatingContext } = stateRef.current;
    setState(prev => ({
      ...prev,
      currentSequence: recommendedSequence,
      isPredicting: true,
    }));
    void runPredict(
      recommendedSequence,
      recommendedSequence,
      priorityProfile,
      operatingContext,
    );
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
    handleApplyEvaluationConditions,
    handleReset,
    handleCommit,
    handleCommitClose,
    handleExplain,
    handleMemoChange,
    handleTransitionSelect,
    handleEvaluationPanelToggle,
  };
};

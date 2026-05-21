import { useDecisionPage } from '../hooks/useDecisionPage';
import EvaluationConditionsPanel from '../components/EvaluationConditionsPanel';
import DecisionWorkspace from '../components/DecisionWorkspace';
import KpiSummaryBar from '../components/KpiSummaryBar';
import ComparisonPanel from '../components/ComparisonPanel';
import TransitionAnalysisTable from '../components/TransitionAnalysisTable';
import CommitSection from '../components/CommitSection';
import ExplainSection from '../components/ExplainSection';
import WarningPanel from '../components/WarningPanel';

function fmtDiffPct(current: number, recommended: number): string {
  const pct = ((current - recommended) / recommended) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `추천안 대비 ${sign}${pct.toFixed(1)}%`;
}

/**
 * 생산순서 의사결정 메인 페이지.
 *
 * useDecisionPage 훅이 진입 플로우(GET /plans → POST /optimize)와
 * 모든 액션을 관리한다. 컴포넌트는 상태 표시·이벤트 전달만 담당한다.
 */
export default function DecisionPage() {
  const {
    state,
    handleEvaluationPanelToggle,
    handleApplyEvaluationConditions,
    handleDragStart,
    handleDragCancel,
    handleDrop,
    handleReset,
    handleTransitionSelect,
    handleMemoChange,
    handleCommit,
    handleCommitClose,
    handleExplain,
  } = useDecisionPage();

  const {
    planItems,
    operatingContext,
    priorityProfile,
    factoryDefaultPriorityProfile,
    recommendedSequence,
    currentSequence,
    transitionCosts,
    riskWarnings,
    objectiveScore,
    totalWeightedCost,
    sequencePenalty,
    aggregatedCost,
    baselineAggregatedCost,
    appliedWeights,
    comparisonState,
    comparisonSummary,
    comparisonDiffs,
    isEvaluationPanelExpanded,
    isPredicting,
    isOptimizing,
    workflowState,
    commitBlockReason,
    selectedTransitionKey,
    decisionMemo,
    saveStatus,
    decisionId,
    committedAt,
    llmExplanation,
    explanationGenerationMode,
    isExplaining,
  } = state;

  const recommendedScore = comparisonState?.recommended ?? null;
  const currentScore = objectiveScore;

  const highRiskCount = riskWarnings.filter(w => w.severity === 'HIGH').length;

  return (
    <div className="decision-page">
      <header className="top-bar">
        <div>
          <div className="top-plan">demo-plan-001 · {operatingContext.lineId}</div>
          <div className="top-title-row">
            <h1 className="top-title">생산 순서 의사결정</h1>
            <div className="top-meta" aria-live="polite">
              {isOptimizing && (
                <span className="top-meta-loading">추천 순서 생성 중…</span>
              )}
              {!isOptimizing && commitBlockReason && (
                <span className="status-warn">{commitBlockReason}</span>
              )}
              {!isOptimizing &&
                !commitBlockReason &&
                currentScore !== null &&
                recommendedScore !== null && (
                  <>
                    <span
                      className={
                        currentScore > recommendedScore ? 'status-warn' : 'status-ok'
                      }
                    >
                      {fmtDiffPct(currentScore, recommendedScore)}
                    </span>
                    {highRiskCount > 0 && (
                      <>
                        <span className="status-sep">·</span>
                        <span className="status-warn">고위험 전환 {highRiskCount}건</span>
                      </>
                    )}
                    <span className="status-sep">·</span>
                    <span className="status-ok">확정 가능</span>
                  </>
                )}
            </div>
          </div>
        </div>
        <div className="top-right">
          <span className={`badge-draft${workflowState === 'committed' ? ' badge-committed' : ''}`}>
            {workflowState === 'committed' ? '확정됨' : '편집 중'}
          </span>
        </div>
      </header>

      <EvaluationConditionsPanel
        operatingContext={operatingContext}
        priorityProfile={priorityProfile}
        factoryDefaultPriorityProfile={factoryDefaultPriorityProfile}
        appliedWeights={appliedWeights}
        isExpanded={isEvaluationPanelExpanded}
        isPredicting={isPredicting}
        onToggle={handleEvaluationPanelToggle}
        onApply={({ operatingContext: ctx, priorityProfile: profile }) =>
          handleApplyEvaluationConditions(ctx, profile)
        }
      />

      <div className="decision-body">
        <div className="decision-main">
          <DecisionWorkspace
            planItems={planItems}
            recommendedSequence={recommendedSequence}
            currentSequence={currentSequence}
            transitionCosts={transitionCosts}
            riskWarnings={riskWarnings}
            recommendedScore={recommendedScore}
            currentScore={currentScore}
            isPredicting={isPredicting}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDragCancel={handleDragCancel}
            onReset={handleReset}
          />
          <TransitionAnalysisTable
            planItems={planItems}
            currentSequence={currentSequence}
            transitionCosts={transitionCosts}
            riskWarnings={riskWarnings}
            appliedWeights={appliedWeights}
            selectedKey={selectedTransitionKey}
            onSelectKey={handleTransitionSelect}
          />
        </div>

        <div className="decision-side">
          <KpiSummaryBar
            objectiveScore={objectiveScore}
            totalWeightedCost={totalWeightedCost}
            sequencePenalty={sequencePenalty}
            aggregatedCost={aggregatedCost}
            baselineAggregatedCost={baselineAggregatedCost}
            riskWarnings={riskWarnings}
            comparisonState={comparisonState}
            isPredicting={isPredicting}
          />
          <ComparisonPanel
            comparisonSummary={comparisonSummary}
            comparisonState={comparisonState}
            comparisonDiffs={comparisonDiffs}
            isPredicting={isPredicting}
          />
          <WarningPanel
            riskWarnings={riskWarnings}
            isPredicting={isPredicting}
          />
          <ExplainSection
            llmExplanation={llmExplanation}
            explanationGenerationMode={explanationGenerationMode}
            isExplaining={isExplaining}
            comparisonState={comparisonState}
            onExplain={handleExplain}
          />
          <CommitSection
            decisionMemo={decisionMemo}
            saveStatus={saveStatus}
            commitBlockReason={commitBlockReason}
            isCommitted={workflowState === 'committed'}
            decisionId={decisionId}
            committedAt={committedAt}
            onMemoChange={handleMemoChange}
            onCommit={handleCommit}
            onCommitClose={handleCommitClose}
          />
        </div>
      </div>
    </div>
  );
}

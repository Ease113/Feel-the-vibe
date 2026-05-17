import { useDecisionPage } from '../hooks/useDecisionPage';
import EvaluationConditionsPanel from '../components/EvaluationConditionsPanel';
import DecisionWorkspace from '../components/DecisionWorkspace';
import KpiSummaryBar from '../components/KpiSummaryBar';
import ComparisonPanel from '../components/ComparisonPanel';
import WarningPanel from '../components/WarningPanel';
import TransitionAnalysisTable from '../components/TransitionAnalysisTable';
import CommitSection from '../components/CommitSection';
import ExplainSection from '../components/ExplainSection';

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
    handlePriorityChange,
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
    recommendedSequence,
    currentSequence,
    transitionCosts,
    riskWarnings,
    objectiveScore,
    totalWeightedCost,
    sequencePenalty,
    aggregatedCost,
    baselineAggregatedCost,
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
    isExplanationStale,
    isExplaining,
  } = state;

  const recommendedScore = comparisonState?.recommended ?? null;
  const currentScore = objectiveScore;

  const highRiskCount = riskWarnings.filter(w => w.severity === 'HIGH').length;
  const canCommit = commitBlockReason === null;

  return (
    <div className="decision-page">
      <header className="top-bar">
        <div>
          <div className="top-plan">demo-plan-001 · {operatingContext.lineId}</div>
          <h1 className="top-title">생산 순서 의사결정</h1>
          {!isOptimizing && currentScore !== null && recommendedScore !== null && (
            <div className="top-status">
              <span className={currentScore > recommendedScore ? 'status-warn' : 'status-ok'}>
                {fmtDiffPct(currentScore, recommendedScore)}
              </span>
              {highRiskCount > 0 && (
                <>
                  <span className="status-sep">·</span>
                  <span className="status-warn">고위험 전환 {highRiskCount}건</span>
                </>
              )}
              <span className="status-sep">·</span>
              <span className={canCommit ? 'status-ok' : 'status-warn'}>
                {canCommit ? '확정 가능' : commitBlockReason}
              </span>
            </div>
          )}
        </div>
        <div className="top-right">
          <span className={`badge-draft${workflowState === 'committed' ? ' badge-committed' : ''}`}>
            {workflowState === 'committed' ? '확정됨' : '편집 중'}
          </span>
        </div>
      </header>

      {isOptimizing && (
        <p className="decision-page-loading">추천 순서 생성 중…</p>
      )}

      <EvaluationConditionsPanel
        operatingContext={operatingContext}
        priorityProfile={priorityProfile}
        isExpanded={isEvaluationPanelExpanded}
        isPredicting={isPredicting}
        onToggle={handleEvaluationPanelToggle}
        onPriorityChange={handlePriorityChange}
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
          />
          <TransitionAnalysisTable
            planItems={planItems}
            currentSequence={currentSequence}
            transitionCosts={transitionCosts}
            riskWarnings={riskWarnings}
            selectedKey={selectedTransitionKey}
            onSelectKey={handleTransitionSelect}
            onReset={handleReset}
          />
        </div>

        <div className="decision-side">
          <KpiSummaryBar
            objectiveScore={objectiveScore}
            totalWeightedCost={totalWeightedCost}
            sequencePenalty={sequencePenalty}
            aggregatedCost={aggregatedCost}
            riskWarnings={riskWarnings}
            comparisonState={comparisonState}
            isPredicting={isPredicting}
          />
          <ComparisonPanel
            comparisonSummary={comparisonSummary}
            comparisonDiffs={comparisonDiffs}
            aggregatedCost={aggregatedCost}
            baselineAggregatedCost={baselineAggregatedCost}
            riskWarnings={riskWarnings}
            isPredicting={isPredicting}
          />
          <WarningPanel
            riskWarnings={riskWarnings}
            isPredicting={isPredicting}
          />
          <ExplainSection
            llmExplanation={llmExplanation}
            isExplanationStale={isExplanationStale}
            isExplaining={isExplaining}
            comparisonState={comparisonState}
            onExplain={handleExplain}
          />
          <CommitSection
            riskWarnings={riskWarnings}
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

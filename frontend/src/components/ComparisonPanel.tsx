import type { ComparisonDiff, ComparisonState } from '../api/types';

interface Props {
  comparisonSummary: string | null;
  comparisonState: ComparisonState | null;
  comparisonDiffs: ComparisonDiff[];
  isPredicting: boolean;
}

function fmtScore(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDiff(value: number): { text: string; cls: string } {
  if (value > 0.0005) {
    return { text: `▲ +${fmtScore(value)}`, cls: 'cp-val--bad' };
  }
  if (value < -0.0005) {
    return { text: `▼ −${fmtScore(Math.abs(value))}`, cls: 'cp-val--good' };
  }
  return { text: `= ${fmtScore(value)}`, cls: 'cp-val--same' };
}

function fmtDiffRate(rate: number): { text: string; cls: string } {
  const pct = (Math.abs(rate) * 100).toFixed(1);
  if (rate > 0.0005) return { text: `▲ +${pct}%`, cls: 'cp-val--bad' };
  if (rate < -0.0005) return { text: `▼ −${pct}%`, cls: 'cp-val--good' };
  return { text: `= ${pct}%`, cls: 'cp-val--same' };
}

/**
 * 추천안 vs 현재안 비교 패널 (DB_state §14).
 *
 * 표시 순서: comparisonSummary → comparisonDiffs(순서 전환 추가/제거) → comparisonState 4행.
 * 점수 비교(▲/▼%)는 KpiSummaryBar 히어로에만 표시, 이 패널에서는 절댓값 diff/rate만 보조 표시.
 */
export default function ComparisonPanel({
  comparisonSummary,
  comparisonState,
  comparisonDiffs,
  isPredicting,
}: Props) {
  const hasData = comparisonSummary !== null || comparisonState !== null;

  if (!hasData && !isPredicting) {
    return (
      <div className="side-card">
        <div className="panel-hd">추천안과의 차이</div>
        <div className="side-sec">
          <p className="cp-empty">평가 후 비교 정보가 표시됩니다.</p>
        </div>
      </div>
    );
  }

  const diffFmt = comparisonState ? fmtDiff(comparisonState.diff) : null;
  const rateFmt = comparisonState ? fmtDiffRate(comparisonState.diffRate) : null;

  return (
    <div className="side-card">
      <div className="panel-hd">추천안과의 차이</div>
      <div className="side-sec">
        {comparisonSummary && (
          <p className="cp-summary-text">{comparisonSummary}</p>
        )}
        {isPredicting && !comparisonSummary && (
          <p className="cp-loading">평가 중…</p>
        )}

        {comparisonDiffs.length > 0 && (
          <div className="cp-diffs">
            {comparisonDiffs.map(d => (
              <div
                key={`${d.fromPlanItemId}->${d.toPlanItemId}`}
                className={`cp-diff cp-diff--${d.type}`}
              >
                <span className="cp-diff-badge">{d.type === 'added' ? '+' : '−'}</span>
                {d.fromSkuName} → {d.toSkuName}
              </div>
            ))}
          </div>
        )}

        {comparisonState && (
          <div className="cp-state-rows">
            <div className="cp-state-row">
              <span className="cp-state-label">추천안</span>
              <span className="cp-val-score">{fmtScore(comparisonState.recommended)}</span>
            </div>
            <div className="cp-state-row">
              <span className="cp-state-label">현재안</span>
              <span className="cp-val-score">{fmtScore(comparisonState.current)}</span>
            </div>
            {diffFmt && (
              <div className="cp-state-row">
                <span className="cp-state-label">차이</span>
                <span className={`cp-val ${diffFmt.cls}`}>{diffFmt.text}</span>
              </div>
            )}
            {rateFmt && (
              <div className="cp-state-row">
                <span className="cp-state-label">차이율</span>
                <span className={`cp-val ${rateFmt.cls}`}>{rateFmt.text}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

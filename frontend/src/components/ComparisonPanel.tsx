import { useMemo } from 'react';
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

function transitionKey(d: ComparisonDiff): string {
  return `${d.fromPlanItemId}->${d.toPlanItemId}`;
}

function TransitionList({ items }: { items: ComparisonDiff[] }) {
  return (
    <ul className="cp-diff-list">
      {items.map(d => (
        <li key={transitionKey(d)} className="cp-diff-item">
          {d.fromSkuName} → {d.toSkuName}
        </li>
      ))}
    </ul>
  );
}

/**
 * 추천안 vs 현재안 비교 패널 (DB_state §14).
 *
 * 표시 순서: comparisonSummary → 전환 diff 2그룹 → comparisonState 4행(차이·차이율 ▲/▼).
 */
export default function ComparisonPanel({
  comparisonSummary,
  comparisonState,
  comparisonDiffs,
  isPredicting,
}: Props) {
  const { added, removed } = useMemo(() => {
    const a: ComparisonDiff[] = [];
    const r: ComparisonDiff[] = [];
    for (const d of comparisonDiffs) {
      if (d.type === 'added') a.push(d);
      else r.push(d);
    }
    return { added: a, removed: r };
  }, [comparisonDiffs]);

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

        {added.length > 0 && (
          <section className="cp-diff-group" aria-label="현재 순서에서 새로 생긴 전환">
            <h4 className="cp-diff-group-hd">현재 순서에서 새로 생긴 전환</h4>
            <TransitionList items={added} />
          </section>
        )}

        {removed.length > 0 && (
          <details className="cp-diff-group cp-diff-group--collapsible">
            <summary className="cp-diff-group-hd cp-diff-group-hd--summary">
              <span className="cp-diff-summary-label">
                추천 순서에서 사라진 전환
                <span className="cp-diff-group-count">{removed.length}</span>
              </span>
            </summary>
            <TransitionList items={removed} />
          </details>
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

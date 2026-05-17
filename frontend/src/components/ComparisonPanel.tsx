import type { ComparisonDiff, CostVector, RiskWarning } from '../api/types';
import { deriveCostDelta } from '../api/mappers';

interface Props {
  comparisonSummary: string | null;
  comparisonDiffs: ComparisonDiff[];
  aggregatedCost: CostVector | null;
  baselineAggregatedCost: CostVector | null;
  riskWarnings: RiskWarning[];
  isPredicting: boolean;
}

// 차원 표시 순서 및 라벨 (sequenceRisk 제외)
const DELTA_AXES: Array<{ key: keyof ReturnType<typeof deriveCostDelta>; label: string }> = [
  { key: 'washCost',     label: '세척 비용' },
  { key: 'downtime',     label: '다운타임' },
  { key: 'materialLoss', label: '원자재 손실' },
  { key: 'packagingTime',label: '패키징 전환' },
  { key: 'laborCost',    label: '작업자 비용' },
  { key: 'setupTime',    label: '준비 시간' },
];

/** delta 부호 → 방향 문자·CSS 클래스 */
function deltaDir(val: number): { arrow: string; cls: string } {
  if (val > 0.5)  return { arrow: '▲', cls: 'cp-delta--up' };
  if (val < -0.5) return { arrow: '▼', cls: 'cp-delta--down' };
  return { arrow: '=', cls: 'cp-delta--same' };
}

/** ComparisonDiff 한 줄 렌더 */
function DiffRow({ diff }: { diff: ComparisonDiff }) {
  const isAdded = diff.type === 'added';
  return (
    <li className={`cp-diff-row cp-diff-row--${isAdded ? 'added' : 'removed'}`}>
      <span className="cp-diff-sign">{isAdded ? '+' : '−'}</span>
      <span>{diff.fromSkuName} → {diff.toSkuName}</span>
      <span className="cp-diff-tag">{isAdded ? '추가' : '제거'}</span>
    </li>
  );
}

/**
 * 추천안 vs 현재안 비교 패널 (§14 순서 고정).
 *
 * 1. comparison_summary 한 줄 요약
 * 2. sequence diff (전환 쌍 추가/제거)
 * 3. 차원별 비용 델타 (▲/▼)
 * 4. 위험 전환 변화 (HIGH·MED)
 * - comparison_state(▲/▼ %)는 KpiSummaryBar 히어로에만 표시 — 이 패널에 중복 금지
 */
export default function ComparisonPanel({
  comparisonSummary,
  comparisonDiffs,
  aggregatedCost,
  baselineAggregatedCost,
  riskWarnings,
  isPredicting,
}: Props) {
  const hasData = comparisonSummary !== null || aggregatedCost !== null;

  if (!hasData && !isPredicting) {
    return (
      <div className="cp-panel">
        <p className="cp-panel-title">비교 분석</p>
        <p className="cp-empty">평가 후 비교 정보가 표시됩니다.</p>
      </div>
    );
  }

  const delta =
    aggregatedCost && baselineAggregatedCost
      ? deriveCostDelta(aggregatedCost, baselineAggregatedCost)
      : null;

  const highCount = riskWarnings.filter(w => w.severity === 'HIGH').length;
  const medCount  = riskWarnings.filter(w => w.severity === 'MEDIUM').length;

  return (
    <div className="cp-panel">
      <p className="cp-panel-title">비교 분석</p>

      {/* 1. 한 줄 요약 */}
      {comparisonSummary && (
        <div className="cp-summary-block">
          <p className="cp-summary-text">{comparisonSummary}</p>
        </div>
      )}
      {isPredicting && !comparisonSummary && (
        <div className="cp-summary-block cp-loading">평가 중…</div>
      )}

      {/* 2. Sequence diff */}
      {comparisonDiffs.length > 0 && (
        <div className="cp-section">
          <p className="cp-section-label">전환 변화</p>
          <ul className="cp-diff-list">
            {comparisonDiffs.map(d => (
              <DiffRow
                key={`${d.type}-${d.fromPlanItemId}-${d.toPlanItemId}`}
                diff={d}
              />
            ))}
          </ul>
        </div>
      )}

      {/* 3. 차원별 델타 */}
      {delta && (
        <div className="cp-section">
          <p className="cp-section-label">비용 차원 변화</p>
          <div className="cp-delta-grid">
            {DELTA_AXES.map(({ key, label }) => {
              const val = delta[key];
              if (Math.abs(val) < 0.5) return null;
              const { arrow, cls } = deltaDir(val);
              return (
                <div key={key} className="cp-delta-row">
                  <span className="cp-delta-label">{label}</span>
                  <span className={`cp-delta-value ${cls}`}>
                    {arrow} {val > 0 ? '+' : ''}{Math.round(val).toLocaleString()} pt
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Risk 변화 */}
      {(highCount > 0 || medCount > 0) && (
        <div className="cp-section">
          <p className="cp-section-label">위험 전환</p>
          <div className="cp-risk-row">
            {highCount > 0 && (
              <span className="cp-risk-badge cp-risk-badge--high">HIGH {highCount}건</span>
            )}
            {medCount > 0 && (
              <span className="cp-risk-badge cp-risk-badge--med">MED {medCount}건</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

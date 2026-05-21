import type { ComparisonState, CostVector, RiskWarning } from '../api/types';
import {
  formatPenaltyBreakdown,
  formatScorePt,
  formatWonDelta,
  formatWonUnit,
} from '../utils/costFormat';

interface Props {
  objectiveScore: number | null;
  totalWeightedCost: number | null;
  sequencePenalty: number | null;
  aggregatedCost: CostVector | null;
  baselineAggregatedCost: CostVector | null;
  riskWarnings: RiskWarning[];
  comparisonState: ComparisonState | null;
  isPredicting: boolean;
}

function buildDiffBadge(cs: ComparisonState): { text: string; cls: string } {
  const pct = (Math.abs(cs.diffRate) * 100).toFixed(1);
  if (cs.diffRate > 0.0005) {
    return { text: `▲ 추천안 대비 +${pct}%`, cls: 'kpi-diff--up' };
  }
  if (cs.diffRate < -0.0005) {
    return { text: `▼ 추천안 대비 −${pct}%`, cls: 'kpi-diff--down' };
  }
  return { text: `= 추천안 대비 ${pct}%`, cls: 'kpi-diff--same' };
}

function riskSubLabel(warnings: RiskWarning[]): string {
  const hi = warnings.filter(w => w.severity === 'HIGH').length;
  const md = warnings.filter(w => w.severity === 'MEDIUM').length;
  const parts: string[] = [];
  if (hi > 0) parts.push(`HIGH ${hi}건`);
  if (md > 0) parts.push(`MED ${md}건`);
  return parts.join(' · ');
}

function Dash({ predicting }: { predicting: boolean }) {
  return (
    <span className={predicting ? 'kpi-loading' : 'kpi-empty'}>
      {predicting ? '…' : '—'}
    </span>
  );
}

/**
 * 현재안 KPI 요약 (와이어프레임 v5 · DB_state §7.1).
 */
export default function KpiSummaryBar({
  objectiveScore,
  totalWeightedCost,
  sequencePenalty,
  aggregatedCost,
  baselineAggregatedCost,
  riskWarnings,
  comparisonState,
  isPredicting,
}: Props) {
  const diffBadge = comparisonState ? buildDiffBadge(comparisonState) : null;
  const penaltyBreakdown = formatPenaltyBreakdown(riskWarnings);

  const washDelta =
    aggregatedCost && baselineAggregatedCost
      ? formatWonDelta(aggregatedCost.washCost - baselineAggregatedCost.washCost)
      : null;

  const visibleRiskCount = riskWarnings.filter(
    w => w.severity === 'HIGH' || w.severity === 'MEDIUM',
  ).length;

  return (
    <div className="side-card">
      <div className="panel-hd">현재안 평가</div>
      <div className="kpi-bar">
        <div className="kpi-hero">
          <p className="kpi-hero-label">종합 점수</p>
          <p className="kpi-hero-value">
            {objectiveScore !== null
              ? formatScorePt(objectiveScore)
              : <Dash predicting={isPredicting} />}
          </p>
          {diffBadge && (
            <p className={`kpi-hero-diff ${diffBadge.cls}`}>{diffBadge.text}</p>
          )}
        </div>

        <div className="kpi-grid">
          <div className="kpi-mini-card">
            <p className="kpi-mini-label">가중 총비용</p>
            <p className="kpi-mini-value">
              {totalWeightedCost !== null
                ? formatScorePt(totalWeightedCost)
                : <Dash predicting={isPredicting} />}
            </p>
          </div>

          <div className="kpi-mini-card">
            <p className="kpi-mini-label">순서 패널티</p>
            <p className="kpi-mini-value">
              {sequencePenalty !== null
                ? formatScorePt(sequencePenalty)
                : <Dash predicting={isPredicting} />}
            </p>
            {penaltyBreakdown && (
              <p className="kpi-mini-sub">{penaltyBreakdown}</p>
            )}
          </div>

          <div className="kpi-mini-card">
            <p className="kpi-mini-label">세척 비용 합계</p>
            <p className="kpi-mini-value">
              {aggregatedCost !== null
                ? formatWonUnit(aggregatedCost.washCost)
                : <Dash predicting={isPredicting} />}
            </p>
            {washDelta && (
              <p className={`kpi-mini-delta ${washDelta.cls}`}>{washDelta.text}</p>
            )}
          </div>

          <div className="kpi-mini-card kpi-mini-card--last-row">
            <p className="kpi-mini-label">위험 전환</p>
            <p className="kpi-mini-value">
              {objectiveScore !== null
                ? `${visibleRiskCount}건`
                : <Dash predicting={isPredicting} />}
            </p>
            {objectiveScore !== null && visibleRiskCount > 0 && (
              <p className="kpi-mini-sub kpi-mini-sub--risk">{riskSubLabel(riskWarnings)}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import type { ComparisonState, CostVector, RiskWarning } from '../api/types';
import { formatPt } from '../utils/costFormat';

interface Props {
  objectiveScore: number | null;
  totalWeightedCost: number | null;
  sequencePenalty: number | null;
  aggregatedCost: CostVector | null;
  riskWarnings: RiskWarning[];
  comparisonState: ComparisonState | null;
  isPredicting: boolean;
}

/** diffRate(0.1823) → { text, cls } */
function buildDiffBadge(cs: ComparisonState): { text: string; cls: string } {
  const pct = (Math.abs(cs.diffRate) * 100).toFixed(1);
  if (cs.diffRate > 0.0005) return { text: `▲ +${pct}%`, cls: 'kpi-diff--up' };
  if (cs.diffRate < -0.0005) return { text: `▼ −${pct}%`, cls: 'kpi-diff--down' };
  return { text: `= ${pct}%`, cls: 'kpi-diff--same' };
}

/** HIGH/MEDIUM 건수 → 서브라벨 문자열 */
function riskSubLabel(warnings: RiskWarning[]): string {
  const hi = warnings.filter(w => w.severity === 'HIGH').length;
  const md = warnings.filter(w => w.severity === 'MEDIUM').length;
  const parts: string[] = [];
  if (hi > 0) parts.push(`HIGH ${hi}건`);
  if (md > 0) parts.push(`MED ${md}건`);
  return parts.length > 0 ? parts.join(' · ') : '경고 없음';
}

/** null 또는 isPredicting 중 표시할 플레이스홀더 */
function Dash({ predicting }: { predicting: boolean }) {
  return (
    <span className={predicting ? 'kpi-loading' : 'kpi-empty'}>
      {predicting ? '…' : '—'}
    </span>
  );
}

/**
 * 현재안 KPI 요약 패널.
 *
 * 히어로(종합 비용 점수 + ▲/▼ 배지 + 분해 부가문구) +
 * 2×2 미니 카드(가중 총비용·순서 패널티·세척 비용·위험 전환).
 * §4, §9, §15 기준.
 */
export default function KpiSummaryBar({
  objectiveScore,
  totalWeightedCost,
  sequencePenalty,
  aggregatedCost,
  riskWarnings,
  comparisonState,
  isPredicting,
}: Props) {
  const badge = comparisonState ? buildDiffBadge(comparisonState) : null;

  const heroSub =
    totalWeightedCost !== null && sequencePenalty !== null
      ? `${Math.round(totalWeightedCost).toLocaleString()} 가중 비용 + ${Math.round(sequencePenalty)} 순서 패널티`
      : null;

  return (
    <div className="kpi-bar">
      {/* ── 히어로 셀 ─────────────────────────────────────────── */}
      <div className="kpi-hero">
        <p className="kpi-hero-label">종합 비용 점수</p>
        <div className="kpi-hero-value">
          {objectiveScore !== null ? formatPt(objectiveScore) : <Dash predicting={isPredicting} />}
          {badge && (
            <span className={`kpi-diff-badge ${badge.cls}`}>{badge.text}</span>
          )}
        </div>
        {heroSub && <p className="kpi-hero-sub">{heroSub}</p>}
      </div>

      {/* ── 2×2 미니 카드 ──────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi-mini-card">
          <p className="kpi-mini-label">가중 총비용</p>
          <p className="kpi-mini-value">
            {totalWeightedCost !== null
              ? formatPt(totalWeightedCost)
              : <Dash predicting={isPredicting} />}
          </p>
        </div>

        <div className="kpi-mini-card">
          <p className="kpi-mini-label">순서 패널티</p>
          <p className="kpi-mini-value">
            {sequencePenalty !== null
              ? `${Math.round(sequencePenalty)} pt`
              : <Dash predicting={isPredicting} />}
          </p>
        </div>

        <div className="kpi-mini-card">
          <p className="kpi-mini-label">세척 비용</p>
          <p className="kpi-mini-value">
            {aggregatedCost !== null
              ? formatPt(aggregatedCost.washCost)
              : <Dash predicting={isPredicting} />}
          </p>
        </div>

        <div className="kpi-mini-card kpi-mini-card--last-row">
          <p className="kpi-mini-label">위험 전환</p>
          <p className="kpi-mini-value">
            {riskWarnings.length > 0 || objectiveScore !== null
              ? `${riskWarnings.length}건`
              : <Dash predicting={isPredicting} />}
          </p>
          {objectiveScore !== null && (
            <p className="kpi-mini-sub">{riskSubLabel(riskWarnings)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

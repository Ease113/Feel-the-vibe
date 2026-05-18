import type { AppliedWeights, CostVector, RiskWarning } from '../api/types';

/** objectiveScore·totalWeightedCost 등 무단위 스칼라 */
export function formatScore(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** @deprecated formatScore 사용 권장 */
export function formatPt(value: number): string {
  return formatScore(value);
}

export function formatWon(value: number): string {
  return Math.round(value).toLocaleString(undefined);
}

export function formatMinutes(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatLiters(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** applied_weights × cost_dimensions (sequence_risk 제외) */
export function computeTransitionWeightedCost(
  dims: CostVector,
  weights: AppliedWeights,
): number {
  return (
    dims.setupTime * weights.setupTime +
    dims.laborCost * weights.laborCost +
    dims.materialLoss * weights.materialLoss +
    dims.washCost * weights.washCost +
    dims.downtime * weights.downtime +
    dims.packagingTime * weights.packagingTime
  );
}

/** riskWarnings → "SR-001(+10) + SR-003(+7)" */
export function formatPenaltyBreakdown(warnings: RiskWarning[]): string | null {
  const parts = warnings
    .filter(w => w.severity === 'HIGH' || w.severity === 'MEDIUM')
    .map(w => `${w.ruleId}(+${Math.round(w.penalty)})`);
  return parts.length > 0 ? parts.join(' + ') : null;
}

/** 원화 델타 — 양수면 나쁨(▲) */
export function formatWonDelta(delta: number): { text: string; cls: string } | null {
  if (Math.abs(delta) < 0.5) return null;
  if (delta > 0) {
    return { text: `▲ +${formatWon(delta)}원`, cls: 'kpi-delta--bad' };
  }
  return { text: `▼ −${formatWon(Math.abs(delta))}원`, cls: 'kpi-delta--good' };
}

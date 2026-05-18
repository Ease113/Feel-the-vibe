import type { TransitionCost, WarningSeverity } from '../api/types';
import { SEVERITY_UI } from '../api/types';

interface Props {
  transition: TransitionCost;
  fromSkuName: string;
  toSkuName: string;
}

function formatPenalty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function pillClass(severity: WarningSeverity | null): string {
  if (severity === 'HIGH') return 'risk-pill';
  if (severity === 'MEDIUM') return 'risk-pill risk-pill--med';
  return 'risk-pill risk-pill--low';
}

/**
 * 인접 SKU 카드 사이 색상 전환 penalty / risk 뱃지 (와이어프레임 seq-transition-risk).
 * sequencePenalty > 0 일 때만 표시한다.
 */
export default function TransitionSlot({
  transition,
  fromSkuName,
  toSkuName,
}: Props) {
  const { sequencePenalty, severity, ruleId } = transition;
  if (sequencePenalty <= 0) return null;

  const sevLabel = severity ? SEVERITY_UI[severity] : null;
  const pillText = sevLabel
    ? `${sevLabel} +${formatPenalty(sequencePenalty)}`
    : `+${formatPenalty(sequencePenalty)}`;

  const ariaLabel = [
    `${fromSkuName}→${toSkuName} 전환`,
    ruleId,
    `penalty ${formatPenalty(sequencePenalty)}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="seq-transition-risk" aria-label={ariaLabel}>
      <span className={pillClass(severity)}>{pillText}</span>
    </div>
  );
}

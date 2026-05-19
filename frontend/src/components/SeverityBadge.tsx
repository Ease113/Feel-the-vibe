import type { WarningSeverity } from '../api/types';

interface Props {
  severity: WarningSeverity | null;
}

/** 전환 분석·주의 경고 등에서 공통으로 쓰는 위험도 뱃지 (risk-pill). */
export default function SeverityBadge({ severity }: Props) {
  if (severity === null) return <span className="risk-pill risk-pill--low">—</span>;
  if (severity === 'HIGH') return <span className="risk-pill">HIGH</span>;
  if (severity === 'MEDIUM') return <span className="risk-pill risk-pill--med">MED</span>;
  return <span className="risk-pill risk-pill--low">LOW</span>;
}

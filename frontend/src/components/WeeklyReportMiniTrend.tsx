import type { KpiTrendPoint } from '../api/types';
import { formatScore, formatWon } from '../utils/costFormat';

interface Props {
  points: KpiTrendPoint[];
}

function fmtDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** 주간 확정 결정별 미니 추이 표 (PDF·모달 공용). */
export default function WeeklyReportMiniTrend({ points }: Props) {
  if (points.length === 0) return null;

  return (
    <div className="weekly-report-trend">
      <table className="weekly-report-trend__table">
        <thead>
          <tr>
            <th scope="col">확정일</th>
            <th scope="col">종합 점수</th>
            <th scope="col">세척비용</th>
          </tr>
        </thead>
        <tbody>
          {points.map(p => (
            <tr key={p.decision_id}>
              <td>{fmtDay(p.confirmed_at)}</td>
              <td>{formatScore(p.objective_score)}</td>
              <td>{formatWon(p.wash_cost)}원</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="weekly-report-trend__hint">종합 점수는 낮을수록 유리합니다.</p>
    </div>
  );
}

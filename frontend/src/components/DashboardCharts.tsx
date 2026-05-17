import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface TrendPoint {
  decision_id: string;
  confirmed_at: string;
  objective_score: number;
  wash_cost: number;
  sequence_risk: number;
}

interface Props {
  data: Array<Record<string, unknown>>;
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(-6) : id;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * 의사결정 로그의 KPI 트렌드 차트.
 *
 * objective_score / wash_cost / sequence_risk 추이를 LineChart로 표시한다.
 */
export default function DashboardCharts({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="chart-box">
        <p className="chart-empty">저장된 확정 결정이 없습니다. 생산 순서를 확정하면 여기에 트렌드가 표시됩니다.</p>
      </div>
    );
  }

  const points = (data as unknown as TrendPoint[]).map(d => ({
    name: fmtDate(d.confirmed_at),
    id: shortId(d.decision_id),
    목적점수: Math.round(d.objective_score),
    세척비용: Math.round(d.wash_cost),
    순서패널티: Math.round(d.sequence_risk),
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={55} tickFormatter={v => v.toLocaleString()} />
          <Tooltip
            contentStyle={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, boxShadow: 'var(--shadow)' }}
            formatter={(value: number) => value.toLocaleString() + ' pt'}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="목적점수" stroke="var(--black)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="세척비용" stroke="#0369a1" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="순서패널티" stroke="var(--bad)" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

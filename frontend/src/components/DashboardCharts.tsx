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
import type { KpiTrendPoint } from '../api/types';

interface Props {
  data: KpiTrendPoint[];
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

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="chart-box">
      <p className="chart-empty">{message}</p>
    </div>
  );
}

/**
 * 의사결정 로그의 KPI 트렌드 — 점수·비용·위반 추이.
 *
 * objective_score / wash_cost / sequence_risk 를 LineChart로 표시한다.
 */
export default function DashboardCharts({ data }: Props) {
  if (data.length === 0) {
    return (
      <ChartEmpty message="저장된 확정 결정이 없습니다. 생산 순서를 확정하면 여기에 트렌드가 표시됩니다." />
    );
  }

  const points = data.map(d => ({
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

/**
 * 의사결정 로그의 KPI 트렌드 — 전환 시간 추이 (분 단위).
 *
 * setup_time / downtime / packaging_time 을 LineChart로 표시한다.
 */
export function DashboardTimeCharts({ data }: Props) {
  if (data.length === 0) {
    return (
      <ChartEmpty message="저장된 확정 결정이 없습니다. 생산 순서를 확정하면 전환 시간 추이가 표시됩니다." />
    );
  }

  const points = data.map(d => ({
    name: fmtDate(d.confirmed_at),
    id: shortId(d.decision_id),
    셋업시간: Math.round(d.setup_time),
    정지시간: Math.round(d.downtime),
    패키징시간: Math.round(d.packaging_time),
  }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={40} tickFormatter={v => v.toLocaleString()} />
          <Tooltip
            contentStyle={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, boxShadow: 'var(--shadow)' }}
            formatter={(value: number) => value.toLocaleString() + ' 분'}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="셋업시간" stroke="#0369a1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="정지시간" stroke="#dc2626" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="패키징시간" stroke="#16a34a" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

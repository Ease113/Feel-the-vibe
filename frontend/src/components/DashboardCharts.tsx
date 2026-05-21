import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { KpiTrendPoint } from '../api/types';
import { formatLiters, formatMinutes, formatScore, formatWon } from '../utils/costFormat';

interface Props {
  data: KpiTrendPoint[];
  selectedIds: string[];
  onToggleId: (id: string) => void;
}

type DimKey =
  | 'setup_time'
  | 'labor_cost'
  | 'material_loss'
  | 'wash_cost'
  | 'downtime'
  | 'packaging_time'
  | 'sequence_risk';

type UnitGroup = 'won' | 'min' | 'liter' | 'score';

interface SeriesDef {
  key: DimKey;
  label: string;
  color: string;
  unitGroup: UnitGroup;
  formatValue: (v: number) => string;
  defaultOn: boolean;
}

const SERIES: SeriesDef[] = [
  { key: 'setup_time',      label: '셋업시간',   color: '#5E85A8', unitGroup: 'min',   formatValue: v => `${formatMinutes(v)} 분`,  defaultOn: true  },
  { key: 'labor_cost',      label: '인건비',     color: '#8475A3', unitGroup: 'won',   formatValue: v => `${formatWon(v)}원`,        defaultOn: false },
  { key: 'material_loss',   label: '자재손실',   color: '#A8905C', unitGroup: 'liter', formatValue: v => `${formatLiters(v)} L`,    defaultOn: false },
  { key: 'wash_cost',       label: '세척비용',   color: '#5A9691', unitGroup: 'won',   formatValue: v => `${formatWon(v)}원`,        defaultOn: true  },
  { key: 'downtime',        label: '정지시간',   color: '#A87A82', unitGroup: 'min',   formatValue: v => `${formatMinutes(v)} 분`,  defaultOn: false },
  { key: 'packaging_time',  label: '패키징시간', color: '#5C8F75', unitGroup: 'min',   formatValue: v => `${formatMinutes(v)} 분`,  defaultOn: false },
  { key: 'sequence_risk',   label: '순서패널티', color: '#767E8A', unitGroup: 'score', formatValue: v => `${formatScore(v)} pt`, defaultOn: true  },
];

const UNIT_LABEL: Record<UnitGroup, string> = {
  won: '원', min: '분', liter: 'L', score: 'pt',
};

const DEFAULT_VISIBLE = Object.fromEntries(
  SERIES.map(s => [s.key, s.defaultOn]),
) as Record<DimKey, boolean>;

interface ChartPoint {
  name: string;
  id: string;
  fullId: string;
  [label: string]: string | number;
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number;
  color?: string;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function shortId(id: string) {
  return id.length > 8 ? id.slice(-6) : id;
}

function normalizeSeries(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return () => 50;
  return v => ((v - min) / (max - min)) * 100;
}

function ChartTooltip({
  active, payload, label, rawByLabel, formatByLabel, normalized,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  rawByLabel: Record<string, Record<string, number>>;
  formatByLabel: Record<string, (v: number) => string>;
  normalized: boolean;
}) {
  if (!active || !payload?.length || !label) return null;
  const raw = rawByLabel[label] ?? {};
  return (
    <div style={{
      fontSize: 12,
      border: '1px solid var(--line)',
      borderRadius: 6,
      boxShadow: 'var(--shadow)',
      background: 'var(--surface)',
      padding: '8px 10px',
    }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--black)' }}>{label}</p>
      {payload.map(entry => {
        const seriesLabel = String(entry.dataKey ?? '');
        const rawVal = raw[seriesLabel];
        if (rawVal === undefined) return null;
        return (
          <p key={seriesLabel} style={{ margin: '2px 0', color: entry.color ?? 'var(--ink)' }}>
            {seriesLabel}: {formatByLabel[seriesLabel]?.(rawVal) ?? rawVal}
            {normalized && (
              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                (상대 {typeof entry.value === 'number' ? Math.round(entry.value) : '—'}%)
              </span>
            )}
          </p>
        );
      })}
      <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--muted)' }}>클릭하여 비교 선택</p>
    </div>
  );
}

/**
 * 의사결정 로그 KPI — 7차원 Grouped BarChart (체크박스 on/off, 클릭으로 비교 선택).
 */
export default function DashboardCharts({ data, selectedIds, onToggleId }: Props) {
  const [visible, setVisible] = useState<Record<DimKey, boolean>>(DEFAULT_VISIBLE);

  const activeSeries = useMemo(() => SERIES.filter(s => visible[s.key]), [visible]);
  const unitGroups = useMemo(() => new Set(activeSeries.map(s => s.unitGroup)), [activeSeries]);
  const useNormalized = unitGroups.size > 1;

  const { points, formatByLabel } = useMemo(() => {
    const formats = Object.fromEntries(SERIES.map(s => [s.label, s.formatValue])) as Record<string, (v: number) => string>;
    if (data.length === 0 || activeSeries.length === 0) return { points: [] as ChartPoint[], formatByLabel: formats };

    const scalers = new Map<string, (v: number) => number>();
    if (useNormalized) {
      for (const s of activeSeries) {
        scalers.set(s.label, normalizeSeries(data.map(d => d[s.key])));
      }
    }

    const pts: ChartPoint[] = data.map(d => {
      const point: ChartPoint = { name: fmtDate(d.confirmed_at), id: shortId(d.decision_id), fullId: d.decision_id };
      for (const s of activeSeries) {
        const raw = d[s.key];
        point[s.label] = useNormalized
          ? (scalers.get(s.label)?.(raw) ?? 0)
          : Math.round(raw * (s.unitGroup === 'liter' ? 10 : 1)) / (s.unitGroup === 'liter' ? 10 : 1);
      }
      return point;
    });

    return { points: pts, formatByLabel: formats };
  }, [data, activeSeries, useNormalized]);

  const rawByLabel = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const d of data) {
      const row: Record<string, number> = {};
      for (const s of activeSeries) row[s.label] = d[s.key];
      out[fmtDate(d.confirmed_at)] = row;
    }
    return out;
  }, [data, activeSeries]);

  const toggle = (key: DimKey) => setVisible(prev => ({ ...prev, [key]: !prev[key] }));
  const selectAll = () => setVisible(Object.fromEntries(SERIES.map(s => [s.key, true])) as Record<DimKey, boolean>);
  const clearAll  = () => setVisible(Object.fromEntries(SERIES.map(s => [s.key, false])) as Record<DimKey, boolean>);

  if (data.length === 0) {
    return (
      <div className="chart-box">
        <p className="chart-empty">저장된 확정 결정이 없습니다. 생산 순서를 확정하면 여기에 트렌드가 표시됩니다.</p>
      </div>
    );
  }

  const yLabel = useNormalized
    ? '상대 추이 (%)'
    : activeSeries.length === 1
      ? UNIT_LABEL[activeSeries[0].unitGroup]
      : UNIT_LABEL[activeSeries[0]?.unitGroup ?? 'won'];

  return (
    <div className="chart-box">
      <div className="chart-main">
        {useNormalized && activeSeries.length > 1 && (
          <p className="chart-axis-hint">
            서로 다른 단위가 선택되어 상대 추이(0~100%)로 표시합니다. 실제 값은 툴팁에서 확인하세요.
          </p>
        )}

        {activeSeries.length === 0 ? (
          <p className="chart-empty">표시할 차원을 하나 이상 선택하세요.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={points}
            margin={{ top: 12, right: 12, left: 4, bottom: 12 }}
            style={{ cursor: 'pointer' }}
            onClick={chartData => {
              const fullId = (chartData?.activePayload?.[0]?.payload as ChartPoint | undefined)?.fullId;
              if (fullId) onToggleId(fullId);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={v => useNormalized ? `${Math.round(v)}%` : v.toLocaleString()}
              label={{
                value: yLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 8,
                style: { fontSize: 10, fill: 'var(--muted)' },
              }}
            />
            <Tooltip
              content={
                <ChartTooltip
                  rawByLabel={rawByLabel}
                  formatByLabel={formatByLabel}
                  normalized={useNormalized}
                />
              }
              cursor={{ fill: 'var(--surface-3)' }}
            />
            {activeSeries.map(s => (
              <Bar key={s.key} dataKey={s.label} maxBarSize={28} isAnimationActive={false}>
                {points.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={s.color}
                    fillOpacity={selectedIds.length === 0 || selectedIds.includes(entry.fullId) ? 1 : 0.22}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      <aside className="chart-legend" aria-label="차트 표시 차원">
        <div className="chart-legend-toolbar">
          <span className="chart-legend-label">표시 차원</span>
          <div className="chart-legend-actions">
            <button
              type="button"
              className="chart-legend-action"
              onClick={selectAll}
            >
              전체 선택
            </button>
            <span className="chart-legend-actions-sep" aria-hidden="true">·</span>
            <button
              type="button"
              className="chart-legend-action"
              onClick={clearAll}
            >
              전체 해제
            </button>
          </div>
        </div>
        <div className="chart-legend-dims" role="group" aria-label="KPI 차원 선택">
          {SERIES.map(s => (
            <label key={s.key} className="chart-toggle">
              <input type="checkbox" checked={visible[s.key]} onChange={() => toggle(s.key)} />
              <span className="chart-toggle-swatch" style={{ background: s.color }} aria-hidden />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}

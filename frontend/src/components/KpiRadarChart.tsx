import { useMemo } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { KpiTrendPoint } from '../api/types';

interface Props {
  data: KpiTrendPoint[];
  selectedIds: string[];
  onRemoveId: (id: string) => void;
  embedded?: boolean;
}

type DimKey = 'setup_time' | 'labor_cost' | 'material_loss' | 'wash_cost' | 'downtime' | 'packaging_time' | 'sequence_risk';

const DIM_LABELS: Record<DimKey, string> = {
  setup_time:     '셋업시간',
  labor_cost:     '인건비',
  material_loss:  '자재손실',
  wash_cost:      '세척비용',
  downtime:       '정지시간',
  packaging_time: '패키징시간',
  sequence_risk:  '순서패널티',
};
const DIMS = Object.keys(DIM_LABELS) as DimKey[];

const RADAR_COLORS = ['#0369a1', '#dc2626', '#16a34a'];

function shortId(id: string) {
  return id.length > 8 ? id.slice(-6) : id;
}

/**
 * 선택된 결정들의 7차원 KPI를 오버레이 레이더로 비교.
 * selectedIds 2~3개일 때만 렌더링, 각 차원은 전체 데이터 기준으로 정규화(0~100).
 */
export default function KpiRadarChart({ data, selectedIds, onRemoveId, embedded = false }: Props) {
  const radarData = useMemo(() => {
    const selectedPoints = selectedIds
      .map(id => data.find(d => d.decision_id === id))
      .filter(Boolean) as KpiTrendPoint[];

    return DIMS.map(dim => {
      const allVals = data.map(d => d[dim]);
      const min = Math.min(...allVals);
      const max = Math.max(...allVals);
      const row: Record<string, string | number> = { subject: DIM_LABELS[dim] };
      for (const point of selectedPoints) {
        const normalized = max === min ? 50 : Math.round(((point[dim] - min) / (max - min)) * 100);
        row[point.decision_id] = normalized;
      }
      return row;
    });
  }, [data, selectedIds]);

  const selectedPoints = selectedIds
    .map(id => data.find(d => d.decision_id === id))
    .filter(Boolean) as KpiTrendPoint[];
  const isProfile = selectedPoints.length === 1;
  const hasSelection = selectedPoints.length > 0;

  return (
    <div className={`radar-panel${embedded ? ' radar-panel--embedded' : ''}`}>
      <div className="radar-panel-head">
        {selectedPoints.length >= 2 ? '선택 결정 비교' : '선택 결정 프로파일'}
      </div>

      <div className="sel-chips">
        {hasSelection
          ? selectedPoints.map((p, i) => (
              <span key={p.decision_id} className="sel-chip" style={{ background: RADAR_COLORS[i] }}>
                {shortId(p.decision_id)}
                <button
                  type="button"
                  className="sel-chip-x"
                  onClick={() => onRemoveId(p.decision_id)}
                  aria-label={`${shortId(p.decision_id)} 선택 해제`}
                >
                  ×
                </button>
              </span>
            ))
          : <span className="sel-chip-placeholder">선택 없음</span>}
      </div>

      <p className="radar-hint">
        {!hasSelection
          ? '히트맵에서 결정 하나를 선택하면 7차원 비용 프로파일이 표시됩니다.'
          : isProfile
          ? '선택한 결정의 7차원 비용 모양입니다. 하나 더 선택하면 비교로 확장됩니다.'
          : '0에 가까울수록 해당 차원의 비용이 낮습니다 (전체 결정 기준 정규화).'}
      </p>

      {hasSelection ? (
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="var(--line-strong)" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 11, fill: 'var(--ink)' }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              tickCount={4}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              formatter={(value: number) => [`${value}%`, '']}
              contentStyle={{
                fontSize: 12,
                border: '1px solid var(--line)',
                borderRadius: 6,
                background: 'var(--surface)',
              }}
            />
            {selectedPoints.map((p, i) => (
              <Radar
                key={p.decision_id}
                name={shortId(p.decision_id)}
                dataKey={p.decision_id}
                stroke={RADAR_COLORS[i]}
                fill={RADAR_COLORS[i]}
                fillOpacity={0.12}
                strokeWidth={2}
              />
            ))}
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      ) : (
        <div className="radar-empty-state">
          <span>히트맵 셀을 클릭해 프로파일을 확인하세요.</span>
        </div>
      )}
    </div>
  );
}

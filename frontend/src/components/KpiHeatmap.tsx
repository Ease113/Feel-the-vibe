import { Fragment, useMemo, type CSSProperties } from 'react';
import type { KpiTrendPoint } from '../api/types';
import { formatLiters, formatMinutes, formatScore, formatWon } from '../utils/costFormat';

interface Props {
  data: KpiTrendPoint[];
  selectedIds: string[];
  onToggleId: (id: string) => void;
}

interface DimDef {
  key: keyof Omit<KpiTrendPoint, 'decision_id' | 'confirmed_at' | 'objective_score'>;
  label: string;
  formatValue: (v: number) => string;
}

const DIMS: DimDef[] = [
  { key: 'setup_time',     label: '셋업시간',   formatValue: v => `${formatMinutes(v)}분` },
  { key: 'labor_cost',     label: '인건비',     formatValue: v => `${formatWon(v)}원` },
  { key: 'material_loss',  label: '자재손실',   formatValue: v => `${formatLiters(v)}L` },
  { key: 'wash_cost',      label: '세척비용',   formatValue: v => `${formatWon(v)}원` },
  { key: 'downtime',       label: '정지시간',   formatValue: v => `${formatMinutes(v)}분` },
  { key: 'packaging_time', label: '패키징시간', formatValue: v => `${formatMinutes(v)}분` },
  { key: 'sequence_risk',  label: '순서패널티', formatValue: v => `${formatScore(v)}pt` },
];

const SELECT_BADGE_COLORS = ['#0369a1', '#dc2626', '#16a34a'] as const;
const SCALE_LOW = '#ecfdf5';
const SCALE_MID = '#f4f4f5';
const SCALE_HIGH = '#fee2e2';

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

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const u = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * u);
  const g = Math.round(g1 + (g2 - g1) * u);
  const bl = Math.round(b1 + (b2 - b1) * u);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** 행 내 상대값 0(낮음) → 1(높음), 선형 3단 그라데이션 */
function cellBg(t: number): string {
  if (t <= 0.5) return lerpHex(SCALE_LOW, SCALE_MID, t * 2);
  return lerpHex(SCALE_MID, SCALE_HIGH, (t - 0.5) * 2);
}

/**
 * KPI 히트맵 — 행=7차원, 열=확정 결정, 열 클릭으로 비교 선택.
 */
export default function KpiHeatmap({ data, selectedIds, onToggleId }: Props) {
  const normalized = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const dim of DIMS) {
      const vals = data.map(d => d[dim.key] as number);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      result[dim.key] = vals.map(v => (max === min ? 0.5 : (v - min) / (max - min)));
    }
    return result;
  }, [data]);

  if (data.length === 0) {
    return <p className="chart-empty">저장된 확정 결정이 없습니다.</p>;
  }

  const hasSelection = selectedIds.length > 0;
  const colCount = data.length;

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-title-row">
        <div>
          <div className="heatmap-title">7차원 비용 히트맵</div>
          <div className="heatmap-subtitle">행은 비용 차원, 열은 확정 결정입니다.</div>
        </div>
        <div className="heatmap-legend" aria-label="히트맵 색상 범례">
          <span>낮음</span>
          <span className="heatmap-legend-scale" aria-hidden />
          <span>높음</span>
        </div>
      </div>

      <div className="heatmap-scroll">
        <div
          className="heatmap-grid"
          role="grid"
          aria-label="확정 결정별 7차원 비용"
          style={{
            gridTemplateColumns: `84px repeat(${colCount}, minmax(48px, 56px))`,
          }}
        >
          <div className="heatmap-corner" role="presentation" />

          {data.map(d => {
            const selIdx = selectedIds.indexOf(d.decision_id);
            const isSelected = selIdx >= 0;
            const badgeStyle = isSelected
              ? ({ '--heatmap-badge': SELECT_BADGE_COLORS[selIdx] } as CSSProperties)
              : undefined;

            return (
              <button
                key={`head-${d.decision_id}`}
                type="button"
                className={[
                  'heatmap-header',
                  isSelected ? 'heatmap-header--selected' : '',
                  hasSelection && !isSelected ? 'heatmap-header--dimmed' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onToggleId(d.decision_id)}
                title={`${d.decision_id}\n클릭하여 비교 선택`}
                aria-pressed={isSelected}
              >
                <span className="heatmap-sel-badge" style={badgeStyle} aria-hidden={!isSelected}>
                  {isSelected ? selIdx + 1 : '\u00a0'}
                </span>
                <span className="heatmap-header-date">{fmtDate(d.confirmed_at)}</span>
                <span className="heatmap-header-id">{shortId(d.decision_id)}</span>
              </button>
            );
          })}

          {DIMS.map((dim, dimIdx) => (
            <Fragment key={dim.key}>
              <div
                className={`heatmap-label${dimIdx === DIMS.length - 1 ? ' heatmap-label--last' : ''}`}
                role="rowheader"
              >
                {dim.label}
              </div>
              {data.map((d, ci) => {
                const selIdx = selectedIds.indexOf(d.decision_id);
                const isSelected = selIdx >= 0;
                const cellStyle = {
                  background: cellBg(normalized[dim.key]?.[ci] ?? 0.5),
                } as CSSProperties;
                const raw = d[dim.key] as number;

                return (
                  <button
                    key={`${dim.key}-${d.decision_id}`}
                    type="button"
                    className={[
                      'heatmap-cell',
                      dimIdx === DIMS.length - 1 ? 'heatmap-cell--last' : '',
                      isSelected ? 'heatmap-cell--selected' : '',
                      hasSelection && !isSelected ? 'heatmap-cell--dimmed' : '',
                    ].filter(Boolean).join(' ')}
                    style={cellStyle}
                    onClick={() => onToggleId(d.decision_id)}
                    title={`${dim.label}: ${dim.formatValue(raw)}`}
                    aria-label={`${dim.label} ${dim.formatValue(raw)}`}
                    aria-pressed={isSelected}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <p className="heatmap-hint">
        열 헤더를 클릭해 비교 대상을 선택하세요. 번호는 선택한 순서를 나타냅니다.
      </p>
    </div>
  );
}

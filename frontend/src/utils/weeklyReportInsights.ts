import type { KpiTrendPoint } from '../api/types';

const TREND_DIM_KEYS = [
  'objective_score',
  'wash_cost',
  'downtime',
  'setup_time',
  'labor_cost',
] as const;

type TrendDimKey = (typeof TREND_DIM_KEYS)[number];

const TREND_DIM_LABELS: Record<TrendDimKey, string> = {
  objective_score: '목적 점수',
  wash_cost: '세척비용',
  downtime: '정지시간',
  setup_time: '셋업시간',
  labor_cost: '인건비',
};

function toLocalDay(iso: string): Date | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } catch {
    return null;
  }
}

function parsePeriodDay(isoDate: string): Date | null {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** ISO 주간 기간 [periodStart, periodEnd]에 속하는 확정 결정만 남긴다. */
export function filterTrendByPeriod(
  trend: KpiTrendPoint[],
  periodStart: string,
  periodEnd: string,
): KpiTrendPoint[] {
  const start = parsePeriodDay(periodStart);
  const end = parsePeriodDay(periodEnd);
  if (start == null || end == null) return [];

  return trend
    .filter(p => {
      const day = toLocalDay(p.confirmed_at);
      return day != null && day >= start && day <= end;
    })
    .sort(
      (a, b) =>
        new Date(a.confirmed_at).getTime() - new Date(b.confirmed_at).getTime(),
    );
}

export interface WeekTrendInsight {
  narrative: string | null;
  topMovers: Array<{ key: TrendDimKey; label: string; delta: number }>;
}

/** 주간 확정 2건 이상일 때 첫 결정→마지막 결정 변화 요약. */
export function buildWeekTrendInsight(points: KpiTrendPoint[]): WeekTrendInsight {
  if (points.length < 2) {
    return { narrative: null, topMovers: [] };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const movers: Array<{ key: TrendDimKey; label: string; delta: number }> = [];

  for (const key of TREND_DIM_KEYS) {
    const delta = last[key] - first[key];
    if (Math.abs(delta) > 1e-6) {
      movers.push({ key, label: TREND_DIM_LABELS[key], delta });
    }
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topMovers = movers.slice(0, 2);

  const scoreDelta = last.objective_score - first.objective_score;
  const washDelta = last.wash_cost - first.wash_cost;
  const parts: string[] = [];

  if (Math.abs(scoreDelta) >= 1) {
    parts.push(
      scoreDelta > 0
        ? `목적 점수가 주 초 대비 ${formatDelta(scoreDelta)} 상승했습니다 (낮을수록 유리).`
        : `목적 점수가 주 초 대비 ${formatDelta(Math.abs(scoreDelta))} 개선되었습니다.`,
    );
  }
  if (Math.abs(washDelta) >= 100) {
    parts.push(
      washDelta > 0
        ? `세척비용 합계는 ${formatWonDelta(washDelta)} 증가 추세입니다.`
        : `세척비용 합계는 ${formatWonDelta(Math.abs(washDelta))} 감소 추세입니다.`,
    );
  }

  return {
    narrative: parts.length > 0 ? parts.join(' ') : null,
    topMovers,
  };
}

function formatDelta(v: number): string {
  return Math.round(v).toLocaleString() + ' pt';
}

function formatWonDelta(v: number): string {
  return Math.round(v).toLocaleString() + '원';
}

const GENERIC_RISK_RECOMMENDATIONS = [
  '고위험 전환 구간은 작업 시작 전 추가 점검 절차를 적용해 보세요.',
  '유사 색상군을 연속 배치해 세척 비용을 절감해 보세요.',
];

/** 룰별 권장과 겹치는 일반 문구·중복 권장을 줄인다. */
export function filterRedundantRecommendations(
  recommendations: string[],
  hasRiskSection: boolean,
): string[] {
  if (!hasRiskSection) return recommendations;
  return recommendations.filter(item => {
    const t = item.trim();
    if (!t) return false;
    return !GENERIC_RISK_RECOMMENDATIONS.includes(t);
  });
}

/** 개요와 숫자·문구가 겹치는 발견 항목을 줄인다. */
export function filterRedundantFindings(
  findings: string[],
  overview: string,
): string[] {
  const ov = overview.trim();
  if (!ov) return findings;

  return findings.filter(item => {
    const t = item.trim();
    if (!t) return false;
    if (/이번 주 \d+건.*결정/.test(t) && /결정/.test(ov)) return false;
    if (/평균 목적 점수/.test(t) && /목적 점수|objective/i.test(ov)) return false;
    if (/고위험 색상 전환/.test(t) && /고위험|전환/.test(ov)) return false;
    if (/가장 자주 발생한 규칙/.test(t)) return false;
    return true;
  });
}

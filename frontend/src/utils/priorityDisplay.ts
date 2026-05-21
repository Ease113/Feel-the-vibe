import type {
  AppliedWeights,
  OperatorPriorityDimensionUI,
  PriorityLabel,
} from '../api/types';
import { PRIORITY_AXIS_KO } from '../api/types';

/** Likert 점 호버 — 5단계 툴팁 */
export const PRIORITY_LABEL_REFLECT_KO: Record<PriorityLabel, string> = {
  VERY_LOW:  '훨씬 덜 반영',
  LOW:       '덜 반영',
  NORMAL:    '보통(기본)',
  HIGH:      '더 반영',
  VERY_HIGH: '훨씬 더 반영',
};

/** 평가 조건 요약 칩 — 목적 점수 가중치 수준 */
export const PRIORITY_LABEL_CHIP_KO: Record<PriorityLabel, string> = {
  VERY_LOW:  '최소',
  LOW:       '낮음',
  NORMAL:    '기본',
  HIGH:      '높음',
  VERY_HIGH: '최대',
};

/** 요약 칩용 짧은 축 이름 */
export const PRIORITY_AXIS_CHIP_KO: Record<keyof typeof PRIORITY_AXIS_KO, string> = {
  washCost: '세척',
  downtime: '다운타임',
  materialLoss: '원자재',
  packagingTime: '패키징',
  laborCost: '작업자',
};

const APPLIED_WEIGHT_ROWS: Array<{
  key: keyof AppliedWeights;
  label: string;
}> = [
  { key: 'washCost', label: PRIORITY_AXIS_KO.washCost },
  { key: 'downtime', label: PRIORITY_AXIS_KO.downtime },
  { key: 'materialLoss', label: PRIORITY_AXIS_KO.materialLoss },
  { key: 'packagingTime', label: PRIORITY_AXIS_KO.packagingTime },
  { key: 'laborCost', label: PRIORITY_AXIS_KO.laborCost },
  { key: 'setupTime', label: '셋업 시간' },
];

/** Likert 행 양끝 — 축 이름(검정) + 반영 극(색상 분리) */
export function priorityAxisPoleParts(axis: OperatorPriorityDimensionUI): {
  name: string;
  minReflect: string;
  maxReflect: string;
} {
  return {
    name: PRIORITY_AXIS_KO[axis],
    minReflect: '최소 반영',
    maxReflect: '최대 반영',
  };
}

export function formatAppliedWeightPct(weight: number): string {
  return `${Math.round(weight * 1000) / 10}%`;
}

export function appliedWeightRows(weights: AppliedWeights) {
  return APPLIED_WEIGHT_ROWS.map(({ key, label }) => ({
    key,
    label,
    pct: formatAppliedWeightPct(weights[key]),
  }));
}

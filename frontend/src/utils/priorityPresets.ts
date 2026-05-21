import type {
  OperatorPriorityDimensionUI,
  PriorityLabel,
  PriorityProfile,
} from '../api/types';
import { PRIORITY_MULTIPLIER } from '../api/types';
import {
  PRIORITY_AXIS_CHIP_KO,
  PRIORITY_LABEL_CHIP_KO,
} from './priorityDisplay';

export type PriorityPresetId = 'standard' | 'quality' | 'throughput';

/** 템플릿 3종 + 직접 설정(항목별 Likert) */
export type PresetSegmentId = PriorityPresetId | 'custom';

export const PRIORITY_PRESET_CUSTOM = {
  id: 'custom' as const,
  label: '직접 설정',
  hint: '아래에서 항목별로 조정합니다',
  summary: '항목별 조정',
};

const PRIORITY_AXES: OperatorPriorityDimensionUI[] = [
  'washCost',
  'downtime',
  'materialLoss',
  'packagingTime',
  'laborCost',
];

export interface PriorityPresetDefinition {
  id: PriorityPresetId;
  /** standard은 factoryDefault 클론 — priorities 미사용 */
  label: string;
  hint: string;
  priorities?: Record<OperatorPriorityDimensionUI, PriorityLabel>;
}

/** 공장·전 라인 공통 운영 방침 프리셋 (프론트 상수, API 불필요) */
export const PRIORITY_PRESETS: PriorityPresetDefinition[] = [
  {
    id: 'standard',
    label: '공장 표준',
    hint: '계획 기본값 · 전 축 기본',
  },
  {
    id: 'quality',
    label: '품질·오염',
    hint: '세척·로스 가중치 상향',
    priorities: {
      washCost: 'HIGH',
      downtime: 'NORMAL',
      materialLoss: 'HIGH',
      packagingTime: 'NORMAL',
      laborCost: 'NORMAL',
    },
  },
  {
    id: 'throughput',
    label: '가동·납기',
    hint: '정지·인력 상향 · 세척 하향',
    priorities: {
      washCost: 'LOW',
      downtime: 'HIGH',
      materialLoss: 'NORMAL',
      packagingTime: 'NORMAL',
      laborCost: 'HIGH',
    },
  },
];

export function clonePriorityProfile(profile: PriorityProfile): PriorityProfile {
  return {
    baseWeightProfileId: profile.baseWeightProfileId,
    priorities: Object.fromEntries(
      PRIORITY_AXES.map(axis => [axis, { ...profile.priorities[axis] }]),
    ) as PriorityProfile['priorities'],
  };
}

export function prioritiesEqual(a: PriorityProfile, b: PriorityProfile): boolean {
  return PRIORITY_AXES.every(axis => a.priorities[axis].label === b.priorities[axis].label);
}

export function profileFromPresetLabels(
  priorities: Record<OperatorPriorityDimensionUI, PriorityLabel>,
  baseWeightProfileId: string,
): PriorityProfile {
  return {
    baseWeightProfileId,
    priorities: Object.fromEntries(
      PRIORITY_AXES.map(axis => {
        const label = priorities[axis];
        return [axis, { label, multiplier: PRIORITY_MULTIPLIER[label] }];
      }),
    ) as PriorityProfile['priorities'],
  };
}

export function resolvePresetProfile(
  presetId: PriorityPresetId,
  factoryDefault: PriorityProfile,
): PriorityProfile {
  const def = PRIORITY_PRESETS.find(p => p.id === presetId);
  if (!def || presetId === 'standard' || !def.priorities) {
    return clonePriorityProfile(factoryDefault);
  }
  return profileFromPresetLabels(def.priorities, factoryDefault.baseWeightProfileId);
}

/** 프리셋 카드/세그먼트용 한 줄 요약 (예: 세척 높음 · 로스 높음) */
export function formatPresetSummary(preset: PriorityPresetDefinition): string {
  if (!preset.priorities) return '전 축 기본';
  const parts = PRIORITY_AXES.filter(
    axis => preset.priorities![axis] !== 'NORMAL',
  ).map(
    axis =>
      `${PRIORITY_AXIS_CHIP_KO[axis]} ${PRIORITY_LABEL_CHIP_KO[preset.priorities![axis]]}`,
  );
  return parts.length > 0 ? parts.join(' · ') : '전 축 기본';
}

export function inferPresetSegmentId(
  profile: PriorityProfile,
  factoryDefault: PriorityProfile,
): PresetSegmentId {
  return matchingPresetId(profile, factoryDefault) ?? 'custom';
}

export function matchingPresetId(
  profile: PriorityProfile,
  factoryDefault: PriorityProfile,
): PriorityPresetId | null {
  if (prioritiesEqual(profile, factoryDefault)) return 'standard';
  for (const preset of PRIORITY_PRESETS) {
    if (!preset.priorities) continue;
    const candidate = profileFromPresetLabels(
      preset.priorities,
      factoryDefault.baseWeightProfileId,
    );
    if (prioritiesEqual(profile, candidate)) return preset.id;
  }
  return null;
}

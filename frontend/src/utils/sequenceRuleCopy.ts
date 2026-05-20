import type { WarningSeverity } from '../api/types';

/** sequence_rules.json reason/recommendation — dashboard risk pattern accordion용 */
export interface SequenceRuleCopy {
  severity: WarningSeverity;
  reason: string;
  recommendation: string;
}

/**
 * MVP 고정 룰 메타 (백엔드 sequence_rules.json과 동기).
 * GET /dashboard risk_patterns에는 rule_id·count만 있으므로 원인 문구는 클라이언트 lookup.
 */
export const SEQUENCE_RULE_COPY: Record<string, SequenceRuleCopy> = {
  'SR-001': {
    severity: 'HIGH',
    reason: '검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.',
    recommendation: '흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요.',
  },
  'SR-002': {
    severity: 'HIGH',
    reason: '어두운색(dark) 이후 밝은색(light) 생산은 잔류 안료 리스크가 있습니다.',
    recommendation: '가능하면 밝은색을 먼저 생산하거나, 세척 강도를 높이세요.',
  },
  'SR-003': {
    severity: 'MEDIUM',
    reason: '메탈/특수광택 이후 일반색(mid) 생산은 광택 잔류 리스크가 있습니다.',
    recommendation: '일반색을 먼저 생산하거나, 세척 시 광택 잔류 여부를 추가 확인하세요.',
  },
  'SR-004': {
    severity: 'HIGH',
    reason: '메탈/특수광택 이후 밝은색(light) 생산은 광택 잔류가 흰색 계열 품질에 직접 영향을 줍니다.',
    recommendation: '밝은색을 먼저 생산하거나, 메탈 계열 생산 직후 세척을 강화하세요.',
  },
};

export function getSequenceRuleCopy(ruleId: string): SequenceRuleCopy | null {
  return SEQUENCE_RULE_COPY[ruleId] ?? null;
}

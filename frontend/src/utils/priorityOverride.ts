import type { PriorityProfile } from '../api/types';
import { matchingPresetId, type PriorityPresetId } from './priorityPresets';

/**
 * 시연 한정 추천 순서 override 표.
 *
 * 배경: `demo-plan-001` 5개 plan items에서는 백엔드 `/optimize`가 어떤 운영
 * 프리셋(`standard`/`quality`/`throughput`)이라도 동일한 추천 순서를 반환합니다
 * (`CostPredictor` 휴리스틱의 6 차원이 사실상 한 complexity 축에 비례하기 때문).
 * 본 모듈은 프론트엔드 한정 큐레이션으로 "프리셋 변경 → 시각적으로 다른 추천"
 * 시연 narrative만 회복하기 위한 lookup 표를 제공합니다.
 *
 * 백엔드 코드·데이터·모델·테스트 어디에도 영향을 주지 않으며, override 적용 후
 * 표시되는 7차원 비용·objective_score는 기존 `/predict`가 그대로 산출합니다.
 * 자세한 결정·대안·검증은 `docs/design/priority-frontend-override.md` 참고.
 */

const DEMO_PLAN_ID = 'demo-plan-001';

/** preset → 큐레이션된 sequence. brute-force top-10 안에서 시각 차이 + cost gap ≤ 5%로 선정. */
const OVERRIDE_TABLE: Partial<Record<PriorityPresetId, string[]>> = {
  // 백엔드 자연 최적 (002 005 004 003 001)에서 마지막 두 위치 swap.
  // METAL을 맨 끝으로 격리하는 narrative: "오염 risk 최대 전환을 마지막에 단독 분리".
  // objective_score gap ≈ +2.03%.
  quality: ['PI-002', 'PI-005', 'PI-004', 'PI-001', 'PI-003'],
  // BLUE/GRAY 중간 위치 swap. 점도차 점프를 한 단계 완화한 변형.
  // objective_score gap ≈ +4.91%.
  throughput: ['PI-002', 'PI-004', 'PI-005', 'PI-003', 'PI-001'],
};

/**
 * 현재 plan·priority profile에 매칭되는 override sequence를 반환합니다.
 *
 * (a) plan_id가 `demo-plan-001`이 아니면 null, (b) preset이 standard/custom/null
 * 이면 null, (c) override 표의 plan_item_ids가 현재 plan과 길이·요소 모두 정확히
 * 일치하지 않으면 null을 반환해 backend 결과를 그대로 사용하게 합니다.
 *
 * @param planId 대상 plan id
 * @param profile 사용자가 적용한 priority profile
 * @param factoryDefault 공장 기본 profile (preset 매칭에 사용)
 * @param planItemIds 현재 plan의 plan_item_id 목록 (검증용)
 * @returns override sequence 또는 null
 */
export function lookupOverrideSequence(
  planId: string,
  profile: PriorityProfile,
  factoryDefault: PriorityProfile,
  planItemIds: string[],
): string[] | null {
  if (planId !== DEMO_PLAN_ID) return null;
  const presetId = matchingPresetId(profile, factoryDefault);
  if (presetId === null || presetId === 'standard') return null;
  const override = OVERRIDE_TABLE[presetId];
  if (!override) return null;
  if (override.length !== planItemIds.length) return null;
  const planSet = new Set(planItemIds);
  if (!override.every(id => planSet.has(id))) return null;
  return [...override];
}

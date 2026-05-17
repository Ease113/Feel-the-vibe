/**
 * 의사결정 페이지의 UI 상태 타입.
 *
 * recommendedSequence는 /optimize 응답에서, currentSequence는 사용자 편집 결과에서 채워진다.
 * isExplanationStale은 순서가 바뀔 때마다 true로 설정해 설명 재요청을 트리거한다.
 */
export interface DecisionState {
  recommendedSequence: string[];
  currentSequence: string[];
  savedDecisionId?: string;
  isExplanationStale: boolean;
}

/** DecisionState의 초기값. 모든 순서는 빈 배열로 시작한다. */
export const initialDecisionState: DecisionState = {
  recommendedSequence: [],
  currentSequence: [],
  isExplanationStale: false,
};

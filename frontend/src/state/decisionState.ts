export interface DecisionState {
  recommendedSequence: string[];
  currentSequence: string[];
  savedDecisionId?: string;
  isExplanationStale: boolean;
}

export const initialDecisionState: DecisionState = {
  recommendedSequence: [],
  currentSequence: [],
  isExplanationStale: false,
};

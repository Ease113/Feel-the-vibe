import type {
  ComparisonState,
  DashboardResponse,
  DecisionsResponse,
  ExplainResponse,
  GetPlanData,
  GetPlanResponse,
  OptimizeResponse,
  PredictResponse,
  PriorityProfile,
  RiskWarning,
} from './types';
import {
  mapGetPlanResponse,
  toDecisionsRequest,
  toExplainRequest,
  toOptimizeRequest,
  toPredictRequest,
} from './mappers';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

/**
 * 공통 fetch 래퍼. Content-Type을 JSON으로 고정하고 응답 실패 시 Error를 throw한다.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** 백엔드 헬스체크 */
export function getHealth() {
  return request<{ status: string; service: string }>('/health');
}

/** 생산계획 조회 — snake_case 응답을 camelCase 도메인으로 변환해 반환 */
export function getPlan(planId: string): Promise<GetPlanData> {
  return request<GetPlanResponse>(`/plans/${planId}`).then(mapGetPlanResponse);
}

/** KPI 대시보드 (P1, wire format 그대로) */
export function getDashboard() {
  return request<DashboardResponse>('/dashboard');
}

/** 추천 순서 생성 */
export function postOptimize(input: {
  planId: string;
  planItemIds: string[];
  priorityProfile: PriorityProfile;
}) {
  return request<OptimizeResponse>('/optimize', {
    method: 'POST',
    body: JSON.stringify(toOptimizeRequest(input)),
  });
}

/** 현재 순서 비용·비교 평가 */
export function postPredict(input: {
  planId: string;
  recommendedSequence: string[];
  currentSequence: string[];
  priorityProfile: PriorityProfile;
}) {
  return request<PredictResponse>('/predict', {
    method: 'POST',
    body: JSON.stringify(toPredictRequest(input)),
  });
}

/** 최종 순서 확정 저장 */
export function postDecisions(input: {
  planId: string;
  recommendedSequence: string[];
  confirmedSequence: string[];
  priorityProfile: PriorityProfile;
  decisionMemo?: string;
}) {
  return request<DecisionsResponse>('/decisions', {
    method: 'POST',
    body: JSON.stringify(toDecisionsRequest(input)),
  });
}

/** 설명 생성 (P1) */
export function postExplain(input: {
  planId: string;
  currentSequence: string[];
  comparisonState: ComparisonState;
  riskWarnings: RiskWarning[];
}) {
  return request<ExplainResponse>('/explain', {
    method: 'POST',
    body: JSON.stringify(toExplainRequest(input)),
  });
}

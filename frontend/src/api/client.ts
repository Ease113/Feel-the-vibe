import type { DashboardResponse, PlanResponse } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

/**
 * 공통 fetch 래퍼. Content-Type을 JSON으로 고정하고 응답 실패 시 Error를 throw한다.
 *
 * @param path - API 엔드포인트 경로 (예: '/health').
 * @param init - fetch RequestInit 옵션 (method, body 등).
 * @returns 파싱된 JSON 응답을 제네릭 타입 T로 캐스트해 반환한다.
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

/** 백엔드 헬스체크를 호출해 status, service 값을 반환한다. */
export function getHealth() {
  return request<{ status: string; service: string }>('/health');
}

/**
 * 지정된 plan_id의 계획 항목과 운영 컨텍스트를 조회한다.
 *
 * @param planId - 조회할 생산 계획 식별자 (예: 'demo-plan-001').
 */
export function getPlan(planId: string) {
  return request<PlanResponse>(`/plans/${planId}`);
}

/** KPI 대시보드 집계 데이터를 조회한다. */
export function getDashboard() {
  return request<DashboardResponse>('/dashboard');
}

import type { DashboardResponse, PlanResponse } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

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

export function getHealth() {
  return request<{ status: string; service: string }>('/health');
}

export function getPlan(planId: string) {
  return request<PlanResponse>(`/plans/${planId}`);
}

export function getDashboard() {
  return request<DashboardResponse>('/dashboard');
}

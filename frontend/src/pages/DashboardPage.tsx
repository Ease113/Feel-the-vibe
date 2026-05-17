import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import type { DashboardResponse } from '../api/types';
import DashboardCharts from '../components/DashboardCharts';

/**
 * KPI 대시보드 페이지.
 *
 * 마운트 시 /dashboard를 호출해 결정 건수, 평균 목적 점수, 위험 전환 수를 표시한다.
 * 데이터 로드 전에는 로딩 플레이스홀더를 렌더링한다.
 */
export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    getDashboard().then(setDashboard).catch(() => setDashboard(null));
  }, []);

  if (!dashboard) {
    return <section className="placeholder">Dashboard API를 기다리는 중입니다.</section>;
  }

  return (
    <section className="dashboard-layout">
      <div className="metric-row">
        <div className="metric">
          <span>Decisions</span>
          <strong>{dashboard.dashboard_summary.decision_count}</strong>
        </div>
        <div className="metric">
          <span>Avg Objective</span>
          <strong>{dashboard.dashboard_summary.average_objective_score.toLocaleString()}</strong>
        </div>
        <div className="metric">
          <span>High Risk</span>
          <strong>{dashboard.dashboard_summary.high_risk_transition_count}</strong>
        </div>
      </div>
      <DashboardCharts data={dashboard.kpi_trend} />
      <p className="summary">{dashboard.weekly_summary}</p>
    </section>
  );
}

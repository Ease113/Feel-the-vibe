import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import type { DashboardResponse } from '../api/types';
import DashboardCharts from '../components/DashboardCharts';

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

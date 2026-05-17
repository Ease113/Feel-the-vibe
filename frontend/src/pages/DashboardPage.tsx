import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';
import type { DashboardResponse } from '../api/types';
import DashboardCharts from '../components/DashboardCharts';

interface RecentDecision {
  decision_id: string;
  plan_id: string;
  objective_score: number;
  risk_warning_count: number;
  reviewed: boolean;
  confirmed_at: string;
}

interface RiskPattern {
  rule_id: string;
  count: number;
}

function fmtScore(v: number) {
  return Math.round(v).toLocaleString() + ' pt';
}

function fmtDatetime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * KPI 대시보드 페이지.
 *
 * GET /dashboard 응답의 요약 지표, 비용 트렌드 차트, 위험 패턴,
 * 최근 확정 로그, 주간 요약을 표시한다.
 */
export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getDashboard()
      .then(setDashboard)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="dash-page">
        <div className="dash-loading">대시보드 데이터를 불러오지 못했습니다.</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="dash-page">
        <div className="dash-loading">대시보드 불러오는 중…</div>
      </div>
    );
  }

  const { dashboard_summary, kpi_trend, risk_patterns, recent_decisions, weekly_summary } = dashboard;
  const patterns = risk_patterns as unknown as RiskPattern[];
  const recents  = recent_decisions as unknown as RecentDecision[];
  const maxCount = patterns.length > 0 ? Math.max(...patterns.map(p => p.count)) : 1;

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-plan">SmartFactory · LINE-01</div>
        <h1 className="dash-title">KPI 대시보드</h1>
      </header>

      {/* 요약 지표 3개 */}
      <div className="dash-summary">
        <div className="dash-kpi">
          <div className="dash-kpi-label">확정 결정 건수</div>
          <div className="dash-kpi-value">{dashboard_summary.decision_count.toLocaleString()}</div>
          <div className="dash-kpi-sub">POST /decisions 저장 기준</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-label">평균 목적 점수</div>
          <div className="dash-kpi-value">
            {dashboard_summary.average_objective_score > 0
              ? fmtScore(dashboard_summary.average_objective_score)
              : '—'}
          </div>
          <div className="dash-kpi-sub">낮을수록 유리</div>
        </div>
        <div className={`dash-kpi${dashboard_summary.high_risk_transition_count > 0 ? ' dash-kpi--warn' : ''}`}>
          <div className="dash-kpi-label">고위험 전환 누적</div>
          <div className="dash-kpi-value">{dashboard_summary.high_risk_transition_count.toLocaleString()}</div>
          <div className="dash-kpi-sub">HIGH severity 기준</div>
        </div>
      </div>

      <div className="dash-body">
        {/* 왼쪽: 비용 트렌드 + 최근 결정 */}
        <div className="dash-main">
          <div>
            <div className="dash-section-title">비용 트렌드</div>
            <DashboardCharts data={kpi_trend} />
          </div>

          <div>
            <div className="dash-section-title">최근 확정 결정</div>
            <div className="recent-box">
              {recents.length === 0 ? (
                <div className="recent-empty">저장된 확정 결정이 없습니다.</div>
              ) : (
                <>
                  <div className="recent-head">
                    <span>Decision ID</span>
                    <span>목적 점수</span>
                    <span>위험</span>
                    <span>확정 시각</span>
                  </div>
                  {recents.map(d => (
                    <div key={d.decision_id} className="recent-row">
                      <span className="recent-id">{d.decision_id.slice(-10)}</span>
                      <span className="recent-score">{fmtScore(d.objective_score)}</span>
                      <span className={d.risk_warning_count > 0 ? 'recent-risk' : ''}>
                        {d.risk_warning_count > 0 ? `${d.risk_warning_count}건` : '—'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {fmtDatetime(d.confirmed_at)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 위험 패턴 + 주간 요약 */}
        <div className="dash-side">
          <div className="pattern-card">
            <div className="pattern-head">반복 위험 패턴</div>
            {patterns.length === 0 ? (
              <p className="pattern-empty">감지된 위험 패턴이 없습니다.</p>
            ) : (
              <ul className="pattern-list">
                {patterns.slice(0, 8).map(p => (
                  <li key={p.rule_id} className="pattern-item">
                    <span className="pattern-rule">{p.rule_id}</span>
                    <span className="pattern-bar-wrap">
                      <span
                        className="pattern-bar"
                        style={{ width: `${Math.round((p.count / maxCount) * 100)}%` }}
                      />
                    </span>
                    <span className="pattern-count">{p.count}건</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="weekly-card">
            <div className="weekly-label">주간 요약</div>
            <p style={{ margin: 0 }}>{weekly_summary}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

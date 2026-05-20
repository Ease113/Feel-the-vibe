import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getDashboard } from '../api/client';
import type { DashboardResponse } from '../api/types';
import DashboardCharts from '../components/DashboardCharts';
import DecisionDetailView from '../components/DecisionDetailView';
import KpiHeatmap from '../components/KpiHeatmap';
import KpiRadarChart from '../components/KpiRadarChart';
import SeverityBadge from '../components/SeverityBadge';
import { getSequenceRuleCopy } from '../utils/sequenceRuleCopy';

const RECENT_PAGE_SIZE = 5;
const MAX_SELECTED = 3;

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

interface SummaryKpiCardProps {
  label: string;
  value: ReactNode;
  sub: string;
  warn?: boolean;
}

function SummaryKpiCard({ label, value, sub, warn }: SummaryKpiCardProps) {
  return (
    <div className={`dash-kpi-card${warn ? ' dash-kpi-card--warn' : ''}`}>
      <div className="dash-kpi-card-head">{label}</div>
      <div className="dash-kpi-card-body">
        <div className="dash-kpi-value">{value}</div>
        <div className="dash-kpi-sub">{sub}</div>
      </div>
    </div>
  );
}

/**
 * KPI 대시보드 페이지.
 *
 * GET /dashboard 응답의 요약 지표, 비용 추이 차트(BarChart), 히트맵,
 * 선택 비교(RadarChart), 위험 패턴, 최근 확정 로그, 주간 요약을 표시한다.
 */
export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [recentPage, setRecentPage] = useState(1);
  const [error, setError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [openDecisionId, setOpenDecisionId] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  const loadDashboard = useCallback((page: number) => {
    return getDashboard({ recentPage: page, recentPageSize: RECENT_PAGE_SIZE })
      .then(data => {
        setDashboard(data);
        setRecentPage(data.recent_decisions_meta?.page ?? page);
        setError(false);
      });
  }, []);

  useEffect(() => {
    loadDashboard(1).catch(() => setError(true));
  }, [loadDashboard]);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  };

  const removeId = (id: string) => setSelectedIds(prev => prev.filter(x => x !== id));

  const toggleRulePattern = (ruleId: string) => {
    setExpandedRuleId(prev => (prev === ruleId ? null : ruleId));
  };

  const addToCompare = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev;
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  };

  const openDecisionDetail = (id: string) => {
    addToCompare(id);
    setOpenDecisionId(id);
  };

  const goRecentPage = (page: number) => {
    setRecentLoading(true);
    loadDashboard(page)
      .catch(() => setError(true))
      .finally(() => setRecentLoading(false));
  };

  const handleReviewedChange = (id: string, reviewed: boolean) => {
    setDashboard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        recent_decisions: prev.recent_decisions.map(d =>
          d.decision_id === id ? { ...d, reviewed } : d,
        ),
      };
    });
  };

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

  const {
    dashboard_summary,
    kpi_trend,
    risk_patterns,
    recent_decisions,
    recent_decisions_meta,
    weekly_summary,
  } = dashboard;
  const patterns = risk_patterns as unknown as RiskPattern[];
  const recents = recent_decisions;
  const recentMeta = recent_decisions_meta ?? {
    page: recentPage,
    page_size: RECENT_PAGE_SIZE,
    total: recent_decisions.length,
    total_pages: 1,
  };
  const maxCount = patterns.length > 0 ? Math.max(...patterns.map(p => p.count)) : 1;
  const showRecentPager = recentMeta.total > 0;

  return (
    <>
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-plan">SmartFactory · LINE-01</div>
        <h1 className="dash-title">KPI 대시보드</h1>
      </header>

      <div className="dash-summary">
        <SummaryKpiCard
          label="확정 결정 건수"
          value={dashboard_summary.decision_count.toLocaleString()}
          sub="POST /decisions 저장 기준"
        />
        <SummaryKpiCard
          label="평균 목적 점수"
          value={
            dashboard_summary.average_objective_score > 0
              ? fmtScore(dashboard_summary.average_objective_score)
              : '—'
          }
          sub="낮을수록 유리"
        />
        <SummaryKpiCard
          label="고위험 전환 누적"
          value={dashboard_summary.high_risk_transition_count.toLocaleString()}
          sub="HIGH severity 기준"
          warn={dashboard_summary.high_risk_transition_count > 0}
        />
      </div>

      <div className="dash-body">
        {/* 왼쪽: 차트 영역 + 최근 결정 */}
        <div className="dash-main">

          {/* BarChart — 판단의 중심 */}
          <div className="dash-card">
            <div className="dash-card-head">7차원 비용 추이</div>
            <DashboardCharts
              data={kpi_trend}
              selectedIds={selectedIds}
              onToggleId={toggleId}
            />
          </div>

          {/* Heatmap — 비교 대상 선택 흐름 */}
          <div className="compare-flow-panel">
            <button
              type="button"
              className="compare-flow-trigger"
              onClick={() => setHeatmapOpen(o => !o)}
              aria-expanded={heatmapOpen}
            >
              <span className="compare-flow-main">
                <span className="compare-flow-icon" aria-hidden="true">
                  {heatmapOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
                <span>
                  <span className="compare-flow-title">
                    히스토리 비교 선택
                    <span className="compare-flow-preview" aria-hidden="true" />
                  </span>
                  <span className="compare-flow-sub">
                    히트맵 또는 아래 최근 확정 결정에서 고르면 비교 선택에 반영됩니다.
                  </span>
                </span>
              </span>
              <span className={`compare-flow-badge${selectedIds.length >= 2 ? ' compare-flow-badge--ready' : ''}`}>
                {selectedIds.length}/3 선택
              </span>
            </button>

            {heatmapOpen && (
              <div className="compare-flow-body">
                <div className="compare-flow-status">
                  {selectedIds.length === 0 && '히트맵에서 결정 하나를 선택하세요.'}
                  {selectedIds.length === 1 && '선택한 결정의 7차원 프로파일입니다. 하나 더 선택하면 비교로 확장됩니다.'}
                  {selectedIds.length >= 2 && '선택 결정 비교가 준비됐습니다. 아래에서 차원별 차이를 확인하세요.'}
                </div>
                <KpiHeatmap
                  data={kpi_trend}
                  selectedIds={selectedIds}
                  onToggleId={toggleId}
                />

                <KpiRadarChart
                  data={kpi_trend}
                  selectedIds={selectedIds}
                  onRemoveId={removeId}
                  embedded
                />
              </div>
            )}
          </div>

          {/* 최근 확정 결정 */}
          <div
            className={`recent-box${recentLoading ? ' recent-box--loading' : ''}`}
            aria-busy={recentLoading}
          >
            <div className="dash-card-head">
              <span>최근 확정 결정</span>
              {showRecentPager && (
                <div className="recent-pager">
                  <button
                    type="button"
                    className="recent-pager-btn"
                    disabled={recentLoading || recentPage <= 1}
                    onClick={() => goRecentPage(recentPage - 1)}
                    aria-label="이전 페이지"
                  >
                    이전
                  </button>
                  <span className="recent-pager-info">
                    {recentMeta.page} / {recentMeta.total_pages}
                    <span className="recent-pager-total">({recentMeta.total}건)</span>
                  </span>
                  <button
                    type="button"
                    className="recent-pager-btn"
                    disabled={recentLoading || recentPage >= recentMeta.total_pages}
                    onClick={() => goRecentPage(recentPage + 1)}
                    aria-label="다음 페이지"
                  >
                    다음
                  </button>
                </div>
              )}
            </div>
            {recentLoading && (
              <div className="recent-loading" role="status">목록 불러오는 중…</div>
            )}
            {recents.length === 0 ? (
              <div className="recent-empty">저장된 확정 결정이 없습니다.</div>
            ) : (
              <table className="recent-table">
                  <caption className="sr-only">최근 확정 결정 목록. 행을 선택하면 상세를 열고 비교 선택에 추가됩니다.</caption>
                  <thead>
                    <tr>
                      <th scope="col">결정 ID</th>
                      <th scope="col">계획</th>
                      <th scope="col">목적 점수</th>
                      <th scope="col">룰 경고</th>
                      <th scope="col">검토</th>
                      <th scope="col">확정 시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recents.map(d => {
                      const isSelected = selectedIds.includes(d.decision_id);
                      return (
                        <tr
                          key={d.decision_id}
                          className={`recent-row${isSelected ? ' recent-row--selected' : ''}`}
                          tabIndex={0}
                          aria-selected={isSelected}
                          onClick={() => openDecisionDetail(d.decision_id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDecisionDetail(d.decision_id);
                            }
                          }}
                        >
                          <td className="recent-cell-id" title={d.decision_id}>
                            {d.decision_id}
                          </td>
                          <td className="recent-plan" title={d.plan_id}>{d.plan_id}</td>
                          <td className="recent-score">{fmtScore(d.objective_score)}</td>
                          <td className={d.risk_warning_count > 0 ? 'recent-risk' : ''}>
                            {d.risk_warning_count > 0 ? `${d.risk_warning_count}건` : '—'}
                          </td>
                          <td className="recent-reviewed">
                            <span
                              className={d.reviewed ? 'reviewed-dot' : 'unreviewed-dot'}
                              aria-hidden
                            />
                            <span>{d.reviewed ? '완료' : '대기'}</span>
                          </td>
                          <td className="recent-datetime">{fmtDatetime(d.confirmed_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 오른쪽: 위험 패턴 + 주간 요약 */}
        <div className="dash-side">
          <div className="pattern-card">
            <div className="dash-card-head">반복 위험 패턴</div>
            {patterns.length === 0 ? (
              <p className="pattern-empty">감지된 위험 패턴이 없습니다.</p>
            ) : (
              <ul className="pattern-list">
                {patterns.slice(0, 8).map(p => {
                  const isOpen = expandedRuleId === p.rule_id;
                  const copy = getSequenceRuleCopy(p.rule_id);
                  const detailId = `pattern-detail-${p.rule_id}`;
                  return (
                    <li key={p.rule_id} className="pattern-row">
                      <button
                        type="button"
                        className={`pattern-item${isOpen ? ' pattern-item--open' : ''}`}
                        onClick={() => toggleRulePattern(p.rule_id)}
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                      >
                        <span className="pattern-rule">{p.rule_id}</span>
                        <span className="pattern-bar-wrap">
                          <span
                            className="pattern-bar"
                            style={{ width: `${Math.round((p.count / maxCount) * 100)}%` }}
                          />
                        </span>
                        <span className="pattern-count">{p.count}건</span>
                        <span className="pattern-chevron" aria-hidden="true">
                          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </span>
                      </button>
                      {isOpen && (
                        <div id={detailId} className="pattern-detail" role="region">
                          {copy ? (
                            <>
                              <div className="pattern-detail-head">
                                <SeverityBadge severity={copy.severity} />
                                <span className="pattern-detail-label">위험 원인</span>
                              </div>
                              <p className="warn-message">{copy.reason}</p>
                              <p
                                className={`warn-rec${copy.severity === 'HIGH' ? ' warn-rec--high' : ''}`}
                              >
                                {copy.recommendation}
                              </p>
                            </>
                          ) : (
                            <p className="pattern-detail-fallback">
                              {p.rule_id} 룰 설명을 찾을 수 없습니다.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
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

    {openDecisionId && (
      <DecisionDetailView
        decisionId={openDecisionId}
        onClose={() => setOpenDecisionId(null)}
        onReviewedChange={handleReviewedChange}
      />
    )}
    </>
  );
}

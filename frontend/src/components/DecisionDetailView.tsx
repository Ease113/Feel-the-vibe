import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiRequestError, getDecision, getPlan, patchDecisionReviewed } from '../api/client';
import type { DecisionDetailRaw, OperatorPriorityDimension, PlanItem } from '../api/types';
import { OPERATOR_PRIORITY_DIMENSIONS, PRIORITY_LABEL_KO } from '../api/types';
import SeverityBadge from './SeverityBadge';

const COST_DIM_KO: Record<string, string> = {
  setup_time:      '셋업 시간',
  labor_cost:      '작업자 비용',
  material_loss:   '원자재 손실',
  wash_cost:       '세척 비용',
  downtime:        '다운타임',
  sequence_risk:   '순서 위험',
  packaging_time:  '패키징 전환',
};

const PRIORITY_AXIS_KO: Record<OperatorPriorityDimension, string> = {
  wash_cost:      '세척 비용',
  downtime:       '다운타임',
  material_loss:  '원자재 손실',
  packaging_time: '패키징 전환',
  labor_cost:     '작업자 비용',
};

function fmtDatetime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtScore(v: number) {
  return Math.round(v).toLocaleString() + ' pt';
}

function fmtDiffRate(rate: number) {
  const pct = (rate * 100).toFixed(1);
  return rate >= 0 ? `+${pct}%` : `${pct}%`;
}

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function seqPos(seq: string[], id: string): number {
  return seq.indexOf(id) + 1;
}

interface Props {
  decisionId: string;
  onClose: () => void;
  onReviewedChange?: (decisionId: string, reviewed: boolean) => void;
}

/**
 * 확정 의사결정 상세 뷰 — 오른쪽 슬라이드 드로어.
 *
 * GET /decisions/{decision_id} 로 스냅샷을 불러와
 * 확정 순서·비교 요약·위험 전환·판단 근거·7차원 비용을 표시한다.
 */
type LoadError = 'not_found' | 'network' | null;

export default function DecisionDetailView({ decisionId, onClose, onReviewedChange }: Props) {
  const [detail, setDetail] = useState<DecisionDetailRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [planItems, setPlanItems] = useState<Map<string, PlanItem>>(new Map());
  const [costOpen, setCostOpen] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    setPlanItems(new Map());
    getDecision(decisionId)
      .then(data => { setDetail(data); setLoading(false); })
      .catch(err => {
        setLoadError(
          err instanceof ApiRequestError && err.status === 404 ? 'not_found' : 'network',
        );
        setLoading(false);
      });
  }, [decisionId, reloadKey]);

  useEffect(() => {
    if (!detail?.plan_id) return;
    getPlan(detail.plan_id)
      .then(data => {
        setPlanItems(new Map(data.planItems.map(item => [item.planItemId, item])));
      })
      .catch(() => setPlanItems(new Map()));
  }, [detail?.plan_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cs = detail?.comparison_state;
  const isWorse = cs != null && cs.diff > 0;
  const sameSeq = detail
    ? arraysEqual(detail.recommended_sequence, detail.confirmed_sequence)
    : false;

  const handleReviewedToggle = async (next: boolean) => {
    if (!detail || reviewSaving) return;
    const prev = detail.reviewed;
    setReviewError(false);
    setDetail({ ...detail, reviewed: next });
    setReviewSaving(true);
    try {
      await patchDecisionReviewed(decisionId, next);
      const refreshed = await getDecision(decisionId);
      setDetail(refreshed);
      onReviewedChange?.(decisionId, refreshed.reviewed);
    } catch {
      setDetail({ ...detail, reviewed: prev });
      setReviewError(true);
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <div className="decision-drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="decision-drawer"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* 헤더 */}
        <div className="drawer-hd">
          <div>
            <div className="drawer-title" id="drawer-title">확정된 생산 순서</div>
            {detail && (
              <div className="drawer-meta">
                <span className="commit-result-modal__id">{detail.decision_id}</span>
                <span className="drawer-meta-time">{fmtDatetime(detail.confirmed_at)}</span>
              </div>
            )}
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 바디 */}
        <div className="drawer-body">
          {loading && <div className="drawer-loading">불러오는 중…</div>}
          {loadError === 'not_found' && (
            <div className="drawer-error">
              <p>해당 결정 로그를 찾을 수 없습니다.</p>
              <button type="button" className="drawer-error-btn" onClick={onClose}>
                닫기
              </button>
            </div>
          )}
          {loadError === 'network' && (
            <div className="drawer-error">
              <p>결정 상세를 불러오지 못했습니다.</p>
              <button
                type="button"
                className="drawer-error-btn"
                onClick={() => setReloadKey(k => k + 1)}
              >
                재시도
              </button>
            </div>
          )}

          {detail && cs && (
            <>
              {/* 1. 핵심 요약 */}
              <div className="drawer-section">
                <p className="drawer-summary">{detail.comparison_summary}</p>
                <div className="drawer-score-row">
                  <div className="drawer-score-card">
                    <div className="drawer-score-label">종합 점수</div>
                    <div className="drawer-score-val">{fmtScore(detail.objective_score)}</div>
                  </div>
                  <div className={`drawer-score-card${isWorse ? ' drawer-score-card--warn' : ' drawer-score-card--ok'}`}>
                    <div className="drawer-score-label">추천안 대비</div>
                    <div className="drawer-score-val">{fmtDiffRate(cs.diff_rate)}</div>
                  </div>
                  {detail.violation_count > 0 && (
                    <div className="drawer-score-card drawer-score-card--warn">
                      <div className="drawer-score-label">고위험 전환</div>
                      <div className="drawer-score-val">{detail.violation_count}건</div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 확정 순서 */}
              <div className="drawer-section">
                <div className="drawer-section-title">확정 순서</div>
                <div className="drawer-seq">
                  {detail.confirmed_sequence.map((id, i) => {
                    const item = planItems.get(id);
                    return (
                      <span key={id} className="drawer-seq-item">
                        {i > 0 && <span className="drawer-seq-arrow" aria-hidden>→</span>}
                        <span className="drawer-seq-chip">
                          <span className="drawer-seq-ord">{i + 1}</span>
                          {item ? (
                            <>
                              <span
                                className="drawer-seq-dot"
                                style={{ backgroundColor: item.hexCode }}
                                aria-hidden
                              />
                              <span className="drawer-seq-name">
                                {item.skuName} {item.quantity}L
                              </span>
                            </>
                          ) : (
                            <span className="drawer-seq-fallback">{id}</span>
                          )}
                        </span>
                      </span>
                    );
                  })}
                </div>
                {sameSeq
                  ? <p className="drawer-note">추천 순서와 동일하게 확정되었습니다.</p>
                  : <p className="drawer-note drawer-note--warn">추천 순서와 다르게 확정되었습니다.</p>
                }
              </div>

              {/* 3. 판단 근거 */}
              <div className="drawer-section">
                <div className="drawer-section-title">판단 근거</div>
                <div className="drawer-basis-grid">
                  <span className="drawer-basis-key">라인</span>
                  <span>{detail.context_snapshot?.visible?.lineId ?? '—'}</span>
                  <span className="drawer-basis-key">근무조</span>
                  <span>{detail.context_snapshot?.visible?.shift === 'day' ? '주간' : '야간'}</span>
                  <span className="drawer-basis-key">인원</span>
                  <span>{detail.context_snapshot?.visible?.crewSize ?? '—'}명</span>
                </div>

                {OPERATOR_PRIORITY_DIMENSIONS.length > 0 && detail.priority_profile?.priorities && (
                  <div className="drawer-basis-grid">
                    {OPERATOR_PRIORITY_DIMENSIONS.map(dim => {
                      const entry = detail.priority_profile.priorities[dim];
                      if (!entry) return null;
                      return (
                        <>
                          <span key={`k-${dim}`} className="drawer-basis-key">{PRIORITY_AXIS_KO[dim]}</span>
                          <span key={`v-${dim}`}>{PRIORITY_LABEL_KO[entry.label]}</span>
                        </>
                      );
                    })}
                  </div>
                )}

                {detail.decision_memo && (
                  <div className="drawer-memo">
                    <span className="drawer-basis-key">확정 메모</span>
                    <p className="drawer-memo-text">{detail.decision_memo}</p>
                  </div>
                )}
              </div>

              {/* 4. 위험 전환 */}
              {detail.violation_details.length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">위험 전환</div>
                  <ul className="drawer-violations">
                    {detail.violation_details.map((v, i) => {
                      const fromPos = seqPos(detail.confirmed_sequence, v.from_plan_item_id);
                      const toPos   = seqPos(detail.confirmed_sequence, v.to_plan_item_id);
                      return (
                        <li key={i} className="drawer-violation-item">
                          <div className="drawer-violation-hd">
                            <SeverityBadge severity={v.severity} />
                            <span className="drawer-violation-rule">{v.rule_id}</span>
                            {fromPos > 0 && toPos > 0 && (
                              <span className="drawer-violation-pos">#{fromPos} → #{toPos}</span>
                            )}
                          </div>
                          <p className="warn-message">{v.message}</p>
                          <p className={`warn-rec${v.severity === 'HIGH' ? ' warn-rec--high' : ''}`}>
                            {v.recommendation}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* 5. 7차원 비용 (접기 기본) */}
              {detail.cost_delta_vs_recommended && (
                <div className="drawer-section">
                  <button
                    type="button"
                    className="drawer-collapse-btn"
                    onClick={() => setCostOpen(o => !o)}
                    aria-expanded={costOpen}
                  >
                    <span>7차원 비용 상세 (추천 대비 증감)</span>
                    <span>{costOpen ? '접기' : '펼치기'}</span>
                  </button>
                  {costOpen && (
                    <div className="drawer-cost-grid">
                      {Object.entries(detail.cost_delta_vs_recommended)
                        .filter(([, v]) => v != null)
                        .map(([k, v]) => {
                          const val = v as number;
                          const cls = val > 0 ? ' drawer-cost-delta--worse'
                            : val < 0 ? ' drawer-cost-delta--better'
                            : '';
                          return (
                            <div key={k} className="drawer-cost-row">
                              <span className="drawer-cost-dim">{COST_DIM_KO[k] ?? k}</span>
                              <span className={`drawer-cost-delta${cls}`}>
                                {val > 0 ? '+' : ''}{val.toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="drawer-ft">
          {detail && (
            <label className="drawer-reviewed-toggle">
              <input
                type="checkbox"
                checked={detail.reviewed}
                disabled={reviewSaving}
                onChange={e => void handleReviewedToggle(e.target.checked)}
              />
              <span>검토 완료</span>
            </label>
          )}
          {reviewError && (
            <span className="drawer-review-error" role="alert">
              검토 상태를 저장하지 못했습니다.
            </span>
          )}
          <button type="button" className="btn-commit-result-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

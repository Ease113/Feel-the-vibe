import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PlanItem, RiskWarning, TransitionCost, WarningSeverity } from '../api/types';

function fmtPt(v: number) { return `${Math.round(v).toLocaleString()} pt`; }
function fmtMin(v: number) { return `${v.toFixed(1)}분`; }

function SevBadge({ severity }: { severity: WarningSeverity }) {
  if (severity === 'HIGH') return <span className="risk-pill">HIGH</span>;
  if (severity === 'MEDIUM') return <span className="badge-med">MED</span>;
  return <span className="badge-low">LOW</span>;
}

interface Props {
  planItems: PlanItem[];
  currentSequence: string[];
  transitionCosts: TransitionCost[];
  /** rule engine soft warnings — 푸터 「rule 경고」건수는 이 배열 길이 기준 */
  riskWarnings: RiskWarning[];
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onReset: () => void;
}

/**
 * 인접 전환 분석 테이블.
 *
 * currentSequence 순서에 따라 transitionCosts를 정렬해 표시한다.
 * 행 클릭 시 상세(세척 비용·다운타임·품질 리스크·권장 조치) 펼침.
 * 푸터 rule 경고 건수 = risk_warnings.length (transition_costs severity 집계와 분리).
 * 하단 ActionFooter (AI 추천 순서로 되돌리기)를 포함한다.
 */
export default function TransitionAnalysisTable({
  planItems,
  currentSequence,
  transitionCosts,
  riskWarnings,
  selectedKey,
  onSelectKey,
  onReset,
}: Props) {
  const itemMap = new Map(planItems.map(i => [i.planItemId, i]));

  // currentSequence 순서를 기준으로 transitionCosts 정렬
  const orderedCosts = [...transitionCosts].sort((a, b) => {
    const ai = currentSequence.indexOf(a.fromPlanItemId);
    const bi = currentSequence.indexOf(b.fromPlanItemId);
    return ai - bi;
  });

  function rowKey(t: TransitionCost) {
    return `${t.fromPlanItemId}->${t.toPlanItemId}`;
  }

  function handleRowClick(t: TransitionCost) {
    const k = rowKey(t);
    onSelectKey(selectedKey === k ? null : k);
  }

  if (transitionCosts.length === 0) {
    return (
      <section className="trans-section" aria-label="전환 분석">
        <div className="section-hd">
          <div>
            <h2 className="section-lbl">전환 분석</h2>
            <p className="section-sub">행을 눌러 상세 비용·권장 조치 확인</p>
          </div>
        </div>
        <div className="trans-box">
          <div className="tbl-foot">전환 데이터 없음</div>
        </div>
      </section>
    );
  }

  return (
    <section className="trans-section" aria-label="전환 분석">
      <div className="section-hd">
        <div>
          <h2 className="section-lbl">전환 분석</h2>
          <p className="section-sub">행을 눌러 상세 비용·권장 조치 확인</p>
        </div>
      </div>

      <div className="trans-box">
        <div className="tbl-head">
          <span>전환</span>
          <span>셋업</span>
          <span>세척 비용</span>
          <span>다운타임</span>
          <span>위험도</span>
          <span />
        </div>

        {orderedCosts.map(tc => {
          const k = rowKey(tc);
          const isOpen = selectedKey === k;
          const isHighlight = tc.severity === 'HIGH' || tc.severity === 'MEDIUM';
          const fromName = itemMap.get(tc.fromPlanItemId)?.skuName ?? tc.fromPlanItemId;
          const toName   = itemMap.get(tc.toPlanItemId)?.skuName ?? tc.toPlanItemId;

          return (
            <div key={k}>
              <div
                className={`tbl-row${isOpen ? ' exp' : ''}${isHighlight ? ' highlight' : ''}`}
                onClick={() => handleRowClick(tc)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && handleRowClick(tc)}
                aria-expanded={isOpen}
              >
                <span>{fromName} → {toName}</span>
                <span>{fmtMin(tc.costDimensions.setupTime)}</span>
                <span>{fmtPt(tc.costDimensions.washCost)}</span>
                <span>{fmtMin(tc.costDimensions.downtime)}</span>
                <span><SevBadge severity={tc.severity} /></span>
                <span className="tbl-chevron">
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
              </div>

              {isOpen && (
                <div className="exp-detail">
                  <div className="exp-item">
                    <div className="exp-lbl">세척 비용</div>
                    <div className="exp-val">{fmtPt(tc.costDimensions.washCost)}</div>
                  </div>
                  <div className="exp-item">
                    <div className="exp-lbl">다운타임</div>
                    <div className="exp-val">{fmtMin(tc.costDimensions.downtime)}</div>
                  </div>
                  <div className="exp-item">
                    <div className="exp-lbl">품질 리스크</div>
                    <div className="exp-val">
                      {tc.warning ? `${tc.warning.ruleId} · ${tc.severity}` : `${tc.ruleId} · ${tc.severity}`}
                    </div>
                  </div>
                  <div className="exp-item">
                    <div className="exp-lbl">권장 조치</div>
                    <div className="exp-val">
                      {tc.warning?.recommendation ?? '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="tbl-foot">
          인접 전환 {transitionCosts.length}건 · rule 경고 {riskWarnings.length}건
        </div>
      </div>

      <div className="action-footer">
        <button type="button" className="btn-reset" onClick={onReset}>
          AI 추천 순서로 되돌리기
        </button>
      </div>
    </section>
  );
}

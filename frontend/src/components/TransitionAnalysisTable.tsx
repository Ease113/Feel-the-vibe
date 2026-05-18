import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  AppliedWeights,
  PlanItem,
  RiskWarning,
  TransitionCost,
  WarningSeverity,
} from '../api/types';
import { SEVERITY_UI } from '../api/types';
import {
  computeTransitionWeightedCost,
  formatLiters,
  formatMinutes,
  formatScore,
  formatWon,
} from '../utils/costFormat';

function SevBadge({ severity }: { severity: WarningSeverity | null }) {
  if (severity === null) return <span className="badge-low">—</span>;
  if (severity === 'HIGH') return <span className="risk-pill">HIGH</span>;
  if (severity === 'MEDIUM') return <span className="badge-med">MED</span>;
  return <span className="badge-low">LOW</span>;
}

function buildTableFooter(transitionCount: number, riskWarnings: RiskWarning[]): string {
  return `인접 전환 ${transitionCount}건 · rule 경고 ${riskWarnings.length}건`;
}

interface Props {
  planItems: PlanItem[];
  currentSequence: string[];
  transitionCosts: TransitionCost[];
  riskWarnings: RiskWarning[];
  appliedWeights: AppliedWeights | null;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onReset: () => void;
}

/**
 * 인접 전환 분석 테이블 (6D costVector + 위험도).
 *
 * 펼침 상세: weightedCost, sequencePenalty, objectiveCost, ruleRisk, 권장 조치.
 * 초기화 버튼: currentSequence ← recommendedSequence 후 /predict 1회 (§7).
 */
export default function TransitionAnalysisTable({
  planItems,
  currentSequence,
  transitionCosts,
  riskWarnings,
  appliedWeights,
  selectedKey,
  onSelectKey,
  onReset,
}: Props) {
  const itemMap = new Map(planItems.map(i => [i.planItemId, i]));

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

  const sectionSub =
    '행을 눌러 상세 비용·권장 조치 확인 · 단위: 비용(원) / 시간(분) / 손실(L)';

  if (transitionCosts.length === 0) {
    return (
      <section className="trans-section" aria-label="전환 분석">
        <div className="section-hd">
          <div>
            <h2 className="section-lbl">전환 분석</h2>
            <p className="section-sub">{sectionSub}</p>
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
      <div className="trans-box">
        <div className="section-hd">
          <div>
            <h2 className="section-lbl">전환 분석</h2>
            <p className="section-sub">{sectionSub}</p>
          </div>
          <button type="button" className="btn-reset" onClick={onReset}>
            추천 순서로 초기화
          </button>
        </div>

        <div className="tbl-wrap">
          <div className="tbl-head tbl-head--wide">
            <span>전환</span>
            <span>셋업(분)</span>
            <span>세척비용(원)</span>
            <span>다운타임(분)</span>
            <span>인건비(원)</span>
            <span>원자재손실(L)</span>
            <span>패키징(분)</span>
            <span>위험도</span>
            <span />
          </div>

          {orderedCosts.map(tc => {
            const k = rowKey(tc);
            const isOpen = selectedKey === k;
            const isHighlight = tc.severity === 'HIGH' || tc.severity === 'MEDIUM';
            const fromName = itemMap.get(tc.fromPlanItemId)?.skuName ?? tc.fromPlanItemId;
            const toName = itemMap.get(tc.toPlanItemId)?.skuName ?? tc.toPlanItemId;
            const dims = tc.costDimensions;
            const weightedCost =
              appliedWeights !== null
                ? computeTransitionWeightedCost(dims, appliedWeights)
                : null;
            const objectiveCost =
              weightedCost !== null ? weightedCost + tc.sequencePenalty : null;
            const uiSev = tc.severity ? SEVERITY_UI[tc.severity] : '없음';

            return (
              <div key={k}>
                <div
                  className={`tbl-row tbl-row--wide${isOpen ? ' exp' : ''}${isHighlight ? ' highlight' : ''}`}
                  onClick={() => handleRowClick(tc)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleRowClick(tc)}
                  aria-expanded={isOpen}
                >
                  <span>{fromName} → {toName}</span>
                  <span>{formatMinutes(dims.setupTime)}</span>
                  <span>{formatWon(dims.washCost)}</span>
                  <span>{formatMinutes(dims.downtime)}</span>
                  <span>{formatWon(dims.laborCost)}</span>
                  <span>{formatLiters(dims.materialLoss)}</span>
                  <span>{formatMinutes(dims.packagingTime)}</span>
                  <span><SevBadge severity={tc.severity} /></span>
                  <span className="tbl-chevron">
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                </div>

                {isOpen && (
                  <div className="exp-detail exp-detail--wide">
                    <div className="exp-item">
                      <div className="exp-lbl">가중 비용</div>
                      <div className="exp-val exp-val--mono">
                        {weightedCost !== null ? formatScore(weightedCost) : '—'}
                      </div>
                    </div>
                    <div className="exp-item">
                      <div className="exp-lbl">순서 패널티</div>
                      <div className="exp-val exp-val--mono">
                        {formatScore(tc.sequencePenalty)}
                      </div>
                    </div>
                    <div className="exp-item">
                      <div className="exp-lbl">전환 점수</div>
                      <div className="exp-val exp-val--mono">
                        {objectiveCost !== null ? formatScore(objectiveCost) : '—'}
                      </div>
                    </div>
                    <div className="exp-item">
                      <div className="exp-lbl">품질 리스크</div>
                      <div className="exp-val">
                        {tc.warning
                          ? `${tc.warning.ruleId} · ${uiSev} · penalty ${Math.round(tc.warning.penalty)}`
                          : `규칙 없음 · ${uiSev}`}
                      </div>
                    </div>
                    <div className="exp-item exp-item--wide">
                      <div className="exp-lbl">권장 조치</div>
                      <div className="exp-val exp-val--rec">
                        {tc.warning?.recommendation ?? '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="tbl-foot">
            {buildTableFooter(transitionCosts.length, riskWarnings)}
          </div>
        </div>
      </div>
    </section>
  );
}

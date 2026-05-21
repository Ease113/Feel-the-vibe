import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { OperatingContext, PriorityLabel, PriorityProfile } from '../api/types';
import InfoTip from './InfoTip';
import {
  PRIORITY_AXIS_KO,
  PRIORITY_LABEL_KO,
  PRIORITY_MULTIPLIER,
} from '../api/types';

const PRIORITY_LABELS: PriorityLabel[] = ['VERY_LOW', 'LOW', 'NORMAL', 'HIGH', 'VERY_HIGH'];
const PRIORITY_AXES = Object.keys(PRIORITY_AXIS_KO) as Array<keyof PriorityProfile['priorities']>;

/** 요약 칩용 짧은 축 이름 */
const PRIORITY_AXIS_CHIP_KO: Record<keyof PriorityProfile['priorities'], string> = {
  washCost: '세척',
  downtime: '다운타임',
  materialLoss: '원자재',
  packagingTime: '패키징',
  laborCost: '작업자',
};

interface PriorityChip {
  key: string;
  text: string;
  highlighted: boolean;
}

interface Props {
  operatingContext: OperatingContext;
  priorityProfile: PriorityProfile;
  isExpanded: boolean;
  isPredicting?: boolean;
  onToggle: () => void;
  onPriorityChange: (profile: PriorityProfile) => void;
  onOperatingContextChange?: (ctx: OperatingContext) => void;
}

/** NORMAL이 아닌 축을 요약 칩으로 반환 (5축 전부 반영) */
function priorityChips(profile: PriorityProfile): PriorityChip[] {
  return PRIORITY_AXES
    .filter(key => profile.priorities[key].label !== 'NORMAL')
    .map(key => {
      const { label } = profile.priorities[key];
      return {
        key,
        text: `${PRIORITY_AXIS_CHIP_KO[key]} ${PRIORITY_LABEL_KO[label]}`,
        highlighted: profile.priorities[key].multiplier > 1.0,
      };
    });
}

/**
 * 평가 조건 패널 — 운영 컨텍스트 + 5축 Likert 우선순위.
 *
 * 헤더: 교대·인원·주요 우선순위 요약 칩 (접힘 상태에서도 표시).
 * 본문: 2열 — 운영 컨텍스트 | Likert 우선순위.
 */
export default function EvaluationConditionsPanel({
  operatingContext,
  priorityProfile,
  isExpanded,
  isPredicting = false,
  onToggle,
  onPriorityChange,
  onOperatingContextChange,
}: Props) {
  const [shift, setShift] = useState<OperatingContext['shift']>(operatingContext.shift);
  const [crewSize, setCrewSize] = useState(operatingContext.crewSize);

  function handlePrioritySelect(axis: keyof PriorityProfile['priorities'], label: PriorityLabel) {
    onPriorityChange({
      ...priorityProfile,
      priorities: {
        ...priorityProfile.priorities,
        [axis]: { label, multiplier: PRIORITY_MULTIPLIER[label] },
      },
    });
  }

  function handleShiftChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as OperatingContext['shift'];
    setShift(next);
    onOperatingContextChange?.({ ...operatingContext, shift: next });
  }

  function handleCrewChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value);
    setCrewSize(next);
    onOperatingContextChange?.({ ...operatingContext, crewSize: next });
  }

  function handleSummaryClick(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault();
    onToggle();
  }

  const chips = priorityChips(priorityProfile);
  const shiftLabel = shift === 'day' ? '주간' : '야간';

  return (
    <section className="eval-panel" aria-label="평가 조건">
      <details className="eval-details" open={isExpanded}>
        <summary className="eval-summary" onClick={handleSummaryClick}>
          <div className="eval-summary-main">
            <span className="eval-summary-title">평가 조건</span>
            <div className="eval-chips">
              <span className="eval-chip">{shiftLabel} · {crewSize}명</span>
              {chips.map(c => (
                <span
                  key={c.key}
                  className={`eval-chip${c.highlighted ? ' eval-chip--hi' : ''}`}
                >
                  {c.text}
                </span>
              ))}
            </div>
          </div>
          <span className="eval-chevron" aria-hidden="true">
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </summary>

        <div className="eval-body">
          <div className="eval-cols-2">
            <div className="eval-col eval-col--ctx">
              <div className="eval-sec-lbl">
                운영 컨텍스트
                <InfoTip label="운영 컨텍스트 상세">
                  lineId 표시, shift·crewSize 선택.
                  workerSkill·equipmentCondition 등 hidden 피처는 서버 처리.
                </InfoTip>
              </div>
              <div className="likert-grid-hd eval-ctx-hd-spacer" aria-hidden="true">
                <div className="likert-grid-hd-spacer" />
                <div className="likert-labels">
                  {PRIORITY_LABELS.map(lbl => (
                    <span key={lbl}>{PRIORITY_LABEL_KO[lbl]}</span>
                  ))}
                </div>
              </div>
              <div className="eval-ctx-row">
                <span className="eval-ctx-plan">{operatingContext.lineId}</span>
                <span className="ctx-field">
                  <label htmlFor="eval-shift">교대</label>
                  <select id="eval-shift" value={shift} onChange={handleShiftChange}>
                    <option value="day">주간</option>
                    <option value="night">야간</option>
                  </select>
                </span>
                <span className="ctx-field">
                  <label htmlFor="eval-crew">투입 인원</label>
                  <select id="eval-crew" value={crewSize} onChange={handleCrewChange}>
                    {[2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </span>
              </div>
            </div>

            <div className="eval-col">
              <div className="eval-sec-lbl">
                운영 우선순위
                <InfoTip label="운영 우선순위 상세">
                  VERY_LOW(×0.70) / LOW(×0.85) / NORMAL(×1.00) / HIGH(×1.15) / VERY_HIGH(×1.30).
                  appliedWeights는 서버 재정규화.
                  필드: washCost, downtime, materialLoss, packagingTime, laborCost.
                  setupTime은 선택 제외 · 내부 appliedWeights 계산에 포함.
                </InfoTip>
              </div>

              <div className="pri-likert-wrap">
                <div className="likert-grid-hd" aria-hidden="true">
                  <div className="likert-grid-hd-spacer" />
                  <div className="likert-labels">
                    {PRIORITY_LABELS.map(lbl => (
                      <span key={lbl}>{PRIORITY_LABEL_KO[lbl]}</span>
                    ))}
                  </div>
                </div>

                {PRIORITY_AXES.map(axis => {
                  const current = priorityProfile.priorities[axis];
                  return (
                    <div key={axis} className="pri-block likert-row">
                      <div className="pri-lbl-col">
                        <div className="pri-lbl">{PRIORITY_AXIS_KO[axis]}</div>
                      </div>
                      <div
                        className="likert-track"
                        role="radiogroup"
                        aria-label={`${PRIORITY_AXIS_KO[axis]} 우선순위`}
                      >
                        {PRIORITY_LABELS.map(lbl => (
                          <label key={lbl} className="likert-point">
                            <input
                              type="radio"
                              name={`pri-${axis}`}
                              value={lbl}
                              checked={current.label === lbl}
                              disabled={isPredicting}
                              onChange={() => handlePrioritySelect(axis, lbl)}
                            />
                            <span className="likert-node" />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

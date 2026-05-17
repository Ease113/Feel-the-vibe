import { useState } from 'react';
import type { OperatingContext, PriorityLabel, PriorityProfile } from '../api/types';
import {
  PRIORITY_AXIS_KO,
  PRIORITY_LABEL_KO,
  PRIORITY_MULTIPLIER,
} from '../api/types';

const PRIORITY_LABELS: PriorityLabel[] = ['VERY_LOW', 'LOW', 'NORMAL', 'HIGH', 'VERY_HIGH'];
const PRIORITY_AXES = Object.keys(PRIORITY_AXIS_KO) as Array<keyof PriorityProfile['priorities']>;

interface Props {
  operatingContext: OperatingContext;
  priorityProfile: PriorityProfile;
  isExpanded: boolean;
  isPredicting?: boolean;
  onToggle: () => void;
  onPriorityChange: (profile: PriorityProfile) => void;
  onOperatingContextChange?: (ctx: OperatingContext) => void;
}

/** NORMAL(1.0) 초과 축 전체를 요약 칩 문자열 배열로 반환 */
function priorityChips(profile: PriorityProfile): string[] {
  return PRIORITY_AXES
    .filter(key => profile.priorities[key].multiplier > 1.0)
    .map(key => `${PRIORITY_AXIS_KO[key]} ${PRIORITY_LABEL_KO[profile.priorities[key].label]}`);
}

/**
 * 평가 조건 패널 — 운영 컨텍스트 + 5축 우선순위.
 *
 * isExpanded=false: 헤더 요약 칩(교대·인원·주요 우선순위)만 표시.
 * isExpanded=true: 운영 컨텍스트(교대/인원 select) + pri-block 우선순위 패널.
 * 우선순위 변경 → onPriorityChange → 상위에서 POST /predict.
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
  // 교대·인원은 로컬 UI 상태로 관리 (API는 현재 operatingContext를 사용하지 않음)
  const [shift, setShift] = useState<OperatingContext['shift']>(operatingContext.shift);
  const [crewSize, setCrewSize] = useState(operatingContext.crewSize);

  function handlePriorityClick(axis: keyof PriorityProfile['priorities'], label: PriorityLabel) {
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

  const chips = priorityChips(priorityProfile);
  const shiftLabel = shift === 'day' ? '주간' : '야간';

  return (
    <section className="eval-panel" aria-label="평가 조건">
      <button className="eval-summary" type="button" onClick={onToggle}>
        <div className="eval-summary-main">
          <span className="eval-summary-title">평가 조건</span>
          {!isExpanded && (
            <div className="eval-chips">
              <span className="eval-chip">{shiftLabel} · {crewSize}명</span>
              {chips.map(c => (
                <span key={c} className="eval-chip eval-chip--hi">{c}</span>
              ))}
            </div>
          )}
        </div>
        <span className={`eval-chevron${isExpanded ? ' eval-chevron--open' : ''}`}>▾</span>
      </button>

      {isExpanded && (
        <div className="eval-body">
          {/* 운영 컨텍스트 */}
          <div>
            <div className="eval-sec-lbl">운영 컨텍스트</div>
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

          <div className="eval-divider" />

          {/* 우선순위 패널 */}
          <div>
            <div className="eval-sec-lbl">운영 우선순위</div>
            {PRIORITY_AXES.map(axis => {
              const current = priorityProfile.priorities[axis].label;
              return (
                <div key={axis} className="pri-block">
                  <div className="pri-lbl-row">
                    <span className="pri-lbl">{PRIORITY_AXIS_KO[axis]}</span>
                    <span className="pri-val">{PRIORITY_LABEL_KO[current]}</span>
                  </div>
                  <div className="pri-segs">
                    {PRIORITY_LABELS.map(lbl => (
                      <button
                        key={lbl}
                        type="button"
                        className={`seg${current === lbl ? ' on' : ''}`}
                        disabled={isPredicting}
                        onClick={() => handlePriorityClick(axis, lbl)}
                      >
                        {PRIORITY_LABEL_KO[lbl]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

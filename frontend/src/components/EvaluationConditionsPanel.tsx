import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AppliedWeights,
  OperatingContext,
  PriorityLabel,
  PriorityProfile,
} from '../api/types';
import { PRIORITY_AXIS_KO, PRIORITY_MULTIPLIER } from '../api/types';
import InfoTip from './InfoTip';
import {
  PRIORITY_AXIS_CHIP_KO,
  PRIORITY_LABEL_CHIP_KO,
  PRIORITY_LABEL_REFLECT_KO,
  appliedWeightRows,
  priorityAxisPoleParts,
} from '../utils/priorityDisplay';
import {
  PRIORITY_PRESET_CUSTOM,
  PRIORITY_PRESETS,
  clonePriorityProfile,
  formatPresetSummary,
  inferPresetSegmentId,
  prioritiesEqual,
  resolvePresetProfile,
  type PresetSegmentId,
} from '../utils/priorityPresets';
import { operatingContextEqual } from '../utils/operatingContext';

const PRIORITY_LABELS: PriorityLabel[] = ['VERY_LOW', 'LOW', 'NORMAL', 'HIGH', 'VERY_HIGH'];
const PRIORITY_AXES = Object.keys(PRIORITY_AXIS_KO) as Array<
  keyof PriorityProfile['priorities']
>;

type PriorityChipTone = 'high' | 'low' | 'neutral';

interface PriorityChip {
  key: string;
  prefix: string;
  suffix: string;
  tone: PriorityChipTone;
  title?: string;
}

export interface EvaluationConditionsApplyPayload {
  operatingContext: OperatingContext;
  priorityProfile: PriorityProfile;
}

interface Props {
  operatingContext: OperatingContext;
  priorityProfile: PriorityProfile;
  factoryDefaultPriorityProfile: PriorityProfile;
  appliedWeights: AppliedWeights | null;
  isExpanded: boolean;
  isPredicting?: boolean;
  onToggle: () => void;
  onApply: (payload: EvaluationConditionsApplyPayload) => void;
}

function priorityChipTone(label: PriorityLabel): PriorityChipTone {
  return label === 'VERY_LOW' || label === 'LOW' ? 'low' : 'high';
}

function priorityChips(profile: PriorityProfile): PriorityChip[] {
  const normalAxes = PRIORITY_AXES.filter(
    key => profile.priorities[key].label === 'NORMAL',
  );
  const nonNormalAxes = PRIORITY_AXES.filter(
    key => profile.priorities[key].label !== 'NORMAL',
  );

  const deviationChips: PriorityChip[] = nonNormalAxes.map(key => {
    const label = profile.priorities[key].label;
    return {
      key,
      prefix: PRIORITY_AXIS_CHIP_KO[key],
      suffix: PRIORITY_LABEL_CHIP_KO[label],
      tone: priorityChipTone(label),
      title: `${PRIORITY_AXIS_KO[key]} · ${PRIORITY_LABEL_CHIP_KO[label]}`,
    };
  });

  const normalCount = normalAxes.length;
  if (normalCount === 0) return deviationChips;

  let normalChip: PriorityChip;
  if (normalCount === PRIORITY_AXES.length) {
    normalChip = { key: 'normal-all', prefix: '전체', suffix: '기본', tone: 'neutral' };
  } else if (normalCount === 1) {
    const key = normalAxes[0];
    normalChip = {
      key: `normal-${key}`,
      prefix: PRIORITY_AXIS_CHIP_KO[key],
      suffix: '기본',
      tone: 'neutral',
    };
  } else {
    normalChip = {
      key: `normal-group-${normalAxes.join('-')}`,
      prefix: normalAxes.map(k => PRIORITY_AXIS_CHIP_KO[k]).join('·'),
      suffix: '기본',
      tone: 'neutral',
      title: `${normalAxes.map(k => PRIORITY_AXIS_KO[k]).join(', ')} · 공장 기본`,
    };
  }

  return [...deviationChips, normalChip];
}

/**
 * 평가 조건 패널 — 운영 컨텍스트 + 5축 Likert 우선순위.
 *
 * 편집은 draft state로 유지하고, 「평가 조건 적용」 시에만 부모에 반영·/predict 호출.
 */
export default function EvaluationConditionsPanel({
  operatingContext,
  priorityProfile,
  factoryDefaultPriorityProfile,
  appliedWeights,
  isExpanded,
  isPredicting = false,
  onToggle,
  onApply,
}: Props) {
  const [draftContext, setDraftContext] = useState<OperatingContext>(operatingContext);
  const [draftPriority, setDraftPriority] = useState<PriorityProfile>(() =>
    clonePriorityProfile(priorityProfile),
  );
  const [presetMode, setPresetMode] = useState<PresetSegmentId>(() =>
    inferPresetSegmentId(priorityProfile, factoryDefaultPriorityProfile),
  );

  useEffect(() => {
    setDraftContext(operatingContext);
    setDraftPriority(clonePriorityProfile(priorityProfile));
    setPresetMode(inferPresetSegmentId(priorityProfile, factoryDefaultPriorityProfile));
  }, [operatingContext, priorityProfile, factoryDefaultPriorityProfile]);

  const isDirty = useMemo(
    () =>
      !operatingContextEqual(draftContext, operatingContext)
      || !prioritiesEqual(draftPriority, priorityProfile),
    [draftContext, draftPriority, operatingContext, priorityProfile],
  );

  function handlePrioritySelect(axis: keyof PriorityProfile['priorities'], label: PriorityLabel) {
    setPresetMode('custom');
    setDraftPriority(prev => ({
      ...prev,
      priorities: {
        ...prev.priorities,
        [axis]: { label, multiplier: PRIORITY_MULTIPLIER[label] },
      },
    }));
  }

  function handlePresetSelect(segmentId: PresetSegmentId) {
    if (segmentId === 'custom') {
      setPresetMode('custom');
      return;
    }
    setPresetMode(segmentId);
    setDraftPriority(
      resolvePresetProfile(segmentId, factoryDefaultPriorityProfile),
    );
  }

  function handleShiftChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const shift = e.target.value as OperatingContext['shift'];
    setDraftContext(prev => ({ ...prev, shift }));
  }

  function handleCrewChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const crewSize = Number(e.target.value);
    setDraftContext(prev => ({ ...prev, crewSize }));
  }

  function handleApplyClick() {
    if (!isDirty || isPredicting) return;
    onApply({
      operatingContext: draftContext,
      priorityProfile: draftPriority,
    });
  }

  function handleSummaryClick(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault();
    onToggle();
  }

  const chips = priorityChips(priorityProfile);
  const shiftLabel = operatingContext.shift === 'day' ? '주간' : '야간';
  const weightRows = appliedWeights ? appliedWeightRows(appliedWeights) : null;

  return (
    <section className="eval-panel" aria-label="평가 조건">
      <details className="eval-details" open={isExpanded}>
        <summary className="eval-summary" onClick={handleSummaryClick}>
          <div className="eval-summary-main">
            <span className="eval-summary-title">평가 조건</span>
            <div className="eval-chips">
              <span className="eval-chip">{shiftLabel} · {operatingContext.crewSize}명</span>
              {chips.map(c => (
                <span key={c.key} className="eval-chip" title={c.title}>
                  {c.prefix}{' '}
                  <span className={`eval-chip-pri eval-chip-pri--${c.tone}`}>
                    {c.suffix}
                  </span>
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
                <InfoTip label="운영 컨텍스트 안내">
                  교대·투입 인원은 절대 비용에만 균일하게 반영되며 추천 순서는 바꾸지 않습니다.
                </InfoTip>
              </div>
              <div className="eval-ctx-grid">
                <div className="eval-ctx-item">
                  <span className="eval-ctx-lbl">생산 라인</span>
                  <span className="eval-ctx-plan">{operatingContext.lineId}</span>
                </div>
                <div className="eval-ctx-item">
                  <label className="eval-ctx-lbl" htmlFor="eval-shift">교대</label>
                  <select
                    id="eval-shift"
                    className="ctx-select"
                    value={draftContext.shift}
                    disabled={isPredicting}
                    onChange={handleShiftChange}
                  >
                    <option value="day">주간</option>
                    <option value="night">야간</option>
                  </select>
                </div>
                <div className="eval-ctx-item">
                  <label className="eval-ctx-lbl" htmlFor="eval-crew">투입 인원</label>
                  <div className="ctx-select-group">
                    <select
                      id="eval-crew"
                      className="ctx-select ctx-select--narrow"
                      value={draftContext.crewSize}
                      disabled={isPredicting}
                      onChange={handleCrewChange}
                    >
                      {[2, 3, 4, 5].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <span className="ctx-select-unit" aria-hidden="true">명</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="eval-col">
              <div className="eval-sec-lbl">
                운영 우선순위
                <InfoTip label="운영 우선순위 안내">
                  <p>
                    항목별 중요도는 <strong>목적 점수에 각 비용 차원을 얼마나 실지</strong>를
                    공장 공통 5단계로 조절합니다. 반영 비중은 적용 후 합 100%로
                    재정규화됩니다.
                  </p>
                  <p>
                    운영 방침 템플릿을 선택하거나 직접 설정으로 항목별 중요도를
                    바꿀 수 있습니다. 단계(최소~최대)와 배율은 전 라인 동일하며,
                    기본 프로파일은 {factoryDefaultPriorityProfile.baseWeightProfileId}입니다.
                  </p>
                  <p>
                    「평가 조건 적용」을 누르면 우선순위 변경 시 AI 추천 순서와
                    KPI를 갱신합니다. 직접 조정한 현재 순서는 유지됩니다. 교대·투입
                    인원만 바꾼 경우에는 추천 순서는 그대로 두고 절대 비용만
                    보정합니다.
                  </p>
                </InfoTip>
              </div>

              <div className="pri-preset-block">
                <div
                  className="pri-preset-segments"
                  role="radiogroup"
                  aria-label="운영 방침 템플릿"
                >
                  {PRIORITY_PRESETS.map(preset => {
                    const checked = presetMode === preset.id;
                    return (
                      <label
                        key={preset.id}
                        className={`pri-preset-seg${checked ? ' pri-preset-seg--active' : ''}`}
                        title={preset.hint}
                      >
                        <input
                          type="radio"
                          name="pri-preset"
                          value={preset.id}
                          checked={checked}
                          disabled={isPredicting}
                          onChange={() => handlePresetSelect(preset.id)}
                        />
                        <span className="pri-preset-seg-title">{preset.label}</span>
                        <span className="pri-preset-seg-summary">
                          {formatPresetSummary(preset)}
                        </span>
                      </label>
                    );
                  })}
                  <label
                    className={`pri-preset-seg${presetMode === 'custom' ? ' pri-preset-seg--active' : ''}`}
                    title={PRIORITY_PRESET_CUSTOM.hint}
                  >
                    <input
                      type="radio"
                      name="pri-preset"
                      value="custom"
                      checked={presetMode === 'custom'}
                      disabled={isPredicting}
                      onChange={() => handlePresetSelect('custom')}
                    />
                    <span className="pri-preset-seg-title">{PRIORITY_PRESET_CUSTOM.label}</span>
                    <span className="pri-preset-seg-summary">
                      {PRIORITY_PRESET_CUSTOM.summary}
                    </span>
                  </label>
                </div>
              </div>

              <div className="pri-likert-wrap">
                {PRIORITY_AXES.map(axis => {
                  const current = draftPriority.priorities[axis];
                  const poles = priorityAxisPoleParts(axis);
                  return (
                    <div key={axis} className="pri-block likert-row likert-row--poles">
                      <span className="likert-pole likert-pole--low">
                        <span className="likert-pole-name">{poles.name}</span>
                        <span className="likert-pole-sep" aria-hidden="true"> · </span>
                        <span className="likert-pole-reflect likert-pole-reflect--min">
                          {poles.minReflect}
                        </span>
                      </span>
                      <div className="likert-track-wrap">
                        <div
                          className="likert-track"
                          role="radiogroup"
                          aria-label={`${PRIORITY_AXIS_KO[axis]} 목적 점수 반영 정도`}
                        >
                          {PRIORITY_LABELS.map(lbl => (
                            <label
                              key={lbl}
                              className="likert-point"
                              title={PRIORITY_LABEL_REFLECT_KO[lbl]}
                            >
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
                      <span className="likert-pole likert-pole--high">
                        <span className="likert-pole-name">{poles.name}</span>
                        <span className="likert-pole-sep" aria-hidden="true"> · </span>
                        <span className="likert-pole-reflect likert-pole-reflect--max">
                          {poles.maxReflect}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              {!weightRows && (
                <p className="pri-applied-weights-hint">
                  평가 조건 적용 후 목적 점수 반영 비중이 표시됩니다.
                </p>
              )}

              {weightRows && isDirty && (
                <p className="pri-applied-weights-hint pri-applied-weights-hint--pending">
                  변경된 조건은 「평가 조건 적용」 후 반영 비중에 갱신됩니다.
                </p>
              )}

              {weightRows && !isDirty && (
                <div className="pri-applied-weights">
                  <div className="pri-applied-weights-hd">
                    목적 점수 반영 비중
                    <InfoTip label="반영 비중 안내">
                      우선순위 적용 후 합계 100%로 재정규화된 가중치입니다.
                      모든 사용자에게 동일한 계산식으로 산출됩니다.
                    </InfoTip>
                  </div>
                  <ul className="pri-applied-weights-list">
                    {weightRows.map(row => (
                      <li key={row.key}>
                        <span>{row.label}</span>
                        <span>{row.pct}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="eval-footer">
            <p className="eval-footer-note">
              {isDirty
                ? '우선순위 변경은 추천 순서를, 운영 컨텍스트는 절대 비용을 갱신합니다.'
                : '현재 평가 조건이 KPI에 반영되어 있습니다.'}
            </p>
            <button
              type="button"
              className="eval-apply-btn"
              disabled={!isDirty || isPredicting}
              onClick={handleApplyClick}
            >
              {isPredicting ? '재평가 중…' : '평가 조건 적용'}
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

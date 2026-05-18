import type { RiskWarning } from '../api/types';
import { SEVERITY_UI } from '../api/types';

interface Props {
  riskWarnings: RiskWarning[];
  isPredicting: boolean;
}

/**
 * rule engine 경고 패널 — HIGH·MEDIUM만 표시. LOW 제외 (§10).
 *
 * 확정을 차단하지 않으며 운영자가 위험을 인지하도록 돕는 용도다.
 * 데이터 소스는 /predict 응답의 risk_warnings이며
 * TransitionAnalysisTable의 transition_costs[].severity와는 집계 단위가 다르다.
 */
export default function WarningPanel({ riskWarnings, isPredicting }: Props) {
  const visible = riskWarnings.filter(
    w => w.severity === 'HIGH' || w.severity === 'MEDIUM',
  );

  return (
    <div className="warn-panel">
      <p className="warn-panel-title">
        위험 경고
        {visible.length > 0 && (
          <span className="warn-count-badge">{visible.length}</span>
        )}
      </p>

      {isPredicting && visible.length === 0 ? (
        <p className="warn-empty warn-loading">평가 중…</p>
      ) : visible.length === 0 ? (
        <p className="warn-empty">위험 경고 없음</p>
      ) : (
        <ul className="warn-list">
          {visible.map(w => {
            const uiSev = SEVERITY_UI[w.severity];
            const isHigh = w.severity === 'HIGH';
            return (
              <li
                key={`${w.ruleId}-${w.fromPlanItemId}-${w.toPlanItemId}`}
                className={`warn-item warn-item--${uiSev.toLowerCase()}`}
              >
                <div className="warn-item-header">
                  <span className={`warn-sev-badge warn-sev-badge--${uiSev.toLowerCase()}`}>
                    {uiSev}
                  </span>
                  <span className="warn-penalty">+{Math.round(w.penalty).toLocaleString()} pt</span>
                </div>
                <p className="warn-message">{w.message}</p>
                {w.recommendation && (
                  <p className={`warn-rec${isHigh ? ' warn-rec--high' : ''}`}>
                    권장: {w.recommendation}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import type { RiskWarning } from '../api/types';
import SeverityBadge from './SeverityBadge';

interface Props {
  riskWarnings: RiskWarning[];
  isPredicting: boolean;
}

/** HIGH/MEDIUM 위험 경고의 이유와 권장 조치를 명시적으로 보여준다. */
export default function WarningPanel({ riskWarnings, isPredicting }: Props) {
  const visibleWarnings = riskWarnings.filter(
    warning => warning.severity === 'HIGH' || warning.severity === 'MEDIUM',
  );

  return (
    <div className="side-card warn-panel">
      <div className="warn-panel-title">
        <span>주의 경고</span>
        <span className="warn-count-badge">{visibleWarnings.length}</span>
      </div>

      {isPredicting && visibleWarnings.length === 0 && (
        <p className="warn-empty warn-loading">경고 평가 중...</p>
      )}

      {!isPredicting && visibleWarnings.length === 0 && (
        <p className="warn-empty">HIGH/MED 경고가 없습니다.</p>
      )}

      {visibleWarnings.length > 0 && (
        <div className="warn-list">
          {visibleWarnings.map(warning => {
            const isHigh = warning.severity === 'HIGH';
            return (
              <article
                key={`${warning.ruleId}-${warning.fromPlanItemId}-${warning.toPlanItemId}`}
                className="warn-item"
              >
                <div className="warn-item-header">
                  <SeverityBadge severity={warning.severity} />
                  <span className="warn-penalty">
                    penalty {Math.round(warning.penalty).toLocaleString()}
                  </span>
                </div>
                <p className="warn-message">{warning.message}</p>
                <p className={`warn-rec${isHigh ? ' warn-rec--high' : ''}`}>
                  {warning.recommendation}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

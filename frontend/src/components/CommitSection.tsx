import { useState } from 'react';
import { Check } from 'lucide-react';
import type { RiskWarning, SaveStatus } from '../api/types';

interface CommitResultModalProps {
  decisionId: string;
  committedAt: string;
  onClose: () => void;
}

function CommitResultModal({ decisionId, committedAt, onClose }: CommitResultModalProps) {
  const when = new Date(committedAt).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-icon">✓</div>
        <div className="modal-title">생산 순서 확정 완료</div>
        <p className="modal-sub">현재 순서가 확정되었습니다. 확정 기록은 의사결정 로그에서 확인할 수 있습니다.</p>
        <div className="modal-meta">{decisionId} · {when}</div>
        <button type="button" className="btn-modal-close" onClick={onClose}>
          닫기 · 계속 편집
        </button>
      </div>
    </div>
  );
}

interface Props {
  riskWarnings: RiskWarning[];
  decisionMemo: string;
  saveStatus: SaveStatus;
  commitBlockReason: string | null;
  isCommitted: boolean;
  decisionId: string | null;
  committedAt: string | null;
  onMemoChange: (memo: string) => void;
  onCommit: () => void;
  onCommitClose: () => void;
}

/**
 * 최종 확정 패널 + CommitResultModal.
 *
 * 고위험 전환이 있으면 확인 체크박스를 요구한다.
 * saveStatus='saving' 중에는 버튼을 비활성화한다.
 * workflowState='committed'(isCommitted=true) 시 모달을 표시한다.
 */
export default function CommitSection({
  riskWarnings,
  decisionMemo,
  saveStatus,
  commitBlockReason,
  isCommitted,
  decisionId,
  committedAt,
  onMemoChange,
  onCommit,
  onCommitClose,
}: Props) {
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const highRiskCount = riskWarnings.filter(w => w.severity === 'HIGH').length;
  const needsAck = highRiskCount > 0;
  const isSaving = saveStatus === 'saving';
  const isDisabled = isSaving || (needsAck && !riskAcknowledged) || !!commitBlockReason;

  return (
    <>
      <div className="side-card">
        <div className="panel-hd">최종 확정</div>
        <div className="side-sec">
          <label
            htmlFor="commit-memo"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 6 }}
          >
            확정 메모 <span style={{ fontWeight: 500, color: 'var(--muted)' }}>(선택)</span>
          </label>
          <textarea
            id="commit-memo"
            className="memo-area"
            placeholder="확정 사유 또는 메모 입력"
            value={decisionMemo}
            onChange={e => onMemoChange(e.target.value)}
            disabled={isSaving}
          />

          {needsAck && (
            <>
              <p className="commit-note">위험 전환이 있어도 확정할 수 있습니다.</p>
              <label className="commit-risk">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={e => setRiskAcknowledged(e.target.checked)}
                  disabled={isSaving}
                />
                <span>고위험 전환 {highRiskCount}건을 확인했습니다</span>
              </label>
            </>
          )}

          {saveStatus === 'error' && commitBlockReason && (
            <p className="commit-error">{commitBlockReason}</p>
          )}
        </div>

        <div className="side-footer">
          <button
            type="button"
            className="btn-commit"
            disabled={isDisabled}
            onClick={onCommit}
          >
            <Check size={14} />
            {isSaving ? '저장 중…' : '최종 순서 확정'}
          </button>
        </div>
      </div>

      {isCommitted && decisionId && committedAt && (
        <CommitResultModal
          decisionId={decisionId}
          committedAt={committedAt}
          onClose={onCommitClose}
        />
      )}
    </>
  );
}

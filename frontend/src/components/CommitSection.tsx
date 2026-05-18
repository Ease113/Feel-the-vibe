import { Check } from 'lucide-react';
import type { SaveStatus } from '../api/types';

interface CommitResultModalProps {
  decisionId: string;
  committedAt: string;
  onClose: () => void;
}

function formatCommittedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CommitResultModal({ decisionId, committedAt, onClose }: CommitResultModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="commit-result-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="commit-result-title"
      >
        <div className="commit-result-modal__hd">
          <h2 id="commit-result-title" className="commit-result-modal__title">
            생산 순서가 확정되었습니다
          </h2>
        </div>
        <div className="commit-result-modal__bd">
          <p className="commit-result-modal__msg">
            의사결정이 저장되었습니다. 닫으면 계속 수정할 수 있으며, 다음 확정 시 새 로그가 생성됩니다.
          </p>
          <div className="commit-result-modal__id">{decisionId}</div>
          <time className="commit-result-modal__time" dateTime={committedAt}>
            {formatCommittedAt(committedAt)}
          </time>
        </div>
        <div className="commit-result-modal__ft">
          <button type="button" className="btn-commit-result-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
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
 * riskWarnings는 soft warning이며 확정 차단 조건이 아니다 (commitBlockReason만 차단).
 * saveStatus='saving' 중에는 버튼을 비활성화한다.
 */
export default function CommitSection({
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
  const isSaving = saveStatus === 'saving';
  const isDisabled = isSaving || !!commitBlockReason;

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

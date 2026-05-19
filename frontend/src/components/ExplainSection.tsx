import { RotateCcw } from 'lucide-react';
import type { ComparisonState } from '../api/types';

interface Props {
  llmExplanation: string | null;
  isExplaining: boolean;
  comparisonState: ComparisonState | null;
  onExplain: () => void;
}

/**
 * AI 설명 카드 (P1).
 *
 * comparisonState가 없으면 설명 생성 불가(버튼 비활성).
 * isExplanationStale=true: stale-box 경고 표시.
 * isExplaining=true: 버튼 비활성 + 로딩 텍스트.
 */
export default function ExplainSection({
  llmExplanation,
  isExplaining,
  comparisonState,
  onExplain,
}: Props) {
  const canExplain = !!comparisonState && !isExplaining;

  return (
    <div className="side-card">
      <div className="panel-hd">
        AI 설명 <span className="panel-hd-note">(선택)</span>
      </div>
      <div className="side-sec">
        {llmExplanation ? (
          <p className="explain-text">{llmExplanation}</p>
        ) : (
          <p className="explain-empty">
            {comparisonState
              ? '버튼을 눌러 AI 설명을 생성하세요.'
              : '평가 결과가 생성된 후 설명을 요청할 수 있습니다.'}
          </p>
        )}

        <button
          type="button"
          className="btn-sm"
          disabled={!canExplain}
          onClick={onExplain}
        >
          <RotateCcw size={11} />
          {isExplaining ? '생성 중…' : llmExplanation ? '설명 재생성' : '설명 생성'}
        </button>
      </div>
    </div>
  );
}

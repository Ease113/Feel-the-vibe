import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  /** 스크린 리더용 라벨 */
  label?: string;
  children: ReactNode;
}

/** 섹션/필드 옆 ℹ — hover·focus 시 짧은 도움말 표시 */
export default function InfoTip({ label = '상세 정보', children }: Props) {
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-trigger" aria-label={label}>
        <Info size={12} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <span className="info-tip-popover" role="tooltip">
        {children}
      </span>
    </span>
  );
}

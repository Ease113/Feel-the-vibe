import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

interface Props extends ComponentPropsWithoutRef<'div'> {
  slotIndex: number;
  /** 출발 전환이 risk_warnings에 포함될 때 좌측 슬롯 번호 영역 강조 */
  warn?: boolean;
  children: ReactNode;
}

/** 생산 순서 슬롯 한 줄: 좌측 순번 배지 + 카드/드래그 영역(children). */
const SeqSlotRow = forwardRef<HTMLDivElement, Props>(function SeqSlotRow(
  { slotIndex, warn, children, className, ...rest },
  ref,
) {
  const rowClass = [
    'seq-slot-row',
    warn && 'seq-slot-row--warn',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={rowClass} {...rest}>
      <div className="seq-slot-num" aria-hidden="true">
        <span className="seq-slot-num-badge">{slotIndex}</span>
      </div>
      {children}
    </div>
  );
});

export default SeqSlotRow;

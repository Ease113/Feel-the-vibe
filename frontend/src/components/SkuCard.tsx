import type { ReactNode } from 'react';
import type { PlanItem } from '../api/types';
import {
  formatSkuMetaHoverDetail,
  formatSkuMetaInline,
} from '../utils/skuLevels';

const CATEGORY_KO: Record<string, string> = {
  light:   '밝은색',
  mid:     '중간색',
  dark:    '어두운색',
  metal:   '메탈',
  special: '특수색',
  normal:  '일반색',
};

interface Props {
  item: PlanItem;
  /** SeqSlotRow가 순번을 표시할 때는 생략 */
  index?: number;
  /** 커스텀 서브태그. 미지정 시 category 한국어 */
  subTag?: string;
  /** 추천안 등 읽기 전용 열 */
  readonly?: boolean;
  /** DragOverlay용 카드 스타일 */
  overlay?: boolean;
  /** 이 카드에서 다음 항목으로 나가는 전환이 risk_warnings에 포함될 때 좌측 강조만 표시 */
  hasOutgoingRisk?: boolean;
  /** 카드 우측 끝 슬롯 (현재안 드래그 핸들 등) */
  trailing?: ReactNode;
}

/**
 * 단일 SKU 생산 계획 항목 카드.
 * severity·전환 문구는 TransitionSlot / WarningPanel에서 표시한다.
 */
export default function SkuCard({
  item,
  index,
  subTag,
  readonly = false,
  overlay = false,
  hasOutgoingRisk = false,
  trailing,
}: Props) {
  const categoryLabel = subTag ?? CATEGORY_KO[item.category] ?? item.category;
  const metaInline = formatSkuMetaInline(item.glossLevel, item.viscosityLevel);
  const metaHover = formatSkuMetaHoverDetail(
    item.pigmentIntensity,
    item.brightnessLevel,
    item.colorFamily,
  );

  const ariaBase = `${item.skuName} ${item.quantity}L, ${categoryLabel}`;
  const ariaLabel = hasOutgoingRisk
    ? `${ariaBase}, 위험 전환 출발`
    : metaInline
      ? `${ariaBase}, ${metaInline}`
      : undefined;

  const cardClass = [
    'sku-card',
    index !== undefined && 'sku-card--with-index',
    readonly && 'sku-card--readonly',
    overlay && 'sku-card--overlay',
    hasOutgoingRisk && 'sku-card--warn',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={cardClass}
      title={metaHover}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      {index !== undefined ? (
        <span className="sku-slot-num">{index}</span>
      ) : null}
      <div className="sku-card-body">
        <span className="sku-dot" style={{ backgroundColor: item.hexCode }} />
        <div className="sku-info">
          <div className="sku-name">
            {item.skuName} {item.quantity}L
          </div>
          <div className="sku-tag">{categoryLabel}</div>
          {metaInline ? <div className="sku-meta">{metaInline}</div> : null}
        </div>
        {trailing}
      </div>
    </article>
  );
}

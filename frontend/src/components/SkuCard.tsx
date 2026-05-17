import type { PlanItem } from '../api/types';

interface Props {
  item: PlanItem;
  index: number;
}

/**
 * 단일 SKU 생산 계획 항목을 카드 형태로 표시하는 컴포넌트.
 *
 * hex_code → color_hex 순서로 색상 스와치를 렌더링한다.
 * 두 값이 모두 없으면 기본 회색(#CCCCCC)을 사용한다.
 *
 * @param item - 렌더링할 plan item 데이터 (sku 정보 포함).
 * @param index - 순서 번호 (1-based).
 */
export default function SkuCard({ item, index }: Props) {
  const swatchColor = item.sku.hex_code ?? item.sku.color_hex ?? '#CCCCCC';

  return (
    <article className="sku-card">
      <span className="sequence-index">{index}</span>
      <span className="color-swatch" style={{ backgroundColor: swatchColor }} />
      <div>
        <strong>{item.sku.sku_name}</strong>
        <p>
          {item.plan_item_id} · {item.quantity.toLocaleString()}L · {item.package_size}
        </p>
      </div>
    </article>
  );
}

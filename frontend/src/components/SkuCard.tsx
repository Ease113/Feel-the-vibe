import type { PlanItem } from '../api/types';

interface Props {
  item: PlanItem;
  index: number;
}

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

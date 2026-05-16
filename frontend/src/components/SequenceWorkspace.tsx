import type { PlanResponse } from '../api/types';
import SkuCard from './SkuCard';

interface Props {
  plan: PlanResponse | null;
}

export default function SequenceWorkspace({ plan }: Props) {
  if (!plan) {
    return <section className="workspace empty">생산계획을 불러오는 중입니다.</section>;
  }

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div>
          <h2>{plan.plan_id}</h2>
          <p>초기화 단계에서는 계획 카드와 API 연결 상태를 확인합니다.</p>
        </div>
      </div>
      <div className="sequence-list">
        {plan.plan_items.map((item, index) => (
          <SkuCard key={item.plan_item_id} item={item} index={index + 1} />
        ))}
      </div>
    </section>
  );
}

import type { PlanResponse } from '../api/types';
import SkuCard from './SkuCard';

interface Props {
  plan: PlanResponse | null;
}

/**
 * 생산 계획 항목을 순서대로 나열하는 작업 공간 컴포넌트.
 *
 * plan이 null이면 로딩 메시지를 표시하고, 로드 완료 시 plan_items를
 * SkuCard 리스트로 렌더링한다. 드래그-드롭 편집은 추후 P1에서 추가된다.
 *
 * @param plan - 서버에서 받아온 PlanResponse. 로딩 중이면 null.
 */
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

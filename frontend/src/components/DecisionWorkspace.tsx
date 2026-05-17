import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { PlanItem, RiskWarning, TransitionCost, WarningSeverity } from '../api/types';
import SkuCard from './SkuCard';

// ── SortableCard ────────────────────────────────────────────────

interface WarningInfo {
  severity: WarningSeverity;
  toSkuName: string;
  ruleId: string;
}

interface SortableCardProps {
  id: string;
  item: PlanItem;
  index: number;
  warning?: WarningInfo | null;
}

/** D&D 핸들 + SkuCard 래퍼 */
function SortableCard({ id, item, index, warning }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`sortable-card-wrapper${isDragging ? ' sortable-card-wrapper--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      <span className="drag-handle" {...listeners} aria-label="드래그 핸들">
        <GripVertical size={14} />
      </span>
      <SkuCard item={item} index={index} warning={warning} />
    </div>
  );
}

// ── DecisionWorkspace ───────────────────────────────────────────

interface Props {
  planItems: PlanItem[];
  recommendedSequence: string[];
  currentSequence: string[];
  transitionCosts: TransitionCost[];
  riskWarnings: RiskWarning[];
  recommendedScore: number | null;
  currentScore: number | null;
  isPredicting: boolean;
  onDragStart: () => void;
  onDrop: (nextSequence: string[]) => void;
  onDragCancel: () => void;
}

/**
 * 추천안(좌)·현재안(우) 2열 작업 공간.
 *
 * 현재안 열: @dnd-kit D&D. 드롭 완료 시 onDrop(newSequence) 콜백.
 * HIGH/MEDIUM 위험 경고가 있는 카드는 강조 표시 + 다음 전환 정보 태그.
 * TransitionSlot 없음 — 위험 정보는 카드에 직접 표시.
 */
export default function DecisionWorkspace({
  planItems,
  recommendedSequence,
  currentSequence,
  riskWarnings,
  recommendedScore,
  currentScore,
  isPredicting,
  onDragStart,
  onDrop,
  onDragCancel,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const itemMap = new Map(planItems.map(i => [i.planItemId, i]));

  /** fromPlanItemId → risk warning 빠른 조회 */
  const warnMap = new Map(riskWarnings.map(w => [w.fromPlanItemId, w]));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    onDragStart();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = currentSequence.indexOf(active.id as string);
      const newIndex = currentSequence.indexOf(over.id as string);
      onDrop(arrayMove(currentSequence, oldIndex, newIndex));
    } else {
      onDragCancel();
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    onDragCancel();
  }

  const fmtScore = (v: number | null) =>
    v !== null ? `${Math.round(v).toLocaleString()} pt` : null;

  if (planItems.length === 0) {
    return (
      <div className="workspace-box">
        <div className="panel-hd">추천안 vs 현재안</div>
        <div className="seq-cols-2">
          <div className="seq-col"><div className="seq-col-head">AI 추천안</div></div>
          <div className="seq-col"><div className="seq-col-head current">현재안</div></div>
        </div>
      </div>
    );
  }

  const activeItem = activeId ? itemMap.get(activeId) : null;
  const recScore   = fmtScore(recommendedScore);
  const curScore   = fmtScore(currentScore);

  return (
    <div className="workspace-box">
      <div className="panel-hd">
        <span>추천안 vs 현재안</span>
        <span className="panel-hd-note">낮은 점수가 유리</span>
      </div>

      <div className="ws-toolbar">
        <span className="ws-toolbar-hint">
          카드 key = <code>plan_item_id</code> · 고위험 전환은 카드 강조 ·
          전환 분석·주의 패널에서 확인 · 초기화는 하단 ActionFooter
        </span>
      </div>

      <div className="seq-cols-2">
        {/* 좌: 추천안 (정적) */}
        <div className="seq-col">
          <div className="seq-col-head">
            AI 추천안
            {recScore && <span className="score">{recScore}</span>}
          </div>
          <div className="seq-stack">
            {recommendedSequence.map((id, i) => {
              const item = itemMap.get(id);
              if (!item) return null;
              return <SkuCard key={id} item={item} index={i + 1} />;
            })}
          </div>
        </div>

        {/* 우: 현재안 (D&D) */}
        <div className="seq-col">
          <div className="seq-col-head current">
            현재안
            {isPredicting
              ? <span className="score">평가 중…</span>
              : curScore && <span className="score">{curScore}</span>
            }
          </div>
          <div className="seq-stack">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={currentSequence} strategy={verticalListSortingStrategy}>
                {currentSequence.map((id, i) => {
                  const item = itemMap.get(id);
                  if (!item) return null;
                  const rw = warnMap.get(id);
                  const toItem = rw ? itemMap.get(rw.toPlanItemId) : undefined;
                  const warning: WarningInfo | null =
                    rw && toItem
                      ? { severity: rw.severity, toSkuName: toItem.skuName, ruleId: rw.ruleId }
                      : null;
                  return (
                    <SortableCard
                      key={id}
                      id={id}
                      item={item}
                      index={i + 1}
                      warning={warning}
                    />
                  );
                })}
              </SortableContext>

              <DragOverlay>
                {activeItem ? (
                  <div className="drag-overlay-card">
                    <SkuCard
                      item={activeItem}
                      index={currentSequence.indexOf(activeId!) + 1}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}

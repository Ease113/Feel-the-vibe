import { Fragment, useState, type ReactNode } from 'react';
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
import type { PlanItem, RiskWarning, TransitionCost } from '../api/types';
import { formatScore } from '../utils/costFormat';
import InfoTip from './InfoTip';
import SeqSlotRow from './SeqSlotRow';
import SkuCard from './SkuCard';
import TransitionSlot from './TransitionSlot';

function transitionKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

interface SortableCardProps {
  id: string;
  item: PlanItem;
  slotIndex: number;
  hasOutgoingRisk?: boolean;
}

function SortableCard({ id, item, slotIndex, hasOutgoingRisk }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <SeqSlotRow
      ref={setNodeRef}
      slotIndex={slotIndex}
      warn={hasOutgoingRisk}
      style={
        isDragging
          ? undefined
          : {
              transform: CSS.Transform.toString(transform),
              transition,
            }
      }
      {...attributes}
    >
      <div
        className={`seq-slot-surface${isDragging ? ' seq-slot-surface--dragging' : ''}`}
      >
        <SkuCard
          item={item}
          hasOutgoingRisk={hasOutgoingRisk}
          trailing={
            <span className="drag-handle" {...listeners} aria-label="드래그 핸들">
              <GripVertical size={14} />
            </span>
          }
        />
      </div>
    </SeqSlotRow>
  );
}

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
  onReset: () => void;
}

function WorkspaceChrome({ children }: { children: ReactNode }) {
  return (
    <section aria-label="생산 순서">
      <div className="workspace-box">
        <div className="section-hd">
          <div>
            <h2 className="section-lbl section-lbl--with-info">
              생산 순서
              <InfoTip label="생산 순서 상세">
                낮은 objectiveScore가 유리. 카드 key = plan_item_id.
              </InfoTip>
            </h2>
            <p className="section-sub">현재안을 드래그해 순서를 바꿉니다</p>
          </div>
        </div>
        <div className="ws-toolbar">
          <span className="ws-toolbar-hint">
            고위험 전환은 카드에서 강조하고, 상세 비용은 전환 분석에서 확인합니다.
          </span>
        </div>
        {children}
      </div>
    </section>
  );
}

/** 추천안과 현재안을 비교하고 현재안 카드 순서를 드래그로 편집한다. */
export default function DecisionWorkspace({
  planItems,
  recommendedSequence,
  currentSequence,
  transitionCosts,
  riskWarnings,
  recommendedScore,
  currentScore,
  isPredicting,
  onDragStart,
  onDrop,
  onDragCancel,
  onReset,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 14 } }),
  );

  const itemMap = new Map(planItems.map(i => [i.planItemId, i]));
  const warnMap = new Map(riskWarnings.map(w => [w.fromPlanItemId, w]));
  const transitionMap = new Map(
    transitionCosts.map(t => [transitionKey(t.fromPlanItemId, t.toPlanItemId), t]),
  );

  /** 드래그 overlay 대상과 페이지 드래그 상태를 함께 시작한다. */
  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setOverlayWidth(event.active.rect.current.initial?.width ?? null);
    onDragStart();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverlayWidth(null);
    if (over && active.id !== over.id) {
      const oldIndex = currentSequence.indexOf(String(active.id));
      const newIndex = currentSequence.indexOf(String(over.id));
      onDrop(arrayMove(currentSequence, oldIndex, newIndex));
    } else {
      onDragCancel();
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverlayWidth(null);
    onDragCancel();
  }

  const activeHasOutgoingRisk = activeId ? warnMap.has(activeId) : false;

  const fmtScore = (v: number | null) =>
    v !== null ? formatScore(v) : null;

  if (planItems.length === 0) {
    return (
      <WorkspaceChrome>
        <div className="seq-cols-2">
          <div className="seq-col"><div className="seq-col-head">AI 추천안</div></div>
          <div className="seq-col"><div className="seq-col-head">현재안</div></div>
        </div>
      </WorkspaceChrome>
    );
  }

  const activeItem = activeId ? itemMap.get(activeId) : null;
  const activeSlotIndex = activeId ? currentSequence.indexOf(activeId) + 1 : 0;
  const recScore = fmtScore(recommendedScore);
  const curScore = fmtScore(currentScore);

  return (
    <WorkspaceChrome>
      <div className="seq-cols-2">
        <div className="seq-col">
          <div className="seq-col-head">
            AI 추천안
            {recScore && <span className="score">{recScore}</span>}
          </div>
          <div className="seq-stack">
            {recommendedSequence.map((id, i) => {
              const item = itemMap.get(id);
              if (!item) return null;
              const slotIndex = i + 1;
              return (
                <SeqSlotRow key={`rec-slot-${i}`} slotIndex={slotIndex}>
                  <SkuCard item={item} readonly />
                </SeqSlotRow>
              );
            })}
          </div>
        </div>

        <div className="seq-col">
          <div className="seq-col-head">
            현재안
            {isPredicting
              ? <span className="score">평가 중…</span>
              : curScore && <span className="score">{curScore}</span>
            }
            <button type="button" className="btn-reset" onClick={onReset}>
              추천 순서로 초기화
            </button>
          </div>
          <div className="seq-stack">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              autoScroll={false}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={currentSequence} strategy={verticalListSortingStrategy}>
                {currentSequence.map((id, i) => {
                  const item = itemMap.get(id);
                  if (!item) return null;
                  const nextId = currentSequence[i + 1];
                  const hasOutgoingRisk = warnMap.has(id);
                  const transition = nextId
                    ? transitionMap.get(transitionKey(id, nextId))
                    : undefined;
                  const nextItem = nextId ? itemMap.get(nextId) : undefined;

                  const slotIndex = i + 1;

                  return (
                    <Fragment key={`slot-${i}`}>
                      <SortableCard
                        id={id}
                        item={item}
                        slotIndex={slotIndex}
                        hasOutgoingRisk={hasOutgoingRisk}
                      />
                      {transition && nextItem && (
                        <TransitionSlot
                          transition={transition}
                          fromSkuName={item.skuName}
                          toSkuName={nextItem.skuName}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </SortableContext>

              <DragOverlay adjustScale={false} dropAnimation={null}>
                {activeItem ? (
                  <div
                    className="drag-overlay-card"
                    style={
                      overlayWidth != null ? { width: overlayWidth } : undefined
                    }
                  >
                    <SeqSlotRow
                      slotIndex={activeSlotIndex}
                      warn={activeHasOutgoingRisk}
                    >
                      <div className="seq-slot-surface">
                        <SkuCard
                          item={activeItem}
                          overlay
                          hasOutgoingRisk={activeHasOutgoingRisk}
                          trailing={
                            <span className="drag-handle" aria-hidden="true">
                              <GripVertical size={14} />
                            </span>
                          }
                        />
                      </div>
                    </SeqSlotRow>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>
    </WorkspaceChrome>
  );
}

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
import type { PlanItem, RiskWarning, TransitionCost, WarningSeverity } from '../api/types';
import { formatScore } from '../utils/costFormat';
import SkuCard from './SkuCard';
import TransitionSlot from './TransitionSlot';

function transitionKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

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

function SortableCard({ id, item, index, warning }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`sortable-card-wrapper${isDragging ? ' sortable-card-wrapper--dragging' : ''}`}
      style={style}
      {...attributes}
    >
      <SkuCard
        item={item}
        index={index}
        warning={warning}
        trailing={
          <span className="drag-handle" {...listeners} aria-label="드래그 핸들">
            <GripVertical size={14} />
          </span>
        }
      />
    </div>
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
}

function WorkspaceChrome({ children }: { children: ReactNode }) {
  return (
    <section aria-label="생산 순서">
      <div className="workspace-box">
        <div className="section-hd">
          <div>
            <h2 className="section-lbl">생산 순서</h2>
            <p className="section-sub">현재안을 드래그해 순서를 바꿉니다</p>
          </div>
          <span className="panel-hd-note">낮은 objectiveScore가 유리</span>
        </div>
        <div className="panel-hd panel-hd--sub">
          <span>추천안 vs 현재안</span>
          <span className="panel-hd-note">카드 key = plan_item_id</span>
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
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const itemMap = new Map(planItems.map(i => [i.planItemId, i]));
  const warnMap = new Map(riskWarnings.map(w => [w.fromPlanItemId, w]));
  const transitionMap = new Map(
    transitionCosts.map(t => [transitionKey(t.fromPlanItemId, t.toPlanItemId), t]),
  );

  /** 드래그 overlay 대상과 페이지 드래그 상태를 함께 시작한다. */
  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    onDragStart();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
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
    onDragCancel();
  }

  const activeIndex = activeId ? currentSequence.indexOf(activeId) : -1;
  const activeWarning =
    activeId && activeIndex >= 0
      ? (() => {
          const rw = warnMap.get(activeId);
          const toItem = rw ? itemMap.get(rw.toPlanItemId) : undefined;
          return rw && toItem
            ? { severity: rw.severity, toSkuName: toItem.skuName, ruleId: rw.ruleId }
            : null;
        })()
      : null;

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
              return <SkuCard key={id} item={item} index={i + 1} />;
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
                  const nextId = currentSequence[i + 1];
                  const rw = warnMap.get(id);
                  const toItem = rw ? itemMap.get(rw.toPlanItemId) : undefined;
                  const warning: WarningInfo | null =
                    rw && toItem
                      ? { severity: rw.severity, toSkuName: toItem.skuName, ruleId: rw.ruleId }
                      : null;
                  const transition = nextId
                    ? transitionMap.get(transitionKey(id, nextId))
                    : undefined;
                  const nextItem = nextId ? itemMap.get(nextId) : undefined;

                  return (
                    <Fragment key={id}>
                      <SortableCard
                        id={id}
                        item={item}
                        index={i + 1}
                        warning={warning}
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
                {activeItem && activeIndex >= 0 ? (
                  <div className="drag-overlay-card sortable-card-wrapper">
                    <SkuCard
                      item={activeItem}
                      index={activeIndex + 1}
                      warning={activeWarning}
                      trailing={
                        <span className="drag-handle" aria-hidden="true">
                          <GripVertical size={14} />
                        </span>
                      }
                    />
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

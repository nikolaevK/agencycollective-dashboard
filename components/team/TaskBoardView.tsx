"use client";

import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Flag, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientChip, DueLabel } from "./MemberHub";
import { QuickAddRow } from "./TasksTab";
import { sortTasks, type TaskMutations } from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
} from "./presentation";
import type { MemberHubPayload, TeamTaskRecord, TaskStatus } from "./types";

const LANE_SPACING = 1024;

/**
 * Kanban board — @dnd-kit (the SopBuilder pattern), one droppable column per
 * status, cards sortable across and within columns. A drop optimistically
 * re-lanes the card in the cache, then PATCHes { move: { status, afterTaskId } }
 * — the SERVER computes the authoritative position; errors invalidate.
 */
export function TaskBoardView({
  hub,
  tasks,
  allTasks,
  today,
  mutations,
  onOpenTask,
}: {
  hub: MemberHubPayload;
  /** Filtered, sorted tasks to display. */
  tasks: TeamTaskRecord[];
  /** The full unfiltered cache list (optimistic updates rewrite this). */
  allTasks: TeamTaskRecord[];
  today: string;
  mutations: TaskMutations;
  onOpenTask: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Without a coordinateGetter the keyboard sensor activates but can't
    // compute drop positions (same wiring as SopBuilder).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns = useMemo(() => {
    const map = new Map<TaskStatus, TeamTaskRecord[]>();
    for (const s of TASK_STATUS_ORDER) map.set(s, []);
    for (const t of sortTasks(tasks)) map.get(t.status)?.push(t);
    return map;
  }, [tasks]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === activeId) return;
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    // Resolve the target column + insertion index within the VISIBLE column.
    let status: TaskStatus;
    let insertIndex: number;
    if (overId.startsWith("col:")) {
      status = overId.slice(4) as TaskStatus;
      insertIndex = (columns.get(status) ?? []).length;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      status = overTask.status;
      const col = columns.get(status) ?? [];
      const overIndex = col.findIndex((t) => t.id === overId);
      if (status === task.status) {
        const oldIndex = col.findIndex((t) => t.id === activeId);
        insertIndex = arrayMove(col, oldIndex, overIndex).findIndex(
          (t) => t.id === activeId
        );
      } else {
        insertIndex = overIndex;
      }
    }

    // Column contents minus the moving card = the anchor lane.
    const lane = (columns.get(status) ?? []).filter((t) => t.id !== activeId);
    const clamped = Math.min(insertIndex, lane.length);
    const afterTask = clamped > 0 ? lane[clamped - 1] : null;
    if (status === task.status) {
      // Same column, same predecessor → the drop resolves to the card's
      // current slot; skip the no-op PATCH.
      const col = columns.get(status) ?? [];
      const oldIndex = col.findIndex((t) => t.id === activeId);
      const currentAfterId = oldIndex > 0 ? col[oldIndex - 1].id : null;
      if ((afterTask?.id ?? null) === currentAfterId) return;
    }

    // Client-side midpoint (render order only — the server recomputes).
    const prev = afterTask?.sortPos ?? null;
    const next = clamped < lane.length ? lane[clamped].sortPos : null;
    let sortPos: number;
    if (prev == null && next == null) sortPos = LANE_SPACING;
    else if (prev == null) sortPos = (next as number) - LANE_SPACING;
    else if (next == null) sortPos = prev + LANE_SPACING;
    else sortPos = (prev + next) / 2;

    const optimistic = allTasks.map((t) =>
      t.id === activeId ? { ...t, status, sortPos } : t
    );
    mutations
      .moveTask(activeId, { status, afterTaskId: afterTask?.id ?? null }, optimistic)
      .catch((err) => alert(err instanceof Error ? err.message : String(err)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 items-start">
        {TASK_STATUS_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns.get(status) ?? []}
            hub={hub}
            today={today}
            mutations={mutations}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    </DndContext>
  );
}

function BoardColumn({
  status,
  tasks,
  hub,
  today,
  mutations,
  onOpenTask,
}: {
  status: TaskStatus;
  tasks: TeamTaskRecord[];
  hub: MemberHubPayload;
  today: string;
  mutations: TaskMutations;
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const meta = TASK_STATUS_META[status];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // min-w-0 lets the column shrink inside the grid — its content
        // (cards, quick-add) must never widen the track past its share.
        "min-w-0 rounded-xl border bg-muted/20 p-2.5 transition-colors",
        isOver ? "border-primary/60 bg-primary/[0.04]" : "border-border/60"
      )}
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide",
            meta.chip
          )}
        >
          {meta.label}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2", tasks.length === 0 && "min-h-[48px]")}>
          {tasks.map((t) => (
            <BoardCard key={t.id} task={t} hub={hub} today={today} onOpen={() => onOpenTask(t.id)} />
          ))}
        </div>
      </SortableContext>
      <div className="mt-1 rounded-lg border border-dashed border-border/60">
        <QuickAddRow hub={hub} defaults={{ status }} mutations={mutations} compact />
      </div>
    </div>
  );
}

function BoardCard({
  task: t,
  hub,
  today,
  onOpen,
}: {
  task: TeamTaskRecord;
  hub: MemberHubPayload;
  today: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
  });
  const ckDone = t.checklist.filter((c) => c.done).length;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border border-border/60 bg-card p-2.5 cursor-pointer hover:border-primary/50 transition-colors",
        isDragging && "opacity-60 ring-2 ring-primary/40 z-10 relative"
      )}
      onClick={onOpen}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
          aria-label="Drag to move"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <p
          className={cn(
            "flex-1 min-w-0 break-words text-xs font-semibold leading-snug",
            t.status === "complete" ? "text-muted-foreground line-through" : "text-foreground"
          )}
        >
          {t.title}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap pl-5">
        {t.clientId && <ClientChip hub={hub} clientId={t.clientId} />}
        <DueLabel task={t} today={today} />
        <Flag className={cn("h-3 w-3", TASK_PRIORITY_META[t.priority].flag)} />
        {t.checklist.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground">
            ☑ {ckDone}/{t.checklist.length}
          </span>
        )}
        {t.source !== "manual" && (
          <span className="text-[9px] font-bold uppercase text-cyan-600 dark:text-cyan-400">
            ⚡ auto
          </span>
        )}
      </div>
    </div>
  );
}

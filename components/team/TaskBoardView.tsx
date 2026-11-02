"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListChecks, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientChip, DueLabel, PriorityFlag } from "./TeamBits";
import { QuickAddRow } from "./TasksTab";
import { sortTasks, type TaskMutations } from "./useTeamData";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "./presentation";
import type { MemberHubPayload, TeamTaskRecord, TaskStatus } from "./types";

const LANE_SPACING = 1024;

/**
 * Pointer-first targeting: the card under the pointer; in a lane's gaps or
 * empty space, that lane's nearest card — or the lane itself (= append) once
 * the pointer is below its last card. closestCorners stays as the keyboard
 * fallback: measuring the dragged card's corners made a drop under a lane's
 * last card land BEFORE that card.
 */
const boardCollision: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return closestCorners(args);
  const within = pointerWithin(args);
  const card = within.find((c) => !String(c.id).startsWith("col:"));
  if (card) return [card];
  const lane = within.find((c) => String(c.id).startsWith("col:"));
  if (!lane) return closestCorners(args);
  const status = String(lane.id).slice(4);
  let nearest: { id: UniqueIdentifier; dist: number } | null = null;
  let lastBottom = -Infinity;
  for (const d of args.droppableContainers) {
    if (String(d.id).startsWith("col:") || d.id === args.active.id) continue;
    if (d.data.current?.status !== status) continue;
    const r = args.droppableRects.get(d.id);
    if (!r) continue;
    lastBottom = Math.max(lastBottom, r.bottom);
    const dist = Math.abs(pointer.y - (r.top + r.height / 2));
    if (!nearest || dist < nearest.dist) nearest = { id: d.id, dist };
  }
  return nearest && pointer.y <= lastBottom ? [{ id: nearest.id }] : [lane];
};

/**
 * Kanban board — @dnd-kit (the SopBuilder pattern), one droppable column per
 * status, cards sortable across and within columns. A drop optimistically
 * re-lanes the card in the cache, then PATCHes { move: { status, afterTaskId } }
 * — the SERVER computes the authoritative position; errors invalidate.
 */
// Below Tailwind's md — where DnD gives way to the per-card status picker.
const PHONE_QUERY = "(max-width: 767px)";
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isPhone = () => window.matchMedia(PHONE_QUERY).matches;

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
  // One subscription for the board: a closed Radix Select still renders its
  // items (for SelectValue), so the picker is only mounted where it shows.
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Without a coordinateGetter the keyboard sensor activates but can't
    // compute drop positions (same wiring as SopBuilder).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // The card being dragged — drawn as a floating copy (DragOverlay) so it
  // follows the pointer into other columns. Without the overlay, dnd-kit only
  // moves a card while it's over its OWN column's list, so a cross-column
  // drag looked like nothing was happening until the drop.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingTask = draggingId ? allTasks.find((t) => t.id === draggingId) ?? null : null;

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
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={(e) => setDraggingId(String(e.active.id))}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={(e) => {
        setDraggingId(null);
        handleDragEnd(e);
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 items-start">
        {TASK_STATUS_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns.get(status) ?? []}
            hub={hub}
            today={today}
            mutations={mutations}
            onOpenTask={onOpenTask}
            statusPicker={phone}
          />
        ))}
      </div>
      {/* No drop animation: the card is already re-laned optimistically, so
          animating the copy back to the old slot would look like a bounce. */}
      <DragOverlay dropAnimation={null}>
        {draggingTask ? <BoardCardOverlay task={draggingTask} hub={hub} today={today} /> : null}
      </DragOverlay>
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
  statusPicker,
}: {
  status: TaskStatus;
  tasks: TeamTaskRecord[];
  hub: MemberHubPayload;
  today: string;
  mutations: TaskMutations;
  onOpenTask: (id: string) => void;
  statusPicker: boolean;
}) {
  // A card from ANOTHER column is over this one (its empty space or one of
  // its cards) — highlight the lane it will land in. active/over come from
  // useDroppable (internal context): useDndContext would re-render every
  // column on each pointer move (its collisions change every frame).
  const { setNodeRef, active, over } = useDroppable({ id: `col:${status}`, data: { status } });
  const isTarget =
    !!active && active.data.current?.status !== status && over?.data.current?.status === status;
  const meta = TASK_STATUS_META[status];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // min-w-0 lets the column shrink inside the grid — its content
        // (cards, quick-add) must never widen the track past its share.
        "min-w-0 rounded-3xl bg-muted/40 p-2.5 transition-[background-color,box-shadow]",
        isTarget && "bg-muted/70 ring-2 ring-foreground/15"
      )}
    >
      <div className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2", tasks.length === 0 && "min-h-[48px]")}>
          {tasks.map((t) => (
            <BoardCard
              key={t.id}
              task={t}
              hub={hub}
              today={today}
              onOpen={() => onOpenTask(t.id)}
              onStatusChange={
                statusPicker
                  ? (next) =>
                      mutations
                        .patchTask(t.id, { status: next })
                        .catch((err) => alert(err instanceof Error ? err.message : String(err)))
                  : undefined
              }
            />
          ))}
        </div>
      </SortableContext>
      <div className="mt-2 rounded-2xl border border-dashed border-foreground/10">
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
  onStatusChange,
}: {
  task: TeamTaskRecord;
  hub: MemberHubPayload;
  today: string;
  onOpen: () => void;
  /** Set only on phones (the picker isn't mounted elsewhere). */
  onStatusChange?: (status: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active } =
    useSortable({ id: t.id, data: { status: t.status } });
  // A card from another column hovering this one drops right before it
  // (handleDragEnd inserts at the hovered card's index) — mark that spot.
  const dropBefore =
    isOver && !!active && active.id !== t.id && active.data.current?.status !== t.status;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/5 cursor-pointer transition-[box-shadow,opacity] hover:ring-foreground/15 dark:ring-foreground/10 dark:hover:ring-foreground/20",
        // The floating copy follows the pointer; this one marks where it came from.
        isDragging && "opacity-40 shadow-none",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {dropBefore && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 -top-[5px] h-0.5 rounded-full bg-foreground/40"
        />
      )}
      <CardFace
        task={t}
        hub={hub}
        today={today}
        handle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing p-2.5 -m-2 text-muted-foreground/50 hover:text-muted-foreground touch-none"
            aria-label="Drag to move"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      >
        {/* Touch users can't drag across vertically-stacked columns — give
            them a direct status control (not mounted on md+ where DnD works). */}
        {onStatusChange && (
          <Select value={t.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
            <SelectTrigger
              onClick={(e) => e.stopPropagation()}
              className="md:hidden ml-auto h-7 w-auto px-2.5 text-xs text-muted-foreground"
              aria-label="Change status"
            >
              <SelectValue />
            </SelectTrigger>
            {/* The menu is portaled, but React still bubbles its clicks through
                this card — stop them so picking a status doesn't open the task
                (the native <select> never let them reach the card). */}
            <SelectContent onClick={(e) => e.stopPropagation()}>
              {TASK_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardFace>
    </div>
  );
}

/** The floating copy that follows the pointer while a card is dragged. */
function BoardCardOverlay({
  task,
  hub,
  today,
}: {
  task: TeamTaskRecord;
  hub: MemberHubPayload;
  today: string;
}) {
  return (
    <div className="cursor-grabbing rounded-2xl bg-card p-3 shadow-lg ring-1 ring-foreground/15 dark:ring-foreground/20">
      <CardFace
        task={task}
        hub={hub}
        today={today}
        handle={
          <span className="mt-0.5 shrink-0 p-2.5 -m-2 text-muted-foreground">
            <GripVertical className="size-3.5" />
          </span>
        }
      />
    </div>
  );
}

/** Title + chips row — shared by the card and its drag copy. */
function CardFace({
  task: t,
  hub,
  today,
  handle,
  children,
}: {
  task: TeamTaskRecord;
  hub: MemberHubPayload;
  today: string;
  handle: React.ReactNode;
  children?: React.ReactNode;
}) {
  const ckDone = t.checklist.filter((c) => c.done).length;
  return (
    <>
      <div className="flex items-start gap-1.5">
        {handle}
        <p
          className={cn(
            "flex-1 min-w-0 break-words text-sm font-medium leading-snug",
            t.status === "complete" ? "text-muted-foreground line-through" : "text-foreground"
          )}
        >
          {t.title}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap pl-5">
        {t.clientId && <ClientChip hub={hub} clientId={t.clientId} />}
        <DueLabel task={t} today={today} />
        <PriorityFlag priority={t.priority} className="size-3" />
        {t.checklist.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <ListChecks className="size-3.5" />
            {ckDone}/{t.checklist.length}
          </span>
        )}
        {t.source !== "manual" && (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            <Zap />
            Auto
          </Badge>
        )}
        {children}
      </div>
    </>
  );
}

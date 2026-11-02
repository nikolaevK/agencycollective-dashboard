"use client";

import { useDeferredValue, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronDown, ChevronRight, List, ListChecks, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ClientChip, DueLabel, PriorityFlag, TaskStatusDot } from "./TeamBits";
import { sortTasks, type TaskMutations } from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
} from "./presentation";
import type {
  MemberHubPayload,
  TeamTaskRecord,
  TaskStatus,
  TaskPriority,
} from "./types";

// The board (and its @dnd-kit dependency) only loads once someone opens it.
const TaskBoardView = dynamic(
  () => import("./TaskBoardView").then((m) => m.TaskBoardView),
  { loading: () => <Skeleton className="h-72 rounded-3xl" /> }
);

type FilterChip = "all" | "todo" | "in_progress" | "review" | "complete" | "overdue";
type GroupBy = "status" | "client" | "priority";
type View = "list" | "board";

export function TasksTab({
  hub,
  tasks,
  today,
  mutations,
  onOpenTask,
}: {
  hub: MemberHubPayload;
  tasks: TeamTaskRecord[];
  today: string;
  mutations: TaskMutations;
  onOpenTask: (id: string) => void;
}) {
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [search, setSearch] = useState("");
  // Typing stays responsive while the (up to 500-row) list re-filters behind it.
  const deferredSearch = useDeferredValue(search);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isOverdue = (t: TeamTaskRecord) =>
    t.status !== "complete" && !!t.dueDate && t.dueDate < today;

  const counts: Record<FilterChip, number> = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      review: tasks.filter((t) => t.status === "review").length,
      complete: tasks.filter((t) => t.status === "complete").length,
      overdue: tasks.filter(isOverdue).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, today]
  );

  const visible = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const clientName = new Map(hub.clients.map((c) => [c.id, c.displayName]));
    return sortTasks(tasks).filter((t) => {
      if (filter === "overdue" && !isOverdue(t)) return false;
      if (filter !== "all" && filter !== "overdue" && t.status !== filter) return false;
      if (q) {
        const client = t.clientId ? clientName.get(t.clientId) : undefined;
        const hay = `${t.title} ${t.description} ${client ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, deferredSearch, today, hub.clients]);

  const chips: { id: FilterChip; label: string }[] = [
    { id: "all", label: "All" },
    { id: "todo", label: "Open" },
    { id: "in_progress", label: "In Progress" },
    { id: "review", label: "Review" },
    { id: "complete", label: "Done" },
    { id: "overdue", label: "Overdue" },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {chips.map((c) => {
            const active = filter === c.id;
            // "Has overdue tasks" emphasis — subtle danger text while the
            // Overdue chip isn't the active filter.
            const flagged = c.id === "overdue" && counts.overdue > 0 && filter !== "overdue";
            return (
              <Button
                key={c.id}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={active}
                onClick={() => setFilter(c.id)}
                className={cn(
                  "gap-1.5",
                  active && "bg-muted text-foreground",
                  flagged &&
                    "text-red-700 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400"
                )}
              >
                {c.label}
                <span className={cn("tabular-nums", flagged ? "opacity-80" : "text-muted-foreground")}>
                  {counts[c.id]}
                </span>
              </Button>
            );
          })}
        </div>
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="h-8 flex-1 min-w-[130px] sm:flex-none sm:w-44"
        />
        {view === "list" && (
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-auto" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Group: Status</SelectItem>
              <SelectItem value="client">Group: Client</SelectItem>
              <SelectItem value="priority">Group: Priority</SelectItem>
            </SelectContent>
          </Select>
        )}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => {
            // Radix sends "" when the active item is re-clicked — keep the view.
            if (v) setView(v as View);
          }}
          aria-label="View"
        >
          {(
            [
              { id: "list", icon: List, label: "List" },
              { id: "board", icon: Columns3, label: "Board" },
            ] as const
          ).map((v) => (
            <ToggleGroupItem key={v.id} value={v.id} className="gap-1.5">
              <v.icon />
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {view === "board" ? (
        <TaskBoardView
          hub={hub}
          tasks={visible}
          allTasks={tasks}
          today={today}
          mutations={mutations}
          onOpenTask={onOpenTask}
        />
      ) : (
        <ListView
          hub={hub}
          tasks={visible}
          today={today}
          groupBy={groupBy}
          collapsed={collapsed}
          onToggleGroup={(g) => setCollapsed((prev) => ({ ...prev, [g]: !prev[g] }))}
          mutations={mutations}
          onOpenTask={onOpenTask}
        />
      )}
    </div>
  );
}

/* ── List view ─────────────────────────────────────────────────────────── */

interface TaskGroup {
  id: string;
  label: string;
  tone: BadgeTone;
  tasks: TeamTaskRecord[];
  quickAddDefaults: { status?: TaskStatus; priority?: TaskPriority; clientId?: string | null };
}

function ListView({
  hub,
  tasks,
  today,
  groupBy,
  collapsed,
  onToggleGroup,
  mutations,
  onOpenTask,
}: {
  hub: MemberHubPayload;
  tasks: TeamTaskRecord[];
  today: string;
  groupBy: GroupBy;
  collapsed: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  mutations: TaskMutations;
  onOpenTask: (id: string) => void;
}) {
  const groups = useMemo<TaskGroup[]>(() => {
    if (groupBy === "status") {
      return TASK_STATUS_ORDER.map((s) => ({
        id: `st:${s}`,
        label: TASK_STATUS_META[s].label,
        tone: TASK_STATUS_META[s].tone,
        tasks: tasks.filter((t) => t.status === s),
        quickAddDefaults: { status: s },
      }));
    }
    if (groupBy === "priority") {
      return TASK_PRIORITY_ORDER.map((p) => ({
        id: `pr:${p}`,
        label: TASK_PRIORITY_META[p].label,
        tone: TASK_PRIORITY_META[p].tone,
        tasks: tasks.filter((t) => t.priority === p),
        quickAddDefaults: { priority: p },
      })).filter((g) => g.tasks.length > 0);
    }
    const ids = [...new Set(tasks.map((t) => t.clientId ?? ""))];
    return ids
      .map((id) => {
        const client = hub.clients.find((c) => c.id === id);
        return {
          id: `cl:${id}`,
          label: id ? (client?.displayName ?? "Unknown client") : "No client",
          tone: "neutral" as const,
          tasks: tasks.filter((t) => (t.clientId ?? "") === id),
          quickAddDefaults: { clientId: id || null },
        };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [tasks, groupBy, hub.clients]);

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.id];
        return (
          <div key={g.id}>
            <button
              type="button"
              onClick={() => onToggleGroup(g.id)}
              aria-expanded={!isCollapsed}
              className="mb-2 flex items-center gap-2 rounded-xl px-1 py-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              )}
              <StatusBadge tone={g.tone}>{g.label}</StatusBadge>
              <span className="text-xs text-muted-foreground tabular-nums">{g.tasks.length}</span>
            </button>
            {!isCollapsed && (
              <Card className="divide-y">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    hub={hub}
                    task={t}
                    today={today}
                    mutations={mutations}
                    onOpen={() => onOpenTask(t.id)}
                  />
                ))}
                <QuickAddRow hub={hub} defaults={g.quickAddDefaults} mutations={mutations} />
              </Card>
            )}
          </div>
        );
      })}
      {groups.every((g) => g.tasks.length === 0) && (
        <p className="rounded-3xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          No tasks match.
        </p>
      )}
    </div>
  );
}

function TaskRow({
  hub,
  task: t,
  today,
  mutations,
  onOpen,
}: {
  hub: MemberHubPayload;
  task: TeamTaskRecord;
  today: string;
  mutations: TaskMutations;
  onOpen: () => void;
}) {
  const done = t.status === "complete";
  const ckDone = t.checklist.filter((c) => c.done).length;
  return (
    // flex-wrap + the title's min-w floor: on phones the chips/due/flag wrap
    // to a second line instead of crushing the title to nothing.
    <div
      role="button"
      tabIndex={0}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-muted/60"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          mutations
            .patchTask(t.id, { status: done ? "todo" : "complete" })
            .catch((err) => alert(err instanceof Error ? err.message : String(err)));
        }}
        className={cn(
          // after: pseudo-element widens the 18px circle's hit area to ~34px.
          "relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors after:absolute after:-inset-2",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/40 text-transparent hover:border-emerald-500 hover:text-emerald-500"
        )}
        aria-label={done ? "Reopen task" : "Complete task"}
      >
        <Check className="size-3" />
      </button>
      <TaskStatusDot status={t.status} />
      <span
        className={cn(
          "flex-1 min-w-[55%] truncate text-sm font-medium",
          done ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {t.title}
      </span>
      {t.checklist.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <ListChecks className="size-3.5" />
          {ckDone}/{t.checklist.length}
        </span>
      )}
      {t.clientId && <ClientChip hub={hub} clientId={t.clientId} />}
      <DueLabel task={t} today={today} />
      <PriorityFlag priority={t.priority} />
    </div>
  );
}

/* ── Quick add ─────────────────────────────────────────────────────────── */

const NO_CLIENT = "__none__";

export function QuickAddRow({
  hub,
  defaults,
  mutations,
  compact = false,
}: {
  hub: MemberHubPayload;
  defaults: { status?: TaskStatus; priority?: TaskPriority; clientId?: string | null };
  mutations: TaskMutations;
  /**
   * Board-column layout: the title input takes the full width and the
   * client/priority selects appear on their own row only while typing —
   * a fixed single-row layout overflows the narrow Kanban columns.
   */
  compact?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(defaults.clientId ?? "");
  const [priority, setPriority] = useState<TaskPriority>(defaults.priority ?? "normal");
  const [busy, setBusy] = useState(false);
  const fixedClient = defaults.clientId !== undefined;

  async function submit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await mutations.createTask({
        title: t,
        status: defaults.status,
        priority,
        clientId: clientId || null,
      });
      setTitle("");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Radix Select can't hold "" — "No client" rides on a sentinel and maps
  // back to "" so `clientId || null` below behaves exactly as before.
  const clientSelect = !fixedClient && (
    <Select
      value={clientId || NO_CLIENT}
      onValueChange={(v) => setClientId(v === NO_CLIENT ? "" : v)}
    >
      <SelectTrigger
        className={cn(
          "h-7 px-2.5 text-xs text-muted-foreground",
          compact ? "min-w-0 flex-1" : "w-auto min-w-0 max-w-[150px]"
        )}
        aria-label="Client"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CLIENT}>No client</SelectItem>
        {hub.clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const prioritySelect = defaults.priority === undefined && (
    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
      <SelectTrigger
        className={cn(
          "h-7 w-auto px-2.5 text-xs text-muted-foreground",
          compact && "min-w-0 shrink-0"
        )}
        aria-label="Priority"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITY_ORDER.map((p) => (
          <SelectItem key={p} value={p}>
            {TASK_PRIORITY_META[p].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (compact) {
    return (
      <div className="px-2.5 py-1.5 space-y-1.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="+ Add task"
          disabled={busy}
          className="w-full min-w-0 bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        {title.trim() && (
          <div className="flex items-center gap-1.5">
            {clientSelect}
            {prioritySelect}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-1.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="+ Add task"
        disabled={busy}
        className="flex-1 min-w-[120px] bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
      {clientSelect}
      {prioritySelect}
    </div>
  );
}

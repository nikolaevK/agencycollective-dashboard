"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Flag, List, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskBoardView } from "./TaskBoardView";
import { ClientChip, DueLabel } from "./MemberHub";
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
    const q = search.trim().toLowerCase();
    return sortTasks(tasks).filter((t) => {
      if (filter === "overdue" && !isOverdue(t)) return false;
      if (filter !== "all" && filter !== "overdue" && t.status !== filter) return false;
      if (q) {
        const client = hub.clients.find((c) => c.id === t.clientId);
        const hay = `${t.title} ${t.description} ${client?.displayName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, search, today, hub.clients]);

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
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                filter === c.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
                c.id === "overdue" && counts.overdue > 0 && filter !== "overdue"
                  ? "text-red-600 dark:text-red-400 border-red-500/40"
                  : undefined
              )}
            >
              {c.label}
              <span className="ml-1.5 opacity-70">{counts[c.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="h-8 flex-1 min-w-[130px] sm:flex-none sm:w-44 rounded-lg border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {view === "list" && (
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold text-foreground"
            aria-label="Group by"
          >
            <option value="status">Group: Status</option>
            <option value="client">Group: Client</option>
            <option value="priority">Group: Priority</option>
          </select>
        )}
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(
            [
              { id: "list", icon: List, label: "List" },
              { id: "board", icon: Columns3, label: "Board" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                view === v.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          ))}
        </div>
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
  chip: string;
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
        chip: TASK_STATUS_META[s].chip,
        tasks: tasks.filter((t) => t.status === s),
        quickAddDefaults: { status: s },
      }));
    }
    if (groupBy === "priority") {
      return TASK_PRIORITY_ORDER.map((p) => ({
        id: `pr:${p}`,
        label: TASK_PRIORITY_META[p].label,
        chip: TASK_PRIORITY_META[p].chip,
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
          chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
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
              className="flex items-center gap-2 mb-1 px-1"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide",
                  g.chip
                )}
              >
                {g.label}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{g.tasks.length}</span>
            </button>
            {!isCollapsed && (
              <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50">
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
              </div>
            )}
          </div>
        );
      })}
      {groups.every((g) => g.tasks.length === 0) && (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
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
    <div
      className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={onOpen}
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
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/40 text-transparent hover:border-emerald-500 hover:text-emerald-500"
        )}
        aria-label={done ? "Reopen task" : "Complete task"}
      >
        <Check className="h-3 w-3" />
      </button>
      <span className={cn("h-2 w-2 shrink-0 rounded-sm", TASK_STATUS_META[t.status].dot)} />
      <span
        className={cn(
          "flex-1 truncate text-sm font-semibold",
          done ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {t.title}
      </span>
      {t.checklist.length > 0 && (
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
          ☑ {ckDone}/{t.checklist.length}
        </span>
      )}
      {t.clientId && <ClientChip hub={hub} clientId={t.clientId} />}
      <DueLabel task={t} today={today} />
      <Flag className={cn("h-3.5 w-3.5 shrink-0", TASK_PRIORITY_META[t.priority].flag)} />
    </div>
  );
}

/* ── Quick add ─────────────────────────────────────────────────────────── */

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

  const clientSelect = !fixedClient && (
    <select
      value={clientId}
      onChange={(e) => setClientId(e.target.value)}
      className={cn(
        "h-7 rounded-md border border-input bg-background px-1.5 text-[11px] text-muted-foreground",
        compact ? "min-w-0 flex-1" : "min-w-0 max-w-[150px]"
      )}
      aria-label="Client"
    >
      <option value="">No client</option>
      {hub.clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.displayName}
        </option>
      ))}
    </select>
  );
  const prioritySelect = defaults.priority === undefined && (
    <select
      value={priority}
      onChange={(e) => setPriority(e.target.value as TaskPriority)}
      className={cn(
        "h-7 rounded-md border border-input bg-background px-1.5 text-[11px] text-muted-foreground",
        compact && "min-w-0 shrink-0"
      )}
      aria-label="Priority"
    >
      {TASK_PRIORITY_ORDER.map((p) => (
        <option key={p} value={p}>
          {TASK_PRIORITY_META[p].label}
        </option>
      ))}
    </select>
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
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
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

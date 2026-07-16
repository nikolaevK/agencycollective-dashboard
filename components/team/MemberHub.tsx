"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flag, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthlyHeadline, monthlyRebillBucket } from "@/lib/teamRebill";
import { formatMoney } from "@/components/users/format";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { RebillStatusChip } from "@/components/users/RebillStatusChip";
import { HEALTH_CHIP_CLS, FALLBACK_CHIP_CLS, CHIP_BASE } from "@/components/users/rosterPresentation";
import { MemberAvatar } from "./TeamHome";
import { MonthlyRebillTracker } from "./MonthlyRebillTracker";
import { TasksTab } from "./TasksTab";
import { ActionItemsTab } from "./ActionItemsTab";
import { TaggedTab } from "./TaggedTab";
import { ClientsTab } from "./ClientsTab";
import { TaskDetailSheet } from "./TaskDetailSheet";
import {
  useMemberHub,
  useMemberTasks,
  useMemberActionItems,
  useTaggedTasks,
  useTaskMutations,
} from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  ATTRIBUTION_LABEL,
  TIMEFRAME_OPTIONS,
  SOURCE_META,
  monthName,
} from "./presentation";
import type {
  MemberHubPayload,
  TeamTaskRecord,
  TeamActionItemRecord,
  TeamClientSlice,
  TeamTimeframeValue,
} from "./types";

type HubTab = "home" | "tasks" | "actions" | "tagged" | "clients";

/** Header metric chips drill into the matching list inline (KPI-tile pattern). */
type HeaderDrillKind =
  | "tasks"
  | "pending"
  | "done"
  | "overdue"
  | "clients"
  | "retention"
  | "unsolved";

export function MemberHub({ adminId }: { adminId: string }) {
  const [timeframe, setTimeframe] = useState<TeamTimeframeValue>("week");
  const [tab, setTab] = useState<HubTab>("home");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [headerDrill, setHeaderDrill] = useState<HeaderDrillKind | null>(null);

  const hubQuery = useMemberHub(adminId, timeframe);
  const tasksQuery = useMemberTasks(adminId);
  const itemsQuery = useMemberActionItems(adminId);
  const taggedQuery = useTaggedTasks(adminId);
  const mutations = useTaskMutations(adminId);

  if (hubQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-72 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }
  if (hubQuery.error || !hubQuery.data) {
    const msg = hubQuery.error instanceof Error ? hubQuery.error.message : "";
    const forbidden = /forbidden/i.test(msg);
    return (
      <div className="rounded-xl border border-border p-10 text-center">
        <p className="text-sm font-semibold text-foreground">
          {forbidden ? "This hub isn't yours to view" : "Couldn't load this member hub"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {forbidden
            ? "Only admins with Admin Management access can open other members' hubs."
            : msg || "The member may not be on the roster."}
        </p>
        <Link href="/dashboard/team" className="mt-4 inline-block text-sm font-semibold text-primary">
          ← Back to Team
        </Link>
      </div>
    );
  }

  const hub = hubQuery.data;
  const tasks = tasksQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const tagged = taggedQuery.data ?? [];
  const today = hub.today;
  const pending = tasks.filter((t) => t.status !== "complete").length;
  const unsolved = items.filter((i) => i.status === "unsolved").length;
  // The tag "notification": open tagged tasks badge the tab until untagged.
  const taggedOpen = tagged.filter((t) => t.status !== "complete").length;
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  const tabs: { id: HubTab; label: string; count: number | null }[] = [
    { id: "home", label: "Home", count: null },
    { id: "tasks", label: "Tasks", count: pending },
    { id: "actions", label: "Action Items", count: unsolved },
    { id: "tagged", label: "Tagged", count: taggedOpen },
    { id: "clients", label: "Clients", count: hub.summary.clientCount },
  ];

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard/team"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Team
      </Link>

      {/* Header — stacks on phones: identity row first, goal ring below.
          (A single flex row let flex-1 crush the name to a few characters
          while the goal block kept its intrinsic width.) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <MemberAvatar name={hub.member.name} avatarPath={hub.member.avatarPath} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-black text-foreground break-words sm:truncate">
              {hub.member.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {hub.member.position || ATTRIBUTION_LABEL[hub.member.attribution]} ·{" "}
              {hub.summary.clientCount} clients · {formatMoney(hub.summary.mrrManagedCents)} MRR
              managed
            </p>
          </div>
        </div>
        <GoalRing
          collectedCents={monthlyHeadline(hub.summary.monthly).cents}
          goalCents={hub.summary.goalCents}
          month={hub.goalMonth}
        />
      </div>

      {/* Stat chips — click to drill into the matching list */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        <HeaderStat
          label="Tasks"
          value={tasks.length}
          onClick={() => setHeaderDrill(headerDrill === "tasks" ? null : "tasks")}
          active={headerDrill === "tasks"}
        />
        <HeaderStat
          label="Pending"
          value={pending}
          tone={pending > 0 ? "amber" : undefined}
          onClick={() => setHeaderDrill(headerDrill === "pending" ? null : "pending")}
          active={headerDrill === "pending"}
        />
        <HeaderStat
          label="Done"
          value={hub.summary.tasks.done}
          tone="green"
          onClick={() => setHeaderDrill(headerDrill === "done" ? null : "done")}
          active={headerDrill === "done"}
        />
        <HeaderStat
          label="Overdue"
          value={hub.summary.tasks.overdue}
          tone={hub.summary.tasks.overdue > 0 ? "red" : undefined}
          onClick={() => setHeaderDrill(headerDrill === "overdue" ? null : "overdue")}
          active={headerDrill === "overdue"}
        />
        <HeaderStat
          label="Clients"
          value={hub.summary.clientCount}
          onClick={() => setHeaderDrill(headerDrill === "clients" ? null : "clients")}
          active={headerDrill === "clients"}
        />
        <RetentionStat
          retention={hub.summary.retention}
          onClick={() => setHeaderDrill(headerDrill === "retention" ? null : "retention")}
          active={headerDrill === "retention"}
        />
        <HeaderStat
          label="Unsolved"
          value={unsolved}
          tone={unsolved > 0 ? "amber" : undefined}
          onClick={() => setHeaderDrill(headerDrill === "unsolved" ? null : "unsolved")}
          active={headerDrill === "unsolved"}
        />
      </div>

      {headerDrill && (
        <HeaderDrillPanel
          kind={headerDrill}
          hub={hub}
          tasks={tasks}
          items={items}
          today={today}
          onOpenTask={setOpenTaskId}
          onGoTab={(t) => {
            setHeaderDrill(null);
            setTab(t);
          }}
          onClose={() => setHeaderDrill(null)}
        />
      )}

      {/* Tab bar + timeframe */}
      <div className="flex items-end justify-between gap-3 border-b border-border flex-wrap">
        {/* Scrolls horizontally on narrow screens instead of overflowing. */}
        <div className="flex gap-1 max-w-full overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== null && (
                <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-bold text-muted-foreground">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 mb-1.5">
          {TIMEFRAME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTimeframe(o.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                timeframe === o.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "home" && (
        <HomeTab
          hub={hub}
          tasks={tasks}
          unsolved={unsolved}
          today={today}
          onOpenTask={setOpenTaskId}
          onGoTasks={() => setTab("tasks")}
          onGoActions={() => setTab("actions")}
          onGoClients={() => setTab("clients")}
        />
      )}
      {tab === "tasks" && (
        <TasksTab
          hub={hub}
          tasks={tasks}
          today={today}
          mutations={mutations}
          onOpenTask={setOpenTaskId}
        />
      )}
      {tab === "actions" && <ActionItemsTab hub={hub} items={items} onOpenTask={setOpenTaskId} />}
      {tab === "tagged" && <TaggedTab hub={hub} tasks={tagged} today={today} />}
      {tab === "clients" && <ClientsTab hub={hub} />}

      {openTask && (
        <TaskDetailSheet
          task={openTask}
          hub={hub}
          today={today}
          mutations={mutations}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

/** Shared clickable-chip shell for the header stats. */
function statChipCls(active?: boolean, clickable?: boolean) {
  return cn(
    "rounded-xl border bg-card px-3 py-2 text-center w-full transition-colors",
    active
      ? "border-primary ring-2 ring-primary/20 bg-primary/[0.03]"
      : "border-border/60",
    clickable && !active && "hover:border-primary/50 cursor-pointer"
  );
}

/**
 * Retention: clients re-billed this month out of total clients managed —
 * fills toward 100% as the month's payouts land, so no alarm colors.
 */
function RetentionStat({
  retention,
  onClick,
  active,
}: {
  retention: { base: number; retained: number };
  onClick?: () => void;
  active?: boolean;
}) {
  const pct =
    retention.base > 0
      ? Math.round((retention.retained / retention.base) * 100)
      : null;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={statChipCls(active, !!onClick)}
      title={
        pct !== null
          ? `${retention.retained} of ${retention.base} managed clients re-billed this month`
          : "No clients managed yet"
      }
    >
      <p
        className={cn(
          "text-lg font-black leading-none",
          pct === null ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {pct !== null ? `${pct}%` : "—"}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        Retention
      </p>
    </Tag>
  );
}

function HeaderStat({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber" | "green";
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={statChipCls(active, !!onClick)}
    >
      <p
        className={cn(
          "text-lg font-black leading-none",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
          !tone && "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </Tag>
  );
}

/**
 * Collected re-bills vs the monthly goal — the goal is a re-bill COLLECTION
 * target, so the ring fills as payouts land, not with book size. The arc
 * clamps at 100%; the center text shows the real percentage.
 */
function GoalRing({
  collectedCents,
  goalCents,
  month,
}: {
  collectedCents: number;
  goalCents: number;
  month: string;
}) {
  const pct = goalCents > 0 ? Math.round((collectedCents / goalCents) * 100) : null;
  const C = 2 * Math.PI * 26;
  // "2026-07" → "July 2026"
  const [gy, gm] = month.split("-").map(Number);
  const monthLabel =
    Number.isFinite(gy) && gm >= 1 && gm <= 12 ? `${monthName(month)} ${gy}` : month;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="26" className="stroke-muted" strokeWidth="7" fill="none" />
        {pct !== null && (
          <circle
            cx="32"
            cy="32"
            r="26"
            className="stroke-primary"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${((C * Math.min(pct, 100)) / 100).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 32 32)"
          />
        )}
        <text
          x="32"
          y="37"
          textAnchor="middle"
          className="fill-foreground"
          fontSize="13"
          fontWeight="700"
        >
          {pct !== null ? `${pct}%` : "—"}
        </text>
      </svg>
      <div>
        <p className="text-sm font-bold text-foreground">
          {formatMoney(collectedCents)}{" "}
          <span className="text-muted-foreground font-medium">
            {goalCents > 0 ? `of ${formatMoney(goalCents)}` : "· no goal set"}
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {monthLabel} re-bill collection goal
        </p>
      </div>
    </div>
  );
}

/* ── Header drill panel — inline expansion of a header metric chip ─────── */

const HEADER_DRILL_TAB: Record<HeaderDrillKind, HubTab> = {
  tasks: "tasks",
  pending: "tasks",
  done: "tasks",
  overdue: "tasks",
  clients: "clients",
  retention: "clients",
  unsolved: "actions",
};

function HeaderDrillPanel({
  kind,
  hub,
  tasks,
  items,
  today,
  onOpenTask,
  onGoTab,
  onClose,
}: {
  kind: HeaderDrillKind;
  hub: MemberHubPayload;
  tasks: TeamTaskRecord[];
  items: TeamActionItemRecord[];
  today: string;
  onOpenTask: (id: string) => void;
  onGoTab: (tab: HubTab) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const month = hub.summary.monthly.month;

  const titles: Record<HeaderDrillKind, string> = {
    tasks: "All tasks",
    pending: "Pending tasks",
    done: "Completed tasks",
    overdue: "Overdue tasks",
    clients: "Clients managed",
    retention: `Retention · ${monthName(month)}`,
    unsolved: "Unsolved action items",
  };
  const tabLabels: Record<HubTab, string> = {
    home: "Home",
    tasks: "Tasks",
    actions: "Action Items",
    tagged: "Tagged",
    clients: "Clients",
  };

  const byPriority = (a: TeamTaskRecord, b: TeamTaskRecord) =>
    TASK_PRIORITY_ORDER.indexOf(a.priority) - TASK_PRIORITY_ORDER.indexOf(b.priority);

  const taskRow = (t: TeamTaskRecord) => (
    <button
      key={t.id}
      type="button"
      onClick={() => onOpenTask(t.id)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/40 text-left"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-sm", TASK_STATUS_META[t.status].dot)} />
      <span className="flex-1 truncate text-sm font-semibold text-foreground">{t.title}</span>
      <DueLabel task={t} today={today} />
      <Flag className={cn("h-3.5 w-3.5 shrink-0", TASK_PRIORITY_META[t.priority].flag)} />
    </button>
  );

  const clientRow = (c: TeamClientSlice, right?: React.ReactNode) => (
    <button
      key={c.id}
      type="button"
      onClick={() => router.push(`/dashboard/users/${c.id}`)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/40 text-left"
    >
      <AvatarInitials name={c.displayName} className="w-7 h-7" />
      <span className="flex-1 truncate text-sm font-semibold text-foreground">
        {c.displayName}
      </span>
      {right ?? (
        <span className="text-xs font-bold text-foreground">{formatMoney(c.mrrCents)}</span>
      )}
    </button>
  );

  const groupHeader = (text: string, tone?: "green" | "amber") => (
    <p
      className={cn(
        "px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider",
        tone === "green" && "text-emerald-600 dark:text-emerald-400",
        tone === "amber" && "text-amber-600 dark:text-amber-400",
        !tone && "text-muted-foreground"
      )}
    >
      {text}
    </p>
  );

  const empty = (text: string) => (
    <p className="px-2 py-6 text-center text-sm text-muted-foreground">{text}</p>
  );

  let body: React.ReactNode;
  if (kind === "tasks" || kind === "pending" || kind === "done" || kind === "overdue") {
    const list =
      kind === "tasks"
        ? [...tasks].sort(
            (a, b) =>
              Number(a.status === "complete") - Number(b.status === "complete") ||
              byPriority(a, b)
          )
        : kind === "pending"
          ? tasks
              .filter((t) => t.status !== "complete")
              .sort((a, b) => byPriority(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
          : kind === "done"
            ? tasks
                .filter((t) => t.status === "complete")
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            : tasks
                .filter((t) => t.status !== "complete" && !!t.dueDate && t.dueDate < today)
                .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    body = list.length ? list.map(taskRow) : empty("Nothing here 🎉");
  } else if (kind === "clients") {
    body = hub.clients.length
      ? hub.clients.map((c) =>
          clientRow(
            c,
            <span className="inline-flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">
                {formatMoney(c.mrrCents)}
              </span>
              {c.rebill && <RebillStatusChip status={c.rebill.status} paid={c.rebill.paid} />}
            </span>
          )
        )
      : empty("No clients attributed yet");
  } else if (kind === "retention") {
    // The SAME classifier the Retention chip's rollup uses — paused and
    // unscheduled clients land in untracked here too, so the drill lists
    // always sum to the chip's numbers.
    const grouped = hub.clients.map((c) => ({
      c,
      bucket: monthlyRebillBucket(c.rebill, month),
    }));
    const rebilled = grouped.filter((g) => g.bucket === "collected").map((g) => g.c);
    const notYet = grouped
      .filter((g) => g.bucket !== "collected" && g.bucket !== "untracked")
      .map((g) => g.c);
    const untracked = grouped.filter((g) => g.bucket === "untracked").map((g) => g.c);
    body = (
      <>
        {groupHeader(`Re-billed this month · ${rebilled.length}`, "green")}
        {rebilled.map((c) => clientRow(c))}
        {rebilled.length === 0 && empty("No re-bills collected yet this month")}
        {notYet.length > 0 && groupHeader(`Not yet re-billed · ${notYet.length}`, "amber")}
        {notYet.map((c) =>
          clientRow(
            c,
            <span className="inline-flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">
                {formatMoney(c.mrrCents)}
              </span>
              {c.rebill && <RebillStatusChip status={c.rebill.status} paid={c.rebill.paid} />}
            </span>
          )
        )}
        {untracked.length > 0 && (
          <p className="px-2 pt-2 text-[10px] text-muted-foreground">
            {untracked.length} manually-billed / paused / unscheduled client
            {untracked.length === 1 ? "" : "s"} counted in the base but not tracked here.
          </p>
        )}
      </>
    );
  } else {
    const unsolvedItems = items.filter((i) => i.status === "unsolved");
    body = unsolvedItems.length
      ? unsolvedItems.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => (i.taskId ? onOpenTask(i.taskId) : onGoTab("actions"))}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/40 text-left"
          >
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                SOURCE_META[i.sourceType].chip
              )}
            >
              {SOURCE_META[i.sourceType].symbol}
            </span>
            <span className="flex-1 truncate text-sm font-semibold text-foreground">
              {i.body}
            </span>
            {i.authorLabel && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{i.authorLabel}</span>
            )}
          </button>
        ))
      : empty("Inbox zero 🎉");
  }

  return (
    <div className="rounded-xl border border-primary/50 bg-card p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-sm font-bold text-foreground">{titles[kind]}</h3>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGoTab(HEADER_DRILL_TAB[kind])}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Open {tabLabels[HEADER_DRILL_TAB[kind]]} →
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto">{body}</div>
    </div>
  );
}

/* ── Home tab ──────────────────────────────────────────────────────────── */

function HomeTab({
  hub,
  tasks,
  unsolved,
  today,
  onOpenTask,
  onGoTasks,
  onGoActions,
  onGoClients,
}: {
  hub: MemberHubPayload;
  tasks: TeamTaskRecord[];
  unsolved: number;
  today: string;
  onOpenTask: (id: string) => void;
  onGoTasks: () => void;
  onGoActions: () => void;
  onGoClients: () => void;
}) {
  const { labels: healthLabels } = useRosterOptions("health");
  const isOverdue = (t: TeamTaskRecord) =>
    t.status !== "complete" && !!t.dueDate && t.dueDate < today;

  const lineup = useMemo(
    () =>
      tasks
        .filter((t) => t.lineup && t.status !== "complete")
        .sort(
          (a, b) =>
            TASK_PRIORITY_ORDER.indexOf(a.priority) - TASK_PRIORITY_ORDER.indexOf(b.priority)
        )
        .slice(0, 5),
    [tasks]
  );
  const agenda = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "complete" && (isOverdue(t) || t.dueDate === today))
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, today]
  );
  const healthEntries = Object.entries(hub.summary.healthCounts).sort((a, b) => b[1] - a[1]);

  const taskRow = (t: TeamTaskRecord, rank?: number) => (
    <button
      key={t.id}
      type="button"
      onClick={() => onOpenTask(t.id)}
      // flex-wrap + the title's min-w floor: on phones the chips/due/flag wrap
      // to a second line instead of crushing the title to a few characters.
      className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-2.5 py-2 hover:bg-muted/40 text-left"
    >
      {rank !== undefined && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
          {rank}
        </span>
      )}
      <span className={cn("h-2 w-2 shrink-0 rounded-sm", TASK_STATUS_META[t.status].dot)} />
      <span className="flex-1 min-w-[55%] truncate text-sm font-semibold text-foreground">
        {t.title}
      </span>
      {t.clientId && <ClientChip hub={hub} clientId={t.clientId} />}
      <DueLabel task={t} today={today} />
      <Flag className={cn("h-3.5 w-3.5 shrink-0", TASK_PRIORITY_META[t.priority].flag)} />
    </button>
  );

  return (
    // items-start: cards size to their own content — without it the grid
    // stretches every card to its tallest row-mate (a long Agenda left the
    // small Client Pulse button as a page-tall box with centered chips).
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
      <HomeCard title="🔥 Lineup" hint="hand-picked priorities" className="lg:col-span-2">
        {lineup.length > 0 ? (
          lineup.map((t, i) => taskRow(t, i + 1))
        ) : (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            Nothing pinned — flag tasks from their detail view.
          </p>
        )}
      </HomeCard>

      <HomeCard
        title="💵 Monthly Re-bills"
        hint="open Clients →"
        onClick={onGoClients}
        className="lg:col-span-2"
      >
        <div className="px-2 pb-1">
          <MonthlyRebillTracker
            monthly={hub.summary.monthly}
            mrrManagedCents={hub.summary.mrrManagedCents}
            goalCents={hub.summary.goalCents}
            retention={hub.summary.retention}
          />
        </div>
      </HomeCard>

      <HomeCard title="📅 Agenda" hint="today & overdue">
        {agenda.length > 0 ? (
          <div className="max-h-72 overflow-y-auto">{agenda.map((t) => taskRow(t))}</div>
        ) : (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Clear for today 🎉</p>
        )}
      </HomeCard>

      <HomeCard title="💓 Client Pulse" hint="open Clients →" onClick={onGoClients}>
        {healthEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-2 py-1">
            {healthEntries.map(([slug, count]) => (
              <span
                key={slug}
                className={cn(CHIP_BASE, HEALTH_CHIP_CLS[slug] ?? FALLBACK_CHIP_CLS)}
              >
                {healthLabels[slug] ?? slug} · {count}
              </span>
            ))}
          </div>
        ) : (
          <p className="px-2 py-2 text-sm text-muted-foreground">No health chips set yet.</p>
        )}
        {hub.summary.zeroMrrActiveCount > 0 && (
          <p className="px-2 pt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {hub.summary.zeroMrrActiveCount} active client
            {hub.summary.zeroMrrActiveCount === 1 ? "" : "s"} with $0 MRR
          </p>
        )}
      </HomeCard>

      <HomeCard title="⚡ Action Items" hint="open inbox →" onClick={onGoActions}>
        <p className="px-2 text-2xl font-black text-foreground">
          {unsolved}{" "}
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            unsolved
          </span>
        </p>
        {unsolved === 0 && (
          <p className="px-2 pt-1 text-sm text-muted-foreground">Inbox zero 🎉</p>
        )}
      </HomeCard>

      <HomeCard title="✅ Board" hint="open Tasks →" onClick={onGoTasks} className="lg:col-span-2">
        <div className="flex gap-4 px-2 flex-wrap">
          {(["todo", "in_progress", "review", "complete"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-sm">
              <span className={cn("h-2 w-2 rounded-sm", TASK_STATUS_META[s].dot)} />
              <span className="font-bold text-foreground">
                {tasks.filter((t) => t.status === s).length}
              </span>
              <span className="text-muted-foreground text-xs">{TASK_STATUS_META[s].label}</span>
            </div>
          ))}
        </div>
      </HomeCard>
    </div>
  );
}

function HomeCard({
  title,
  hint,
  onClick,
  className,
  children,
}: {
  title: string;
  hint?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4 text-left w-full",
        onClick && "hover:border-primary transition-colors cursor-pointer",
        className
      )}
    >
      <p className="mb-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
        {hint && <span className="font-medium normal-case tracking-normal">{hint}</span>}
      </p>
      {children}
    </Tag>
  );
}

/* ── Shared bits used by the tabs ──────────────────────────────────────── */

export function ClientChip({
  hub,
  clientId,
}: {
  hub: { clients: Array<{ id: string; displayName: string }> };
  clientId: string;
}) {
  const client = hub.clients.find((c) => c.id === clientId);
  if (!client) return null;
  return (
    <span className="shrink-0 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 truncate max-w-[140px]">
      {client.displayName}
    </span>
  );
}

export function DueLabel({ task: t, today }: { task: TeamTaskRecord; today: string }) {
  if (!t.dueDate) return null;
  const overdue = t.status !== "complete" && t.dueDate < today;
  const isToday = t.dueDate === today && t.status !== "complete";
  const label = isToday
    ? "Today"
    : new Date(`${t.dueDate}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] font-semibold",
        overdue
          ? "text-red-600 dark:text-red-400 font-bold"
          : isToday
            ? "text-amber-600 dark:text-amber-400 font-bold"
            : "text-muted-foreground"
      )}
    >
      {overdue ? `Overdue · ${label}` : label}
    </span>
  );
}

export function UnsolvedBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
      <Zap className="h-3 w-3" />
      {count}
    </span>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthlyHeadline } from "@/lib/teamRebill";
import { formatMoney } from "@/components/users/format";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { HEALTH_CHIP_CLS, FALLBACK_CHIP_CLS, CHIP_BASE } from "@/components/users/rosterPresentation";
import { MemberAvatar } from "./TeamHome";
import { MonthlyRebillTracker } from "./MonthlyRebillTracker";
import { TasksTab } from "./TasksTab";
import { ActionItemsTab } from "./ActionItemsTab";
import { ClientsTab } from "./ClientsTab";
import { TaskDetailSheet } from "./TaskDetailSheet";
import {
  useMemberHub,
  useMemberTasks,
  useMemberActionItems,
  useTaskMutations,
} from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  ATTRIBUTION_LABEL,
  TIMEFRAME_OPTIONS,
  monthName,
} from "./presentation";
import type { MemberHubPayload, TeamTaskRecord, TeamTimeframeValue } from "./types";

type HubTab = "home" | "tasks" | "actions" | "clients";

export function MemberHub({ adminId }: { adminId: string }) {
  const [timeframe, setTimeframe] = useState<TeamTimeframeValue>("week");
  const [tab, setTab] = useState<HubTab>("home");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const hubQuery = useMemberHub(adminId, timeframe);
  const tasksQuery = useMemberTasks(adminId);
  const itemsQuery = useMemberActionItems(adminId);
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
  const today = hub.today;
  const pending = tasks.filter((t) => t.status !== "complete").length;
  const unsolved = items.filter((i) => i.status === "unsolved").length;
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  const tabs: { id: HubTab; label: string; count: number | null }[] = [
    { id: "home", label: "Home", count: null },
    { id: "tasks", label: "Tasks", count: pending },
    { id: "actions", label: "Action Items", count: unsolved },
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

      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <MemberAvatar name={hub.member.name} avatarPath={hub.member.avatarPath} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl lg:text-2xl font-black text-foreground truncate">
            {hub.member.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {hub.member.position || ATTRIBUTION_LABEL[hub.member.attribution]} ·{" "}
            {hub.summary.clientCount} clients · {formatMoney(hub.summary.mrrManagedCents)} MRR
            managed
          </p>
        </div>
        <GoalRing
          collectedCents={monthlyHeadline(hub.summary.monthly).cents}
          goalCents={hub.summary.goalCents}
          month={hub.goalMonth}
        />
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        <HeaderStat label="Tasks" value={tasks.length} />
        <HeaderStat label="Pending" value={pending} tone={pending > 0 ? "amber" : undefined} />
        <HeaderStat label="Done" value={hub.summary.tasks.done} tone="green" />
        <HeaderStat
          label="Overdue"
          value={hub.summary.tasks.overdue}
          tone={hub.summary.tasks.overdue > 0 ? "red" : undefined}
        />
        <HeaderStat label="Clients" value={hub.summary.clientCount} />
        <RetentionStat retention={hub.summary.retention} />
        <HeaderStat label="Unsolved" value={unsolved} tone={unsolved > 0 ? "amber" : undefined} />
      </div>

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

/**
 * Retention: clients re-billed this month out of total clients managed —
 * fills toward 100% as the month's payouts land, so no alarm colors.
 */
function RetentionStat({
  retention,
}: {
  retention: { base: number; retained: number };
}) {
  const pct =
    retention.base > 0
      ? Math.round((retention.retained / retention.base) * 100)
      : null;
  return (
    <div
      className="rounded-xl border border-border/60 bg-card px-3 py-2 text-center"
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
    </div>
  );
}

function HeaderStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber" | "green";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2 text-center">
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
    </div>
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
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/40 text-left"
    >
      {rank !== undefined && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
          {rank}
        </span>
      )}
      <span className={cn("h-2 w-2 shrink-0 rounded-sm", TASK_STATUS_META[t.status].dot)} />
      <span className="flex-1 truncate text-sm font-semibold text-foreground">{t.title}</span>
      {t.clientId && <ClientChip hub={hub} clientId={t.clientId} />}
      <DueLabel task={t} today={today} />
      <Flag className={cn("h-3.5 w-3.5 shrink-0", TASK_PRIORITY_META[t.priority].flag)} />
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
          agenda.map((t) => taskRow(t))
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

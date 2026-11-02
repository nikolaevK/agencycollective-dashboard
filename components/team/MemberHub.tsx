"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  DollarSign,
  Flame,
  HeartPulse,
  KanbanSquare,
  ListChecks,
  ListTodo,
  RefreshCcw,
  RotateCw,
  UserRoundCheck,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { monthlyHeadline, monthlyRebillBucket } from "@/lib/teamRebill";
import { formatMoney } from "@/components/users/format";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { useAdmin } from "@/components/providers/AdminProvider";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { RebillStatusChip } from "@/components/users/RebillStatusChip";
import { HEALTH_TONE, toneOf } from "@/components/users/rosterPresentation";
import { StatCard } from "@/components/overview/StatCard";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import type { MetricSparkline as MetricSparklineType } from "@/components/shared/MetricSparkline";
import { Badge, StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ClientChip, DueLabel, MemberAvatar, PriorityFlag, TaskStatusDot } from "./TeamBits";
import { MonthlyRebillTracker } from "./MonthlyRebillTracker";
import {
  useMemberHub,
  useMemberTasks,
  useMemberActionItems,
  useMemberTrends,
  useTaggedTasks,
  useTaskMutations,
} from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_PRIORITY_ORDER,
  ATTRIBUTION_LABEL,
  TIMEFRAME_OPTIONS,
  SOURCE_META,
  monthName,
  shortMonthLabel,
  weekOfLabel,
} from "./presentation";
import type { TeamTrends } from "@/lib/teamTrendSeries";
import type {
  MemberHubPayload,
  TeamTaskRecord,
  TeamActionItemRecord,
  TeamClientSlice,
  TeamTimeframeValue,
} from "./types";

// Lazy: recharts only loads once a card draws a line / the Home charts show.
const MetricSparkline = dynamic(
  () => import("@/components/shared/MetricSparkline").then((m) => m.MetricSparkline),
  { loading: () => <SparklinePlaceholder /> }
);
const RebillGoalChart = dynamic(() => import("./TeamCharts").then((m) => m.RebillGoalChart), {
  loading: () => <Skeleton className="h-[352px] w-full rounded-3xl" />,
});
const TaskThroughputChart = dynamic(() => import("./TeamCharts").then((m) => m.TaskThroughputChart), {
  loading: () => <Skeleton className="h-[332px] w-full rounded-3xl" />,
});
// Lazy: the non-default tabs and the task sheet (Selects, menus, the date
// picker, confirm dialogs) load on first open — the Home tab ships without them.
const tabLoading = () => <Skeleton className="h-72 w-full rounded-3xl" />;
const TasksTab = dynamic(() => import("./TasksTab").then((m) => m.TasksTab), { loading: tabLoading });
const ActionItemsTab = dynamic(() => import("./ActionItemsTab").then((m) => m.ActionItemsTab), { loading: tabLoading });
const TaggedTab = dynamic(() => import("./TaggedTab").then((m) => m.TaggedTab), { loading: tabLoading });
const ClientsTab = dynamic(() => import("./ClientsTab").then((m) => m.ClientsTab), { loading: tabLoading });
const TaskDetailSheet = dynamic(() => import("./TaskDetailSheet").then((m) => m.TaskDetailSheet), { ssr: false });
type CardTrend = Omit<React.ComponentProps<typeof MetricSparklineType>, "label">;

// Same marks as the Team overview: billed = chart-1, re-bill = chart-4,
// done = chart-2.
const BLUE = "hsl(var(--chart-1))";
const MAGENTA = "hsl(var(--chart-4))";
const GREEN = "hsl(var(--chart-2))";
const asCount = (v: number) => String(v);

type HubTab = "home" | "tasks" | "actions" | "tagged" | "clients";

/** Header metric cards drill into the matching list inline (KPI-card pattern). */
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
  // History for the trend lines + Home charts — once the hub is in (it
  // reuses that build's server-side memo of the Client Directory).
  const trendsQuery = useMemberTrends(adminId, { enabled: !!hubQuery.data });
  const mutations = useTaskMutations(adminId);
  const viewer = useAdmin();
  const listQueries = [tasksQuery, itemsQuery, taggedQuery];

  // Wait for the lists too — otherwise Lineup/Agenda/Unsolved render their
  // "all clear" empty states (and 0 counts) before the data has arrived.
  // Only the FIRST attempt holds the page: a failing list would otherwise
  // keep the skeleton up through every retry (~7s) before the error banner.
  if (
    hubQuery.isLoading ||
    (!hubQuery.isError && listQueries.some((q) => q.isLoading && q.failureCount === 0))
  ) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24 rounded-3xl" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    );
  }
  if (hubQuery.error || !hubQuery.data) {
    const err = hubQuery.error as (Error & { status?: number }) | null;
    const forbidden = err?.status === 403;
    // Your own hub 404s when you aren't on the Team roster yet.
    const notRostered = err?.status === 404 && adminId === viewer.adminId;
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <p className="text-sm font-medium">
          {forbidden
            ? "This hub isn't yours to view"
            : notRostered
              ? "You're not on the Team roster yet"
              : "Couldn't load this member hub"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {forbidden
            ? "Only Admin Management (or your book's Head of Ads) can open other members' hubs."
            : notRostered
              ? "Ask an admin to add you to the roster to get your own hub."
              : err?.message || "The member may not be on the roster."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/team">
            <ArrowLeft />
            Back to Team
          </Link>
        </Button>
      </Card>
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
  // A failed list would otherwise read as a genuine empty state ("Inbox zero").
  const listFailed = listQueries.some((q) => q.isError || q.failureCount > 0);

  const tabs: { id: HubTab; label: string; count: number | null }[] = [
    { id: "home", label: "Home", count: null },
    { id: "tasks", label: "Tasks", count: pending },
    { id: "actions", label: "Action Items", count: unsolved },
    { id: "tagged", label: "Tagged", count: taggedOpen },
    { id: "clients", label: "Clients", count: hub.summary.clientCount },
  ];

  return (
    <div
      className={cn(
        "space-y-6 transition-opacity",
        // Previous timeframe's numbers stay visible (dimmed) while the new one loads.
        hubQuery.isPlaceholderData && "opacity-60"
      )}
    >
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/dashboard/team">
          <ArrowLeft />
          Back to Team
        </Link>
      </Button>

      {/* Header — stacks on phones: identity row first, goal ring below.
          (A single flex row let flex-1 crush the name to a few characters
          while the goal block kept its intrinsic width.) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <MemberAvatar name={hub.member.name} avatarPath={hub.member.avatarPath} size="lg" />
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-semibold tracking-tight sm:truncate lg:text-3xl">
              {hub.member.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
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

      {listFailed && (
        <div className={cn("flex flex-wrap items-center gap-3 rounded-3xl border px-4 py-2.5 text-xs", badgeTone.danger)}>
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-[12rem] flex-1">
            Some hub data failed to load — counts and lists below may be incomplete.
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              listQueries.forEach((q) => (q.isError || q.failureCount > 0) && q.refetch())
            }
          >
            <RotateCw />
            Retry
          </Button>
        </div>
      )}

      {/* Metric cards — click to drill into the matching list */}
      <HubMetricCards
        hub={hub}
        tasks={tasks}
        pending={pending}
        unsolved={unsolved}
        trends={trendsQuery.data}
        trendsLoading={!trendsQuery.data && !trendsQuery.isError}
        drill={headerDrill}
        onDrill={(k) => setHeaderDrill(headerDrill === k ? null : k)}
      />

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
      <Tabs value={tab} onValueChange={(v) => setTab(v as HubTab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Scrolls horizontally on narrow screens instead of overflowing. */}
          <div className="max-w-full overflow-x-auto">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                  {t.count !== null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* order-first on phones: when the tabs fill the row, the toggle
              sits above them instead of wrapping under them. */}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={timeframe}
            // Radix reports "" when the active item is clicked again; a
            // timeframe can't be deselected, so ignore that.
            onValueChange={(v) => {
              if (v) setTimeframe(v as TeamTimeframeValue);
            }}
            aria-label="Timeframe"
            className="order-first sm:order-none"
          >
            {TIMEFRAME_OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value} className="px-3">
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </Tabs>

      {tab === "home" && (
        <HomeTab
          hub={hub}
          tasks={tasks}
          unsolved={unsolved}
          today={today}
          trends={trendsQuery.data}
          trendsError={trendsQuery.isError}
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

/* ── Metric cards ──────────────────────────────────────────────────────── */

function HubMetricCards({
  hub,
  tasks,
  pending,
  unsolved,
  trends,
  trendsLoading,
  drill,
  onDrill,
}: {
  hub: MemberHubPayload;
  tasks: TeamTaskRecord[];
  pending: number;
  unsolved: number;
  trends?: TeamTrends;
  trendsLoading: boolean;
  drill: HeaderDrillKind | null;
  onDrill: (k: HeaderDrillKind) => void;
}) {
  const s = hub.summary;
  const headline = monthlyHeadline(s.monthly);
  const retentionPct =
    s.retention.base > 0 ? Math.round((s.retention.retained / s.retention.base) * 100) : null;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const inReview = tasks.filter((t) => t.status === "review").length;
  const completedWeeks = trends?.totals.tasksCompleted;
  const doneThisWeek = completedWeeks ? completedWeeks[completedWeeks.length - 1] ?? 0 : null;

  // Stable per payload — the sparklines are memoized.
  const lines = useMemo(() => {
    if (!trends) return null;
    return {
      rebilled: {
        points: trends.months.map((ym, i) => ({ label: shortMonthLabel(ym), value: trends.totals.rebilled[i] ?? 0 })),
        color: MAGENTA,
        format: formatMoney,
        caption: "Last 12 months",
        hint: "REBILL payouts",
        reference: s.goalCents > 0 ? { value: s.goalCents, label: "Goal" } : undefined,
      } satisfies CardTrend,
      // MRR has no history (it's the latest payout month, live) — like the
      // Client Directory's MRR card, the line is what was billed each month.
      billed: {
        points: trends.months.map((ym, i) => ({ label: shortMonthLabel(ym), value: trends.totals.billed[i] ?? 0 })),
        color: BLUE,
        format: formatMoney,
        caption: "Billed per month",
        hint: "Payout DB",
      } satisfies CardTrend,
      completed: {
        points: trends.weeks.map((w, i) => ({
          label: weekOfLabel(w),
          value: trends.totals.tasksCompleted[i] ?? 0,
        })),
        color: GREEN,
        format: asCount,
        caption: "Last 12 weeks",
        hint: "Per week",
      } satisfies CardTrend,
    };
  }, [trends, s.goalCents]);
  const spark = (trend: CardTrend | undefined, label: string) =>
    trend ? <MetricSparkline label={label} {...trend} /> : trendsLoading ? <SparklinePlaceholder /> : null;

  // Two cards open the retention list — ring only the one that was clicked.
  const [card, setCard] = useState<string | null>(null);
  const open = (cardKey: string, kind: HeaderDrillKind) => {
    setCard(cardKey);
    // Switching between two cards on the same open list keeps it open.
    if (drill === kind && card !== cardKey) return;
    onDrill(kind);
  };
  const active = (cardKey: string, kind: HeaderDrillKind) =>
    drill === kind && card === cardKey ? "ring-2 ring-ring/40" : undefined;
  const danger = "text-red-700 dark:text-red-400";
  const warning = "text-amber-700 dark:text-amber-400";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label={`Re-billed · ${monthName(s.monthly.month)}`}
        icon={RefreshCcw}
        value={formatMoney(headline.cents)}
        sub={
          <>
            {s.goalCents > 0
              ? `${Math.round((headline.cents / s.goalCents) * 100)}% of ${formatMoney(s.goalCents)} goal`
              : "No goal set"}
            {headline.wholeBook && " · all book"}
          </>
        }
        onClick={() => open("rebilled", "retention")}
        className={active("rebilled", "retention")}
      >
        {spark(lines?.rebilled, "Re-billed per month")}
      </StatCard>
      <StatCard
        label="MRR Managed"
        icon={DollarSign}
        value={formatMoney(s.mrrManagedCents)}
        sub={
          <>
            {s.clientCount} clients
            {s.zeroMrrActiveCount > 0 && (
              <span className={warning}> · {s.zeroMrrActiveCount} at $0</span>
            )}
          </>
        }
        onClick={() => open("clients", "clients")}
        className={active("clients", "clients")}
      >
        {spark(lines?.billed, "Billed per month")}
      </StatCard>
      <StatCard
        label="Tasks Completed"
        icon={ListChecks}
        // The headline is the server count its drill lists; the trends'
        // weekly figure only qualifies it (it can fail or land later).
        value={String(s.tasks.done)}
        sub={doneThisWeek == null ? "done in total" : `done in total · ${doneThisWeek} this week`}
        onClick={() => open("done", "done")}
        className={active("done", "done")}
      >
        {spark(lines?.completed, "Tasks completed per week")}
      </StatCard>
      <StatCard
        label="Open Tasks"
        icon={ListTodo}
        value={String(pending)}
        sub={`${inProgress} in progress · ${inReview} in review`}
        onClick={() => open("pending", "pending")}
        className={active("pending", "pending")}
      />

      <StatCard
        label="All Tasks"
        icon={KanbanSquare}
        value={String(tasks.length)}
        sub={`${pending} open · ${tasks.length - pending} done`}
        onClick={() => open("tasks", "tasks")}
        className={active("tasks", "tasks")}
      />
      <StatCard
        label="Overdue"
        icon={CircleAlert}
        value={String(s.tasks.overdue)}
        sub={s.tasks.overdue > 0 ? <span className={danger}>needs attention</span> : "Nothing overdue"}
        onClick={() => open("overdue", "overdue")}
        className={active("overdue", "overdue")}
      />
      {/* Retention: clients re-billed this month out of total clients managed
          — fills toward 100% as the month's payouts land, so no alarm colors. */}
      <StatCard
        label="Retention"
        icon={UserRoundCheck}
        value={retentionPct !== null ? `${retentionPct}%` : "—"}
        sub={
          retentionPct !== null
            ? `${s.retention.retained} of ${s.retention.base} managed clients re-billed this month`
            : "No clients managed yet"
        }
        onClick={() => open("retention", "retention")}
        className={active("retention", "retention")}
      />
      <StatCard
        label="Action Items"
        icon={Zap}
        value={String(unsolved)}
        sub={unsolved > 0 ? <span className={warning}>unsolved</span> : "Inbox zero"}
        onClick={() => open("unsolved", "unsolved")}
        className={active("unsolved", "unsolved")}
      />
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
        <circle cx="32" cy="32" r="26" className="stroke-muted" strokeWidth="6" fill="none" />
        {pct !== null && (
          <circle
            cx="32"
            cy="32"
            r="26"
            className="stroke-chart-4"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${((C * Math.min(pct, 100)) / 100).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 32 32)"
          />
        )}
        <text
          x="32"
          y="36.5"
          textAnchor="middle"
          className="fill-foreground"
          fontSize="13"
          fontWeight="600"
        >
          {pct !== null ? `${pct}%` : "—"}
        </text>
      </svg>
      <div>
        <p className="text-sm font-medium tabular-nums">
          {formatMoney(collectedCents)}{" "}
          <span className="font-normal text-muted-foreground">
            {goalCents > 0 ? `of ${formatMoney(goalCents)}` : "· no goal set"}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {monthLabel} re-bill collection goal
        </p>
      </div>
    </div>
  );
}

/* ── Header drill panel — inline expansion of a metric card ────────────── */

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
  // Client rows open the Client Directory — only with its `users` permission.
  const admin = useAdmin();
  const canOpenClient = admin.isSuper || admin.permissions.users;

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

  const rowCls = "flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors";

  const taskRow = (t: TeamTaskRecord) => (
    <button
      key={t.id}
      type="button"
      onClick={() => onOpenTask(t.id)}
      className={cn(rowCls, "hover:bg-muted/60")}
    >
      <TaskStatusDot status={t.status} />
      <span className="flex-1 truncate text-sm font-medium">{t.title}</span>
      <DueLabel task={t} today={today} />
      <PriorityFlag priority={t.priority} />
    </button>
  );

  const clientRow = (c: TeamClientSlice, right?: React.ReactNode) => (
    <button
      key={c.id}
      type="button"
      disabled={!canOpenClient}
      onClick={() => router.push(`/dashboard/users/${c.id}`)}
      className={cn(rowCls, "enabled:hover:bg-muted/60")}
    >
      <AvatarInitials name={c.displayName} className="size-7 text-[10px]" />
      <span className="flex-1 truncate text-sm font-medium">{c.displayName}</span>
      {right ?? (
        <span className="text-sm font-medium tabular-nums">{formatMoney(c.mrrCents)}</span>
      )}
    </button>
  );

  const groupHeader = (text: string, tone?: "success" | "warning") => (
    <p
      className={cn(
        "px-2 pb-1 pt-2 text-xs font-medium",
        tone === "success" && "text-emerald-700 dark:text-emerald-400",
        tone === "warning" && "text-amber-700 dark:text-amber-400",
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
    body = list.length ? list.map(taskRow) : empty("Nothing here");
  } else if (kind === "clients") {
    body = hub.clients.length
      ? hub.clients.map((c) =>
          clientRow(
            c,
            <span className="inline-flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums">
                {formatMoney(c.mrrCents)}
              </span>
              {c.rebill && <RebillStatusChip status={c.rebill.status} paid={c.rebill.paid} />}
            </span>
          )
        )
      : empty("No clients attributed yet");
  } else if (kind === "retention") {
    // The SAME classifier the Retention card's rollup uses — paused and
    // unscheduled clients land in untracked here too, so the drill lists
    // always sum to the card's numbers.
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
        {groupHeader(`Re-billed this month · ${rebilled.length}`, "success")}
        {rebilled.map((c) => clientRow(c))}
        {rebilled.length === 0 && empty("No re-bills collected yet this month")}
        {notYet.length > 0 && groupHeader(`Not yet re-billed · ${notYet.length}`, "warning")}
        {notYet.map((c) =>
          clientRow(
            c,
            <span className="inline-flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums">
                {formatMoney(c.mrrCents)}
              </span>
              {c.rebill && <RebillStatusChip status={c.rebill.status} paid={c.rebill.paid} />}
            </span>
          )
        )}
        {untracked.length > 0 && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            {untracked.length} manually-billed / paused / unscheduled client
            {untracked.length === 1 ? "" : "s"} counted in the base but not tracked here.
          </p>
        )}
      </>
    );
  } else {
    const unsolvedItems = items.filter((i) => i.status === "unsolved");
    body = unsolvedItems.length
      ? unsolvedItems.map((i) => {
          const src = SOURCE_META[i.sourceType];
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => (i.taskId ? onOpenTask(i.taskId) : onGoTab("actions"))}
              className={cn(rowCls, "hover:bg-muted/60")}
            >
              <Badge variant="outline" className="font-normal text-muted-foreground" title={src.label}>
                <src.icon />
                <span className="sr-only">{src.label}</span>
              </Badge>
              <span className="flex-1 truncate text-sm font-medium">{i.body}</span>
              {i.authorLabel && (
                <span className="shrink-0 text-xs text-muted-foreground">{i.authorLabel}</span>
              )}
            </button>
          );
        })
      : empty("Inbox zero");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
        <CardTitle>{titles[kind]}</CardTitle>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onGoTab(HEADER_DRILL_TAB[kind])}
            className="text-muted-foreground"
          >
            Open {tabLabels[HEADER_DRILL_TAB[kind]]}
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X />
          </Button>
        </span>
      </CardHeader>
      <CardContent className="pt-0 md:pt-0">
        <div className="-mx-2 max-h-80 overflow-y-auto">{body}</div>
      </CardContent>
    </Card>
  );
}

/* ── Home tab ──────────────────────────────────────────────────────────── */

function HomeTab({
  hub,
  tasks,
  unsolved,
  today,
  trends,
  trendsError,
  onOpenTask,
  onGoTasks,
  onGoActions,
  onGoClients,
}: {
  hub: MemberHubPayload;
  tasks: TeamTaskRecord[];
  unsolved: number;
  today: string;
  trends?: TeamTrends;
  trendsError: boolean;
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
  const t = trends?.totals;
  const wholeBook = hub.member.attribution === "book" && !!t?.wholeBook;

  const taskRow = (task: TeamTaskRecord, rank?: number) => (
    <button
      key={task.id}
      type="button"
      onClick={() => onOpenTask(task.id)}
      // flex-wrap + the title's min-w floor: on phones the chips/due/flag wrap
      // to a second line instead of crushing the title to a few characters.
      // The floor is capped at 12rem so a half-width card doesn't wrap rows
      // that fit on one line.
      className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
    >
      {rank !== undefined && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
          {rank}
        </span>
      )}
      <TaskStatusDot status={task.status} />
      <span className="min-w-[min(55%,12rem)] flex-1 truncate text-sm font-medium">
        {task.title}
      </span>
      {/* Wraps as one group, so the flag never ends up alone on a line. */}
      <span className="ml-auto flex shrink-0 items-center gap-2.5">
        {task.clientId && <ClientChip hub={hub} clientId={task.clientId} />}
        <DueLabel task={task} today={today} />
        <PriorityFlag priority={task.priority} />
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      <HomeCard title="Lineup" icon={Flame} hint="Hand-picked priorities">
        {lineup.length > 0 ? (
          <div className="-mx-2">{lineup.map((task, i) => taskRow(task, i + 1))}</div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing pinned — flag tasks from their detail view.
          </p>
        )}
      </HomeCard>

      {/* items-start: cards size to their own content — without it the grid
          stretches every card to its tallest row-mate (a long Agenda left the
          small cards as page-tall boxes with centered content). */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <HomeCard title="Monthly Re-bills" icon={RefreshCcw} hint="Open Clients" onClick={onGoClients}>
          <MonthlyRebillTracker
            monthly={hub.summary.monthly}
            mrrManagedCents={hub.summary.mrrManagedCents}
            goalCents={hub.summary.goalCents}
            retention={hub.summary.retention}
          />
        </HomeCard>

        <HomeCard title="Agenda" icon={CalendarClock} hint="Today & overdue">
          {agenda.length > 0 ? (
            <div className="-mx-2 max-h-72 overflow-y-auto">{agenda.map((task) => taskRow(task))}</div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Clear for today</p>
          )}
        </HomeCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RebillGoalChart
          months={trends?.months}
          rebilled={t?.rebilled}
          goals={t?.goals}
          failed={trendsError}
          description={`${
            wholeBook ? "REBILL payouts, whole book" : "REBILL payouts of this member's clients"
          }${t?.goals.some((g) => g > 0) ? " · monthly goal" : ""}`}
        />
        <TaskThroughputChart
          weeks={trends?.weeks}
          created={t?.tasksCreated}
          completed={t?.tasksCompleted}
          failed={trendsError}
          description="Tasks created vs completed per week"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
        <HomeCard title="Client Pulse" icon={HeartPulse} hint="Open Clients" onClick={onGoClients}>
          {healthEntries.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {healthEntries.map(([slug, count]) => (
                <StatusBadge key={slug} tone={toneOf(HEALTH_TONE, slug)}>
                  {healthLabels[slug] ?? slug} · {count}
                </StatusBadge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No health chips set yet.</p>
          )}
          {hub.summary.zeroMrrActiveCount > 0 && (
            <p className="pt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
              {hub.summary.zeroMrrActiveCount} active client
              {hub.summary.zeroMrrActiveCount === 1 ? "" : "s"} with $0 MRR
            </p>
          )}
        </HomeCard>

        <HomeCard title="Action Items" icon={Zap} hint="Open inbox" onClick={onGoActions}>
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{unsolved}</span>
            <span className="text-xs text-muted-foreground">unsolved</span>
          </p>
          {unsolved === 0 && (
            <p className="pt-1 text-sm text-muted-foreground">Inbox zero</p>
          )}
        </HomeCard>

        <HomeCard title="Board" icon={KanbanSquare} hint="Open Tasks" onClick={onGoTasks}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {(["todo", "in_progress", "review", "complete"] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5 text-sm">
                <TaskStatusDot status={s} />
                <span className="font-medium tabular-nums">
                  {tasks.filter((task) => task.status === s).length}
                </span>
                <span className="truncate text-xs text-muted-foreground">{TASK_STATUS_META[s].label}</span>
              </div>
            ))}
          </div>
        </HomeCard>
      </div>
    </div>
  );
}

function HomeCard({
  title,
  icon: Icon,
  hint,
  onClick,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  hint?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const card = (
    <Card className={cn("h-full", onClick && "transition-colors group-hover:bg-muted/40", !onClick && className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 md:pb-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <CardTitle>{title}</CardTitle>
        </div>
        {hint && (
          <CardDescription className="flex items-center gap-0.5 text-xs">
            {hint}
            {onClick && <ArrowUpRight className="size-3.5" />}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
  if (!onClick) return card;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group block w-full rounded-[min(calc(var(--radius)*2.6),24px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        className
      )}
    >
      {card}
    </button>
  );
}

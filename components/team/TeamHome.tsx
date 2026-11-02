"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CircleAlert,
  DollarSign,
  HeartPulse,
  ListChecks,
  ListTodo,
  RefreshCcw,
  Settings2,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyRebill, monthlyHeadline } from "@/lib/teamRebill";
import { formatMoney, formatDate } from "@/components/users/format";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { HEALTH_TONE, toneOf } from "@/components/users/rosterPresentation";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAdmin } from "@/components/providers/AdminProvider";
import { StatCard } from "@/components/overview/StatCard";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import type { MetricSparkline as MetricSparklineType } from "@/components/shared/MetricSparkline";
import { Badge, StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTeamDirectory, useTeamTrends } from "./useTeamData";
import { MonthlyRebillTracker } from "./MonthlyRebillTracker";
import { MemberAvatar } from "./TeamBits";
import {
  TIMEFRAME_OPTIONS,
  TIMEFRAME_PHRASE,
  ATTRIBUTION_LABEL,
  monthName,
  shortMonthLabel,
  weekOfLabel,
} from "./presentation";
import type { TeamTrends, MemberTrendSeries } from "@/lib/teamTrendSeries";
import type {
  TeamDirectoryPayload,
  TeamMemberSummary,
  TeamClientSlice,
  TeamTimeframeValue,
} from "./types";

// Lazy: recharts only loads once a card draws a line / the Insights tab opens.
const MetricSparkline = dynamic(
  () => import("@/components/shared/MetricSparkline").then((m) => m.MetricSparkline),
  { loading: () => <SparklinePlaceholder /> }
);
const TeamInsights = dynamic(() => import("./TeamInsights").then((m) => m.TeamInsights), {
  loading: () => <Skeleton className="h-[380px] w-full rounded-3xl" />,
});
// Lazy: privileged-only, opened on click — its Selects and confirm dialog
// stay out of the overview's first load.
const RosterManageDialog = dynamic(
  () => import("./RosterManageDialog").then((m) => m.RosterManageDialog),
  { ssr: false }
);
// Lazy: only multi-book super / Admin Management viewers get the filter.
const WorkspaceFilter = dynamic(() => import("./WorkspaceFilter").then((m) => m.WorkspaceFilter), {
  ssr: false,
  loading: () => <Skeleton className="h-9 w-40 rounded-3xl" />,
});
type CardTrend = Omit<React.ComponentProps<typeof MetricSparklineType>, "label">;

// Same marks as the Payout Tracker / Client Directory: billed = chart-1,
// re-bill = chart-4, done = chart-2.
const BLUE = "hsl(var(--chart-1))";
const MAGENTA = "hsl(var(--chart-4))";
const GREEN = "hsl(var(--chart-2))";
const asCount = (v: number) => String(v);

/** Card trend lines from the trends payload (stable per payload — the
 *  sparklines are memoized). */
function rebilledTrend(t: TeamTrends, s: Pick<MemberTrendSeries, "rebilled">, goalCents: number): CardTrend {
  return {
    points: t.months.map((ym, i) => ({ label: shortMonthLabel(ym), value: s.rebilled[i] ?? 0 })),
    color: MAGENTA,
    format: formatMoney,
    caption: "Last 12 months",
    hint: "REBILL payouts",
    reference: goalCents > 0 ? { value: goalCents, label: "Goal" } : undefined,
  };
}
/** MRR has no history (it's the latest payout month, live) — like the Client
 *  Directory's MRR card, the line is what was billed each month. */
function billedTrend(t: TeamTrends, s: Pick<MemberTrendSeries, "billed">): CardTrend {
  return {
    points: t.months.map((ym, i) => ({ label: shortMonthLabel(ym), value: s.billed[i] ?? 0 })),
    color: BLUE,
    format: formatMoney,
    caption: "Billed per month",
    hint: "Payout DB",
  };
}
function completedTrend(t: TeamTrends, s: Pick<MemberTrendSeries, "tasksCompleted">): CardTrend {
  return {
    points: t.weeks.map((w, i) => ({ label: weekOfLabel(w), value: s.tasksCompleted[i] ?? 0 })),
    color: GREEN,
    format: asCount,
    caption: "Last 12 weeks",
    hint: "Per week",
  };
}

type DrillKind =
  | "mrr"
  | "health"
  | "rebills"
  | "collected"
  | "tasksdue"
  | "overdue"
  | "actions";

type HomeView = "members" | "insights";

export function TeamHome() {
  const [timeframe, setTimeframe] = useState<TeamTimeframeValue>("week");
  const [drill, setDrill] = useState<DrillKind | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [managePreselect, setManagePreselect] = useState<string | null>(null);
  const [view, setView] = useState<HomeView>("members");
  // Book filter — only rendered for admins who can see multiple workspaces
  // (super / Admin Management); "" = all books.
  const [workspace, setWorkspace] = useState("");
  const { workspaces, canManage } = useWorkspaces();
  const admin = useAdmin();
  const { data, isLoading, error, refetch, isPlaceholderData } = useTeamDirectory(
    timeframe,
    workspace
  );
  // History for the trend lines + Insights — requested once the directory
  // is in (it reuses that build's server-side memo of the Client Directory).
  const trendsQuery = useTeamTrends(workspace, { enabled: !!data });
  // A book switch keeps the previous book's trends as placeholder data —
  // never draw those under the new book's numbers (placeholders instead).
  const trends = trendsQuery.isPlaceholderData ? undefined : trendsQuery.data;

  if (isLoading) {
    // Non-privileged viewers usually get just their own card — skeleton
    // accordingly so the page doesn't collapse from three cards to one.
    const likelySelfOnly = !(admin.isSuper || admin.permissions.admin);
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72 rounded-3xl" />
        {!likelySelfOnly && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-3xl" />
            ))}
          </div>
        )}
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            likelySelfOnly ? "max-w-xl" : "lg:grid-cols-2 xl:grid-cols-3"
          )}
        >
          {(likelySelfOnly ? [0] : [0, 1, 2]).map((i) => (
            <Skeleton key={i} className="h-80 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <QueryErrorState
        title="Failed to load the Team directory."
        onRetry={() => refetch()}
      />
    );
  }

  const tfl = TIMEFRAME_PHRASE[timeframe];
  // Self-only viewer (e.g. a media buyer): just their own card. The KPI strip
  // would only repeat that card's numbers, so it's skipped.
  const selfOnly = !!data.viewer.selfOnly;
  const notRostered = selfOnly && data.members.length === 0;

  const memberGrid = (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        selfOnly ? "max-w-xl" : "lg:grid-cols-2 xl:grid-cols-3"
      )}
    >
      {data.members.map((m) => (
        <MemberCard
          key={m.adminId}
          member={m}
          tfl={tfl}
          timeframe={timeframe}
          viewer={data.viewer}
          trends={trends}
          trendsLoading={trendsQuery.isLoading || (!trends && !trendsQuery.isError)}
        />
      ))}
    </div>
  );

  return (
    // The previous timeframe/book stays visible (dimmed) while the new one loads.
    <div className={cn("space-y-6 transition-opacity", isPlaceholderData && "opacity-60")}>
      {/* Toolbar: timeframe + book filter + roster manage */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        >
          {TIMEFRAME_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className="px-3">
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canManage && workspaces.length > 1 && (
            <WorkspaceFilter value={workspace} onChange={setWorkspace} workspaces={workspaces} />
          )}
          {data.viewer.privileged && (
            <Button type="button" variant="outline" onClick={() => setManageOpen(true)}>
              <Settings2 />
              Manage roster
            </Button>
          )}
        </div>
      </div>

      {!selfOnly && (
        <KpiCards
          data={data}
          tfl={tfl}
          drill={drill}
          onDrill={setDrill}
          trends={trends}
          trendsLoading={!trends && !trendsQuery.isError}
        />
      )}

      {drill && !selfOnly && (
        <DrillPanel data={data} kind={drill} tfl={tfl} onClose={() => setDrill(null)} />
      )}

      {data.unrostered.length > 0 && (
        <UnrosteredNotice
          data={data}
          onAdd={(adminId) => {
            setManagePreselect(adminId);
            setManageOpen(true);
          }}
        />
      )}

      {data.members.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <p className="text-sm font-medium">
            {notRostered ? "You're not on the Team roster yet" : "No team members yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.viewer.privileged
              ? "Add admins to the roster to build their hubs."
              : notRostered
                ? "Ask an admin to add you to the roster to get your own hub."
                : "An admin needs to set up the roster."}
          </p>
          {data.viewer.privileged && (
            <Button type="button" className="mt-4" onClick={() => setManageOpen(true)}>
              <UserPlus />
              Add team member
            </Button>
          )}
        </Card>
      ) : selfOnly ? (
        memberGrid
      ) : (
        <Tabs value={view} onValueChange={(v) => setView(v as HomeView)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="members">
              Members
              <span className="text-xs tabular-nums text-muted-foreground">{data.members.length}</span>
            </TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>
          {/* Panels inherit the page's type (TabsContent defaults to text-sm). */}
          <TabsContent value="members" className="text-[length:inherit] leading-[inherit]">
            {memberGrid}
          </TabsContent>
          <TabsContent value="insights" className="text-[length:inherit] leading-[inherit]">
            <TeamInsights data={data} trends={trends} trendsError={trendsQuery.isError} />
          </TabsContent>
        </Tabs>
      )}

      {manageOpen && (
        <RosterManageDialog
          directory={data}
          initialAdminId={managePreselect}
          onClose={() => {
            setManageOpen(false);
            setManagePreselect(null);
          }}
        />
      )}
    </div>
  );
}

/* ── KPI cards ─────────────────────────────────────────────────────────── */

function KpiCards({
  data,
  tfl,
  drill,
  onDrill,
  trends,
  trendsLoading,
}: {
  data: TeamDirectoryPayload;
  tfl: string;
  drill: DrillKind | null;
  onDrill: (k: DrillKind | null) => void;
  trends?: TeamTrends;
  trendsLoading: boolean;
}) {
  const t = data.totals;
  const { labels: healthLabels } = useRosterOptions("health");
  // Count CLIENTS with any health chip (not chip instances) so the card
  // matches the drill list length exactly.
  const healthFlagged = data.clients.filter((c) => c.health.length > 0).length;
  const topHealth = Object.entries(t.healthCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  // Team-level collected = the whole-book Payout-DB aggregate (all re-billed
  // revenue this month), falling back to the bucket sum if absent.
  const collected = monthlyHeadline(t.monthly);

  const lines = useMemo(
    () =>
      trends
        ? {
            // No goal line: members' goals overlap (an Entire-book member's
            // goal covers everyone's clients), so they don't sum to a team goal.
            rebilled: rebilledTrend(trends, trends.totals, 0),
            billed: billedTrend(trends, trends.totals),
            completed: completedTrend(trends, trends.totals),
          }
        : null,
    [trends]
  );
  const doneNow = trends ? trends.totals.tasksCompleted[trends.totals.tasksCompleted.length - 1] ?? 0 : null;
  const doneLast = trends ? trends.totals.tasksCompleted[trends.totals.tasksCompleted.length - 2] ?? 0 : null;
  const createdNow = trends ? trends.totals.tasksCreated[trends.totals.tasksCreated.length - 1] ?? 0 : null;
  const spark = (trend: CardTrend | undefined, label: string) =>
    trend ? <MetricSparkline label={label} {...trend} /> : trendsLoading ? <SparklinePlaceholder /> : null;

  const toggle = (kind: DrillKind) => onDrill(drill === kind ? null : kind);
  const active = (kind: DrillKind) =>
    drill === kind ? "ring-2 ring-ring/40" : undefined;
  const danger = "text-red-700 dark:text-red-400";
  const warning = "text-amber-700 dark:text-amber-400";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Book MRR"
        icon={DollarSign}
        value={formatMoney(t.bookMrrCents)}
        sub={`across ${t.activeClients} active clients`}
        onClick={() => toggle("mrr")}
        className={active("mrr")}
      >
        {spark(lines?.billed, "Billed per month")}
      </StatCard>
      <StatCard
        label={`Re-billed · ${monthName(t.monthly.month)}`}
        icon={RefreshCcw}
        value={formatMoney(collected.cents)}
        // "all rebills" qualifies the mixed populations: the aggregate spans
        // the whole Payout DB while book MRR is active-directory only. Only
        // shown when the headline actually IS that aggregate.
        sub={
          t.bookMrrCents > 0
            ? `${Math.round((collected.cents / t.bookMrrCents) * 100)}% of book MRR${
                collected.wholeBook ? " · all rebills" : ""
              }`
            : collected.wholeBook
              ? "all rebills this month"
              : "collected this month"
        }
        onClick={() => toggle("collected")}
        className={active("collected")}
      >
        {spark(lines?.rebilled, "Re-billed per month")}
      </StatCard>
      <StatCard
        label={`Rebills · ${tfl}`}
        icon={CalendarClock}
        value={String(t.rebills.inWindow)}
        delta={
          t.rebills.overdue > 0 ? (
            <StatusBadge tone="danger">{t.rebills.overdue} overdue</StatusBadge>
          ) : undefined
        }
        sub={
          t.rebills.overdue > 0
            ? `${formatMoney(t.rebills.inWindowMrrCents)} · ${formatMoney(t.rebills.overdueMrrCents)} overdue`
            : formatMoney(t.rebills.inWindowMrrCents)
        }
        onClick={() => toggle("rebills")}
        className={active("rebills")}
      />
      <StatCard
        label="Tasks Completed"
        icon={ListChecks}
        value={doneNow == null ? "—" : String(doneNow)}
        sub={
          doneNow == null
            ? trendsLoading
              ? "This week"
              : "Couldn't load the task history"
            : `this week · ${createdNow} created · ${doneLast} done last week`
        }
        isLoading={trendsLoading && doneNow == null}
      >
        {spark(lines?.completed, "Tasks completed per week")}
      </StatCard>

      <StatCard
        label={`Tasks Due · ${tfl}`}
        icon={ListTodo}
        value={String(t.tasksDueInWindow)}
        sub={`${t.tasksOverdue} overdue included`}
        onClick={() => toggle("tasksdue")}
        className={active("tasksdue")}
      />
      <StatCard
        label="Overdue Tasks"
        icon={CircleAlert}
        value={String(t.tasksOverdue)}
        sub={t.tasksOverdue > 0 ? <span className={danger}>needs attention</span> : "Nothing overdue"}
        onClick={() => toggle("overdue")}
        className={active("overdue")}
      />
      <StatCard
        label="Action Items"
        icon={Zap}
        value={String(t.unsolvedActionItems)}
        sub={t.unsolvedActionItems > 0 ? <span className={warning}>unsolved</span> : "Inbox zero"}
        onClick={() => toggle("actions")}
        className={active("actions")}
      />
      <StatCard
        label="Client Health"
        icon={HeartPulse}
        value={String(healthFlagged)}
        sub={
          topHealth.length > 0
            ? topHealth.map(([slug, n]) => `${n} ${(healthLabels[slug] ?? slug).toLowerCase()}`).join(" · ")
            : "clients with health chips"
        }
        onClick={() => toggle("health")}
        className={active("health")}
      />
    </div>
  );
}

/* ── Drilldown panel ───────────────────────────────────────────────────── */

function DrillPanel({
  data,
  kind,
  tfl,
  onClose,
}: {
  data: TeamDirectoryPayload;
  kind: DrillKind;
  tfl: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { labels: healthLabels } = useRosterOptions("health");
  const titles: Record<DrillKind, string> = {
    mrr: "MRR managed by member",
    health: "Client health",
    rebills: `Rebills · ${tfl}`,
    collected: `Re-billed · ${monthName(data.totals.monthly.month)} · by member`,
    tasksdue: `Tasks due · ${tfl}`,
    overdue: "Overdue tasks by member",
    actions: "Unsolved action items by member",
  };

  const memberRow = (m: TeamMemberSummary, right: React.ReactNode) => (
    <button
      key={m.adminId}
      type="button"
      onClick={() => router.push(`/dashboard/team/${m.adminId}`)}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <MemberAvatar name={m.name} avatarPath={m.avatarPath} size="sm" />
      <span className="min-w-[6rem] flex-1 truncate text-sm font-medium">{m.name}</span>
      <span className="min-w-0 text-right">{right}</span>
    </button>
  );

  const clientRow = (c: TeamClientSlice, right: React.ReactNode) => (
    <div key={c.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
      <AvatarInitials name={c.displayName} className="size-7 text-[10px]" />
      <span className="min-w-[6rem] flex-1 truncate text-sm font-medium">{c.displayName}</span>
      <span className="min-w-0 text-right">{right}</span>
    </div>
  );

  const groupLabel = (text: string, className?: string) => (
    <p className={cn("px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground", className)}>{text}</p>
  );
  const value = "text-sm font-medium tabular-nums";
  const detail = "ml-2 text-xs text-muted-foreground";

  let body: React.ReactNode = null;
  if (kind === "mrr") {
    body = data.members.map((m) =>
      memberRow(
        m,
        <span className={value}>
          {formatMoney(m.mrrManagedCents)}
          <span className={detail}>{m.clientCount} clients</span>
        </span>
      )
    );
  } else if (kind === "collected") {
    // Same headline resolution the member cards render (monthlyHeadline) —
    // the drill always matches the bars. Whole-book members show the
    // all-book Payout-DB aggregate.
    const anyWholeBook = data.members.some(
      (m) => monthlyHeadline(m.monthly).wholeBook
    );
    body = (
      <>
        {data.members.map((m) => {
          const h = monthlyHeadline(m.monthly);
          const pct =
            m.mrrManagedCents > 0
              ? Math.round((h.cents / m.mrrManagedCents) * 100)
              : null;
          return memberRow(
            m,
            <span className={value}>
              {formatMoney(h.cents)}
              <span className={detail}>
                {h.wholeBook && "all book · "}
                {pct !== null ? `${pct}% of MRR` : "no MRR"}
                {m.goalCents > 0 &&
                  ` · ${Math.round((h.cents / m.goalCents) * 100)}% of goal`}
              </span>
            </span>
          );
        })}
        {anyWholeBook && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            &ldquo;All book&rdquo; rows show the same whole-book total — the
            column is not additive.
          </p>
        )}
      </>
    );
  } else if (kind === "health") {
    const flagged = data.clients
      .filter((c) => c.health.length > 0)
      .sort((a, b) => b.mrrCents - a.mrrCents);
    body = flagged.length
      ? flagged.map((c) =>
          clientRow(
            c,
            <span className="flex flex-wrap items-center justify-end gap-1">
              {c.health.map((h) => (
                <StatusBadge key={h} tone={toneOf(HEALTH_TONE, h)}>
                  {healthLabels[h] ?? h}
                </StatusBadge>
              ))}
            </span>
          )
        )
      : <Empty text="No health chips set on the book yet" />;
  } else if (kind === "rebills") {
    // Same classifier the server rollup uses — the list always matches the card.
    const buckets = data.clients.map(
      (c) => [c, classifyRebill(c.rebill, data.window)] as const
    );
    const inWindow = buckets
      .filter(([, b]) => b.inWindow)
      .sort(([a], [b]) => (a.rebill!.nextRebillAt! < b.rebill!.nextRebillAt! ? -1 : 1));
    const overdue = buckets.filter(([, b]) => b.overdue).map(([c]) => c);
    body = (
      <>
        {overdue.length > 0 &&
          groupLabel(`Overdue · ${overdue.length}`, "pt-1 text-red-700 dark:text-red-400")}
        {overdue.map((c) =>
          clientRow(
            c,
            <span className="text-xs font-medium tabular-nums text-red-700 dark:text-red-400">
              {formatMoney(c.mrrCents)} · {formatDate(c.rebill?.nextRebillAt)}
            </span>
          )
        )}
        {inWindow.length > 0 && groupLabel(`Due ${tfl} · ${inWindow.length}`)}
        {inWindow.map(([c, b]) =>
          clientRow(
            c,
            <span
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                b.sent && "opacity-60"
              )}
            >
              {formatMoney(c.mrrCents)} · {formatDate(c.rebill?.nextRebillAt)}
              {b.sent && " · sent"}
            </span>
          )
        )}
        {overdue.length === 0 && inWindow.length === 0 && (
          <Empty text={`No rebills ${tfl}`} />
        )}
      </>
    );
  } else if (kind === "tasksdue") {
    // Same buckets the card sums (overdue + dueToday + dueInWindow) — the
    // panel members always add up to the card count for this timeframe.
    body = data.members
      .filter((m) => m.tasks.overdue + m.tasks.dueToday + m.tasks.dueInWindow > 0)
      .map((m) =>
        memberRow(
          m,
          <span className="text-xs tabular-nums text-muted-foreground">
            {m.tasks.overdue > 0 && (
              <span className="mr-2 font-medium text-red-700 dark:text-red-400">
                {m.tasks.overdue} overdue
              </span>
            )}
            {m.tasks.dueToday} today
            {data.timeframe !== "today" && ` · ${m.tasks.dueInWindow} later ${tfl}`}
          </span>
        )
      );
    if (!Array.isArray(body) || body.length === 0) body = <Empty text={`Nothing due ${tfl}`} />;
  } else if (kind === "overdue") {
    const rows = data.members.filter((m) => m.tasks.overdue > 0);
    body = rows.length
      ? rows.map((m) =>
          memberRow(
            m,
            <span className={cn(value, "text-red-700 dark:text-red-400")}>
              {m.tasks.overdue}
            </span>
          )
        )
      : <Empty text="Nothing overdue" />;
  } else {
    const rows = data.members.filter((m) => m.unsolvedActionItems > 0);
    body = rows.length
      ? rows.map((m) =>
          memberRow(
            m,
            <span className={cn(value, "text-amber-700 dark:text-amber-400")}>
              {m.unsolvedActionItems}
            </span>
          )
        )
      : <Empty text="Inbox zero" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
        <CardTitle>{titles[kind]}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="pt-0 md:pt-0">
        <div className="-mx-2 max-h-80 overflow-y-auto">{body}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

/* ── Member card ───────────────────────────────────────────────────────── */

// Short on purpose: a tile is ~50px wide in the three-column layout.
const WINDOW_STAT_LABEL: Record<TeamTimeframeValue, string> = {
  today: "In window",
  week: "This wk",
  month: "This mo",
};

function MemberCard({
  member: m,
  tfl,
  timeframe,
  viewer,
  trends,
  trendsLoading,
}: {
  member: TeamMemberSummary;
  tfl: string;
  timeframe: TeamTimeframeValue;
  viewer: { adminId: string; privileged: boolean; managedAdminIds?: string[] };
  trends?: TeamTrends;
  trendsLoading: boolean;
}) {
  const router = useRouter();
  const { labels: healthLabels } = useRosterOptions("health");
  // Privileged admins open anyone; a Head of Ads (lead) opens members of
  // their own book (server-enforced via canManageMemberScoped).
  const canOpen =
    viewer.privileged ||
    viewer.adminId === m.adminId ||
    (viewer.managedAdminIds ?? []).includes(m.adminId);
  const topHealth = useMemo(
    () =>
      Object.entries(m.healthCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
    [m.healthCounts]
  );
  const trend = useMemo(() => {
    const s = trends?.members.find((x) => x.adminId === m.adminId);
    return trends && s ? rebilledTrend(trends, s, m.goalCents) : undefined;
  }, [trends, m.adminId, m.goalCents]);

  return (
    // Not `disabled` — a disabled button swallows hover, so the title tooltip
    // explaining WHY it can't be opened would never show.
    <button
      type="button"
      aria-disabled={!canOpen}
      onClick={() => canOpen && router.push(`/dashboard/team/${m.adminId}`)}
      title={canOpen ? undefined : "Only Admin Management (or your book's Head of Ads) can open other members' hubs"}
      className={cn(
        "group block min-w-0 rounded-[min(calc(var(--radius)*2.6),24px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        canOpen ? "cursor-pointer" : "cursor-default"
      )}
    >
      <Card className={cn("flex h-full flex-col", canOpen && "transition-colors group-hover:bg-muted/40")}>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3 md:pb-4">
          <MemberAvatar name={m.name} avatarPath={m.avatarPath} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate" title={m.name}>{m.name}</CardTitle>
            <CardDescription className="truncate text-xs">
              {m.position || ATTRIBUTION_LABEL[m.attribution]} · {m.clientCount} clients
            </CardDescription>
          </div>
          {topHealth.length > 0 && (
            <span className="flex shrink-0 items-center gap-1">
              {topHealth.map(([slug, count]) => (
                <StatusBadge
                  key={slug}
                  tone={toneOf(HEALTH_TONE, slug)}
                  title={healthLabels[slug] ?? slug}
                  className="tabular-nums"
                >
                  {count}
                </StatusBadge>
              ))}
            </span>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {/* The monthly goal is a re-bill COLLECTION target — it's compared
              against collected in the tracker below, never against MRR managed. */}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatMoney(m.mrrManagedCents)}
            </span>
            <span className="text-xs text-muted-foreground">MRR managed</span>
            {m.goalCents > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                Goal <span className="font-medium tabular-nums text-foreground">{formatMoney(m.goalCents)}</span>
              </span>
            )}
          </div>

          <MonthlyRebillTracker
            monthly={m.monthly}
            mrrManagedCents={m.mrrManagedCents}
            goalCents={m.goalCents}
            retention={m.retention}
            className="rounded-2xl bg-muted/40 px-3 py-2.5"
          />

          {/* Timeframe-scoped window strip — the month tracker above doesn't
              answer "what lands {tfl}?", so this keeps the toggle meaningful. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {m.rebills.inWindow} rebill{m.rebills.inWindow === 1 ? "" : "s"}
            </span>
            <span className="tabular-nums">· {formatMoney(m.rebills.inWindowMrrCents)} · {tfl}</span>
            {m.rebills.sentInWindow > 0 && <span>· {m.rebills.sentInWindow} sent</span>}
            {m.rebills.overdue > 0 && (
              <StatusBadge tone="danger" className="ml-auto">
                {m.rebills.overdue} overdue
              </StatusBadge>
            )}
          </div>

          {/* 2×2 below 400px (inner cross of dividers), one row of 4 above. */}
          <div className="grid grid-cols-2 rounded-2xl ring-1 ring-foreground/5 [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(odd)]:border-r min-[400px]:grid-cols-4 min-[400px]:[&>*:nth-child(-n+2)]:border-b-0 min-[400px]:[&>*:nth-child(-n+3)]:border-r">
            <StatTile label="Overdue" value={m.tasks.overdue} tone={m.tasks.overdue > 0 ? "danger" : undefined} />
            <StatTile label="Today" value={m.tasks.dueToday} tone={m.tasks.dueToday > 0 ? "warning" : undefined} />
            <StatTile label={WINDOW_STAT_LABEL[timeframe]} value={m.tasks.dueInWindow} />
            <StatTile label="Done" value={m.tasks.done} />
          </div>

          {m.unsolvedActionItems > 0 && (
            <p className={cn("flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", badgeTone.warning)}>
              <AlertTriangle className="size-3" />
              {m.unsolvedActionItems} unsolved action item{m.unsolvedActionItems === 1 ? "" : "s"}
            </p>
          )}

          {trend ? (
            <MetricSparkline label={`${m.name} re-billed per month`} {...trend} />
          ) : trendsLoading ? (
            <SparklinePlaceholder />
          ) : null}
        </CardContent>
      </Card>
    </button>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="px-2 py-2.5 text-center">
      <p
        className={cn(
          "text-base font-semibold leading-none tabular-nums",
          tone === "danger" && "text-red-700 dark:text-red-400",
          tone === "warning" && "text-amber-700 dark:text-amber-400"
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ── Unrostered assignees notice ───────────────────────────────────────── */

function UnrosteredNotice({
  data,
  onAdd,
}: {
  data: TeamDirectoryPayload;
  onAdd: (adminId: string) => void;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-3xl border px-4 py-3", badgeTone.warning)}>
      <AlertTriangle className="size-4 shrink-0" />
      <p className="text-xs">
        <span className="font-medium">
          {data.unrostered.length} assignee{data.unrostered.length === 1 ? "" : "s"}
        </span>{" "}
        hold client assignments but aren&apos;t on the Team roster:
      </p>
      <span className="flex flex-1 flex-wrap items-center gap-1.5">
        {data.unrostered.map((u) =>
          data.viewer.privileged ? (
            <Button
              key={u.adminId}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onAdd(u.adminId)}
              title={`Add ${u.name} to the roster`}
            >
              <UserPlus />
              {u.name} ({u.clientCount})
            </Button>
          ) : (
            <Badge key={u.adminId} variant="outline" className="font-normal">
              {u.name} ({u.clientCount})
            </Badge>
          )
        )}
      </span>
    </div>
  );
}

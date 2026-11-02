"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Gauge, HeartPulse, ListTodo, Users } from "lucide-react";
import { BadgeDot, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/components/users/format";
import { HEALTH_TONE, toneOf } from "@/components/users/rosterPresentation";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { monthlyHeadline } from "@/lib/teamRebill";
import { cn } from "@/lib/utils";
import { RebillGoalChart, TaskThroughputChart } from "./TeamCharts";
import { MemberAvatar } from "./TeamBits";
import { ATTRIBUTION_LABEL, MONTHLY_REBILL_META, monthName } from "./presentation";
import type { TeamTrends } from "@/lib/teamTrendSeries";
import type { MonthlyRebillBucket, TeamDirectoryPayload, TeamMemberSummary } from "./types";

const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/**
 * Team overview insights: 12 months of re-bills vs goals, 12 weeks of task
 * throughput, and how the book and the work spread across the roster. Every
 * number comes from the same directory payload as the cards above (or the
 * read-only trends history), so the two never disagree.
 */
export function TeamInsights({
  data,
  trends,
  trendsError,
}: {
  data: TeamDirectoryPayload;
  trends?: TeamTrends;
  trendsError?: boolean;
}) {
  const t = trends?.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RebillGoalChart
          months={trends?.months}
          rebilled={t?.rebilled}
          failed={trendsError}
          description={
            t?.wholeBook
              ? "REBILL payouts, whole book · last 12 months"
              : "REBILL payouts of the team's clients · last 12 months"
          }
          className="lg:col-span-2"
        />
        <ClientHealthCard data={data} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RebillByMemberCard data={data} />
        <WorkloadCard data={data} />
        <TaskThroughputChart
          weeks={trends?.weeks}
          created={t?.tasksCreated}
          completed={t?.tasksCompleted}
          failed={trendsError}
          description="Tasks created vs completed per week · whole roster"
        />
        <MrrByMemberCard data={data} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-bill collection per member (segmented bar over MRR managed)
// ---------------------------------------------------------------------------

const BAR_BUCKETS: MonthlyRebillBucket[] = ["collected", "sent", "due", "overdue"];

function MemberLink({ m, children }: { m: TeamMemberSummary; children: React.ReactNode }) {
  return (
    <Link
      href={`/dashboard/team/${m.adminId}`}
      prefetch={false}
      className="-mx-2 block rounded-2xl px-2 py-1.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      {children}
    </Link>
  );
}

/** Members the viewer may open (same rule as the member cards). */
function useCanOpen(data: TeamDirectoryPayload) {
  return (adminId: string) =>
    data.viewer.privileged ||
    data.viewer.adminId === adminId ||
    (data.viewer.managedAdminIds ?? []).includes(adminId);
}

function RowShell({ m, canOpen, children }: { m: TeamMemberSummary; canOpen: boolean; children: React.ReactNode }) {
  return canOpen ? <MemberLink m={m}>{children}</MemberLink> : <div className="py-1.5">{children}</div>;
}

function RebillByMemberCard({ data }: { data: TeamDirectoryPayload }) {
  const canOpen = useCanOpen(data);
  const month = monthName(data.totals.monthly.month);
  const members = useMemo(
    () => [...data.members].sort((a, b) => b.mrrManagedCents - a.mrrManagedCents),
    [data.members]
  );

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            <CardTitle>Re-bill Collection by Member</CardTitle>
          </div>
          <CardDescription className="text-xs">{month} · share of MRR managed</CardDescription>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {BAR_BUCKETS.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5">
              <BadgeDot tone={MONTHLY_REBILL_META[b].tone} />
              {MONTHLY_REBILL_META[b].label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-1">
          {members.map((m) => {
            const h = monthlyHeadline(m.monthly);
            return (
              <li key={m.adminId}>
                <RowShell m={m} canOpen={canOpen(m.adminId)}>
                  <div className="flex items-center gap-2.5">
                    <MemberAvatar name={m.name} avatarPath={m.avatarPath} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{m.name}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-medium">{formatMoney(h.cents)}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {h.wholeBook ? "all book" : `${pctOf(h.cents, m.mrrManagedCents)}%`}
                            {m.goalCents > 0 && ` · ${pctOf(h.cents, m.goalCents)}% of goal`}
                          </span>
                        </span>
                      </div>
                      <div
                        className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`${m.name}: ${BAR_BUCKETS.map((b) => `${m.monthly.buckets[b].count} ${MONTHLY_REBILL_META[b].label.toLowerCase()}`).join(", ")}`}
                      >
                        {m.mrrManagedCents > 0 &&
                          BAR_BUCKETS.map((b) => {
                            const cents = m.monthly.buckets[b].mrrCents;
                            if (cents <= 0) return null;
                            return (
                              <span
                                key={b}
                                className={cn("h-full min-w-[3px]", MONTHLY_REBILL_META[b].bar)}
                                style={{ width: `${(cents / m.mrrManagedCents) * 100}%` }}
                              />
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </RowShell>
              </li>
            );
          })}
        </ul>
        {members.some((m) => monthlyHeadline(m.monthly).wholeBook) && (
          <p className="mt-3 text-xs text-muted-foreground">
            &ldquo;All book&rdquo; members show the whole Payout DB&apos;s re-billed total; their bar is
            still their clients&apos; collection.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Workload per member — open tasks by urgency
// ---------------------------------------------------------------------------

const WORKLOAD_SEGMENTS = [
  { key: "overdue", label: "Overdue", bar: "bg-red-500", tone: "danger" },
  { key: "today", label: "Due today", bar: "bg-amber-500", tone: "warning" },
  { key: "window", label: "Due later", bar: "bg-sky-500", tone: "info" },
  { key: "rest", label: "Other open", bar: "bg-muted-foreground/30", tone: "neutral" },
] as const;

function WorkloadCard({ data }: { data: TeamDirectoryPayload }) {
  const canOpen = useCanOpen(data);
  const rows = useMemo(() => {
    const list = data.members.map((m) => {
      const open = m.tasks.total - m.tasks.done;
      const today = m.tasks.dueToday;
      const window = m.tasks.dueInWindow;
      const overdue = m.tasks.overdue;
      return {
        m,
        open,
        parts: { overdue, today, window, rest: Math.max(open - overdue - today - window, 0) },
        unsolved: m.unsolvedActionItems,
      };
    });
    return list.sort((a, b) => b.parts.overdue - a.parts.overdue || b.open - a.open);
  }, [data.members]);
  const max = Math.max(1, ...rows.map((r) => r.open));
  const windowLabel = data.timeframe === "week" ? "this week" : "this month";

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-muted-foreground" />
            <CardTitle>Workload</CardTitle>
          </div>
          <CardDescription className="text-xs">Open tasks per member</CardDescription>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {/* "Today" collapses the window to today — that segment is always empty. */}
          {WORKLOAD_SEGMENTS.filter((s) => s.key !== "window" || data.timeframe !== "today").map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <BadgeDot tone={s.tone} className={cn(s.key === "rest" && "opacity-50")} />
              {s.key === "window" ? `Due later ${windowLabel}` : s.label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-1">
          {rows.map(({ m, open, parts, unsolved }) => (
            <li key={m.adminId}>
              <RowShell m={m} canOpen={canOpen(m.adminId)}>
                <div className="flex items-center gap-2.5">
                  <MemberAvatar name={m.name} avatarPath={m.avatarPath} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{m.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        <span className="text-sm font-medium text-foreground">{open}</span> open
                        {parts.overdue > 0 && (
                          <span className="text-red-700 dark:text-red-400"> · {parts.overdue} overdue</span>
                        )}
                        {unsolved > 0 && (
                          <span className="text-amber-700 dark:text-amber-400"> · {unsolved} unsolved</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="flex h-full gap-0.5" style={{ width: `${(open / max) * 100}%` }}>
                        {WORKLOAD_SEGMENTS.map((s) =>
                          parts[s.key] > 0 ? (
                            <span
                              key={s.key}
                              className={cn("h-full min-w-[3px]", s.bar)}
                              style={{ width: `${(parts[s.key] / open) * 100}%` }}
                            />
                          ) : null
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </RowShell>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MRR managed per member
// ---------------------------------------------------------------------------

function MrrByMemberCard({ data }: { data: TeamDirectoryPayload }) {
  const canOpen = useCanOpen(data);
  const rows = useMemo(
    () => [...data.members].sort((a, b) => b.mrrManagedCents - a.mrrManagedCents),
    [data.members]
  );
  const max = Math.max(1, ...rows.map((m) => m.mrrManagedCents));

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle>MRR Managed</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {formatMoney(data.totals.bookMrrCents)} book MRR · {data.totals.activeClients} active clients
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-1">
          {rows.map((m) => (
            <li key={m.adminId}>
              <RowShell m={m} canOpen={canOpen(m.adminId)}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {m.position || ATTRIBUTION_LABEL[m.attribution]}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium">{formatMoney(m.mrrManagedCents)}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {m.clientCount} clients
                      {data.totals.bookMrrCents > 0 && ` · ${pctOf(m.mrrManagedCents, data.totals.bookMrrCents)}%`}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${Math.max((m.mrrManagedCents / max) * 100, 1)}%` }}
                  />
                </div>
              </RowShell>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          A client can have several team members (and &ldquo;Entire book&rdquo; members manage every
          client), so shares can add up to more than 100%.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Client health across the book
// ---------------------------------------------------------------------------

function ClientHealthCard({ data }: { data: TeamDirectoryPayload }) {
  const { labels: healthLabels } = useRosterOptions("health");
  const t = data.totals;
  const rows = useMemo(() => {
    const entries = Object.entries(t.healthCounts).sort((a, b) => b[1] - a[1]);
    return entries.map(([slug, count]) => {
      const mrr = data.clients
        .filter((c) => c.health.includes(slug))
        .reduce((s, c) => s + c.mrrCents, 0);
      return { slug, count, mrr };
    });
  }, [t.healthCounts, data.clients]);
  const flagged = data.clients.filter((c) => c.health.length > 0).length;
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <HeartPulse className="size-4 text-muted-foreground" />
          <CardTitle>Client Health</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {flagged} of {t.activeClients} active clients flagged
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No health chips set on the book yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.slug}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <StatusBadge tone={toneOf(HEALTH_TONE, r.slug)}>{healthLabels[r.slug] ?? r.slug}</StatusBadge>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium">{r.count}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{formatMoney(r.mrr)} MRR</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-muted-foreground/40"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {(t.unassignedActive > 0 || t.zeroMrrActive > 0) && (
          <div className="mt-auto space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {t.unassignedActive > 0 && (
              <p>
                <span className="font-medium text-amber-700 dark:text-amber-400">{t.unassignedActive}</span> active
                client{t.unassignedActive === 1 ? "" : "s"} without a team
              </p>
            )}
            {t.zeroMrrActive > 0 && (
              <p>
                <span className="font-medium text-amber-700 dark:text-amber-400">{t.zeroMrrActive}</span> active
                client{t.zeroMrrActive === 1 ? "" : "s"} with $0 MRR
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { memo, Suspense, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useAlerts } from "@/hooks/useAlerts";
import { useDailyInsights } from "@/hooks/useDailyInsights";
import { useDateRange } from "@/hooks/useDateRange";
import { useHydrated } from "@/hooks/useHydrated";
import { aggregateInsights } from "@/lib/meta/transformers";
import { cn, spansMultipleDays } from "@/lib/utils";
import { buildTimeFrame, appendTimeFrameParams } from "@/lib/timeFrame";
import { DashboardShell } from "@/components/layout/DashboardShell";
import DashboardLoading from "./loading";
import { SetupBanner } from "@/components/layout/SetupBanner";
import { useAdmin } from "@/components/providers/AdminProvider";
import { rangeLabel } from "@/components/filters/dateRangeLabel";
import { AgencyPulse, type SalesStats } from "@/components/overview/AgencyPulse";
import { MetaKpiCards } from "@/components/overview/MetaKpiCards";
import { MetaPerformanceChart } from "@/components/overview/MetaPerformanceChart";
import { TopAccountsCard } from "@/components/overview/TopAccountsCard";
import { AccountsTable } from "@/components/overview/AccountsTable";
import { AlertsCard } from "@/components/overview/AlertsCard";
import { RebillCollectionCard } from "@/components/overview/RebillProgress";
import { RebillsDueCard } from "@/components/overview/RebillsDueCard";
import { TeamWorkloadCard } from "@/components/overview/TeamWorkloadCard";
import { CardLink } from "@/components/overview/CardLink";
import { TeamTrendChart } from "@/components/closers/TeamTrendChart";
import { PayoutRevenueMixChart } from "@/components/payouts/PayoutRevenueMixChart";
import { useRebillAlerts } from "@/components/users/useRebillAlerts";
import { useTeamDirectory } from "@/components/team/useTeamData";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamMonthlyTrendPoint } from "@/lib/deals";
import type { PayoutTrends } from "@/lib/payouts";

type OverviewSalesStats = SalesStats & { monthlyTrend?: TeamMonthlyTrendPoint[] };

const NO_TREND: TeamMonthlyTrendPoint[] = [];

const SUMMARY_STALE_MS = 5 * 60 * 1000;

// The page re-renders as each of its ~7 queries lands; memoized charts with
// constant header links skip those renders (a new data array would replay
// the chart's entry animation every time).
const RevenueMixChart = memo(PayoutRevenueMixChart);
const SalesTrendChart = memo(TeamTrendChart);
const PAYOUT_TRACKER_LINK = <CardLink href="/dashboard/closers/payouts">Payout Tracker</CardLink>;
const SALES_OVERVIEW_LINK = <CardLink href="/dashboard/closers">Sales Overview</CardLink>;

/** Error carrying the HTTP status — the query client skips retries on 401/403. */
function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

/** Loading skeleton, or a failure note, in place of a chart card. */
function ChartPlaceholder({ failed, what }: { failed: boolean; what: string }) {
  if (failed) {
    return (
      <Card>
        <CardContent className="flex h-[340px] items-center justify-center p-6 text-sm text-muted-foreground md:p-6">
          Couldn&apos;t load the {what}.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[260px] w-full rounded-2xl" />
      </CardContent>
    </Card>
  );
}

function OverviewContent() {
  const admin = useAdmin();
  // Sections follow the pages they summarize: Sales + Payout Tracker need
  // `closers` (payouts stay internal), re-bill alerts need `users`; the Team
  // hub rollup is every admin's (scoped server-side).
  const canSales = admin.isSuper || admin.permissions.closers;
  const canPayouts = canSales && !admin.isExternal;
  const canClients = admin.isSuper || admin.permissions.users;

  const { dateRange, dateQuery } = useDateRange();
  const hydrated = useHydrated();
  const { data: accounts, isLoading: accountsLoading, error: accountsError } = useAccounts(dateRange);
  const { data: alerts, isLoading: alertsLoading, isError: alertsError } = useAlerts(dateRange);

  const err = accountsError as (Error & { status?: number }) | null;
  const isAuthError = err?.status === 401;
  // A failed load must not read as "no spend" — the Meta section says so instead.
  const metaFailed = Boolean(err) && !accounts;

  const range = rangeLabel(dateRange);

  // Agency-wide Meta totals, and the previous period's from each account's
  // previous totals (Δ of the sums — not an average of per-account %s).
  const metaTotals = useMemo(() => (accounts ? aggregateInsights(accounts.map((a) => a.insights)) : undefined), [accounts]);
  const metaPrevious = useMemo(
    () =>
      accounts?.some((a) => a.previous)
        ? aggregateInsights(accounts.flatMap((a) => (a.previous ? [a.previous] : [])))
        : null,
    [accounts]
  );
  // Biggest spenders first: the daily route takes at most 200.
  const spendingIds = useMemo(
    () =>
      (accounts ?? [])
        .filter((a) => a.insights.spend > 0)
        .sort((x, y) => y.insights.spend - x.insights.spend)
        .map((a) => a.id),
    [accounts]
  );
  const multiDay = spansMultipleDays(dateRange);
  const daily = useDailyInsights(multiDay ? spendingIds : [], dateRange);
  // Trend lines only where one can arrive: a multi-day range with spend (the
  // space is reserved while the accounts load) and a daily read that worked.
  const showTrend = multiDay && !daily.isError && (accountsLoading || spendingIds.length > 0);

  // Same keys + fetchers as the Sales Overview / Payout Tracker / Team pages,
  // so opening one of them after the Overview is instant (and vice versa).
  const salesFrame = useMemo(() => buildTimeFrame("month"), []);
  // The summary reads each source once (5 min fresh, no refetch on focus):
  // those builds are the expensive ones, and the source pages stay live.
  const salesQ = useQuery<OverviewSalesStats>({
    queryKey: ["closers-stats", salesFrame.key, salesFrame.since ?? "", salesFrame.until ?? ""],
    queryFn: async () => {
      const r = await fetch(appendTimeFrameParams("/api/admin/closers/stats?trends=1", salesFrame));
      if (!r.ok) throw httpError("Failed to fetch stats", r.status);
      const d = await r.json();
      return d.data;
    },
    staleTime: SUMMARY_STALE_MS,
    refetchOnWindowFocus: false,
    enabled: canSales,
  });
  const [month, year] = useMemo(() => {
    const now = new Date();
    return [now.getMonth() + 1, now.getFullYear()];
  }, []);
  const payoutsQ = useQuery<PayoutTrends>({
    queryKey: ["admin-payouts-trends", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payouts/trends?month=${month}&year=${year}`);
      if (!res.ok) throw httpError("Failed to fetch payout trends", res.status);
      const json = await res.json();
      return json.data;
    },
    staleTime: SUMMARY_STALE_MS,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    enabled: canPayouts,
  });
  const teamQ = useTeamDirectory("week", undefined, { live: false });
  const rebillsQ = useRebillAlerts({ enabled: canClients, live: false });

  const teamTotals = teamQ.data?.totals;
  const selfOnly = teamQ.data?.viewer.selfOnly ?? false;

  // The shell may already hold this page's data at hydration (see useHydrated).
  if (!hydrated) return <DashboardLoading />;

  return (
    <DashboardShell wide>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">
            How the agency is doing across revenue, sales, clients and Meta ads
          </p>
        </div>

        <SetupBanner show={isAuthError} />

        <Section title="At a glance" subtitle="Each card opens its page">
          <AgencyPulse
            sales={canSales ? { data: salesQ.data, isLoading: salesQ.isLoading, isError: salesQ.isError } : undefined}
            payouts={
              canPayouts ? { data: payoutsQ.data, isLoading: payoutsQ.isLoading, isError: payoutsQ.isError } : undefined
            }
            team={{
              data: teamQ.data,
              isLoading: teamQ.isLoading,
              isError: teamQ.isError,
              // A self-only viewer's MRR is their own book — the Clients page
              // totals the whole book, the Team hub shows theirs.
              href: canClients && !selfOnly ? "/dashboard/users" : "/dashboard/team",
            }}
            ads={{
              spend: metaTotals?.spend,
              previousSpend: metaPrevious ? metaPrevious.spend : null,
              roas: metaTotals?.roas,
              spendingAccounts: spendingIds.length,
              series: daily.data?.timeSeries,
              showTrend,
              isLoading: accountsLoading,
              isError: metaFailed,
              rangeLabel: range,
            }}
          />
        </Section>

        {canSales && (
          <Section title="Revenue & sales" subtitle="Last 12 months">
            <div className={cn("grid grid-cols-1 gap-6", canPayouts && "xl:grid-cols-2")}>
              {canPayouts &&
                (payoutsQ.data ? (
                  <RevenueMixChart months={payoutsQ.data.months} action={PAYOUT_TRACKER_LINK} />
                ) : (
                  <ChartPlaceholder failed={payoutsQ.isError} what="payout trends" />
                ))}
              {salesQ.data ? (
                <SalesTrendChart data={salesQ.data.monthlyTrend ?? NO_TREND} action={SALES_OVERVIEW_LINK} />
              ) : (
                <ChartPlaceholder failed={salesQ.isError} what="sales trends" />
              )}
            </div>
          </Section>
        )}

        <Section title="Clients & team" subtitle={selfOnly ? "Your clients and tasks" : undefined}>
          <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2", canClients && "xl:grid-cols-3")}>
            <RebillCollectionCard
              monthly={teamTotals?.monthly}
              mrrCents={teamTotals?.bookMrrCents ?? 0}
              retention={teamTotals?.retention}
              isLoading={teamQ.isLoading}
              isError={teamQ.isError}
              href="/dashboard/team"
              scopeLabel={selfOnly ? "Your clients" : "All clients you can see"}
            />
            {canClients && (
              <RebillsDueCard data={rebillsQ.data} isLoading={rebillsQ.isLoading} isError={rebillsQ.isError} />
            )}
            <TeamWorkloadCard
              team={teamQ.data}
              isLoading={teamQ.isLoading}
              isError={teamQ.isError}
              // Third card: a full row on the 2-column grid.
              className={canClients ? "md:col-span-2 xl:col-span-1" : undefined}
            />
          </div>
        </Section>

        <Section
          id="meta-ads"
          title="Meta ads"
          subtitle={accounts ? `${range} · ${accounts.length} account${accounts.length !== 1 ? "s" : ""}` : range}
        >
          {metaFailed ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-10 text-center md:p-10">
                <AlertTriangle className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">Couldn&apos;t load Meta ad accounts</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {isAuthError ? "The Meta access token is missing or expired — see Settings." : err?.message}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <MetaKpiCards
                metrics={metaTotals}
                previous={metaPrevious}
                timeSeries={daily.data?.timeSeries}
                showTrend={showTrend}
                isLoading={accountsLoading}
              />
              <MetaPerformanceChart
                data={daily.data?.timeSeries}
                isLoading={accountsLoading || (daily.isLoading && spendingIds.length > 0)}
                error={daily.error as Error | null}
                description={
                  daily.data
                    ? `${range} · ${daily.data.accounts} spending account${daily.data.accounts === 1 ? "" : "s"}${
                        daily.data.failed > 0 ? ` (${daily.data.failed} unavailable)` : ""
                      }`
                    : range
                }
                emptyText={multiDay ? undefined : "Pick a range longer than one day to see the daily trend"}
              />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <TopAccountsCard accounts={accounts} isLoading={accountsLoading} dateQuery={dateQuery} rangeLabel={range} />
                <AlertsCard alerts={alerts} isLoading={alertsLoading} isError={alertsError} dateQuery={dateQuery} />
              </div>
              <AccountsTable accounts={accounts} isLoading={accountsLoading} dateRange={dateQuery} />
            </>
          )}
        </Section>
      </div>
    </DashboardShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardShell wide><div className="animate-pulse text-muted-foreground">Loading...</div></DashboardShell>}>
      <OverviewContent />
    </Suspense>
  );
}

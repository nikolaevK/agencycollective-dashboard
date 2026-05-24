"use client";

import { useState, useMemo, Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { useDateRange } from "@/hooks/useDateRange";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useTopAds } from "@/hooks/useTopAds";
import { useAllAccountsOverview } from "@/hooks/useAllAccountsOverview";
import { useCombinedOverview } from "@/hooks/useCombinedOverview";
import { usePixelHealth } from "@/hooks/usePixelHealth";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { aggregateInsights } from "@/lib/meta/transformers";
import type { PixelStatsPeriod } from "@/types/dashboard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { TopAdsCard } from "@/components/portal/TopAdsCard";
import { AccountsOverviewGrid, ALL_ACCOUNTS_ID } from "@/components/portal/AccountsOverviewGrid";
import { PixelHealthCard } from "@/components/drilldown/PixelHealthCard";
import { ActivityFeedCard } from "@/components/drilldown/ActivityFeedCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function OverviewContent() {
  const { dateRange } = useDateRange();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [pixelPeriod, setPixelPeriod] = useState<PixelStatsPeriod>("last_7d");

  // Fetch all accounts with metrics (for the grid)
  const { data: allAccounts, isLoading: allAccountsLoading } = useAllAccountsOverview(dateRange);

  const hasMultipleAccounts = allAccounts && allAccounts.length > 1;

  // Determine mode
  const isAllMode = selectedAccountId === ALL_ACCOUNTS_ID;
  const showAllMode = (isAllMode || (!selectedAccountId && hasMultipleAccounts)) && allAccounts && allAccounts.length > 1;

  // Effective account for single-account queries
  const effectiveAccountId = useMemo(() => {
    if (showAllMode) return undefined;
    if (!allAccounts || allAccounts.length === 0) return selectedAccountId;
    if (selectedAccountId && selectedAccountId !== ALL_ACCOUNTS_ID && allAccounts.some((a) => a.accountId === selectedAccountId)) {
      return selectedAccountId;
    }
    return allAccounts[0].accountId;
  }, [selectedAccountId, allAccounts, showAllMode]);

  // Grid highlight
  const gridSelectedId = showAllMode ? ALL_ACCOUNTS_ID : effectiveAccountId;

  // ── Combined overview (all accounts aggregated) ──
  const {
    data: combinedData,
    isLoading: combinedLoading,
    error: combinedError,
  } = useCombinedOverview(dateRange, !!showAllMode);

  // ── Single account data ──
  // In combined mode, effectiveAccountId is undefined. useUserOverview/useTopAds
  // will fall back to the default account — the result is not displayed but the
  // fetch is cheap (cached). Hooks can't be conditionally called.
  const { data, isLoading, error } = useUserOverview(dateRange, effectiveAccountId);
  const { data: topAds, isLoading: topAdsLoading } = useTopAds(dateRange, effectiveAccountId);
  const { pixels, periodLabel: pixelPeriodLabel, isLoading: pixelsLoading, error: pixelsError } =
    usePixelHealth(effectiveAccountId, "/api/user/pixel-health", pixelPeriod);
  const { data: activities, isLoading: activitiesLoading, error: activitiesError } =
    useActivityFeed(effectiveAccountId, dateRange, "/api/user/activities");

  // Aggregated metrics from the same source as the grid card (single source of truth)
  const aggregatedMetrics = useMemo(() => {
    if (!allAccounts || allAccounts.length === 0) return undefined;
    return aggregateInsights(allAccounts.map((a) => a.metrics));
  }, [allAccounts]);

  // Pick the right data source — metrics from allAccounts, time series from combined API
  const displayMetrics = showAllMode ? aggregatedMetrics : data?.metrics;
  const displayTimeSeries = showAllMode ? combinedData?.timeSeries : data?.timeSeries;
  const displayLoading = showAllMode ? allAccountsLoading : isLoading;
  const displayError = showAllMode ? combinedError : error;
  const displayTitle = showAllMode
    ? "all linked accounts"
    : (data?.accountName ?? "your account");

  // No Meta ad account connected to this client yet (admin hasn't linked any).
  // The overview endpoint resolves the account server-side (linked accounts +
  // legacy account_id) and returns "" only when there's truly none — a more
  // accurate signal than the linked-accounts list alone (which omits the
  // legacy account_id of pre-existing clients).
  const noAccounts = !isLoading && data?.accountId === "";

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {noAccounts
              ? "Your ad accounts will appear here once your account manager connects them."
              : `Performance for ${displayTitle}`}
          </p>
        </div>

        {noAccounts ? (
          <div className="flex min-h-[55vh] items-center justify-center px-2 py-8 sm:px-4">
            <Card className="w-full max-w-lg">
              {/* Plain div, not CardContent — CardContent hard-codes md:pt-0,
                  which tailwind-merge can't override across the breakpoint and
                  would collapse the top padding (icon flush to the border). */}
              <div className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:px-10 sm:py-14">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <BarChart3 className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-foreground">
                    No ad accounts connected yet
                  </h3>
                  <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Your account manager hasn&apos;t linked any Meta ad accounts to your
                    portal yet. Once they do, your campaign performance will show up here
                    automatically.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Think this is a mistake? Reach out on the Support tab.
                </p>
              </div>
            </Card>
          </div>
        ) : (
          <>
        {/* Account selector grid */}
        {hasMultipleAccounts && (
          <AccountsOverviewGrid
            accounts={allAccounts}
            selectedAccountId={gridSelectedId}
            onSelectAccount={setSelectedAccountId}
          />
        )}

        {allAccountsLoading && !allAccounts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        )}

        {/* KPI Grid — works for both modes */}
        <KpiGrid
          metrics={displayMetrics}
          isLoading={displayLoading}
          currency={showAllMode ? "USD" : data?.currency}
        />

        {/* Performance Over Time — works for both modes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              isLoading={displayLoading}
              error={displayError as Error | null}
              isEmpty={!displayLoading && (!displayTimeSeries || displayTimeSeries.length === 0)}
              height={320}
            >
              {displayTimeSeries && displayTimeSeries.length > 0 && (
                <TimeSeriesChart data={displayTimeSeries} height={320} />
              )}
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Per-account sections — only in single account mode */}
        {!showAllMode && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PixelHealthCard
                pixels={pixels}
                isLoading={pixelsLoading}
                error={pixelsError as Error | null}
                periodLabel={pixelPeriodLabel}
                period={pixelPeriod}
                onPeriodChange={setPixelPeriod}
              />
              <ActivityFeedCard
                items={activities}
                isLoading={activitiesLoading}
                error={activitiesError as Error | null}
              />
            </div>

            <TopAdsCard
              ads={topAds}
              isLoading={topAdsLoading}
              currency={data?.currency}
            />
          </>
        )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

export default function PortalOverviewPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </DashboardShell>
      }
    >
      <OverviewContent />
    </Suspense>
  );
}

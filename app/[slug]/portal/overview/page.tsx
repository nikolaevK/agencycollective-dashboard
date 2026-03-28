"use client";

import { useState, useMemo, Suspense } from "react";
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

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance for {displayTitle}
          </p>
        </div>

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

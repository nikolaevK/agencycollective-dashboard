"use client";

import { useState, useMemo, Suspense } from "react";
import { useDateRange } from "@/hooks/useDateRange";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useTopAds } from "@/hooks/useTopAds";
import { useAllAccountsOverview } from "@/hooks/useAllAccountsOverview";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { TopAdsCard } from "@/components/portal/TopAdsCard";
import { AccountsOverviewGrid } from "@/components/portal/AccountsOverviewGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function OverviewContent() {
  const { dateRange } = useDateRange();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);

  // Fetch all accounts with metrics (for the grid)
  const { data: allAccounts, isLoading: allAccountsLoading } = useAllAccountsOverview(dateRange);

  // If selected account was removed, reset to first available
  const effectiveAccountId = useMemo(() => {
    if (!allAccounts || allAccounts.length === 0) return selectedAccountId;
    if (selectedAccountId && allAccounts.some((a) => a.accountId === selectedAccountId)) {
      return selectedAccountId;
    }
    return allAccounts[0].accountId;
  }, [selectedAccountId, allAccounts]);

  // Fetch detail data for the selected account
  const { data, isLoading, error } = useUserOverview(dateRange, effectiveAccountId);
  const { data: topAds, isLoading: topAdsLoading } = useTopAds(dateRange, effectiveAccountId);

  const hasMultipleAccounts = allAccounts && allAccounts.length > 1;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance for {data?.accountName ?? "your account"}
          </p>
        </div>

        {/* All accounts grid — only shown when client has >1 linked account */}
        {hasMultipleAccounts && (
          <AccountsOverviewGrid
            accounts={allAccounts}
            selectedAccountId={effectiveAccountId}
            onSelectAccount={setSelectedAccountId}
          />
        )}

        {/* Loading skeleton for accounts grid */}
        {allAccountsLoading && !allAccounts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        )}

        <KpiGrid
          metrics={data?.metrics}
          isLoading={isLoading}
          currency={data?.currency}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              isLoading={isLoading}
              error={error as Error | null}
              isEmpty={!isLoading && (!data?.timeSeries || data.timeSeries.length === 0)}
              height={320}
            >
              {data?.timeSeries && data.timeSeries.length > 0 && (
                <TimeSeriesChart data={data.timeSeries} height={320} />
              )}
            </ChartContainer>
          </CardContent>
        </Card>

        <TopAdsCard
          ads={topAds}
          isLoading={topAdsLoading}
          currency={data?.currency}
        />
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

"use client";

import { Suspense, useState } from "react";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useInsights } from "@/hooks/useInsights";
import { useDateRange } from "@/hooks/useDateRange";
import { useHydrated } from "@/hooks/useHydrated";
import { useAccounts } from "@/hooks/useAccounts";
import { usePixelHealth } from "@/hooks/usePixelHealth";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { DashboardShell } from "@/components/layout/DashboardShell";
import AccountLoading from "./loading";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { CampaignTable } from "@/components/drilldown/CampaignTable";
import { PixelHealthCard } from "@/components/drilldown/PixelHealthCard";
import { ActivityFeedCard } from "@/components/drilldown/ActivityFeedCard";
import { rangeLabel } from "@/components/filters/dateRangeLabel";
import { MetaKpiCards } from "@/components/overview/MetaKpiCards";
import { MetaPerformanceChart } from "@/components/overview/MetaPerformanceChart";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { spansMultipleDays } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { PixelStatsPeriod } from "@/types/dashboard";

interface AccountPageProps {
  params: { accountId: string };
}

function AccountContent({ accountId }: { accountId: string }) {
  const { dateRange } = useDateRange();
  const hydrated = useHydrated();
  const [pixelPeriod, setPixelPeriod] = useState<PixelStatsPeriod>("last_7d");
  const { data: accounts } = useAccounts(dateRange);
  const { data: insightsData, isLoading: insightsLoading, error: insightsError } = useInsights(
    accountId,
    dateRange,
    { withTimeSeries: true }
  );
  const { data: campaigns, isLoading: campaignsLoading, error: campaignsError } = useCampaigns(
    accountId,
    dateRange
  );
  const { pixels, periodLabel: pixelPeriodLabel, isLoading: pixelsLoading, error: pixelsError } = usePixelHealth(accountId, "/api/pixel-health", pixelPeriod);
  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useActivityFeed(
    accountId,
    dateRange
  );

  const account = accounts?.find((a) => a.id === accountId);
  const accountName = account?.name ?? accountId;

  // The shell may already hold this page's data at hydration (see useHydrated).
  if (!hydrated) return <AccountLoading />;

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <DrilldownBreadcrumb items={[{ label: accountName }]} />

        {/* Header */}
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-2xl lg:text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{accountName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {account ? (
              <>
                <span className="font-mono text-xs">{account.id}</span>
                <span aria-hidden>·</span>
                <span>{account.currency}</span>
                <span aria-hidden>·</span>
                <span>{account.timezone}</span>
                <StatusBadge tone={metaStatusTone(account.status)}>{metaStatusLabel(account.status)}</StatusBadge>
              </>
            ) : (
              <span>Ad account</span>
            )}
          </div>
        </div>

        {/* KPI metrics */}
        <MetaKpiCards
          metrics={insightsData?.metrics}
          previous={account?.previous}
          timeSeries={insightsData?.timeSeries}
          showTrend={spansMultipleDays(dateRange)}
          isLoading={insightsLoading}
          currency={account?.currency}
        />

        {/* Time series chart */}
        <MetaPerformanceChart
          data={insightsData?.timeSeries}
          isLoading={insightsLoading}
          error={insightsError as Error | null}
          currency={account?.currency}
          description={rangeLabel(dateRange)}
        />

        {/* Pixel health & activity feed */}
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

        {/* Campaigns table */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <CardTitle>Campaigns</CardTitle>
            {campaigns && <Badge variant="secondary">{campaigns.length}</Badge>}
          </CardHeader>
          <CardContent>
            {campaignsError ? (
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4 shrink-0" />
                Failed to load campaigns: {(campaignsError as Error).message}
              </div>
            ) : (
              <CampaignTable
                campaigns={campaigns}
                isLoading={campaignsLoading}
                accountId={accountId}
                currency={account?.currency}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

export default function AccountPage({ params }: AccountPageProps) {
  return (
    <Suspense fallback={<DashboardShell wide><div className="animate-pulse text-muted-foreground">Loading account...</div></DashboardShell>}>
      <AccountContent accountId={params.accountId} />
    </Suspense>
  );
}

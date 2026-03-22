"use client";

import { Suspense, useState } from "react";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useInsights } from "@/hooks/useInsights";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { usePixelHealth } from "@/hooks/usePixelHealth";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { CampaignTable } from "@/components/drilldown/CampaignTable";
import { PixelHealthCard } from "@/components/drilldown/PixelHealthCard";
import { ActivityFeedCard } from "@/components/drilldown/ActivityFeedCard";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { AlertTriangle } from "lucide-react";
import type { PixelStatsPeriod } from "@/types/dashboard";

interface AccountPageProps {
  params: { accountId: string };
}

function AccountContent({ accountId }: { accountId: string }) {
  const { dateRange } = useDateRange();
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

  return (
    <DashboardShell>
      <div className="space-y-8">
        <DrilldownBreadcrumb
          items={[{ label: accountName }]}
        />

        {/* Header */}
        <div>
          {/* Mobile */}
          <div className="lg:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Account</p>
            <h1 className="text-xl font-bold text-foreground truncate">{accountName}</h1>
            {account && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {account.currency} · {account.timezone} ·{" "}
                <span className={account.status === "ACTIVE" ? "text-emerald-500" : "text-red-500"}>
                  {account.status}
                </span>
              </p>
            )}
          </div>
          {/* Desktop */}
          <div className="hidden lg:block">
            <h2 className="text-3xl font-light text-foreground">
              Account <span className="font-bold text-primary">{accountName}</span>
            </h2>
            {account && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-mono">{account.id}</span> · {account.currency} · {account.timezone} ·{" "}
                <span className={`font-medium ${account.status === "ACTIVE" ? "text-emerald-500" : "text-red-500"}`}>
                  {account.status}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* KPI metrics */}
        <KpiGrid
          metrics={insightsData?.metrics}
          delta={account?.delta}
          isLoading={insightsLoading}
          currency={account?.currency}
        />

        {/* Time series chart */}
        <div className="bg-card rounded-2xl p-5 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
          <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-xl lg:font-bold lg:normal-case lg:tracking-normal text-foreground mb-6 lg:mb-8">
            Performance Over Time
          </h4>
          <ChartContainer
            isLoading={insightsLoading}
            error={insightsError as Error | null}
            isEmpty={!insightsData?.timeSeries || insightsData.timeSeries.length === 0}
            height={300}
          >
            {insightsData?.timeSeries && (
              <TimeSeriesChart data={insightsData.timeSeries} height={300} />
            )}
          </ChartContainer>
        </div>

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
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden px-4 py-5 lg:px-8 lg:py-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-xl lg:font-bold lg:normal-case lg:tracking-normal text-foreground">
              Campaigns
            </h4>
            {campaigns && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                {campaigns.length}
              </span>
            )}
          </div>
          {campaignsError ? (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Failed to load campaigns: {(campaignsError as Error).message}
            </div>
          ) : (
            <CampaignTable
              campaigns={campaigns}
              isLoading={campaignsLoading}
              accountId={accountId}
            />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export default function AccountPage({ params }: AccountPageProps) {
  return (
    <Suspense fallback={<DashboardShell><div className="animate-pulse text-muted-foreground">Loading account...</div></DashboardShell>}>
      <AccountContent accountId={params.accountId} />
    </Suspense>
  );
}

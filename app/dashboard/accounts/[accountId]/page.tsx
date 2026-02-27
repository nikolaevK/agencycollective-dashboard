"use client";

import { Suspense } from "react";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useInsights } from "@/hooks/useInsights";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { CampaignTable } from "@/components/drilldown/CampaignTable";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface AccountPageProps {
  params: { accountId: string };
}

function AccountContent({ accountId }: { accountId: string }) {
  const { dateRange } = useDateRange();
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

  const account = accounts?.find((a) => a.id === accountId);
  const accountName = account?.name ?? accountId;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <DrilldownBreadcrumb
          items={[{ label: accountName }]}
        />

        <div>
          <h1 className="text-2xl font-bold">{accountName}</h1>
          {account && (
            <p className="text-sm text-muted-foreground">
              {account.currency} · {account.timezone} · {account.status}
            </p>
          )}
        </div>

        {/* KPI metrics */}
        <KpiGrid
          metrics={insightsData?.metrics}
          delta={account?.delta}
          isLoading={insightsLoading}
          currency={account?.currency}
        />

        {/* Time series chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Campaigns table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Campaigns
              {campaigns && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({campaigns.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
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

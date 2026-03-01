"use client";

import { Suspense } from "react";
import { useDateRange } from "@/hooks/useDateRange";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useTopAds } from "@/hooks/useTopAds";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { TopAdsCard } from "@/components/portal/TopAdsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function OverviewContent() {
  const { dateRange } = useDateRange();
  const { data, isLoading, error } = useUserOverview(dateRange);
  const { data: topAds, isLoading: topAdsLoading } = useTopAds(dateRange);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Performance for {data?.accountName ?? "your account"}
          </p>
        </div>

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

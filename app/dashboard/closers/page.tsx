"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { CloserOverviewMetrics } from "@/components/closers/CloserOverviewMetrics";
import { CloserLeaderboard } from "@/components/closers/CloserLeaderboard";
import { TeamOutputChart } from "@/components/closers/TeamOutputChart";
import { TeamTrendChart } from "@/components/closers/TeamTrendChart";
import { TimeFrameSelector } from "@/components/shared/TimeFrameSelector";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  appendTimeFrameParams,
  buildTimeFrame,
  TIME_FRAME_LABELS,
  type TimeFrame,
  type TimeFrameKey,
} from "@/lib/timeFrame";

function windowLabel(tf: TimeFrame): string {
  if (tf.key === "custom" && tf.since && tf.until) return `${tf.since} → ${tf.until}`;
  return TIME_FRAME_LABELS[tf.key as TimeFrameKey] ?? "Selected window";
}

export default function ClosersPage() {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>(() => buildTimeFrame("month"));

  const { data, isLoading } = useQuery({
    queryKey: ["closers-stats", timeFrame.key, timeFrame.since ?? "", timeFrame.until ?? ""],
    queryFn: async () => {
      const url = appendTimeFrameParams("/api/admin/closers/stats", timeFrame);
      const r = await fetch(url);
      if (!r.ok) throw new Error("Failed to fetch stats");
      const d = await r.json();
      return d.data;
    },
    staleTime: 30_000,
  });

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">
            Sales Overview
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track your team&apos;s sales performance
          </p>
        </div>

        <CloserSubNav />

        <TimeFrameSelector value={timeFrame} onChange={setTimeFrame} />

        {isLoading ? (
          <OverviewSkeleton />
        ) : data ? (
          <>
            <CloserOverviewMetrics
              stats={data}
              windowLabel={windowLabel(timeFrame)}
              isLifetimeWindow={timeFrame.key === "all"}
            />
            {Array.isArray(data.monthlyTrend) && data.monthlyTrend.length > 0 && (
              <TeamTrendChart data={data.monthlyTrend} />
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CloserLeaderboard closerBreakdowns={data.closerBreakdowns} />
              <TeamOutputChart closerBreakdowns={data.closerBreakdowns} />
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="p-12 md:p-12 text-center">
              <p className="text-muted-foreground text-sm">
                No sales data available yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

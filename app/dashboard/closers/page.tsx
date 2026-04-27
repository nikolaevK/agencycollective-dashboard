"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { CloserOverviewMetrics } from "@/components/closers/CloserOverviewMetrics";
import { CloserLeaderboard } from "@/components/closers/CloserLeaderboard";
import { TeamOutputChart } from "@/components/closers/TeamOutputChart";
import { TimeFrameSelector } from "@/components/shared/TimeFrameSelector";
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
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CloserLeaderboard closerBreakdowns={data.closerBreakdowns} />
              <TeamOutputChart closerBreakdowns={data.closerBreakdowns} />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No sales data available yet.
            </p>
          </div>
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
          <div
            key={i}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg animate-pulse bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-6 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6"
          >
            <div className="h-5 w-32 animate-pulse rounded bg-muted mb-6" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="h-8 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

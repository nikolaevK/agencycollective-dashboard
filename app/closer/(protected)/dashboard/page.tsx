"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CloserDashboardView,
  type CloserDashboardData,
} from "@/components/closer/CloserDashboardView";
import {
  DashboardSkeleton,
  DashboardError,
} from "@/components/closer/DashboardSkeleton";
import { appendTimeFrameParams, buildTimeFrame, type TimeFrame } from "@/lib/timeFrame";

export default function CloserDashboardPage() {
  // "This month" by default — agreed default across admin/closer/setter.
  const [timeFrame, setTimeFrame] = useState<TimeFrame>(() => buildTimeFrame("month"));

  const { data, isError } = useQuery<CloserDashboardData>({
    // Time frame in the key so refetch fires when the user picks a new range.
    queryKey: ["closer-stats", timeFrame.key, timeFrame.since ?? "", timeFrame.until ?? ""],
    queryFn: async () => {
      const url = appendTimeFrameParams("/api/closer/stats", timeFrame);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load dashboard: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    // Paired stale/refetch: 2 min aligns with the Google Calendar cache TTL.
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  return (
    <main className="flex-1 overflow-y-auto">
      {isError ? (
        <DashboardError message="Failed to load your dashboard. Please refresh in a moment." />
      ) : !data ? (
        <DashboardSkeleton tiles={6} />
      ) : (
        <CloserDashboardView
          data={data}
          timeFrame={timeFrame}
          onTimeFrameChange={setTimeFrame}
        />
      )}
    </main>
  );
}

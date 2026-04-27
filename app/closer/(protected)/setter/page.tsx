"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SetterDashboardView,
  type SetterDashboardData,
} from "@/components/closer/SetterDashboardView";
import {
  DashboardSkeleton,
  DashboardError,
} from "@/components/closer/DashboardSkeleton";
import { appendTimeFrameParams, buildTimeFrame, type TimeFrame } from "@/lib/timeFrame";

export default function SetterDashboardPage() {
  const queryClient = useQueryClient();
  const [timeFrame, setTimeFrame] = useState<TimeFrame>(() => buildTimeFrame("month"));
  const queryKey = ["setter-stats", timeFrame.key, timeFrame.since ?? "", timeFrame.until ?? ""];

  const { data, isError } = useQuery<SetterDashboardData>({
    queryKey,
    queryFn: async () => {
      const url = appendTimeFrameParams("/api/closer/setter/stats", timeFrame);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load setter dashboard: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
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
        <SetterDashboardView
          data={data}
          timeFrame={timeFrame}
          onTimeFrameChange={setTimeFrame}
          onMutated={() => {
            queryClient.invalidateQueries({ queryKey });
            queryClient.invalidateQueries({ queryKey: ["setter-appointments"] });
          }}
        />
      )}
    </main>
  );
}

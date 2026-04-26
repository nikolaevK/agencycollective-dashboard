"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SetterDashboardView,
  type SetterDashboardData,
} from "@/components/closer/SetterDashboardView";
import {
  DashboardSkeleton,
  DashboardError,
} from "@/components/closer/DashboardSkeleton";

const QUERY_KEY = ["setter-stats"] as const;

export default function SetterDashboardPage() {
  const queryClient = useQueryClient();

  const { data, isError } = useQuery<SetterDashboardData>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/closer/setter/stats");
      if (!res.ok) throw new Error(`Failed to load setter dashboard: ${res.status}`);
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
        <SetterDashboardView
          data={data}
          onMutated={() => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            // Companion cache used by the appointments page; harmless if
            // it isn't currently subscribed.
            queryClient.invalidateQueries({ queryKey: ["setter-appointments"] });
          }}
        />
      )}
    </main>
  );
}

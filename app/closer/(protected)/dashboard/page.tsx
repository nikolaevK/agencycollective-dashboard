"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CloserDashboardView,
  type CloserDashboardData,
} from "@/components/closer/CloserDashboardView";
import {
  DashboardSkeleton,
  DashboardError,
} from "@/components/closer/DashboardSkeleton";

export default function CloserDashboardPage() {
  const { data, isError } = useQuery<CloserDashboardData>({
    queryKey: ["closer-stats"],
    queryFn: async () => {
      const res = await fetch("/api/closer/stats");
      if (!res.ok) throw new Error(`Failed to load dashboard: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    // Paired stale/refetch: 2 min aligns with the Google Calendar cache
    // TTL used by no-show enrichment on this endpoint.
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  return (
    <main className="flex-1 overflow-y-auto">
      {isError ? (
        <DashboardError message="Failed to load your dashboard. Please refresh in a moment." />
      ) : !data ? (
        <DashboardSkeleton tiles={4} />
      ) : (
        <CloserDashboardView data={data} />
      )}
    </main>
  );
}

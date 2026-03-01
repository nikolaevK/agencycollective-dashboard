"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";

interface UserOverviewData {
  accountId: string;
  accountName: string;
  currency: string;
  logoPath: string | null;
  metrics: InsightMetrics;
  timeSeries: TimeSeriesDataPoint[];
}

async function fetchUserOverview(dateRange: DateRangeInput): Promise<UserOverviewData> {
  const params = new URLSearchParams();
  if (dateRange.preset) {
    params.set("preset", dateRange.preset);
  } else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/user/overview?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as UserOverviewData;
}

export function useUserOverview(dateRange: DateRangeInput) {
  return useQuery({
    queryKey: ["user-overview", dateRange],
    queryFn: () => fetchUserOverview(dateRange),
    staleTime: 5 * 60 * 1000,
  });
}

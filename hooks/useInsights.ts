"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, DateRangeInput } from "@/types/api";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";

interface InsightsResponse {
  metrics: InsightMetrics;
  timeSeries?: TimeSeriesDataPoint[];
}

async function fetchInsights(
  accountId: string,
  dateRange: DateRangeInput,
  withTimeSeries: boolean
): Promise<InsightsResponse> {
  const params = new URLSearchParams({ accountId });
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }
  if (withTimeSeries) params.set("timeSeries", "true");

  const res = await fetch(`/api/insights?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json: ApiResponse<InsightsResponse> = await res.json();
  return json.data;
}

export function useInsights(
  accountId: string | undefined,
  dateRange: DateRangeInput,
  options: { withTimeSeries?: boolean } = {}
) {
  const { withTimeSeries = false } = options;
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["insights", accountId, dateKey, withTimeSeries],
    queryFn: () => fetchInsights(accountId!, dateRange, withTimeSeries),
    enabled: Boolean(accountId),
    staleTime: 4 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

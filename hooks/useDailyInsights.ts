"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { TimeSeriesDataPoint } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";
import { META_QUERY_STALE_MS, fetchApi } from "@/lib/queryConfig";

interface DailyInsightsResponse {
  timeSeries: TimeSeriesDataPoint[];
  /** Accounts merged into the series / accounts whose daily read failed. */
  accounts: number;
  failed: number;
}

/** The route's cap (app/api/insights/daily). */
export const DAILY_INSIGHTS_MAX_ACCOUNTS = 200;

/**
 * Agency-wide daily Meta insights — the given accounts' daily rows merged
 * into one series. Pass only accounts that spent in the range (the rest have
 * no rows), biggest spenders first: beyond the route's cap the rest are left
 * out. The server reads each through the shared 24h Meta cache.
 */
export function useDailyInsights(accountIds: string[], dateRange: DateRangeInput) {
  const dateKey = dateRangeCacheKey(dateRange);
  const ids = accountIds.slice(0, DAILY_INSIGHTS_MAX_ACCOUNTS).sort().join(",");

  return useQuery({
    queryKey: ["insights-daily", dateKey, ids],
    queryFn: () => {
      const params = new URLSearchParams({ accountIds: ids });
      if (dateRange.preset) params.set("preset", dateRange.preset);
      else if (dateRange.since && dateRange.until) {
        params.set("since", dateRange.since);
        params.set("until", dateRange.until);
      }
      return fetchApi<DailyInsightsResponse>(`/api/insights/daily?${params.toString()}`);
    },
    enabled: ids.length > 0,
    staleTime: META_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
    // Each attempt fans out to every account: never retry a 4xx (bad input,
    // auth, or a Meta rate limit — another round would only add to it).
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status && err.status >= 400 && err.status < 500) return false;
      return failureCount < 1;
    },
    retryDelay: 3000,
  });
}

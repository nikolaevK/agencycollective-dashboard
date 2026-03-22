"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, DateRangeInput } from "@/types/api";
import type { ActivityFeedItem } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";

async function fetchActivityFeed(
  accountId: string,
  dateRange: DateRangeInput,
  apiBase: string
): Promise<ActivityFeedItem[]> {
  const params = new URLSearchParams({ accountId });
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`${apiBase}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json: ApiResponse<ActivityFeedItem[]> = await res.json();
  return json.data;
}

export function useActivityFeed(
  accountId: string | undefined,
  dateRange: DateRangeInput,
  apiBase = "/api/activities"
) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["activity-feed", accountId, dateKey, apiBase],
    queryFn: () => fetchActivityFeed(accountId!, dateRange, apiBase),
    enabled: Boolean(accountId),
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

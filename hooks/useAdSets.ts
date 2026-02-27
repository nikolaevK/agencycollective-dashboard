"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, DateRangeInput } from "@/types/api";
import type { AdSetRow } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";

async function fetchAdSets(
  campaignId: string,
  dateRange: DateRangeInput
): Promise<AdSetRow[]> {
  const params = new URLSearchParams({ campaignId });
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/adsets?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json: ApiResponse<AdSetRow[]> = await res.json();
  return json.data;
}

export function useAdSets(
  campaignId: string | undefined,
  dateRange: DateRangeInput
) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["adsets", campaignId, dateKey],
    queryFn: () => fetchAdSets(campaignId!, dateRange),
    enabled: Boolean(campaignId),
    staleTime: 4 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

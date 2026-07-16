"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { AdSetRow } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";
import { META_QUERY_STALE_MS, fetchApi } from "@/lib/queryConfig";

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

  return fetchApi<AdSetRow[]>(`/api/adsets?${params.toString()}`);
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
    staleTime: META_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { AdRow } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";
import { META_QUERY_STALE_MS, fetchApi } from "@/lib/queryConfig";

async function fetchAds(
  adSetId: string,
  dateRange: DateRangeInput
): Promise<AdRow[]> {
  const params = new URLSearchParams({ adSetId });
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  return fetchApi<AdRow[]>(`/api/ads?${params.toString()}`);
}

export function useAds(adSetId: string | undefined, dateRange: DateRangeInput) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["ads", adSetId, dateKey],
    queryFn: () => fetchAds(adSetId!, dateRange),
    enabled: Boolean(adSetId),
    staleTime: META_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

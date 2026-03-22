"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { MetaAdWithCreative } from "@/lib/meta/types";

async function fetchTopAds(dateRange: DateRangeInput, accountId?: string): Promise<MetaAdWithCreative[]> {
  const params = new URLSearchParams();
  if (dateRange.preset) {
    params.set("preset", dateRange.preset);
  } else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }
  if (accountId) {
    params.set("accountId", accountId);
  }

  const res = await fetch(`/api/user/top-ads?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as MetaAdWithCreative[];
}

export function useTopAds(dateRange: DateRangeInput, accountId?: string) {
  return useQuery({
    queryKey: ["user-top-ads", dateRange, accountId],
    queryFn: () => fetchTopAds(dateRange, accountId),
    staleTime: 5 * 60 * 1000,
  });
}

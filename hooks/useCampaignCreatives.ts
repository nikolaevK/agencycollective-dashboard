"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, DateRangeInput } from "@/types/api";
import type { CampaignCreative } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";

async function fetchCreatives(
  accountId: string,
  campaignId: string,
  dateRange: DateRangeInput
): Promise<CampaignCreative[]> {
  const params = new URLSearchParams({ accountId, campaignId });
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/ad-copy/creatives?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json: ApiResponse<CampaignCreative[]> = await res.json();
  return json.data;
}

export function useCampaignCreatives(
  accountId: string | undefined,
  campaignId: string | undefined,
  dateRange: DateRangeInput,
  enabled = true
) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["campaignCreatives", campaignId, dateKey],
    queryFn: () => fetchCreatives(accountId!, campaignId!, dateRange),
    enabled: Boolean(accountId && campaignId && enabled),
    staleTime: 4 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

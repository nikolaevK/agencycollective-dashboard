"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse, DateRangeInput } from "@/types/api";
import type { CampaignRow } from "@/types/dashboard";
import { dateRangeCacheKey } from "@/lib/utils";

async function fetchCampaigns(
  accountId: string,
  dateRange: DateRangeInput
): Promise<CampaignRow[]> {
  const params = new URLSearchParams({ accountId });
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/campaigns?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json: ApiResponse<CampaignRow[]> = await res.json();
  return json.data;
}

export function useCampaigns(
  accountId: string | undefined,
  dateRange: DateRangeInput
) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["campaigns", accountId, dateKey],
    queryFn: () => fetchCampaigns(accountId!, dateRange),
    enabled: Boolean(accountId),
    staleTime: 4 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

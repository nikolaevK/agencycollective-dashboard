"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountSummary } from "@/types/dashboard";
import type { DateRangeInput } from "@/types/api";
import { dateRangeCacheKey } from "@/lib/utils";
import { META_QUERY_STALE_MS, fetchApi } from "@/lib/queryConfig";

async function fetchAccounts(dateRange: DateRangeInput): Promise<AccountSummary[]> {
  const params = new URLSearchParams();
  if (dateRange.preset) {
    params.set("preset", dateRange.preset);
  } else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  return fetchApi<AccountSummary[]>(`/api/accounts?${params.toString()}`);
}

export function useAccounts(dateRange: DateRangeInput) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["accounts", dateKey],
    queryFn: () => fetchAccounts(dateRange),
    staleTime: META_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401 || err?.status === 403) return false;
      return failureCount < 2;
    },
    retryDelay: (_, error: unknown) => {
      const err = error as { status?: number; retryAfter?: number };
      if (err?.status === 429 && err.retryAfter) {
        return err.retryAfter * 1000;
      }
      return 3000;
    },
  });
}

export function useRefreshAccounts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["accounts"] });
}

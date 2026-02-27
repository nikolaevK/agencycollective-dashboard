"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";
import type { AccountSummary } from "@/types/dashboard";
import type { DateRangeInput } from "@/types/api";
import { dateRangeCacheKey } from "@/lib/utils";

async function fetchAccounts(dateRange: DateRangeInput): Promise<AccountSummary[]> {
  const params = new URLSearchParams();
  if (dateRange.preset) {
    params.set("preset", dateRange.preset);
  } else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/accounts?${params.toString()}`);

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const err = new Error("Rate limit exceeded") as Error & { status: number; retryAfter?: number };
    err.status = 429;
    if (retryAfter) err.retryAfter = parseInt(retryAfter, 10);
    throw err;
  }

  if (res.status === 401) {
    const err = new Error("Token expired or invalid") as Error & { status: number };
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const json: ApiResponse<AccountSummary[]> = await res.json();
  return json.data;
}

export function useAccounts(dateRange: DateRangeInput) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["accounts", dateKey],
    queryFn: () => fetchAccounts(dateRange),
    staleTime: 4 * 60 * 1000,
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

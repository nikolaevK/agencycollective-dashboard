"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { InsightMetrics } from "@/types/dashboard";

export interface AccountOverview {
  accountId: string;
  label: string | null;
  name: string;
  currency: string;
  status: string;
  metrics: InsightMetrics;
}

async function fetchAllAccountsOverview(dateRange: DateRangeInput): Promise<AccountOverview[]> {
  const params = new URLSearchParams();
  if (dateRange.preset) {
    params.set("preset", dateRange.preset);
  } else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/user/all-accounts?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as AccountOverview[];
}

export function useAllAccountsOverview(dateRange: DateRangeInput) {
  return useQuery({
    queryKey: ["user-all-accounts", dateRange],
    queryFn: () => fetchAllAccountsOverview(dateRange),
    staleTime: 5 * 60 * 1000,
  });
}

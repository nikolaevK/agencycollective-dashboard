"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse, DateRangeInput } from "@/types/api";
import type { Alert } from "@/types/alerts";
import { dateRangeCacheKey } from "@/lib/utils";

async function fetchAlerts(dateRange: DateRangeInput): Promise<Alert[]> {
  const params = new URLSearchParams();
  if (dateRange.preset) params.set("preset", dateRange.preset);
  else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/alerts?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json: ApiResponse<Alert[]> = await res.json();
  return json.data;
}

export function useAlerts(dateRange: DateRangeInput) {
  const dateKey = dateRangeCacheKey(dateRange);

  return useQuery({
    queryKey: ["alerts", dateKey],
    queryFn: () => fetchAlerts(dateRange),
    staleTime: 2 * 60 * 1000,           // 2 minutes (shorter than others)
    refetchInterval: 5 * 60 * 1000,     // Poll every 5 minutes
    refetchIntervalInBackground: false,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });
}

export function useAlertCount(dateRange: DateRangeInput): number {
  const { data } = useAlerts(dateRange);
  return data?.length ?? 0;
}

export function useCriticalAlertCount(dateRange: DateRangeInput): number {
  const { data } = useAlerts(dateRange);
  return data?.filter((a) => a.severity === "critical").length ?? 0;
}

export function useRefreshAlerts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

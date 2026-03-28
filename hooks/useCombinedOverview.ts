"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput } from "@/types/api";
import type { TimeSeriesDataPoint } from "@/types/dashboard";

interface CombinedTimeSeriesData {
  timeSeries: TimeSeriesDataPoint[];
}

async function fetchCombinedTimeSeries(dateRange: DateRangeInput): Promise<CombinedTimeSeriesData> {
  const params = new URLSearchParams();
  if (dateRange.preset) {
    params.set("preset", dateRange.preset);
  } else if (dateRange.since && dateRange.until) {
    params.set("since", dateRange.since);
    params.set("until", dateRange.until);
  }

  const res = await fetch(`/api/user/combined-overview?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as CombinedTimeSeriesData;
}

export function useCombinedOverview(dateRange: DateRangeInput, enabled = true) {
  return useQuery({
    queryKey: ["user-combined-timeseries", dateRange],
    queryFn: () => fetchCombinedTimeSeries(dateRange),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

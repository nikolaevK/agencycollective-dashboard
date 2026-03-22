"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiResponse } from "@/types/api";
import type { PixelHealth, PixelStatsPeriod } from "@/types/dashboard";

interface PixelHealthResponse {
  pixels: PixelHealth[];
  periodLabel: string;
}

async function fetchPixelHealth(
  accountId: string,
  period: PixelStatsPeriod,
  apiBase: string
): Promise<PixelHealthResponse> {
  const params = new URLSearchParams({ accountId, period });
  const res = await fetch(`${apiBase}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json: ApiResponse<PixelHealth[]> = await res.json();
  return {
    pixels: json.data,
    periodLabel: json.meta.dateRange || period,
  };
}

export function usePixelHealth(
  accountId: string | undefined,
  apiBase = "/api/pixel-health",
  period: PixelStatsPeriod = "last_7d"
) {
  const query = useQuery({
    queryKey: ["pixel-health", accountId, period, apiBase],
    queryFn: () => fetchPixelHealth(accountId!, period, apiBase),
    enabled: Boolean(accountId),
    staleTime: 8 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const err = error as { status?: number };
      if (err?.status === 401) return false;
      return failureCount < 2;
    },
  });

  return {
    ...query,
    pixels: query.data?.pixels,
    periodLabel: query.data?.periodLabel,
  };
}

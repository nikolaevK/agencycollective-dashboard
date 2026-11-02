"use client";

import { useQuery } from "@tanstack/react-query";

interface RebillAlert {
  id: string;
  slug: string;
  displayName: string;
  logoPath: string | null;
  status: "due" | "overdue";
  nextRebillAt: string | null;
  lastRebilledAt: string | null;
  daysUntilDue: number | null;
  payoutMrr: number;
}

interface ReminderAlert {
  id: string;
  userId: string;
  clientName: string;
  clientSlug: string;
  body: string;
  remindAt: string | null;
}

export interface RebillAlertsData {
  rebills: RebillAlert[];
  reminders: ReminderAlert[];
  count: number;
  overdueCount: number;
}

async function fetchAlerts(): Promise<RebillAlertsData> {
  const res = await fetch("/api/admin/clients/rebill-alerts");
  // The status lets the query client skip retries on 401/403.
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const json = await res.json();
  return json.data as RebillAlertsData;
}

/**
 * Shared hook — same query key dedupes the page badge + the panel fetch.
 * 10-minute cadence: the endpoint rebuilds the full client directory per
 * call and the schedule engine is day-granular, so minute-level polling
 * buys nothing. Every billing mutation invalidates this key explicitly,
 * so admin actions still refresh the badge immediately.
 * `live: false` (the Overview) reads once — no polling, no refetch on focus.
 */
export function useRebillAlerts({ enabled = true, live = true }: { enabled?: boolean; live?: boolean } = {}) {
  return useQuery({
    queryKey: ["admin-rebill-alerts"],
    queryFn: fetchAlerts,
    enabled,
    staleTime: 600_000,
    refetchInterval: live ? 600_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: live,
  });
}

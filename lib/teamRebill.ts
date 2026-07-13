import type { RebillStatus } from "./clientBilling";

// ---------------------------------------------------------------------------
// Pure re-bill window classification shared by the server rollup
// (lib/teamHub.ts) and the client drilldown panels
// (components/team/TeamHome.tsx), so KPI tile counts and drill lists can
// never disagree. NO db imports — safe to import from client components
// (same lifecycle as lib/metaAccountSummary.ts).
// ---------------------------------------------------------------------------

export const REBILL_WINDOW_STATUSES: readonly RebillStatus[] = [
  "upcoming",
  "due",
  "extended",
  "invoice_sent",
];

/** Sent-this-cycle rows stay in the window count but render dimmed. */
export function isRebillSentStatus(status: RebillStatus): boolean {
  return status === "invoice_sent";
}

export interface RebillFacts {
  status: RebillStatus;
  nextRebillAt: string | null;
}

export interface RebillBucket {
  overdue: boolean;
  inWindow: boolean;
  /** status === 'due' — inside the lead window, regardless of the timeframe. */
  dueToday: boolean;
  /** inWindow AND already invoiced this cycle. */
  sent: boolean;
}

/**
 * Bucket one client's computed schedule against a [start, end] ymd window.
 * Callers pass null for pepads clients (manually billed — the computed
 * schedule is excluded, mirroring the rebill-alerts exclusion); paused and
 * unscheduled rows have no live cycle and land in no bucket.
 */
export function classifyRebill(
  rebill: RebillFacts | null,
  window: { start: string; end: string }
): RebillBucket {
  if (!rebill || rebill.status === "paused" || rebill.status === "unscheduled") {
    return { overdue: false, inWindow: false, dueToday: false, sent: false };
  }
  if (rebill.status === "overdue") {
    return { overdue: true, inWindow: false, dueToday: false, sent: false };
  }
  const inWindow =
    rebill.nextRebillAt != null &&
    rebill.nextRebillAt >= window.start &&
    rebill.nextRebillAt <= window.end &&
    REBILL_WINDOW_STATUSES.includes(rebill.status);
  return {
    overdue: false,
    inWindow,
    dueToday: rebill.status === "due",
    sent: inWindow && isRebillSentStatus(rebill.status),
  };
}

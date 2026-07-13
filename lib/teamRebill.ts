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

/** No computed cycle to track: pepads (null), paused, or unscheduled. */
function hasLiveCycle(
  rebill: { status: RebillStatus } | null
): rebill is { status: RebillStatus } {
  return (
    rebill !== null &&
    rebill.status !== "paused" &&
    rebill.status !== "unscheduled"
  );
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
  if (!hasLiveCycle(rebill)) {
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

// ---------------------------------------------------------------------------
// Monthly re-bill collection progress — how much of a member's managed MRR
// has a qualifying REBILL payout recorded IN the tracker month. Derives
// entirely from the computed Client Directory schedules: `lastPaidMonth` is
// the Payout-DB reconciliation fact (same qualifying standard as the green
// Paid chip, but month-scoped — a June payment whose cycle spans into July
// does NOT count as collected for July), the statuses are the re-bill
// engine's. Pure, no db imports — shared by lib/teamHub.ts and the Team
// client components so cards and drill lists can never disagree.
// ---------------------------------------------------------------------------

export const MONTHLY_REBILL_BUCKETS = [
  "collected", // qualifying REBILL payout recorded in the tracker month
  "sent", // invoice_sent — billed this cycle, awaiting the payout
  "due", // inside the lead window, not yet billed
  "overdue", // past due, nothing landed
  "scheduled", // upcoming | extended — later in the cycle
  "untracked", // pepads / paused / unscheduled — no computed cycle
] as const;

export type MonthlyRebillBucket = (typeof MONTHLY_REBILL_BUCKETS)[number];

export interface MonthlyRebillFacts {
  status: RebillStatus;
  /** "yyyy-mm" of the latest qualifying payment (schedule.lastPaidMonth). */
  lastPaidMonth: string | null;
}

export interface MonthlyRebillProgress {
  month: string; // "yyyy-mm" business month this snapshot tracks
  buckets: Record<MonthlyRebillBucket, { count: number; mrrCents: number }>;
  /**
   * Σ amount_due of the month's REBILL-flagged payout ROWS across the ENTIRE
   * Payout DB (lib/payouts.ts getMonthRebillRevenueCents) — includes brands
   * with no directory client and manually-billed PepAds the buckets can't
   * see. Set only for whole-book oversight (book-attribution members + team
   * totals); null for partial-book members (lead/media_buyer/csm), whose
   * headline is their clients' collected-bucket sum.
   */
  rebilledRevenueCents: number | null;
}

/**
 * Bucket one client for the tracker month. Precedence: untracked (no
 * computed cycle) → collected (a qualifying payout landed in `month` — the
 * money is in, whatever the schedule status says) → the cycle statuses.
 * Every client lands in exactly ONE bucket, so bucket MRR sums exactly to
 * the member's MRR managed.
 */
export function monthlyRebillBucket(
  rebill: MonthlyRebillFacts | null,
  month: string
): MonthlyRebillBucket {
  if (!hasLiveCycle(rebill)) return "untracked";
  if (rebill.lastPaidMonth === month) return "collected";
  if (isRebillSentStatus(rebill.status)) return "sent";
  if (rebill.status === "overdue") return "overdue";
  if (rebill.status === "due") return "due";
  return "scheduled"; // upcoming | extended
}

export function buildMonthlyRebillProgress(
  clients: Array<{ rebill: MonthlyRebillFacts | null; mrrCents: number }>,
  month: string,
  rebilledRevenueCents: number | null = null
): MonthlyRebillProgress {
  const buckets = Object.fromEntries(
    MONTHLY_REBILL_BUCKETS.map((b) => [b, { count: 0, mrrCents: 0 }])
  ) as MonthlyRebillProgress["buckets"];
  for (const c of clients) {
    const bucket = buckets[monthlyRebillBucket(c.rebill, month)];
    bucket.count += 1;
    bucket.mrrCents += c.mrrCents;
  }
  return { month, buckets, rebilledRevenueCents };
}

/**
 * The ONE resolution of a tracker's headline number: the whole-book Payout-DB
 * aggregate when present, else the collected-bucket MRR sum. Every surface
 * (member card bar, KPI tile, drill rows, Clients-tab tile) must go through
 * this so they can never disagree.
 */
export function monthlyHeadline(monthly: MonthlyRebillProgress): {
  cents: number;
  wholeBook: boolean;
} {
  return monthly.rebilledRevenueCents != null
    ? { cents: monthly.rebilledRevenueCents, wholeBook: true }
    : { cents: monthly.buckets.collected.mrrCents, wholeBook: false };
}

// ---------------------------------------------------------------------------
// Retention — clients re-billed this month out of TOTAL clients managed:
// retained = the collected bucket's count, base = every attributed client
// (all buckets, incl. untracked — "total clients managed" is literal). Fills
// toward 100% as the month's payouts land. Derived entirely from the bucket
// rollup, so it can never disagree with the tracker bar.
// ---------------------------------------------------------------------------

export interface MonthlyRetention {
  month: string; // the tracker month ("yyyy-mm")
  base: number; // total clients managed
  retained: number; // clients with a qualifying re-bill payout this month
}

export function monthlyRetentionOf(
  monthly: MonthlyRebillProgress
): MonthlyRetention {
  const base = MONTHLY_REBILL_BUCKETS.reduce(
    (s, b) => s + monthly.buckets[b].count,
    0
  );
  return {
    month: monthly.month,
    base,
    retained: monthly.buckets.collected.count,
  };
}

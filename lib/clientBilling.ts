import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RebillStatus =
  | "upcoming" // next bill is further out than the lead window
  | "due" // within the lead window
  | "overdue" // past due, no payout recorded
  | "invoice_sent" // re-bill invoice sent for the current cycle, awaiting payment
  | "paused" // exception: billing paused
  | "extended" // extension active; deferred bill not yet within the lead window
  | "unscheduled"; // no anchor date — can't schedule yet

export interface ClientBilling {
  userId: string;
  cadence: string; // 'monthly'
  billingDay: number | null; // 1-31; null = derive day-of-month from anchor
  paused: boolean;
  pauseReason: string | null;
  extendUntil: string | null; // ISO date (yyyy-mm-dd)
  lastRebilledOverride: string | null; // ISO date — hybrid manual override
  mrrMonthOverride: string | null; // "yyyy-mm" — pin recurring MRR to this payout month (null = latest)
  leadDays: number;
  settingsNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RebillSchedule {
  anchorDate: string | null; // resolved client start date (yyyy-mm-dd)
  billingDay: number | null;
  lastRebilledAt: string | null; // max(latest payout month, manual override)
  nextRebillAt: string | null; // yyyy-mm-dd
  status: RebillStatus;
  paused: boolean;
  extendUntil: string | null;
  daysUntilDue: number | null; // negative = overdue
}

// ---------------------------------------------------------------------------
// Date helpers (UTC, day-granular — avoids timezone drift on yyyy-mm-dd)
// ---------------------------------------------------------------------------

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Accept 'yyyy-mm-dd' or full ISO; take the date part only.
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : toUtcMidnight(d);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Billing date for a given year/month, clamping the day to the month length. */
function billingDateFor(year: number, monthIndex0: number, day: number): Date {
  const clamped = Math.min(day, daysInMonth(year, monthIndex0));
  return new Date(Date.UTC(year, monthIndex0, clamped));
}

/** First billing-day occurrence strictly after `date`. */
function nextCycleAfter(date: Date, day: number): Date {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth();
  let candidate = billingDateFor(y, m, day);
  while (candidate.getTime() <= date.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    candidate = billingDateFor(y, m, day);
  }
  return candidate;
}

/** First billing-day occurrence on or after `date`. */
function cycleOnOrAfter(date: Date, day: number): Date {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth();
  let candidate = billingDateFor(y, m, day);
  while (candidate.getTime() < date.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    candidate = billingDateFor(y, m, day);
  }
  return candidate;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// The re-bill schedule engine (pure)
// ---------------------------------------------------------------------------

const DEFAULT_LEAD_DAYS = 5;

/**
 * Compute a client's re-bill schedule. Hybrid model:
 *   lastRebilledAt = max(latest payout month's billing date, manual override)
 *   nextRebillAt   = one cadence after lastRebilledAt, else first cycle from anchor
 * Exceptions (paused) and extensions (extend_until) adjust status/next.
 *
 * Pure — no DB. `payoutMonths` are the (year, month) pairs that have a payout
 * row for this client (derived from the Payout DB). `today` is injectable for
 * determinism.
 */
export function computeRebillSchedule(params: {
  anchorDate: string | null;
  billing: ClientBilling | null;
  payoutMonths: Array<{ year: number; month: number }>;
  today?: Date;
  /**
   * The client's currently-active sent re-bill invoice, if any. When present
   * AND its `cycleAnchor` matches the computed `nextRebillAt`, the resulting
   * status is promoted to `invoice_sent` instead of `due`/`overdue` — we've
   * already billed for this cycle and are awaiting payment in the Payout DB.
   * An invoice for a different (past) cycle is ignored here — the schedule has
   * moved on (the auto-paid promotion lives in clientRebillInvoices).
   */
  activeSentInvoice?: { cycleAnchor: string } | null;
}): RebillSchedule {
  const { anchorDate, billing, payoutMonths, activeSentInvoice } = params;
  const today = toUtcMidnight(params.today ?? new Date());

  const paused = billing?.paused ?? false;
  const leadDays = billing?.leadDays ?? DEFAULT_LEAD_DAYS;
  const extendUntil = billing?.extendUntil ?? null;
  const override = billing?.lastRebilledOverride ?? null;

  const anchor = parseDate(anchorDate);

  // Day-of-month: explicit override, else derived from the anchor, else null.
  const billingDay =
    billing?.billingDay ?? (anchor ? anchor.getUTCDate() : null);

  // No anchor and no billing day → can't schedule.
  if (!anchor && billingDay == null) {
    return {
      anchorDate,
      billingDay: null,
      lastRebilledAt: override,
      nextRebillAt: null,
      status: paused ? "paused" : "unscheduled",
      paused,
      extendUntil,
      daysUntilDue: null,
    };
  }

  const day = billingDay ?? anchor!.getUTCDate();

  // Last re-bill from the Payout DB: the billing date of the most recent month
  // that has a payout row.
  let payoutLast: Date | null = null;
  if (payoutMonths.length > 0) {
    const latest = [...payoutMonths].sort(
      (a, b) => a.year - b.year || a.month - b.month
    )[payoutMonths.length - 1];
    payoutLast = billingDateFor(latest.year, latest.month - 1, day);
  }

  // Manual override is authoritative when set — the field is labelled
  // "Overrides the date derived from payouts", so an admin who sets it expects
  // the schedule to follow it (even to a date earlier than the latest payout).
  // With no override we fall back to the payout-derived last re-bill.
  const overrideDate = parseDate(override);
  const lastRebilled: Date | null = overrideDate ?? payoutLast;

  // Next re-bill: one cadence after the last recorded re-bill. With NO payment
  // history (no payout rows, no override) we can't claim the client is overdue
  // against a possibly long-past join date, so we schedule the next UPCOMING
  // cycle from today (or the anchor if it's still in the future) instead.
  let next: Date | null;
  if (lastRebilled) {
    next = nextCycleAfter(lastRebilled, day);
  } else if (anchor) {
    const base = anchor.getTime() > today.getTime() ? anchor : today;
    next = cycleOnOrAfter(base, day);
  } else {
    next = null;
  }

  // Extension defers the next bill out to extend_until (only if it pushes later).
  const extend = parseDate(extendUntil);
  if (next && extend && extend > next) {
    next = extend;
  }

  // Status precedence.
  let status: RebillStatus;
  let daysUntilDue: number | null = null;
  if (paused) {
    status = "paused";
  } else if (!next) {
    status = "unscheduled";
  } else {
    daysUntilDue = diffDays(next, today);
    if (daysUntilDue < 0) {
      status = "overdue";
    } else if (daysUntilDue <= leadDays) {
      // Within the lead window the bill is imminent and SHOULD alert — even for
      // an extended client. An extension defers the bill date; it does not mute
      // the reminder once the (deferred) date is close.
      status = "due";
    } else if (extend && today < extend) {
      // Extension active and the deferred bill is still further out than the
      // lead window — suppress the alert until it comes within lead_days, at
      // which point it falls through to "due" above.
      status = "extended";
    } else {
      status = "upcoming";
    }

    // An invoice for THIS cycle (anchor matches the resolved nextRebillAt)
    // suppresses the due/overdue alert in favour of `invoice_sent` — we've
    // billed and are waiting for the payment to land in the Payout DB. An
    // invoice for an earlier cycle is stale (a payout has already advanced
    // the schedule) and is ignored. `paused`/`extended` keep precedence —
    // those are intentional exceptions to billing altogether.
    if (
      activeSentInvoice &&
      next &&
      activeSentInvoice.cycleAnchor === toIsoDate(next) &&
      (status === "due" || status === "overdue" || status === "upcoming")
    ) {
      status = "invoice_sent";
    }
  }

  return {
    anchorDate: anchor ? toIsoDate(anchor) : anchorDate,
    billingDay: day,
    lastRebilledAt: lastRebilled ? toIsoDate(lastRebilled) : null,
    nextRebillAt: next ? toIsoDate(next) : null,
    status,
    paused,
    extendUntil,
    daysUntilDue,
  };
}

/**
 * Statuses that should raise an in-app re-bill alert. `invoice_sent` is
 * intentionally NOT an alert — the client has already been billed for this
 * cycle and is showcased in the parallel "Sent invoices" panel instead.
 */
export function isRebillAlertStatus(status: RebillStatus): boolean {
  return status === "due" || status === "overdue";
}

/** True when this client is awaiting payment on a sent re-bill invoice. */
export function isRebillSentStatus(status: RebillStatus): boolean {
  return status === "invoice_sent";
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

function rowToBilling(row: Row): ClientBilling {
  return {
    userId: String(row.user_id),
    cadence: String(row.cadence || "monthly"),
    billingDay: row.billing_day != null ? Number(row.billing_day) : null,
    paused: Number(row.paused ?? 0) === 1,
    pauseReason: row.pause_reason != null ? String(row.pause_reason) : null,
    extendUntil: row.extend_until != null ? String(row.extend_until) : null,
    lastRebilledOverride:
      row.last_rebilled_override != null
        ? String(row.last_rebilled_override)
        : null,
    mrrMonthOverride:
      row.mrr_month_override != null ? String(row.mrr_month_override) : null,
    leadDays: Number(row.lead_days ?? DEFAULT_LEAD_DAYS),
    settingsNotes: row.settings_notes != null ? String(row.settings_notes) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function getClientBilling(
  userId: string
): Promise<ClientBilling | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM client_billing WHERE user_id = ?",
    args: [userId],
  });
  return result.rows[0] ? rowToBilling(result.rows[0]) : null;
}

export async function getAllClientBilling(): Promise<Map<string, ClientBilling>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM client_billing");
  const map = new Map<string, ClientBilling>();
  for (const row of result.rows) {
    const b = rowToBilling(row);
    map.set(b.userId, b);
  }
  return map;
}

export interface ClientBillingInput {
  cadence?: string;
  billingDay?: number | null;
  paused?: boolean;
  pauseReason?: string | null;
  extendUntil?: string | null;
  lastRebilledOverride?: string | null;
  mrrMonthOverride?: string | null;
  leadDays?: number;
  settingsNotes?: string | null;
}

/**
 * Upsert a client's billing config. Creates the row on first edit (absence =
 * defaults), otherwise patches the provided fields. Idempotent.
 */
export async function upsertClientBilling(
  userId: string,
  changes: ClientBillingInput
): Promise<void> {
  await ensureMigrated();
  const db = getDb();

  // Ensure a row exists, then patch. Two small statements keep the column list
  // explicit and avoid a giant INSERT … ON CONFLICT clause.
  await db.execute({
    sql: `INSERT INTO client_billing (user_id) VALUES (?)
          ON CONFLICT(user_id) DO NOTHING`,
    args: [userId],
  });

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (col: string, val: string | number | null) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };

  if (changes.cadence !== undefined) set("cadence", changes.cadence);
  if (changes.billingDay !== undefined) set("billing_day", changes.billingDay);
  if (changes.paused !== undefined) set("paused", changes.paused ? 1 : 0);
  if (changes.pauseReason !== undefined) set("pause_reason", changes.pauseReason);
  if (changes.extendUntil !== undefined) set("extend_until", changes.extendUntil);
  if (changes.lastRebilledOverride !== undefined)
    set("last_rebilled_override", changes.lastRebilledOverride);
  if (changes.mrrMonthOverride !== undefined)
    set("mrr_month_override", changes.mrrMonthOverride);
  if (changes.leadDays !== undefined) set("lead_days", changes.leadDays);
  if (changes.settingsNotes !== undefined)
    set("settings_notes", changes.settingsNotes);

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(userId);

  await db.execute({
    sql: `UPDATE client_billing SET ${fields.join(", ")} WHERE user_id = ?`,
    args,
  });
}

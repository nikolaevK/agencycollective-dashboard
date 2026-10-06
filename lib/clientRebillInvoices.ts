import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import {
  manualFieldsFromRow,
  EMPTY_MANUAL_FIELDS,
  getConsumedPayoutMonthsByKey,
  type InvoiceManualFields,
} from "./invoiceManualOverride";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a re-bill invoice between "sent from Billing tab" and the
 * payment being recognised in the Payout DB.
 *
 *   sent       — invoice was emailed; awaiting payment
 *   paid       — a payout for the cycle anchor's month-or-later has landed
 *                since send (auto-promoted at read time, see reconcile…)
 *   unpaid     — admin explicitly marked the period as gone unpaid. Historical
 *                only — DOES NOT advance the re-bill schedule (the cycle still
 *                shows overdue until a payout lands or the admin pauses/extends)
 *   superseded — a fresh invoice was sent for the same client while this one
 *                was still active (mechanically replaced; carries no opinion
 *                about whether the original was paid)
 */
export type RebillInvoiceStatus = "sent" | "paid" | "unpaid" | "superseded";

export interface RebillInvoice extends InvoiceManualFields {
  id: string;
  userId: string;
  invoiceNumber: string;
  payoutDocumentId: string | null;
  /** yyyy-mm-dd — the schedule.nextRebillAt at the moment we sent */
  cycleAnchor: string;
  amountCents: number;
  recipientEmail: string | null;
  sentAt: string;
  sentByAdminId: string | null;
  status: RebillInvoiceStatus;
  paidAt: string | null;
  paidPayoutMonth: number | null;
  paidPayoutYear: number | null;
  markedUnpaidAt: string | null;
  markedUnpaidByAdminId: string | null;
  markedUnpaidReason: string | null;
  /** CC list of the original send (empty for registered/legacy rows). */
  ccEmails: string[];
  /** Agency Profile used as the invoice/email style (null = default AC). */
  styleProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Joined with the client for the dashboard's sent-invoices panel. */
export interface RebillInvoiceWithClient extends RebillInvoice {
  clientName: string;
  clientSlug: string;
  clientLogoPath: string | null;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/** Defensive parse of a stored JSON string array (cc_emails). */
export function parseCcEmails(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function rowToInvoice(row: Row): RebillInvoice {
  const status = String(row.status ?? "sent");
  return {
    id: String(row.id),
    userId: String(row.user_id),
    invoiceNumber: String(row.invoice_number ?? ""),
    payoutDocumentId:
      row.payout_document_id != null ? String(row.payout_document_id) : null,
    cycleAnchor: String(row.cycle_anchor ?? ""),
    amountCents: Number(row.amount_cents ?? 0),
    recipientEmail:
      row.recipient_email != null ? String(row.recipient_email) : null,
    sentAt: String(row.sent_at || new Date().toISOString()),
    sentByAdminId:
      row.sent_by_admin_id != null ? String(row.sent_by_admin_id) : null,
    status:
      status === "paid" || status === "unpaid" || status === "superseded"
        ? status
        : "sent",
    paidAt: row.paid_at != null ? String(row.paid_at) : null,
    paidPayoutMonth:
      row.paid_payout_month != null ? Number(row.paid_payout_month) : null,
    paidPayoutYear:
      row.paid_payout_year != null ? Number(row.paid_payout_year) : null,
    markedUnpaidAt:
      row.marked_unpaid_at != null ? String(row.marked_unpaid_at) : null,
    markedUnpaidByAdminId:
      row.marked_unpaid_by_admin_id != null
        ? String(row.marked_unpaid_by_admin_id)
        : null,
    markedUnpaidReason:
      row.marked_unpaid_reason != null ? String(row.marked_unpaid_reason) : null,
    ccEmails: parseCcEmails(row.cc_emails),
    styleProfileId:
      row.style_profile_id != null ? String(row.style_profile_id) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    ...manualFieldsFromRow(row),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every invoice (all statuses) for one client, newest first. */
export async function listInvoicesForUser(
  userId: string
): Promise<RebillInvoice[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM client_rebill_invoices
          WHERE user_id = ?
          ORDER BY sent_at DESC`,
    args: [userId],
  });
  return result.rows.map(rowToInvoice);
}

/**
 * Every still-sent (awaiting payment) invoice for one user, newest first.
 * A client can hold several — an earlier cycle still unpaid, a backfill for
 * another cycle, a reopened row — and each must stay visible and reconcilable.
 */
export async function getSentInvoicesForUser(
  userId: string
): Promise<RebillInvoice[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM client_rebill_invoices
          WHERE user_id = ? AND status = 'sent'
          ORDER BY sent_at DESC, created_at DESC`,
    args: [userId],
  });
  return result.rows.map(rowToInvoice);
}

/**
 * Every still-sent invoice grouped by user (newest first within each user),
 * in one query — the directory reconciles ALL of them, not just the newest
 * (mirrors getSentInvoicesByAdAccount), so an older-cycle or reopened row
 * can't get stuck `sent` behind a newer one.
 */
export async function getSentInvoicesByUser(): Promise<
  Map<string, RebillInvoice[]>
> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(`
    SELECT * FROM client_rebill_invoices
    WHERE status = 'sent'
    ORDER BY sent_at DESC, created_at DESC
  `);
  const map = new Map<string, RebillInvoice[]>();
  for (const row of result.rows) {
    const inv = rowToInvoice(row);
    const arr = map.get(inv.userId);
    if (arr) arr.push(inv);
    else map.set(inv.userId, [inv]);
  }
  return map;
}

/**
 * The sent invoice that represents a schedule's CURRENT cycle (anchor ===
 * nextRebillAt), else the newest sent one, else null. `sent` is newest-first.
 * Shared by both directory builders so "the active invoice" is chosen the
 * same way the `invoice_sent` status is decided.
 */
export function pickActiveSentInvoice<T extends { cycleAnchor: string }>(
  sent: T[],
  nextRebillAt: string | null
): T | null {
  if (sent.length === 0) return null;
  return (
    (nextRebillAt ? sent.find((i) => i.cycleAnchor === nextRebillAt) : undefined) ??
    sent[0]
  );
}

/** Find one invoice by id (used by mark-unpaid). */
export async function findRebillInvoice(
  id: string
): Promise<RebillInvoice | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM client_rebill_invoices WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToInvoice(result.rows[0]) : null;
}

/**
 * All currently-sent invoices across all clients, joined with the client's
 * display fields, newest first. Powers the dashboard's "Sent invoices" panel.
 */
export async function listActiveSentInvoices(): Promise<
  RebillInvoiceWithClient[]
> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(`
    SELECT i.*,
           u.display_name AS client_name,
           u.slug         AS client_slug,
           u.logo_path    AS client_logo_path
    FROM client_rebill_invoices i
    JOIN users u ON u.id = i.user_id
    WHERE i.status = 'sent'
    ORDER BY i.sent_at DESC
  `);
  return result.rows.map((row) => ({
    ...rowToInvoice(row),
    clientName: String(row.client_name ?? ""),
    clientSlug: String(row.client_slug ?? ""),
    clientLogoPath:
      row.client_logo_path != null ? String(row.client_logo_path) : null,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateRebillInvoiceInput {
  userId: string;
  invoiceNumber: string;
  payoutDocumentId?: string | null;
  /** yyyy-mm-dd — schedule.nextRebillAt at send time (fallback: today) */
  cycleAnchor: string;
  amountCents: number;
  recipientEmail?: string | null;
  sentByAdminId?: string | null;
  /**
   * When the invoice was actually sent. ISO timestamp; defaults to now.
   * Backfill (registering a historical send that pre-dates this feature) sets
   * this so the row groups under the correct month in the Sent Invoices panel
   * instead of "this month". `created_at`/`updated_at` stay at now — they
   * record when the tracking row itself was written.
   */
  sentAt?: string;
  /** CC list of the send — kept so a follow-up reaches the same people. */
  ccEmails?: string[];
  /** Agency Profile used as the invoice/email style (null = default AC). */
  styleProfileId?: string | null;
  /**
   * Supersede the user's still-sent invoice(s) for the SAME cycle (default
   * true — a re-send for a cycle replaces that cycle's record). Invoices for
   * OTHER cycles are never touched: superseded is terminal, so sweeping every
   * sent row used to destroy an unrelated awaiting invoice (e.g. registering
   * last month's backfill wiped this month's "Invoice sent").
   */
  supersede?: boolean;
  /**
   * Still-sent invoices (of THIS user, any cycle) the admin explicitly chose
   * to replace — e.g. a corrected re-send after the cycle date moved. Marked
   * superseded in the same atomic batch; ids of other users / non-sent rows
   * are ignored by the WHERE clause.
   */
  replaceInvoiceIds?: string[];
}

/**
 * Create a new sent invoice. Atomically supersedes any prior `sent` row for
 * the same user AND cycle (a mid-cycle re-send replaces that cycle's record);
 * still-sent invoices for other cycles keep their status. Returns the new row.
 */
export async function createRebillInvoice(
  input: CreateRebillInvoiceInput
): Promise<RebillInvoice> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const sentAt = input.sentAt ?? now;
  const amountCents = Math.max(0, Math.round(input.amountCents));
  const ccEmails = input.ccEmails ?? [];

  const insert = {
    sql: `INSERT INTO client_rebill_invoices (
            id, user_id, invoice_number, payout_document_id,
            cycle_anchor, amount_cents, recipient_email,
            sent_at, sent_by_admin_id, status,
            cc_emails, style_profile_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
    args: [
      id,
      input.userId,
      input.invoiceNumber,
      input.payoutDocumentId ?? null,
      input.cycleAnchor,
      amountCents,
      input.recipientEmail ?? null,
      sentAt,
      input.sentByAdminId ?? null,
      ccEmails.length > 0 ? JSON.stringify(ccEmails) : null,
      input.styleProfileId ?? null,
      now,
      now,
    ],
  };

  const statements = [];
  if (input.supersede !== false) {
    statements.push({
      sql: `UPDATE client_rebill_invoices
            SET status = 'superseded', reconcile_locked = 0, updated_at = ?
            WHERE user_id = ? AND status = 'sent' AND cycle_anchor = ?`,
      args: [now, input.userId, input.cycleAnchor],
    });
  }
  const replaceIds = [...new Set(input.replaceInvoiceIds ?? [])];
  if (replaceIds.length > 0) {
    statements.push({
      sql: `UPDATE client_rebill_invoices
            SET status = 'superseded', reconcile_locked = 0, updated_at = ?
            WHERE user_id = ? AND status = 'sent'
              AND id IN (${replaceIds.map(() => "?").join(", ")})`,
      args: [now, input.userId, ...replaceIds],
    });
  }
  if (statements.length > 0) {
    await db.batch([...statements, insert], "write");
  } else {
    await db.execute(insert);
  }

  return {
    id,
    userId: input.userId,
    invoiceNumber: input.invoiceNumber,
    payoutDocumentId: input.payoutDocumentId ?? null,
    cycleAnchor: input.cycleAnchor,
    amountCents,
    recipientEmail: input.recipientEmail ?? null,
    sentAt,
    sentByAdminId: input.sentByAdminId ?? null,
    status: "sent",
    paidAt: null,
    paidPayoutMonth: null,
    paidPayoutYear: null,
    markedUnpaidAt: null,
    markedUnpaidByAdminId: null,
    markedUnpaidReason: null,
    ccEmails,
    styleProfileId: input.styleProfileId ?? null,
    createdAt: now,
    updatedAt: now,
    ...EMPTY_MANUAL_FIELDS,
  };
}

/**
 * Admin manually marks the period as unpaid. Historical only — schedule
 * unaffected. Returns true when the row was actually transitioned; false when
 * the WHERE-clause guard rejected the update (status changed between the
 * route's pre-flight check and this write — race with auto-promotion-to-paid
 * or a concurrent supersede). Callers should surface a 409 on false so the UI
 * can refetch the now-stale local state.
 */
export async function markInvoiceUnpaid(
  id: string,
  adminId: string,
  reason: string | null
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE client_rebill_invoices
          SET status = 'unpaid',
              marked_unpaid_at = ?,
              marked_unpaid_by_admin_id = ?,
              marked_unpaid_reason = ?,
              updated_at = ?
          WHERE id = ? AND status = 'sent'`,
    args: [now, adminId, reason ? reason.slice(0, 500) : null, now, id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Auto-promote a sent invoice to paid — called by the reconciliation pass.
 * Returns whether the guarded UPDATE actually transitioned the row (false when
 * it was locked/superseded/settled concurrently).
 */
async function markInvoicePaid(
  id: string,
  payoutMonth: number,
  payoutYear: number
): Promise<boolean> {
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE client_rebill_invoices
          SET status = 'paid',
              paid_at = ?,
              paid_payout_month = ?,
              paid_payout_year = ?,
              paid_source = 'auto',
              updated_at = ?
          WHERE id = ? AND status = 'sent' AND reconcile_locked = 0`,
    args: [now, payoutMonth, payoutYear, now, id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Reconciliation (sent → paid)
// ---------------------------------------------------------------------------

/**
 * Pure decision: given a sent invoice's cycle anchor and the client's payout
 * (year, month) pairs, return the payout that should auto-promote it to paid,
 * or null. A payout counts when its month is at or after the cycle anchor's
 * month — same direction the schedule's `lastRebilledAt` already follows.
 *
 * Pure on purpose so the schedule preview path (no DB writes) can call it too.
 */
export function decideAutoPaid(
  cycleAnchor: string,
  payoutMonths: Array<{ year: number; month: number }>
): { year: number; month: number } | null {
  if (payoutMonths.length === 0) return null;
  const m = cycleAnchor.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const anchorYear = Number(m[1]);
  const anchorMonth = Number(m[2]); // 1-12

  // Highest (year, month) we've seen — same precedence rule as the schedule.
  let latest: { year: number; month: number } | null = null;
  for (const p of payoutMonths) {
    if (!latest || p.year > latest.year || (p.year === latest.year && p.month > latest.month)) {
      latest = p;
    }
  }
  if (!latest) return null;

  const latestKey = latest.year * 12 + latest.month;
  const anchorKey = anchorYear * 12 + anchorMonth;
  return latestKey >= anchorKey ? latest : null;
}

/**
 * Reconcile one user's active sent invoice against their payouts: if a payout
 * for the cycle (or later) has landed, mark the invoice paid and return the
 * post-reconciliation row (status='paid'). Returns the original row if nothing
 * to do, or null if there's no active invoice. Best-effort — DB failures are
 * swallowed (logged) so the read path can't break on a write.
 */
export async function reconcileInvoiceForUser(
  invoice: RebillInvoice | null,
  payoutMonths: Array<{ year: number; month: number }>
): Promise<RebillInvoice | null> {
  if (!invoice || invoice.status !== "sent") return invoice;
  // An admin-set status (or a reopened row) is locked until they Resync.
  if (invoice.reconcileLocked) return invoice;
  const promote = decideAutoPaid(invoice.cycleAnchor, payoutMonths);
  if (!promote) return invoice;

  try {
    // Nothing written (row changed concurrently) → don't report it as paid.
    if (!(await markInvoicePaid(invoice.id, promote.month, promote.year)))
      return invoice;
  } catch (err) {
    console.warn("[rebill-invoice] auto-paid promotion failed:", err);
    return invoice; // caller still sees the sent invoice — next pass retries
  }
  return {
    ...invoice,
    status: "paid",
    paidAt: new Date().toISOString(),
    paidPayoutMonth: promote.month,
    paidPayoutYear: promote.year,
    paidSource: "auto",
  };
}

/** Most cycles one month's REBILL total can count for (a year of catch-up). */
const MAX_UNITS_PER_MONTH = 12;

/**
 * Pure: a brand's REBILL months (summed amount_due + payout row count) → one
 * entry per recurring-size payment — the pool reconciliation allocates from,
 * and the schedule's confirmed-paid months.
 *
 * The recurring amount is the latest month's total — unless that month is a
 * catch-up: an exact k× (k ≥ 2) multiple of the month before, made of at least
 * k payout rows (k separate payments; one row at a doubled amount reads as a
 * price change). A month whose total is an exact k× multiple of the recurring
 * amount yields k entries, so a client paying September AND October in
 * October settles both invoices — one summed entry per month used to settle
 * only one, leaving September awaiting payment for good. Any other amount (a
 * partial or one-off payment) qualifies nothing.
 */
export function rebillPaymentUnits(
  months: Array<{ year: number; month: number; amountDue: number; rows?: number }>
): Array<{ year: number; month: number }> {
  if (months.length === 0) return [];
  const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
  const multipleOf = (amount: number, base: number): number => {
    const k = Math.round(amount / base);
    return k >= 1 && amount === k * base ? k : 0;
  };

  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  let baseline = latest.amountDue;
  if (prev && prev.amountDue > 0) {
    const k = multipleOf(latest.amountDue, prev.amountDue);
    if (k >= 2 && (latest.rows ?? 1) >= k) baseline = prev.amountDue;
  }

  const out: Array<{ year: number; month: number }> = [];
  for (const m of sorted) {
    const units =
      baseline > 0
        ? Math.min(multipleOf(m.amountDue, baseline), MAX_UNITS_PER_MONTH)
        : m.amountDue === baseline
        ? 1
        : 0;
    for (let i = 0; i < units; i++) out.push({ year: m.year, month: m.month });
  }
  return out;
}

/**
 * Pure: which qualifying payout month settles which OPEN invoice, when an
 * owner (client or ad account) has several awaiting payment at once. Each
 * payout month settles at most ONE invoice — without this, `decideAutoPaid`'s
 * "latest payout ≥ cycle" rule let a single October payment mark both a still-
 * owed September invoice and October's paid, silently dropping September from
 * the Sent panel. Exact-month matches are paired first (October's payment →
 * October's invoice); the rest go oldest cycle first to the earliest unused
 * payout month at/after their cycle. Locked rows (manual status) are skipped —
 * reconciliation never touches them, so they must not consume a payment.
 * `consumedMonths` are payout months already spent on this owner's PAID
 * invoices (getConsumedPayoutMonthsByKey) — each removes one matching pool
 * entry first, so a payment that settled October on an earlier pass can't
 * settle September on the next one. For a single open invoice with nothing
 * consumed the outcome equals `decideAutoPaid`.
 */
export function allocateAutoPaid(
  invoices: Array<{ id: string; cycleAnchor: string; reconcileLocked?: boolean }>,
  payoutMonths: Array<{ year: number; month: number }>,
  consumedMonths: Array<{ year: number; month: number }> = []
): Map<string, { year: number; month: number }> {
  const out = new Map<string, { year: number; month: number }>();
  const keyOf = (y: number, m: number) => y * 12 + m;
  const candidates = invoices
    .filter((i) => !i.reconcileLocked)
    .map((i) => {
      const m = i.cycleAnchor.match(/^(\d{4})-(\d{2})/);
      return m ? { id: i.id, key: keyOf(Number(m[1]), Number(m[2])) } : null;
    })
    .filter((c): c is { id: string; key: number } => c !== null)
    .sort((a, b) => a.key - b.key);
  const pool = payoutMonths
    .map((p) => ({ ...p, key: keyOf(p.year, p.month), used: false }))
    .sort((a, b) => a.key - b.key);
  for (const c of consumedMonths) {
    const key = keyOf(c.year, c.month);
    const spent = pool.find((p) => !p.used && p.key === key);
    if (spent) spent.used = true;
  }

  const unmatched: typeof candidates = [];
  for (const c of candidates) {
    const exact = pool.find((p) => !p.used && p.key === c.key);
    if (exact) {
      exact.used = true;
      out.set(c.id, { year: exact.year, month: exact.month });
    } else {
      unmatched.push(c);
    }
  }
  for (const c of unmatched) {
    const next = pool.find((p) => !p.used && p.key >= c.key);
    if (next) {
      next.used = true;
      out.set(c.id, { year: next.year, month: next.month });
    }
  }
  return out;
}

/**
 * Reconcile ALL of one client's open invoices together (see
 * allocateAutoPaid) — every reconciliation path (directory builds, resync)
 * goes through here so one payment can't settle two invoices. `consumedMonths`
 * = payout months the client's paid invoices already used; when omitted they
 * are read for this client (the directory passes its bulk read instead).
 */
export async function reconcileInvoicesForUser(
  invoices: RebillInvoice[],
  payoutMonths: Array<{ year: number; month: number }>,
  consumedMonths?: Array<{ year: number; month: number }>
): Promise<RebillInvoice[]> {
  const open = invoices.filter((i) => i.status === "sent");
  if (open.length === 0) return invoices;
  const consumed =
    consumedMonths ??
    (
      await getConsumedPayoutMonthsByKey("client_rebill_invoices", "user_id", open[0].userId)
    ).get(open[0].userId) ??
    [];
  const alloc = allocateAutoPaid(open, payoutMonths, consumed);
  return Promise.all(
    invoices.map(async (inv) => {
      const month = alloc.get(inv.id);
      return (await reconcileInvoiceForUser(inv, month ? [month] : [])) ?? inv;
    })
  );
}

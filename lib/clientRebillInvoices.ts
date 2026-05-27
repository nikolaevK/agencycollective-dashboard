import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

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

export interface RebillInvoice {
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
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Most recent sent (un-resolved) invoice for one user, or null. */
export async function getLatestActiveInvoice(
  userId: string
): Promise<RebillInvoice | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM client_rebill_invoices
          WHERE user_id = ? AND status = 'sent'
          ORDER BY sent_at DESC LIMIT 1`,
    args: [userId],
  });
  return result.rows[0] ? rowToInvoice(result.rows[0]) : null;
}

/**
 * Most recent sent invoice per user, for every user that has one. Used by the
 * directory aggregator so we don't do N+1 lookups.
 */
export async function getLatestActiveInvoicesByUser(): Promise<
  Map<string, RebillInvoice>
> {
  await ensureMigrated();
  const db = getDb();
  // Window function picks the freshest sent row per user_id (same shape we use
  // in setterStats for show/no-show resolution).
  const result = await db.execute(`
    SELECT * FROM (
      SELECT
        i.*,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY sent_at DESC) AS rn
      FROM client_rebill_invoices i
      WHERE status = 'sent'
    ) ranked
    WHERE rn = 1
  `);
  const map = new Map<string, RebillInvoice>();
  for (const row of result.rows) {
    const inv = rowToInvoice(row);
    map.set(inv.userId, inv);
  }
  return map;
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
}

/**
 * Create a new sent invoice, atomically superseding any prior `sent` row for
 * the same user (an admin re-sending mid-cycle replaces the old record — only
 * the latest is "the current invoice for this cycle"). Returns the new row.
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

  await db.batch(
    [
      {
        sql: `UPDATE client_rebill_invoices
              SET status = 'superseded', updated_at = ?
              WHERE user_id = ? AND status = 'sent'`,
        args: [now, input.userId],
      },
      {
        sql: `INSERT INTO client_rebill_invoices (
                id, user_id, invoice_number, payout_document_id,
                cycle_anchor, amount_cents, recipient_email,
                sent_at, sent_by_admin_id, status,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
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
          now,
          now,
        ],
      },
    ],
    "write"
  );

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
    createdAt: now,
    updatedAt: now,
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

/** Auto-promote a sent invoice to paid — called by the reconciliation pass. */
async function markInvoicePaid(
  id: string,
  payoutMonth: number,
  payoutYear: number
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE client_rebill_invoices
          SET status = 'paid',
              paid_at = ?,
              paid_payout_month = ?,
              paid_payout_year = ?,
              updated_at = ?
          WHERE id = ? AND status = 'sent'`,
    args: [now, payoutMonth, payoutYear, now, id],
  });
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
  const promote = decideAutoPaid(invoice.cycleAnchor, payoutMonths);
  if (!promote) return invoice;

  try {
    await markInvoicePaid(invoice.id, promote.month, promote.year);
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
  };
}

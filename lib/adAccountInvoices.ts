import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import { decideAutoPaid } from "./clientRebillInvoices";
import type { AdInvoiceType } from "./adAccountInvoice";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle of an ad-account invoice — same model as client re-bill invoices.
 *   sent       — emailed; awaiting payment
 *   paid       — an "Ad Account"-flagged payout for the brand landed at/after
 *                the cycle anchor (auto-promoted at read time)
 *   unpaid     — admin explicitly marked the period unpaid (historical only)
 *   superseded — a fresh invoice was sent for the same ad account while this
 *                one was still active
 */
export type AdAccountInvoiceStatus = "sent" | "paid" | "unpaid" | "superseded";

export interface AdAccountInvoice {
  id: string;
  adAccountId: string | null;
  userId: string | null;
  brand: string | null;
  invoiceNumber: string;
  invoiceType: AdInvoiceType;
  payoutDocumentId: string | null;
  cycleAnchor: string; // yyyy-mm-dd
  amountCents: number;
  spendCents: number | null;
  feeBps: number | null;
  recipientEmail: string | null;
  sentAt: string;
  sentByAdminId: string | null;
  status: AdAccountInvoiceStatus;
  paidAt: string | null;
  paidPayoutMonth: number | null;
  paidPayoutYear: number | null;
  markedUnpaidAt: string | null;
  markedUnpaidByAdminId: string | null;
  markedUnpaidReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Joined with the ad account + client for the sent-invoices panel. */
export interface AdAccountInvoiceWithContext extends AdAccountInvoice {
  accountName: string | null;
  clientName: string | null;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToInvoice(row: Row): AdAccountInvoice {
  const status = String(row.status ?? "sent");
  const type = String(row.invoice_type ?? "retainer");
  return {
    id: String(row.id),
    adAccountId: row.ad_account_id != null ? String(row.ad_account_id) : null,
    userId: row.user_id != null ? String(row.user_id) : null,
    brand: row.brand != null ? String(row.brand) : null,
    invoiceNumber: String(row.invoice_number ?? ""),
    invoiceType:
      type === "ad_spend" ? "ad_spend" : type === "combined" ? "combined" : "retainer",
    payoutDocumentId:
      row.payout_document_id != null ? String(row.payout_document_id) : null,
    cycleAnchor: String(row.cycle_anchor ?? ""),
    amountCents: Number(row.amount_cents ?? 0),
    spendCents: row.spend_cents != null ? Number(row.spend_cents) : null,
    feeBps: row.fee_bps != null ? Number(row.fee_bps) : null,
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

/**
 * All sent invoices per ad account (one query, no N+1), newest first within
 * each account. The directory reconciles EVERY sent row — not just the latest —
 * so a backdated/registered invoice (created with supersede:false) can't get
 * stuck `sent` when a matching payout lands later.
 */
export async function getSentInvoicesByAdAccount(): Promise<
  Map<string, AdAccountInvoice[]>
> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(`
    SELECT * FROM ad_account_invoices
    WHERE status = 'sent' AND ad_account_id IS NOT NULL
    ORDER BY sent_at DESC
  `);
  const map = new Map<string, AdAccountInvoice[]>();
  for (const row of result.rows) {
    const inv = rowToInvoice(row);
    if (!inv.adAccountId) continue;
    const arr = map.get(inv.adAccountId);
    if (arr) arr.push(inv);
    else map.set(inv.adAccountId, [inv]);
  }
  return map;
}

/** Every invoice (all statuses) for one ad account, newest first. */
export async function listInvoicesForAdAccount(
  adAccountId: string
): Promise<AdAccountInvoice[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM ad_account_invoices
          WHERE ad_account_id = ?
          ORDER BY sent_at DESC`,
    args: [adAccountId],
  });
  return result.rows.map(rowToInvoice);
}

/** Find one invoice by id (used by mark-unpaid). */
export async function findAdAccountInvoice(
  id: string
): Promise<AdAccountInvoice | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM ad_account_invoices WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToInvoice(result.rows[0]) : null;
}

/** All currently-sent ad-account invoices, joined with account + client. */
export async function listActiveSentInvoices(): Promise<
  AdAccountInvoiceWithContext[]
> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(`
    SELECT i.*,
           a.account_name AS account_name,
           u.display_name AS client_name
    FROM ad_account_invoices i
    LEFT JOIN ad_accounts a ON a.id = i.ad_account_id
    LEFT JOIN users u ON u.id = i.user_id
    WHERE i.status = 'sent'
    ORDER BY i.sent_at DESC
  `);
  return result.rows.map((row) => ({
    ...rowToInvoice(row),
    accountName: row.account_name != null ? String(row.account_name) : null,
    clientName: row.client_name != null ? String(row.client_name) : null,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateAdAccountInvoiceInput {
  adAccountId?: string | null;
  userId?: string | null;
  brand?: string | null;
  invoiceNumber: string;
  invoiceType: AdInvoiceType;
  payoutDocumentId?: string | null;
  cycleAnchor: string;
  amountCents: number;
  spendCents?: number | null;
  feeBps?: number | null;
  recipientEmail?: string | null;
  sentByAdminId?: string | null;
  sentAt?: string;
  /**
   * Whether to supersede the account's prior active `sent` invoice (default
   * true — a fresh send replaces the current one). Backfilling a historical /
   * backdated invoice passes false so it's recorded alongside the current one
   * rather than demoting it.
   */
  supersede?: boolean;
}

/**
 * Create a sent ad-account invoice. When tied to an ad account, atomically
 * supersedes any prior `sent` row for the SAME account (a re-send mid-cycle
 * replaces the record) — unless `supersede: false` (backdated backfill).
 * Free invoices (no ad_account_id) are standalone and never supersede. Returns
 * the new row.
 */
export async function createAdAccountInvoice(
  input: CreateAdAccountInvoiceInput
): Promise<AdAccountInvoice> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const sentAt = input.sentAt ?? now;
  const amountCents = Math.max(0, Math.round(input.amountCents));

  const insert = {
    sql: `INSERT INTO ad_account_invoices (
            id, ad_account_id, user_id, brand, invoice_number, invoice_type,
            payout_document_id, cycle_anchor, amount_cents, spend_cents, fee_bps,
            recipient_email, sent_at, sent_by_admin_id, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
    args: [
      id,
      input.adAccountId ?? null,
      input.userId ?? null,
      input.brand ?? null,
      input.invoiceNumber,
      input.invoiceType,
      input.payoutDocumentId ?? null,
      input.cycleAnchor,
      amountCents,
      input.spendCents != null ? Math.max(0, Math.round(input.spendCents)) : null,
      input.feeBps != null ? Math.round(input.feeBps) : null,
      input.recipientEmail ?? null,
      sentAt,
      input.sentByAdminId ?? null,
      now,
      now,
    ],
  };

  if (input.adAccountId && input.supersede !== false) {
    await db.batch(
      [
        {
          sql: `UPDATE ad_account_invoices
                SET status = 'superseded', updated_at = ?
                WHERE ad_account_id = ? AND status = 'sent'`,
          args: [now, input.adAccountId],
        },
        insert,
      ],
      "write"
    );
  } else {
    await db.execute(insert);
  }

  return {
    id,
    adAccountId: input.adAccountId ?? null,
    userId: input.userId ?? null,
    brand: input.brand ?? null,
    invoiceNumber: input.invoiceNumber,
    invoiceType: input.invoiceType,
    payoutDocumentId: input.payoutDocumentId ?? null,
    cycleAnchor: input.cycleAnchor,
    amountCents,
    spendCents: input.spendCents != null ? Math.max(0, Math.round(input.spendCents)) : null,
    feeBps: input.feeBps != null ? Math.round(input.feeBps) : null,
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

/** Admin manually marks the period unpaid. Historical only. */
export async function markInvoiceUnpaid(
  id: string,
  adminId: string,
  reason: string | null
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE ad_account_invoices
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
    sql: `UPDATE ad_account_invoices
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
 * Reconcile one ad account's active sent invoice against the brand's
 * "Ad Account"-flagged payout months: if such a payout for the cycle (or later)
 * has landed, mark the invoice paid and return the updated row. Reuses the pure
 * `decideAutoPaid` rule shared with client re-bill invoices. Best-effort — DB
 * write failures are swallowed so the read path can't break. Free invoices
 * (no brand match available) never auto-reconcile.
 */
export async function reconcileInvoiceForAdAccount(
  invoice: AdAccountInvoice | null,
  payoutMonths: Array<{ year: number; month: number }>
): Promise<AdAccountInvoice | null> {
  if (!invoice || invoice.status !== "sent") return invoice;
  const promote = decideAutoPaid(invoice.cycleAnchor, payoutMonths);
  if (!promote) return invoice;

  try {
    await markInvoicePaid(invoice.id, promote.month, promote.year);
  } catch (err) {
    console.warn("[ad-account-invoice] auto-paid promotion failed:", err);
    return invoice;
  }
  return {
    ...invoice,
    status: "paid",
    paidAt: new Date().toISOString(),
    paidPayoutMonth: promote.month,
    paidPayoutYear: promote.year,
  };
}

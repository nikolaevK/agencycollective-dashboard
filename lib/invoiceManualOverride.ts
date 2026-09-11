import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Manual overrides shared by client re-bill invoices AND ad-account invoices.
//
// Both tables carry the same override columns (self-healed in
// ensureCriticalColumns):
//   paid_source       'auto' | 'manual' | 'payout' — how `paid` was decided
//   paid_payout_id    explicit payouts.id relationship (nullable)
//   paid_by_admin_id  who set it (manual paths only)
//   manual_note       free-text reason shown in the history list
//   reconcile_locked  1 = an admin set the status by hand; the read-time
//                     payout reconciliation must NOT touch the row until the
//                     admin runs "Resync" (which clears the lock + resets to
//                     `sent` so the automation re-evaluates from scratch).
//
// The automation only ever transitions `sent → paid`. Everything else —
// paid → unpaid, unpaid → sent (reopen), sent → paid without a payout row,
// linking a specific payout, re-anchoring the cycle — is the admin's call and
// lives here. Additive: existing rows (NULL source, lock 0) behave exactly as
// before.
// ---------------------------------------------------------------------------

/** Tables this module may write. Whitelisted — the name is interpolated. */
export type InvoiceTable = "client_rebill_invoices" | "ad_account_invoices";

export type PaidSource = "auto" | "manual" | "payout";

/** Manual-override fields present on both invoice shapes. */
export interface InvoiceManualFields {
  paidSource: PaidSource | null;
  paidPayoutId: string | null;
  paidByAdminId: string | null;
  manualNote: string | null;
  reconcileLocked: boolean;
}

export function manualFieldsFromRow(row: Row): InvoiceManualFields {
  const src = row.paid_source != null ? String(row.paid_source) : null;
  return {
    paidSource:
      src === "auto" || src === "manual" || src === "payout" ? src : null,
    paidPayoutId: row.paid_payout_id != null ? String(row.paid_payout_id) : null,
    paidByAdminId:
      row.paid_by_admin_id != null ? String(row.paid_by_admin_id) : null,
    manualNote: row.manual_note != null ? String(row.manual_note) : null,
    reconcileLocked: Number(row.reconcile_locked ?? 0) === 1,
  };
}

export const EMPTY_MANUAL_FIELDS: InvoiceManualFields = {
  paidSource: null,
  paidPayoutId: null,
  paidByAdminId: null,
  manualNote: null,
  reconcileLocked: false,
};

/** Statuses an admin may set by hand (superseded is mechanical only). */
export type ManualInvoiceStatus = "sent" | "paid" | "unpaid";

export interface ManualInvoiceUpdate {
  adminId: string;
  /** New lifecycle status. Omit to leave the status alone. */
  status?: ManualInvoiceStatus;
  /** Re-anchor the invoice to a different billing cycle (yyyy-mm-dd). */
  cycleAnchor?: string;
  /**
   * Explicit payout relationship. Only meaningful with `status: "paid"` (or
   * an already-paid row): `{ id, month, year }` links the row to that payout
   * (source 'payout'); `null` clears any link (source 'manual').
   */
  paidPayout?: { id: string; month: number; year: number } | null;
  /** Free-text reason; null clears. */
  note?: string | null;
  /**
   * Hand the row back to the automation: clears the lock and every manual
   * marker, resets the status to `sent`. Caller should run the normal
   * reconciliation afterwards so a matching payout re-promotes it at once.
   * Mutually exclusive with `status` / `paidPayout`.
   */
  resync?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pre-flight an override against the row's CURRENT status. Returns an error
 * message (→ 409) or null. `superseded` is terminal — it was mechanically
 * replaced by a newer invoice, so resurrecting it as `sent` would put two
 * active invoices on one cycle; a payout link only makes sense on a paid row.
 */
export function manualUpdateConflict(
  currentStatus: "sent" | "paid" | "unpaid" | "superseded",
  update: Pick<ManualInvoiceUpdate, "status" | "resync" | "paidPayout">
): string | null {
  if (currentStatus === "superseded" && (update.status !== undefined || update.resync))
    return "Invoice is superseded by a newer one — it can no longer change status";
  if (
    update.paidPayout !== undefined &&
    update.status === undefined &&
    currentStatus !== "paid"
  )
    return `Cannot link a payout — invoice is ${currentStatus}, not paid`;
  return null;
}

/**
 * Apply an admin override to one invoice row. Every manual status set (and a
 * payout link) locks the row against auto-reconciliation; `resync` unlocks
 * it. Returns false when no row matched the id.
 */
export async function applyManualInvoiceUpdate(
  table: InvoiceTable,
  id: string,
  update: ManualInvoiceUpdate
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (col: string, val: string | number | null) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };

  if (update.cycleAnchor !== undefined) {
    if (!DATE_RE.test(update.cycleAnchor))
      throw new Error("cycleAnchor must be yyyy-mm-dd");
    set("cycle_anchor", update.cycleAnchor);
  }

  if (update.resync) {
    set("status", "sent");
    set("reconcile_locked", 0);
    set("paid_source", null);
    set("paid_payout_id", null);
    set("paid_by_admin_id", null);
    set("paid_at", null);
    set("paid_payout_month", null);
    set("paid_payout_year", null);
    set("marked_unpaid_at", null);
    set("marked_unpaid_by_admin_id", null);
    set("marked_unpaid_reason", null);
    // Manual markers are cleared on resync — the note included, unless the
    // caller passes a fresh one.
    set("manual_note", update.note !== undefined ? update.note : null);
  } else {
    if (update.note !== undefined) set("manual_note", update.note);

    if (update.status === "paid") {
      set("status", "paid");
      set("reconcile_locked", 1);
      set("paid_at", now);
      set("paid_by_admin_id", update.adminId);
      set("marked_unpaid_at", null);
      set("marked_unpaid_by_admin_id", null);
      set("marked_unpaid_reason", null);
      if (update.paidPayout) {
        set("paid_source", "payout");
        set("paid_payout_id", update.paidPayout.id);
        set("paid_payout_month", update.paidPayout.month);
        set("paid_payout_year", update.paidPayout.year);
      } else {
        set("paid_source", "manual");
        set("paid_payout_id", null);
        set("paid_payout_month", null);
        set("paid_payout_year", null);
      }
    } else if (update.status === "unpaid") {
      set("status", "unpaid");
      set("reconcile_locked", 1);
      set("marked_unpaid_at", now);
      set("marked_unpaid_by_admin_id", update.adminId);
      set("marked_unpaid_reason", update.note ?? null);
      set("paid_source", null);
      set("paid_payout_id", null);
      set("paid_by_admin_id", null);
      set("paid_at", null);
      set("paid_payout_month", null);
      set("paid_payout_year", null);
    } else if (update.status === "sent") {
      // Reopen — awaiting payment again, but LOCKED so a stale payout doesn't
      // immediately re-promote it (the admin just said it's not settled).
      set("status", "sent");
      set("reconcile_locked", 1);
      set("paid_source", null);
      set("paid_payout_id", null);
      set("paid_by_admin_id", null);
      set("paid_at", null);
      set("paid_payout_month", null);
      set("paid_payout_year", null);
      set("marked_unpaid_at", null);
      set("marked_unpaid_by_admin_id", null);
      set("marked_unpaid_reason", null);
    } else if (update.paidPayout !== undefined) {
      // Link/unlink on an already-paid row without changing status.
      set("reconcile_locked", 1);
      if (update.paidPayout) {
        set("paid_source", "payout");
        set("paid_payout_id", update.paidPayout.id);
        set("paid_payout_month", update.paidPayout.month);
        set("paid_payout_year", update.paidPayout.year);
      } else {
        set("paid_source", "manual");
        set("paid_payout_id", null);
        set("paid_payout_month", null);
        set("paid_payout_year", null);
      }
    }
  }

  if (fields.length === 0) return true;
  fields.push("updated_at = ?");
  args.push(now);
  args.push(id);

  const result = await db.execute({
    sql: `UPDATE ${table} SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Cycle months (year, month of `cycle_anchor`) of every PAID invoice, grouped
 * by the owning key (user_id or ad_account_id). The directory builders merge
 * these into the schedule's `paidMonths` so a cycle an admin settled by hand
 * (or linked to a payout recorded under a different month) shows `paid`
 * exactly like a payout-recognised one. Auto-paid rows are included too —
 * their cycle month is never later than the payout month that promoted them,
 * so the merge can't move `lastPaidMonth` for those.
 */
export async function getPaidCycleMonthsByKey(
  table: InvoiceTable,
  keyColumn: "user_id" | "ad_account_id"
): Promise<Map<string, Array<{ year: number; month: number }>>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    `SELECT ${keyColumn} AS k, cycle_anchor FROM ${table}
     WHERE status = 'paid' AND ${keyColumn} IS NOT NULL`
  );
  const map = new Map<string, Array<{ year: number; month: number }>>();
  for (const row of result.rows) {
    const key = row.k != null ? String(row.k) : "";
    if (!key) continue;
    const m = String(row.cycle_anchor ?? "").match(/^(\d{4})-(\d{2})/);
    if (!m) continue;
    const entry = { year: Number(m[1]), month: Number(m[2]) };
    const arr = map.get(key);
    if (arr) arr.push(entry);
    else map.set(key, [entry]);
  }
  return map;
}

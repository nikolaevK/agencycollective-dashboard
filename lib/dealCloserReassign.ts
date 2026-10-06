import { getDb, ensureMigrated } from "./db";
import { findDeal } from "./deals";
import { readClosers } from "./closers";
import { matchCloserBySalesRep } from "./salesRepMatch";
import { logAuditEvent } from "./auditLog";

/**
 * Moves a deal to the closer named in its imported payout's Sales Rep — the
 * Payout DB records who actually finished a deal another closer submitted.
 *
 * `deals.closer_id` stays the single attribution key (portal list, revenue,
 * quota, commission, leaderboard all follow it); the submitter is kept in
 * `original_closer_id` (written once). Attendance rows are NOT moved — the
 * show belongs to whoever took the call. A Sales Rep that doesn't name exactly
 * one ACTIVE closer (splits, REBILL/Ad Account markers, unknown or inactive
 * names) leaves the deal where it is.
 *
 * Callers run this AFTER the payout write and only for payouts linked to a
 * deal (`source_deal_id`). It never throws — the payout is already saved.
 */

export type CloserReassignResult =
  | { moved: true; dealId: string; fromCloserId: string; toCloserId: string; toCloserName: string }
  | { moved: false; reason: "no_match" | "unchanged" | "not_found" | "conflict" | "error" };

export async function syncDealCloserFromSalesRep(
  dealId: string,
  salesRep: string | null,
  actor: { adminId: string; adminUsername: string }
): Promise<CloserReassignResult> {
  try {
    const [deal, closers] = await Promise.all([findDeal(dealId), readClosers()]);
    if (!deal) return { moved: false, reason: "not_found" };

    const toCloserId = matchCloserBySalesRep(salesRep, closers);
    if (!toCloserId) return { moved: false, reason: "no_match" };
    if (toCloserId === deal.closerId) return { moved: false, reason: "unchanged" };

    await ensureMigrated();
    const db = getDb();
    // Guarded on the closer we read, so a concurrent move can't be clobbered.
    const result = await db.execute({
      sql: `UPDATE deals
               SET closer_id = ?,
                   original_closer_id = COALESCE(original_closer_id, ?),
                   closer_reassigned_at = datetime('now'),
                   closer_reassigned_source = 'payout',
                   updated_at = datetime('now')
             WHERE id = ? AND closer_id = ?`,
      args: [toCloserId, deal.closerId, dealId, deal.closerId],
    });
    if (result.rowsAffected === 0) return { moved: false, reason: "conflict" };

    logAuditEvent({
      ...actor,
      action: "deal.closer_reassign",
      targetType: "deal",
      targetId: dealId,
      details: JSON.stringify({ from: deal.closerId, to: toCloserId, salesRep, source: "payout" }),
    }).catch(() => {});

    const toCloserName = closers.find((c) => c.id === toCloserId)?.displayName ?? toCloserId;
    return { moved: true, dealId, fromCloserId: deal.closerId, toCloserId, toCloserName };
  } catch (err) {
    console.error("[dealCloserReassign] sync failed:", err);
    return { moved: false, reason: "error" };
  }
}

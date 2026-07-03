import { getDb, ensureMigrated } from "./db";
import { isSetterTier } from "./appointments";

/**
 * Return the setter_id (and tier) that should be credited for a given
 * Google event.
 *
 * Per the 1099 contract, the setter is no longer auto-attributed just by
 * claiming the calendar event — they must also pick a tier (A/B/C/D), which
 * acts as their explicit approval to take credit. We pick the latest
 * appointment that has a tier set so that a *tierless* claim (e.g., a second
 * setter just adding notes) doesn't wipe the previous setter's attribution.
 * Only an explicit tier commit competes for credit.
 */
export async function resolveSetterForEvent(
  googleEventId: string
): Promise<{ setterId: string; tier: "A" | "B" | "C" | "D" } | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT setter_id, setter_tier FROM appointments
           WHERE google_event_id = ? AND setter_tier IS NOT NULL
        ORDER BY updated_at DESC LIMIT 1`,
    args: [googleEventId],
  });
  const row = result.rows[0];
  if (!row) return null;
  const tier = row.setter_tier != null ? String(row.setter_tier) : null;
  if (!isSetterTier(tier)) return null;
  return { setterId: String(row.setter_id), tier };
}

/**
 * Sync setter_id + setter_tier on every deal that links to the given Google
 * event. Setter credit only flows through when an appointment has a tier
 * selected; otherwise both columns are nulled on the deal.
 *
 * Called from two sides of the attribution flow:
 *   1. Closer creates/links a deal to an event → attribute the current claimer.
 *   2. Setter claims/updates/unclaims/sets-tier on an event → update any
 *      existing deals.
 *
 * Idempotent: runs one UPDATE per deal even if values don't change. Safe to
 * call without knowing whether a matching deal exists.
 *
 * Skips deals that already carry an admin-set override — those have been
 * manually pinned and shouldn't be reverted by setter-side activity.
 * (Admin override is the explicit `setter_override` flag, stamped whenever
 * an admin edits a deal's setter_id/setter_tier.)
 */
export async function reassignDealsForEvent(
  googleEventId: string
): Promise<number> {
  if (!googleEventId) return 0;
  await ensureMigrated();
  const db = getDb();
  const resolved = await resolveSetterForEvent(googleEventId);
  const setterId = resolved?.setterId ?? null;
  const tier = resolved?.tier ?? null;
  const result = await db.execute({
    sql: `UPDATE deals
             SET setter_id = ?, setter_tier = ?, updated_at = datetime('now')
           WHERE google_event_id = ?
             AND COALESCE(setter_override, 0) = 0
             AND (
               COALESCE(setter_id, '') != COALESCE(?, '')
               OR COALESCE(setter_tier, '') != COALESCE(?, '')
             )`,
    args: [setterId, tier, googleEventId, setterId, tier],
  });
  return result.rowsAffected ?? 0;
}

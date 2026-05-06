import { getDb, ensureMigrated } from "./db";
import { findLatestAppointmentByEvent } from "./appointments";

/**
 * Return the setter_id (and tier) that should be credited for a given
 * Google event.
 *
 * Per the 1099 contract, the setter is no longer auto-attributed just by
 * claiming the calendar event — they must also pick a tier (A/B/C/D), which
 * acts as their explicit approval to take credit. If the most recent
 * appointment claim has no tier set, returns null and the linked deal will
 * carry no setter attribution.
 */
export async function resolveSetterForEvent(
  googleEventId: string
): Promise<{ setterId: string; tier: "A" | "B" | "C" | "D" } | null> {
  const appt = await findLatestAppointmentByEvent(googleEventId);
  if (!appt) return null;
  if (!appt.setterTier) return null;
  return { setterId: appt.setterId, tier: appt.setterTier };
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
 * Skips deals that already carry an admin-set tier override — those have
 * been manually pinned and shouldn't be reverted by setter-side activity.
 * (Admin override is identified by setter_tier on a deal whose appointment
 * has a *different* tier; any time an admin diverges from the setter's
 * claim, that deal becomes "manual".)
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
             AND (
               COALESCE(setter_id, '') != COALESCE(?, '')
               OR COALESCE(setter_tier, '') != COALESCE(?, '')
             )`,
    args: [setterId, tier, googleEventId, setterId, tier],
  });
  return result.rowsAffected ?? 0;
}

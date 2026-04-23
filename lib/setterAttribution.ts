import { getDb, ensureMigrated } from "./db";
import { findLatestAppointmentByEvent } from "./appointments";

/**
 * Return the setter_id that should be credited for a given Google event,
 * based on whichever setter most recently touched their appointment claim.
 * Returns null when no setter has claimed the event.
 */
export async function resolveSetterForEvent(
  googleEventId: string
): Promise<string | null> {
  const appt = await findLatestAppointmentByEvent(googleEventId);
  return appt?.setterId ?? null;
}

/**
 * Sync setter_id on every deal that links to the given Google event.
 *
 * Called from two sides of the attribution flow:
 *   1. Closer creates/links a deal to an event → attribute the current claimer.
 *   2. Setter claims/updates/unclaims an event → update any existing deals.
 *
 * Idempotent: runs one UPDATE per deal even if value doesn't change. Safe to
 * call without knowing whether a matching deal exists.
 */
export async function reassignDealsForEvent(
  googleEventId: string
): Promise<number> {
  if (!googleEventId) return 0;
  await ensureMigrated();
  const db = getDb();
  const setterId = await resolveSetterForEvent(googleEventId);
  const result = await db.execute({
    sql: `UPDATE deals
             SET setter_id = ?, updated_at = datetime('now')
           WHERE google_event_id = ?
             AND COALESCE(setter_id, '') != COALESCE(?, '')`,
    args: [setterId, googleEventId, setterId],
  });
  return result.rowsAffected ?? 0;
}

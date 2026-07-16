import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, type AdminRecord } from "@/lib/admins";

/**
 * Shared admin guard for /api/admin/* route handlers — replaces ~30
 * copy-pasted per-route `requireAdminSession()` helpers. Resolves the cookie
 * session and re-loads the admin from the DB (role truth is the DB, never the
 * token — mirrors lib/teamAuth). Returns null when unauthenticated; routes
 * respond 401 themselves, matching their existing response shapes.
 *
 * Routes with extra requirements (permission keys, isSuper) keep their own
 * checks on the returned record.
 */
export async function requireAdminRecord(): Promise<AdminRecord | null> {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

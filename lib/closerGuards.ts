import { cache } from "react";
import { redirect } from "next/navigation";
import { getCloserSession } from "./closerSession";
import { findCloser, type CloserRecord } from "./closers";
import { ensureMigrated } from "./db";

/**
 * Resolve the session to a live, ACTIVE closer/setter row. The single choke
 * point for portal auth: a signed cookie alone is not enough — the row must
 * still exist and not be deactivated (admin sets status='inactive' to revoke
 * access; the 7-day cookie must not outlive that).
 *
 * request-memoized via React cache() so layout + nested layout + page share
 * one DB read per render pass.
 */
export const getActiveCloserFromSession = cache(
  async (): Promise<CloserRecord | null> => {
    const session = getCloserSession();
    if (!session) return null;

    await ensureMigrated();
    const closer = await findCloser(session.closerId);
    if (!closer || closer.status !== "active") return null;
    return closer;
  }
);

/**
 * Drop-in replacement for the cookie-only getCloserSession() in API routes:
 * same `{ closerId }` shape, but resolved against the DB so deactivated or
 * deleted rows are rejected immediately instead of at cookie expiry.
 */
export async function getActiveCloserSession(): Promise<{
  closerId: string;
  role: CloserRecord["role"];
} | null> {
  const closer = await getActiveCloserFromSession();
  return closer ? { closerId: closer.id, role: closer.role } : null;
}

/**
 * API-route variant of the role gate. Returns the closer record only if a
 * valid session exists, the row is still active, AND the role matches.
 * Returns null otherwise — callers turn that into a 401/403 response.
 */
export async function getSetterFromSession(): Promise<CloserRecord | null> {
  const closer = await getActiveCloserFromSession();
  if (!closer || closer.role !== "setter") return null;
  return closer;
}

/**
 * API-route variant for closer-only endpoints (deal creation/mutation).
 * Setters share the c_sess cookie, so role must be checked server-side —
 * a setter session must not be able to insert closer-attributed deals.
 */
export async function getCloserOnlyFromSession(): Promise<CloserRecord | null> {
  const closer = await getActiveCloserFromSession();
  if (!closer || closer.role === "setter") return null;
  return closer;
}

/**
 * Load the authenticated closer record, enforcing role restrictions.
 * Returns the record for use in the page. Redirects on mismatch.
 *
 * Used at the page level as the authoritative role gate. Middleware does
 * best-effort routing based on the session token's role field, but sessions
 * that pre-date the setter role don't carry one — so pages that must not
 * cross roles verify against the DB here.
 */
export async function requireCloserRecord(opts: {
  allow: "closers-only" | "setters-only";
}): Promise<CloserRecord> {
  const closer = await getActiveCloserFromSession();
  if (!closer) redirect("/?portal=closer");

  const isSetter = closer.role === "setter";
  if (opts.allow === "closers-only" && isSetter) redirect("/closer/setter");
  if (opts.allow === "setters-only" && !isSetter) redirect("/closer/dashboard");

  return closer;
}

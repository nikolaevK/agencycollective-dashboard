import { redirect } from "next/navigation";
import { getCloserSession } from "./closerSession";
import { findCloser, type CloserRecord } from "./closers";
import { ensureMigrated } from "./db";

/**
 * API-route variant of the role gate. Returns the closer record only if a
 * valid session exists AND the role matches. Returns null otherwise — callers
 * turn that into a 401/403 response.
 */
export async function getSetterFromSession(): Promise<CloserRecord | null> {
  const session = getCloserSession();
  if (!session) return null;

  await ensureMigrated();
  const closer = await findCloser(session.closerId);
  if (!closer || closer.role !== "setter") return null;
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
  const session = getCloserSession();
  if (!session) redirect("/?portal=closer");

  await ensureMigrated();
  const closer = await findCloser(session.closerId);
  if (!closer) redirect("/?portal=closer");

  const isSetter = closer.role === "setter";
  if (opts.allow === "closers-only" && isSetter) redirect("/closer/setter");
  if (opts.allow === "setters-only" && !isSetter) redirect("/closer/dashboard");

  return closer;
}

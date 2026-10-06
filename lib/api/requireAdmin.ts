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

// ---------------------------------------------------------------------------
// Workspace ("book") scoping — Client Directory / Ad Accounts routes resolve
// the actor once and filter/verify every row against the scope. Out-of-scope
// clients read as NOT FOUND (never 403) so ids can't be probed across books.
// ---------------------------------------------------------------------------

import {
  workspaceScopeOf,
  inWorkspaceScope,
  isExternalScope,
  type WorkspaceScope,
} from "@/lib/workspaces";
import { findUser, type UserRecord } from "@/lib/users";

export interface DirectoryActor {
  admin: AdminRecord;
  /** Allowed workspace slugs; null = unscoped (super / Admin Management). */
  scope: WorkspaceScope;
}

export async function requireDirectoryActor(): Promise<DirectoryActor | null> {
  const admin = await requireAdminRecord();
  if (!admin) return null;
  return { admin, scope: workspaceScopeOf(admin) };
}

/** Load a client and verify it's inside the actor's workspace scope. */
export async function findClientInScope(
  scope: WorkspaceScope,
  userId: string
): Promise<UserRecord | null> {
  const user = await findUser(userId);
  if (!user) return null;
  return inWorkspaceScope(scope, user.workspace) ? user : null;
}

import { NextResponse } from "next/server";
import { getAdAccount, type AdAccount } from "@/lib/adAccounts";

/** Load an ad account and verify it's inside the actor's workspace scope. */
export async function findAdAccountInScope(
  scope: WorkspaceScope,
  id: string
): Promise<AdAccount | null> {
  const account = await getAdAccount(id);
  if (!account) return null;
  return inWorkspaceScope(scope, account.workspace) ? account : null;
}

/**
 * Workspace gate for one ad-account INVOICE. An invoice of an account in the
 * actor's book passes with that account. Free invoices (no account) are
 * internal-only. Orphans whose account has since been deleted (no FK; their
 * rows keep `ad_account_id`) used to 404 for everyone, so they could never be
 * settled, marked or followed up — they're now gated by the book of the
 * client snapshotted on the row, else visible to unscoped admins only (a
 * deleted PARTNER account's invoices must not open up to main-only admins).
 */
export async function findAdInvoiceAccountInScope(
  scope: WorkspaceScope,
  invoice: { adAccountId: string | null; userId: string | null }
): Promise<{ ok: true; account: AdAccount | null } | { ok: false }> {
  if (invoice.adAccountId) {
    const account = await getAdAccount(invoice.adAccountId);
    if (account)
      return inWorkspaceScope(scope, account.workspace)
        ? { ok: true, account }
        : { ok: false };
    // Orphan of a deleted account.
    const client = invoice.userId ? await findUser(invoice.userId) : null;
    if (client)
      return inWorkspaceScope(scope, client.workspace)
        ? { ok: true, account: null }
        : { ok: false };
    return scope === null ? { ok: true, account: null } : { ok: false };
  }
  return isExternalScope(scope) ? { ok: false } : { ok: true, account: null };
}

/**
 * Guard for internal-only surfaces (Payout pool/import, Welcome Kit builder,
 * maintenance banner): an external (partner) scope — one without the main
 * book — gets 403; everyone else passes with their actor.
 */
export async function requireInternalActor(): Promise<
  | { actor: DirectoryActor; response?: undefined }
  | { response: NextResponse; actor?: undefined }
> {
  const actor = await requireDirectoryActor();
  if (!actor) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (isExternalScope(actor.scope)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { actor };
}

/**
 * One-call guard for per-client admin routes: session + DB-fresh admin +
 * workspace-scope check on the target client. Returns a ready 401/404
 * response, or the actor + verified user record.
 */
export async function requireClientRouteActor(
  userId: string,
  notFoundMessage = "Client not found"
): Promise<
  | { actor: DirectoryActor; user: UserRecord; response?: undefined }
  | { response: NextResponse; actor?: undefined; user?: undefined }
> {
  const actor = await requireDirectoryActor();
  if (!actor) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await findClientInScope(actor.scope, userId);
  if (!user) {
    return { response: NextResponse.json({ error: notFoundMessage }, { status: 404 }) };
  }
  return { actor, user };
}

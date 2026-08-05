import { findAdmin } from "@/lib/admins";
import { findUser, type UserRecord } from "@/lib/users";
import {
  workspaceScopeOf,
  inWorkspaceScope,
  type WorkspaceScope,
} from "@/lib/workspaces";

// ---------------------------------------------------------------------------
// Workspace-scope helpers for the token-session-guarded Support routes (they
// keep their existing getAdminSession + rate-limit shape and bolt the scope
// check on after it). Everything client-facing in Support keys off a userId,
// so scoping = "is that client's workspace in the actor's scope".
// ---------------------------------------------------------------------------

/**
 * Resolve the workspace scope for a session's adminId. `undefined` = the
 * admin row no longer exists (treat as unauthorized); null = unscoped.
 */
export async function getScopeForAdminId(
  adminId: string
): Promise<WorkspaceScope | undefined> {
  const admin = await findAdmin(adminId);
  if (!admin) return undefined;
  return workspaceScopeOf(admin);
}

/** The client record when it exists AND is inside the scope; else null. */
export async function clientVisibleToScope(
  scope: WorkspaceScope,
  userId: string
): Promise<UserRecord | null> {
  const user = await findUser(userId);
  if (!user) return null;
  return inWorkspaceScope(scope, user.workspace) ? user : null;
}

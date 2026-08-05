import { getAdminSession } from "./adminSession";
import { findAdmin, type AdminRecord } from "./admins";
import { workspaceScopeOf, type WorkspaceScope } from "./workspaces";

// ---------------------------------------------------------------------------
// Team hub access rules (shared by all /api/admin/team routes):
// - The Team OVERVIEW is visible to every logged-in admin.
// - FULL access (any member's hub, roster/goal management, other members'
//   tasks and action items) requires isSuper OR the existing `admin`
//   permission — no new permission key.
// - Everyone else may view and manage ONLY their own hub (self tasks, self
//   action items, self comments).
// - REASSIGNMENT is deliberately owner-side-gated only: canManageMember is
//   checked against the CURRENT owner, and the TARGET is unrestricted (any
//   roster member) — that's what lets a non-privileged member forward a
//   misrouted task/item out of their own hub. Do NOT "harden" reassign
//   routes with a target-side canManageMember check; it would kill
//   forwarding for every non-privileged member.
// Role truth is the DB (findAdmin), never the session token — mirrors the
// closer/setter layout-guard principle.
// ---------------------------------------------------------------------------

export interface TeamActor {
  admin: AdminRecord;
  privileged: boolean;
  /**
   * Workspace (book) scope — null for privileged actors (they see every
   * book), else the admin's allow-list (default ['main']). Team surfaces
   * filter members + client rollups through it so a partner-book admin never
   * sees the internal team or its clients (lib/workspaces.ts).
   */
  scope: WorkspaceScope;
}

export async function getTeamActor(): Promise<TeamActor | null> {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return {
    admin,
    privileged: admin.isSuper || admin.permissions.admin,
    scope: workspaceScopeOf(admin),
  };
}

/** May this actor view/manage the hub (tasks, items) of `targetAdminId`? */
export function canManageMember(actor: TeamActor, targetAdminId: string): boolean {
  return actor.privileged || actor.admin.id === targetAdminId;
}

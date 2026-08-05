import { getAdminSession } from "./adminSession";
import { findAdmin, type AdminRecord } from "./admins";
import {
  workspaceScopeOf,
  workspaceMembershipOf,
  type WorkspaceScope,
} from "./workspaces";
import { getTeamMember } from "./teamMembers";

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
  /**
   * Books this actor MANAGES as a rostered Head of Ads (team_members
   * attribution 'lead'): their own workspace membership. A book manager can
   * open and manage the hubs, tasks, action items and goals of members in
   * these books — the workspace-scoped equivalent of the `admin`-perm
   * privilege, without granting cross-book visibility or the Admins page.
   * Empty for everyone else (and left empty for privileged actors, who
   * don't need it).
   */
  managedWorkspaces: string[];
}

export async function getTeamActor(): Promise<TeamActor | null> {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  const privileged = admin.isSuper || admin.permissions.admin;

  // Head-of-Ads (lead-attribution) roster members manage their book(s).
  // DB-fresh like the role itself — flipping an attribution takes effect on
  // the next request, mirroring the closer/setter layout-guard principle.
  let managedWorkspaces: string[] = [];
  if (!privileged) {
    const member = await getTeamMember(admin.id);
    if (member?.attribution === "lead") {
      managedWorkspaces = workspaceMembershipOf(admin);
    }
  }

  return {
    admin,
    privileged,
    scope: workspaceScopeOf(admin),
    managedWorkspaces,
  };
}

/** May this actor view/manage the hub (tasks, items) of `targetAdminId`? */
export function canManageMember(actor: TeamActor, targetAdminId: string): boolean {
  return actor.privileged || actor.admin.id === targetAdminId;
}

/**
 * Book-manager check: does the actor (a Head of Ads) manage a book the
 * target admin BELONGS to? Membership, not visibility — the same rule the
 * member filters use, so a manager can reach exactly the members their
 * book's Team page shows.
 */
export async function canManageBookMember(
  actor: TeamActor,
  targetAdminId: string
): Promise<boolean> {
  if (actor.managedWorkspaces.length === 0) return false;
  const target = await findAdmin(targetAdminId);
  if (!target) return false;
  const membership = workspaceMembershipOf(target);
  return actor.managedWorkspaces.some((w) => membership.includes(w));
}

/**
 * canManageMember + the Head-of-Ads book-manager grant. The async variant
 * every per-member/per-task team route should use; the sync canManageMember
 * stays for cheap self/privileged short-circuits.
 */
export async function canManageMemberScoped(
  actor: TeamActor,
  targetAdminId: string
): Promise<boolean> {
  if (canManageMember(actor, targetAdminId)) return true;
  return canManageBookMember(actor, targetAdminId);
}

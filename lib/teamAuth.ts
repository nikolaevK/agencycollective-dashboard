import { getAdminSession } from "./adminSession";
import { findAdmin, type AdminRecord } from "./admins";

// ---------------------------------------------------------------------------
// Team hub access rules (shared by all /api/admin/team routes):
// - The Team OVERVIEW is visible to every logged-in admin.
// - FULL access (any member's hub, roster/goal management, other members'
//   tasks and action items) requires isSuper OR the existing `admin`
//   permission — no new permission key.
// - Everyone else may view and manage ONLY their own hub (self tasks, self
//   action items, self comments).
// Role truth is the DB (findAdmin), never the session token — mirrors the
// closer/setter layout-guard principle.
// ---------------------------------------------------------------------------

export interface TeamActor {
  admin: AdminRecord;
  privileged: boolean;
}

export async function getTeamActor(): Promise<TeamActor | null> {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { admin, privileged: admin.isSuper || admin.permissions.admin };
}

/** May this actor view/manage the hub (tasks, items) of `targetAdminId`? */
export function canManageMember(actor: TeamActor, targetAdminId: string): boolean {
  return actor.privileged || actor.admin.id === targetAdminId;
}

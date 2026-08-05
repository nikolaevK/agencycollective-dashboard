import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, getEffectivePermissions } from "@/lib/admins";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { workspaceScopeOf, isExternalScope } from "@/lib/workspaces";
import { DashboardClientShell } from "@/components/layout/DashboardClientShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getAdminSession();
  if (!session) redirect("/?portal=admin");

  const admin = await findAdmin(session.adminId);
  if (!admin) redirect("/?portal=admin");

  const permissions = getEffectivePermissions(admin);

  // Detect if session data is stale (permissions changed in DB since last
  // login). MUST compare EVERY permission key — middleware enforces the token
  // snapshot, so any key missing here means granting that permission
  // mid-session never takes effect until a manual re-login (this bit
  // Media Buyers/API Tokens/Meta Accounts grants for years: the old
  // hand-enumerated list compared only 9 of 13 keys). Looping over
  // ALL_PERMISSION_KEYS makes future keys impossible to forget.
  const sessionPerms = session.permissions;
  const needsRefresh =
    session.isSuper !== admin.isSuper ||
    session.displayName !== admin.displayName ||
    session.avatarPath !== admin.avatarPath ||
    ALL_PERMISSION_KEYS.some((key) => sessionPerms[key] !== permissions[key]);

  // Workspace (book) scope — DB-fresh like the permissions above; drives
  // client-side gating of internal-only surfaces (Welcome Kit, SOPs, payout
  // pickers) for external partner admins. Enforcement stays in-route.
  const scope = workspaceScopeOf(admin);

  const adminData = {
    adminId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    avatarPath: admin.avatarPath,
    isSuper: admin.isSuper,
    permissions,
    workspaces: scope,
    isExternal: isExternalScope(scope),
  };

  return (
    <DashboardClientShell adminData={adminData} needsSessionRefresh={needsRefresh}>
      {children}
    </DashboardClientShell>
  );
}

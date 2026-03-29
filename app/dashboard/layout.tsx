import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, getEffectivePermissions } from "@/lib/admins";
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

  // Detect if session data is stale (permissions changed in DB since last login)
  const sessionPerms = session.permissions;
  const needsRefresh =
    session.isSuper !== admin.isSuper ||
    session.displayName !== admin.displayName ||
    session.avatarPath !== admin.avatarPath ||
    sessionPerms.dashboard !== permissions.dashboard ||
    sessionPerms.analyst !== permissions.analyst ||
    sessionPerms.studio !== permissions.studio ||
    sessionPerms.adcopy !== permissions.adcopy ||
    sessionPerms.users !== permissions.users ||
    sessionPerms.closers !== permissions.closers ||
    sessionPerms.admin !== permissions.admin;

  const adminData = {
    adminId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    avatarPath: admin.avatarPath,
    isSuper: admin.isSuper,
    permissions,
  };

  return (
    <DashboardClientShell adminData={adminData} needsSessionRefresh={needsRefresh}>
      {children}
    </DashboardClientShell>
  );
}

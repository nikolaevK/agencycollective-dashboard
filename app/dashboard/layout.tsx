import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { DashboardClientShell } from "@/components/layout/DashboardClientShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const admin = await findAdmin(session.adminId);
  if (!admin) redirect("/admin/login");

  return (
    <DashboardClientShell isSuperAdmin={admin.isSuper}>
      {children}
    </DashboardClientShell>
  );
}

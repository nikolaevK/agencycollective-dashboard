import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { AdminsPanel } from "./AdminsPanel";

export default async function AdminsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const admin = await findAdmin(session.adminId);
  if (!admin) redirect("/admin/login");

  // Require admin permission or super admin
  if (!admin.isSuper && !admin.permissions.admin) {
    redirect("/dashboard/unauthorized");
  }

  return <AdminsPanel />;
}

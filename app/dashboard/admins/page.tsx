import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { AdminsPanel } from "./AdminsPanel";

export default async function AdminsPage() {
  const session = getAdminSession();
  if (!session) redirect("/?portal=admin");

  const admin = await findAdmin(session.adminId);
  if (!admin) redirect("/?portal=admin");

  // Require admin permission or super admin
  if (!admin.isSuper && !admin.permissions.admin) {
    redirect("/dashboard/unauthorized");
  }

  return <AdminsPanel />;
}

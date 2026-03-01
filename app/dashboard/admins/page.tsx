import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { AdminsPanel } from "./AdminsPanel";

export default async function AdminsPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const admin = await findAdmin(session.adminId);
  if (!admin?.isSuper) redirect("/dashboard");

  return <AdminsPanel />;
}

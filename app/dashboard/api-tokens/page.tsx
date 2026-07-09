import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ApiTokensPanel } from "@/components/api-tokens/ApiTokensPanel";

export default async function ApiTokensPage() {
  const session = getAdminSession();
  if (!session) redirect("/?portal=admin");

  const admin = await findAdmin(session.adminId);
  if (!admin) redirect("/?portal=admin");

  if (!admin.isSuper && !admin.permissions.apitokens) {
    redirect("/dashboard/unauthorized");
  }

  return <ApiTokensPanel />;
}

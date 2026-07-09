import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ApiDocsPanel } from "@/components/api-docs/ApiDocsPanel";

export default async function ApiDocsPage() {
  const session = getAdminSession();
  if (!session) redirect("/?portal=admin");

  const admin = await findAdmin(session.adminId);
  if (!admin) redirect("/?portal=admin");

  if (!admin.isSuper && !admin.permissions.apitokens) {
    redirect("/dashboard/unauthorized");
  }

  return <ApiDocsPanel />;
}

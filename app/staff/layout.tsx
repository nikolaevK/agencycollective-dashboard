import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { findAdmin } from "@/lib/admins";
import { findCloser } from "@/lib/closers";

export default async function StaffLoginLayout({ children }: { children: React.ReactNode }) {
  // Already-signed-in staff skip the login form and land on their dashboard.
  // Verify against the DB (not just the cookie signature) so a deleted user
  // whose 7-day cookie is still valid isn't bounced straight back here by the
  // dashboard/closer guards — which DB-check and redirect to /?portal=… (now
  // forwarded to /staff). Cookie-only checks here would create a redirect loop.
  const adminSession = getAdminSession();
  if (adminSession && (await findAdmin(adminSession.adminId))) redirect("/dashboard");

  const closerSession = getCloserSession();
  if (closerSession && (await findCloser(closerSession.closerId))) redirect("/closer/dashboard");

  return <>{children}</>;
}

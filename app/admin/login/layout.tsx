import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminSession";

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  const session = getAdminSession();
  if (session) redirect("/dashboard");
  return <>{children}</>;
}

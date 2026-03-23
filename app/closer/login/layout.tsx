import { redirect } from "next/navigation";
import { getCloserSession } from "@/lib/closerSession";

export default async function CloserLoginLayout({ children }: { children: React.ReactNode }) {
  const session = getCloserSession();
  if (session) {
    redirect("/closer/dashboard");
  }
  return <>{children}</>;
}

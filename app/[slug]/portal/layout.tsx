import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { readUsers } from "@/lib/users";
import { PortalShell } from "./PortalShell";

export default function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = getSession();
  if (!session) redirect("/login");

  const users = readUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user || user.slug !== params.slug) redirect("/login");

  return <PortalShell>{children}</PortalShell>;
}

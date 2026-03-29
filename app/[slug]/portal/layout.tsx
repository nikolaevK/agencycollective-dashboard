import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { PortalShell } from "./PortalShell";

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = getSession();
  if (!session) redirect("/?portal=client");

  const user = await findUser(session.userId);
  if (!user || user.slug !== params.slug) redirect("/?portal=client");

  return <PortalShell>{children}</PortalShell>;
}

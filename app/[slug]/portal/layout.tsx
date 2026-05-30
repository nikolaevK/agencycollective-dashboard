import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { getMaintenanceConfig, effectiveMaintenanceMessage } from "@/lib/maintenance";
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

  // A maintenance notice is non-critical — never let a config-read failure
  // block a client from their portal.
  let maintenanceMessage: string | null = null;
  try {
    const maintenance = await getMaintenanceConfig();
    maintenanceMessage = maintenance.enabled
      ? effectiveMaintenanceMessage(maintenance)
      : null;
  } catch {
    maintenanceMessage = null;
  }

  return <PortalShell maintenanceMessage={maintenanceMessage}>{children}</PortalShell>;
}

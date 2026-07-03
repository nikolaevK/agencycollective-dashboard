import { redirect } from "next/navigation";
import { getActiveCloserFromSession } from "@/lib/closerGuards";
import { CloserPortalShell } from "./CloserPortalShell";

export default async function CloserProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cached for the render pass — nested layouts' requireCloserRecord calls
  // reuse this lookup. Also enforces status='active' (deactivation revokes
  // access immediately, not at cookie expiry).
  const closer = await getActiveCloserFromSession();
  if (!closer) redirect("/?portal=closer");

  return (
    <CloserPortalShell displayName={closer.displayName} role={closer.role}>
      {children}
    </CloserPortalShell>
  );
}

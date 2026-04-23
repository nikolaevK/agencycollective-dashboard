import { redirect } from "next/navigation";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { ensureMigrated } from "@/lib/db";
import { CloserPortalShell } from "./CloserPortalShell";

export default async function CloserProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = getCloserSession();
  if (!session) redirect("/?portal=closer");

  await ensureMigrated();
  const closer = await findCloser(session.closerId);
  if (!closer) redirect("/?portal=closer");

  return (
    <CloserPortalShell displayName={closer.displayName} role={closer.role}>
      {children}
    </CloserPortalShell>
  );
}

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
  if (!session) redirect("/closer/login");

  await ensureMigrated();
  const closer = await findCloser(session.closerId);
  if (!closer) redirect("/closer/login");

  return (
    <CloserPortalShell displayName={closer.displayName}>
      {children}
    </CloserPortalShell>
  );
}

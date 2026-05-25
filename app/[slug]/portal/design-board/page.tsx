import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DesignBoardEmbed } from "@/components/portal/DesignBoardEmbed";

// Render fresh so admin link/toggle changes show up immediately.
export const dynamic = "force-dynamic";

export default async function DesignBoardPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = getSession();
  if (!session) redirect("/?portal=client");

  const user = await findUser(session.userId);
  if (!user || user.slug !== params.slug) redirect("/?portal=client");

  // Master toggle off → gated message (mirrors the AI Analyst page).
  if (!user.designBoardEnabled) {
    return (
      <DashboardShell>
        <div className="max-w-2xl space-y-3">
          <h1 className="text-2xl font-bold">Design Board</h1>
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold text-sm">Design Board is currently unavailable on your account.</p>
            <p className="mt-1 text-sm opacity-90">
              Please contact your account manager if you&apos;d like access.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  // Enabled but no link set yet → friendly empty state. (The nav item is hidden
  // in this case, so this is only reachable by direct URL.)
  if (!user.designBoardUrl) {
    return (
      <DashboardShell>
        <div className="max-w-2xl space-y-3">
          <h1 className="text-2xl font-bold">Design Board</h1>
          <p className="text-sm text-muted-foreground">
            Your design board hasn&apos;t been added yet. Once your team links a Figma board,
            it&apos;ll appear here.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DesignBoardEmbed url={user.designBoardUrl} />
    </DashboardShell>
  );
}

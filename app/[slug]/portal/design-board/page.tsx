import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DesignBoardEmbed } from "@/components/portal/DesignBoardEmbed";
import { badgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
        <div className="max-w-2xl space-y-4">
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Design Board</h1>
          <div className={cn("rounded-3xl border px-4 py-3", badgeTone.warning)}>
            <p className="font-medium text-sm">Design Board is currently unavailable on your account.</p>
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
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Design Board</h1>
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

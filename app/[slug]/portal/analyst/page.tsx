import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AnalystInterface } from "./AnalystInterface";

export const dynamic = "force-dynamic";

export default async function PortalAnalystPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { accountId?: string };
}) {
  const session = getSession();
  if (!session) redirect("/?portal=client");

  const user = await findUser(session.userId);
  if (!user || user.slug !== params.slug) redirect("/?portal=client");

  if (!user.analystEnabled) {
    return (
      <DashboardShell>
        <div className="max-w-2xl space-y-3">
          <h1 className="text-2xl font-bold">AI Analyst</h1>
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold text-sm">AI Analyst is currently unavailable on your account.</p>
            <p className="mt-1 text-sm opacity-90">
              Please contact your account manager if you&apos;d like to request access.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const accounts = await readActiveAccountsForUser(session.userId);

  if (accounts.length === 0) {
    return (
      <DashboardShell>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">AI Analyst</h1>
          <p className="text-sm text-muted-foreground">
            No connected ad accounts yet. Once your team links an ad account to your portal,
            you&apos;ll be able to chat with the analyst about its performance.
          </p>
        </div>
      </DashboardShell>
    );
  }

  // Resolve selected account: requested → first owned. Always use a valid id.
  const requestedId = searchParams.accountId;
  const selected =
    (requestedId && accounts.find((a) => a.accountId === requestedId)) || accounts[0];

  return (
    <DashboardShell>
      <AnalystInterface
        slug={params.slug}
        accounts={accounts.map((a) => ({
          accountId: a.accountId,
          label: a.label,
        }))}
        initialAccountId={selected.accountId}
      />
    </DashboardShell>
  );
}

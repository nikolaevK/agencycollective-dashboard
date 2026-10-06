export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { listActiveSentInvoices } from "@/lib/adAccountInvoices";
import { withFollowUpSummaries } from "@/lib/invoiceFollowUps";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { listAdAccounts } from "@/lib/adAccounts";
import { readUsers } from "@/lib/users";
import { inWorkspaceScope, isExternalScope } from "@/lib/workspaces";

/**
 * All currently-sent ad-account invoices (awaiting payment), joined with the
 * ad account + client. Powers the "Invoices Sent" panel + summary count, the
 * same way /api/admin/clients/sent-invoices does for client re-bill invoices.
 */
export async function GET() {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  let invoices = await listActiveSentInvoices();
  if (actor.scope !== null) {
    // Workspace scoping: only invoices of accounts in the actor's book(s);
    // free invoices (no account) are internal-only.
    const [accounts, users] = await Promise.all([listAdAccounts(), readUsers()]);
    const workspaceById = new Map(accounts.map((a) => [a.id, a.workspace] as const));
    const workspaceByUser = new Map(users.map((u) => [u.id, u.workspace] as const));
    invoices = invoices.filter((inv) => {
      if (!inv.adAccountId) return !isExternalScope(actor.scope);
      // Orphans of a deleted account follow their client's book (same rule as
      // findAdInvoiceAccountInScope) — never default to 'main'.
      const ws =
        workspaceById.get(inv.adAccountId) ??
        (inv.userId ? workspaceByUser.get(inv.userId) : undefined);
      return ws !== undefined && inWorkspaceScope(actor.scope, ws);
    });
  }
  // Each row carries its follow-up summary (count + latest touch).
  const withFollowUps = await withFollowUpSummaries("ad_account", invoices);
  return NextResponse.json({
    data: { invoices: withFollowUps, count: withFollowUps.length },
  });
}

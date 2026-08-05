export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { listActiveSentInvoices } from "@/lib/adAccountInvoices";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { listAdAccounts } from "@/lib/adAccounts";
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
    const workspaceById = new Map(
      (await listAdAccounts()).map((a) => [a.id, a.workspace] as const)
    );
    invoices = invoices.filter((inv) =>
      inv.adAccountId
        ? inWorkspaceScope(actor.scope, workspaceById.get(inv.adAccountId) ?? "main")
        : !isExternalScope(actor.scope)
    );
  }
  return NextResponse.json({ data: { invoices, count: invoices.length } });
}

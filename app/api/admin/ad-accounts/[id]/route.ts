export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getAdAccount, updateAdAccount, deleteAdAccount } from "@/lib/adAccounts";
import { requireDirectoryActor, findClientInScope } from "@/lib/api/requireAdmin";
import { inWorkspaceScope } from "@/lib/workspaces";


interface RouteContext {
  params: { id: string };
}


/** Edit an ad account (client link, vendor, fee, retainer, status, notes). */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const existing = await getAdAccount(params.id);
  // Out-of-scope accounts read as not-found (no cross-book id probing).
  if (!existing || !inWorkspaceScope(actor.scope, existing.workspace))
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changes: Parameters<typeof updateAdAccount>[1] = {};

  if ("userId" in body) {
    if (body.userId === null || body.userId === "") {
      changes.userId = null;
    } else if (typeof body.userId === "string") {
      const user = await findClientInScope(actor.scope, body.userId);
      if (!user)
        return NextResponse.json({ error: "Client not found" }, { status: 400 });
      changes.userId = user.id;
      // Keep the account in its client's book — assignment moves it.
      if (user.workspace !== existing.workspace) changes.workspace = user.workspace;
    }
  }
  if (typeof body.accountName === "string") {
    if (!body.accountName.trim())
      return NextResponse.json({ error: "accountName cannot be empty" }, { status: 400 });
    changes.accountName = body.accountName.trim();
  }
  if ("vendor" in body) changes.vendor = typeof body.vendor === "string" ? body.vendor : null;
  if ("platform" in body) changes.platform = typeof body.platform === "string" ? body.platform : null;
  if (typeof body.adSpendFeeBps === "number") changes.adSpendFeeBps = body.adSpendFeeBps;
  if (typeof body.monthlyRetainerCents === "number")
    changes.monthlyRetainerCents = body.monthlyRetainerCents;
  if (body.status === "active" || body.status === "inactive") changes.status = body.status;
  if ("notes" in body) changes.notes = typeof body.notes === "string" ? body.notes : null;

  // Billing-schedule controls.
  if (typeof body.billingPaused === "boolean") changes.billingPaused = body.billingPaused;
  if ("billingDay" in body)
    changes.billingDay = typeof body.billingDay === "number" ? body.billingDay : null;
  if (typeof body.leadDays === "number") changes.leadDays = body.leadDays;
  if ("extendUntil" in body)
    changes.extendUntil = typeof body.extendUntil === "string" ? body.extendUntil : null;
  if ("lastBilledOverride" in body)
    changes.lastBilledOverride =
      typeof body.lastBilledOverride === "string" ? body.lastBilledOverride : null;

  await updateAdAccount(params.id, changes);
  const updated = await getAdAccount(params.id);
  return NextResponse.json({ data: updated });
}

/** Remove an ad account. */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  const existing = await getAdAccount(params.id);
  if (!existing || !inWorkspaceScope(actor.scope, existing.workspace))
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const deleted = await deleteAdAccount(params.id);
  if (!deleted)
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

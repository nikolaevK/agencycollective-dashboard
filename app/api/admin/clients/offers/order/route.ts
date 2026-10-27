export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";
import { reorderOffers } from "@/lib/portalOffers";

/** Body: { ids: string[] } — the catalog in its new display order. */
export async function PUT(request: Request) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be an array of offer ids" }, { status: 400 });
  }
  await reorderOffers(ids as string[]);
  logAuditEvent({
    adminId: guard.actor.admin.id,
    adminUsername: guard.actor.admin.username,
    action: "offers.reorder",
    targetType: "portal_offer",
  }).catch(() => {});
  return NextResponse.json({ data: { ok: true } });
}

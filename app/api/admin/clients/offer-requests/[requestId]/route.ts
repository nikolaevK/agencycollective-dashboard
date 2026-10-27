export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findClientInScope, requireInternalActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";
import {
  OfferRequestConflictError,
  getOfferRequest,
  updateOfferRequest,
} from "@/lib/portalOffers";
import { isOfferRequestStatus } from "@/lib/portalOfferRules";

/** Body: { status?: new|contacted|won|lost, note?: string | null } — working a lead. */
export async function PATCH(request: Request, { params }: { params: { requestId: string } }) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const { admin, scope } = guard.actor;

  const lead = await getOfferRequest(params.requestId);
  // A lead of a client outside the actor's books reads as not found.
  if (!lead || !(await findClientInScope(scope, lead.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown; note?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (body.status !== undefined && !isOfferRequestStatus(body.status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 });
  }
  const changes = {
    status: body.status as typeof lead.status | undefined,
    note: body.note === undefined ? undefined : ((body.note as string | null)?.trim().slice(0, 2000) || null),
  };

  try {
    await updateOfferRequest(lead.id, changes, admin.displayName || admin.username);
  } catch (err) {
    if (err instanceof OfferRequestConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "client.offer_request_update",
    targetType: "client",
    targetId: lead.userId,
    details: JSON.stringify({ requestId: lead.id, offer: lead.offerTitle, from: lead.status, ...changes }),
  }).catch(() => {});
  return NextResponse.json({ data: await getOfferRequest(lead.id) });
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";
import { OfferValidationError, deleteOffer, updateOffer } from "@/lib/portalOffers";
import { normalizeOfferFields } from "@/lib/portalOfferRules";

interface RouteContext {
  params: { offerId: string };
}

/** Partial edit of a catalog offer (only the fields sent change). */
export async function PATCH(request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const { admin } = guard.actor;

  const fields = normalizeOfferFields(await request.json().catch(() => null), true);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });

  try {
    const offer = await updateOffer(params.offerId, fields.value);
    if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "offers.update",
      targetType: "portal_offer",
      targetId: offer.id,
      details: JSON.stringify({ title: offer.title, fields: Object.keys(fields.value) }),
    }).catch(() => {});
    return NextResponse.json({ data: offer });
  } catch (err) {
    if (err instanceof OfferValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** Removes the offer, its logo and view counts. Leads keep the offer's title. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const { admin } = guard.actor;

  if (!(await deleteOffer(params.offerId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "offers.delete",
    targetType: "portal_offer",
    targetId: params.offerId,
  }).catch(() => {});
  return NextResponse.json({ data: { ok: true } });
}

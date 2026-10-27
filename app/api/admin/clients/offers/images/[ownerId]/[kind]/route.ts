export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";
import { clearOfferImage, isImageKindFor, setOfferImage } from "@/lib/portalOffers";
import { OFFER_IMAGE_MAX_BYTES, detectOfferImageType } from "@/lib/portalOfferRules";

interface RouteContext {
  params: { ownerId: string; kind: string };
}

/**
 * Upload/replace an image of the portal cross-sell page: a service's `logo` or
 * `cover` (ownerId = offer id), or the page `hero` (ownerId = "page").
 * Multipart `file`, PNG/JPEG/WebP (type from the bytes).
 */
export async function POST(request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const { ownerId, kind } = params;
  if (!isImageKindFor(ownerId, kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const max = OFFER_IMAGE_MAX_BYTES[kind];
  // Refuse an oversized body before reading it (multipart adds a few hundred bytes).
  const declared = Number(request.headers.get("content-length"));
  if (!declared || declared > max + 64 * 1024) {
    return NextResponse.json({ error: `Image must be ${max / (1024 * 1024)} MB or smaller` }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  }
  if (file.size > max) {
    return NextResponse.json({ error: `Image must be ${max / (1024 * 1024)} MB or smaller` }, { status: 400 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const contentType = detectOfferImageType(data);
  if (!contentType) {
    return NextResponse.json({ error: "Image must be a PNG, JPEG or WebP" }, { status: 400 });
  }
  if (!(await setOfferImage(ownerId, kind, data, contentType))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  audit(guard.actor.admin, "offers.image_update", ownerId, kind);
  return NextResponse.json({ data: { ok: true } });
}

function audit(admin: { id: string; username: string }, action: string, ownerId: string, kind: string) {
  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action,
    targetType: ownerId === "page" ? "portal_offers_page" : "portal_offer",
    targetId: ownerId,
    details: JSON.stringify({ kind }),
  }).catch(() => {});
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  if (!isImageKindFor(params.ownerId, params.kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await clearOfferImage(params.ownerId, params.kind);
  audit(guard.actor.admin, "offers.image_delete", params.ownerId, params.kind);
  return NextResponse.json({ data: { ok: true } });
}

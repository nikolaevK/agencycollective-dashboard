export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { offersInternalOnly, readOfferImageUpload } from "@/lib/api/offerApi";
import { clearOfferImage, getOffer, setOfferImage } from "@/lib/portalOffers";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { id: string; kind: string };
}

const KINDS = ["logo", "cover"] as const;
type Kind = (typeof KINDS)[number];
const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Upload/replace a service's `logo` (≤1 MB) or `cover` (≤2 MB) — multipart
 * (file) or JSON ({ fileBase64 }); PNG / JPEG / WebP, typed from the bytes.
 * Answers with the new public URL (it changes on every upload).
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;
  if (!isKind(params.kind)) return fail("not_found", "Unknown image — use logo or cover", 404);

  try {
    const image = await readOfferImageUpload(request, params.kind);
    if (!image.ok) return image.response;
    if (!(await setOfferImage(params.id, params.kind, image.data, image.contentType))) {
      return fail("not_found", "Service not found", 404);
    }
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.image_update",
      targetType: "portal_offer",
      targetId: params.id,
      details: JSON.stringify({ kind: params.kind, size: image.data.length }),
    }).catch(() => {});
    const offer = await getOffer(params.id);
    const url = params.kind === "logo" ? offer?.logoUrl : offer?.coverUrl;
    return ok({ uploaded: true, kind: params.kind, url: url ?? null }, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/offers/[id]/images/[kind] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Remove a service's logo (back to its initials) or cover — requires `client:delete`. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;
  if (!isKind(params.kind)) return fail("not_found", "Unknown image — use logo or cover", 404);

  try {
    if (!(await getOffer(params.id))) return fail("not_found", "Service not found", 404);
    await clearOfferImage(params.id, params.kind);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.image_delete",
      targetType: "portal_offer",
      targetId: params.id,
      details: JSON.stringify({ kind: params.kind }),
    }).catch(() => {});
    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/offers/[id]/images/[kind] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

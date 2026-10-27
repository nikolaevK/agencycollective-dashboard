export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { offersInternalOnly, readOfferImageUpload } from "@/lib/api/offerApi";
import { PAGE_IMAGE_OWNER, clearOfferImage, getOfferPage, setOfferImage } from "@/lib/portalOffers";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Upload/replace the catalog header image (right of the header, hidden on
 * phones) — multipart (file) or JSON ({ fileBase64 }); PNG / JPEG / WebP ≤2 MB.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    const image = await readOfferImageUpload(request, "hero");
    if (!image.ok) return image.response;
    await setOfferImage(PAGE_IMAGE_OWNER, "hero", image.data, image.contentType);
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.image_update",
      targetType: "portal_offers_page",
      targetId: PAGE_IMAGE_OWNER,
      details: JSON.stringify({ kind: "hero", size: image.data.length }),
    }).catch(() => {});
    return ok({ uploaded: true, url: (await getOfferPage()).heroImageUrl }, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/offers/page/image error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Remove the header image — requires `client:delete`. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;
  const denied = offersInternalOnly(auth.token);
  if (denied) return denied;

  try {
    await clearOfferImage(PAGE_IMAGE_OWNER, "hero");
    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "offers.image_delete",
      targetType: "portal_offers_page",
      targetId: PAGE_IMAGE_OWNER,
      details: JSON.stringify({ kind: "hero" }),
    }).catch(() => {});
    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/offers/page/image error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

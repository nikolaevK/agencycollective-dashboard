import type { NextResponse } from "next/server";
import { tokenIsExternal, type ScopedTokenLike } from "@/lib/apiScopes";
import { OFFER_IMAGE_MAX_BYTES, detectOfferImageType, offerLifecycle } from "@/lib/portalOfferRules";
import { EMPTY_OFFER_STATS, type OfferStats, type PortalOffer } from "@/lib/portalOffers";
import { fetchPublicImage } from "@/lib/publicImageFetch";
import { readUpload } from "./files";
import { fail } from "./respond";

/**
 * Shared bits of the v1 portal cross-sell routes (/client/offers/**,
 * /client/offer-requests/**). The catalog is the agency's own services, so —
 * like the Welcome Kit — it's closed to workspace-restricted tokens whose
 * books exclude main (mirrors requireInternalActor on the admin side).
 */
export function offersInternalOnly(token: ScopedTokenLike): NextResponse | null {
  return tokenIsExternal(token)
    ? fail("resource_forbidden", "The portal cross-sell is internal-only for workspace-restricted tokens", 403)
    : null;
}

/**
 * Read an image for a logo, cover or the page header — multipart `file`,
 * JSON `fileBase64`, or JSON `imageUrl` (downloaded server-side from a public
 * https host; agents know a brand's logo URL but can't produce its bytes).
 * Size-capped per kind; the type comes from the bytes (PNG / JPEG / WebP —
 * the declared type is ignored).
 */
export async function readOfferImageUpload(
  request: Request,
  kind: keyof typeof OFFER_IMAGE_MAX_BYTES
): Promise<{ ok: true; data: Buffer; contentType: string } | { ok: false; response: NextResponse }> {
  const max = OFFER_IMAGE_MAX_BYTES[kind];
  const tooLarge = () => fail("payload_too_large", `Image too large (max ${max / (1024 * 1024)} MB)`, 413);
  const payload = await readUpload(request);
  let data = payload?.file?.buffer ?? null;
  const imageUrl = payload?.get("imageUrl");
  if (!data && imageUrl) {
    const fetched = await fetchPublicImage(imageUrl, max);
    if (!fetched.ok) {
      return { ok: false, response: fetched.tooLarge ? tooLarge() : fail("invalid_request", fetched.error, 400) };
    }
    data = fetched.data;
  }
  if (!data) return { ok: false, response: fail("invalid_request", "No image provided (send fileBase64 or imageUrl)", 400) };
  if (data.length > max) return { ok: false, response: tooLarge() };
  const contentType = detectOfferImageType(data);
  if (!contentType) {
    return {
      ok: false,
      response: fail("invalid_request", "Image must be a PNG, JPEG or WebP (SVG, GIF and HTML pages aren't accepted)", 400),
    };
  }
  return { ok: true, data, contentType };
}

/** API shape of a catalog service: the record + its lifecycle + engagement totals. */
export function offerDto(offer: PortalOffer, stats?: OfferStats) {
  // `accent` is kept in the table but unused by the design — not part of the API.
  const { accent, ...fields } = offer;
  void accent;
  return { ...fields, lifecycle: offerLifecycle(offer), stats: stats ?? EMPTY_OFFER_STATS };
}

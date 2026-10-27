export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { checkRate } from "@/lib/rateLimit";
import { getOffer, recordOfferView } from "@/lib/portalOffers";

/**
 * The signed-in client opened a service's detail page (portal → More from
 * Agency Collective). Counted per client + offer so the team knows what a
 * client has been looking at before a call.
 */
export async function POST(_request: Request, { params }: { params: { offerId: string } }) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  // Tracking spam guard (shared by views + link clicks): 60 a minute per client.
  if (!checkRate(`offer-track:${guard.user.id}`, 60, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  try {
    const offer = await getOffer(params.offerId);
    if (!offer?.active) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await recordOfferView(guard.user.id, offer.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[portal/offers view]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

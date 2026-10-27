export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { readJsonCapped } from "@/lib/api/readBodyCapped";
import {
  OfferRequestLimitError,
  createOfferRequest,
  getOffer,
  notifyOfferRequest,
} from "@/lib/portalOffers";
import { normalizeOfferRequest } from "@/lib/portalOfferRules";

/**
 * A client's Request Info / Book a Call on a service. Files a lead in the
 * dashboard (Client Directory → Cross-sell) and pushes a heads-up to the admins who can open it.
 * A repeat while the first is still open files nothing (`duplicate: true`).
 */
export async function POST(request: Request, { params }: { params: { offerId: string } }) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;

  const parsed = await readJsonCapped(request, 16 * 1024);
  if (!parsed.ok) {
    return parsed.reason === "too_large"
      ? NextResponse.json({ error: "Request body too large" }, { status: 413 })
      : NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = normalizeOfferRequest(parsed.value, user.email);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  try {
    const offer = await getOffer(params.offerId);
    if (!offer?.active) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { request: lead, duplicate } = await createOfferRequest({
      userId: user.id,
      offer,
      input: input.value,
    });
    if (!duplicate) waitUntil(notifyOfferRequest(offer, lead.id, user.workspace));
    return NextResponse.json({
      data: { id: lead.id, status: lead.status, createdAt: lead.createdAt, duplicate },
    });
  } catch (err) {
    if (err instanceof OfferRequestLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error("[portal/offers request]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

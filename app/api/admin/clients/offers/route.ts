export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";
import {
  EMPTY_OFFER_STATS,
  OfferValidationError,
  createOffer,
  createStarterOffers,
  getOfferStats,
  listOffers,
} from "@/lib/portalOffers";
import { normalizeOfferFields } from "@/lib/portalOfferRules";

/**
 * The portal "More from Agency Collective" catalog (Client Directory →
 * Cross-sell → Catalog). Internal admins only: these are the agency's own
 * services. GET = every offer (hidden ones too) + engagement totals.
 */
export async function GET() {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const [offers, stats] = await Promise.all([listOffers(), getOfferStats()]);
  return NextResponse.json({
    data: offers.map((o) => ({
      ...o,
      stats: stats.get(o.id) ?? EMPTY_OFFER_STATS,
    })),
  });
}

/** Create one offer, or `{ starter: true }` = the launch list as hidden drafts (empty catalog only). */
export async function POST(request: Request) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const { admin } = guard.actor;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.starter === true) {
    const created = await createStarterOffers();
    if (created > 0) {
      logAuditEvent({
        adminId: admin.id,
        adminUsername: admin.username,
        action: "offers.starter",
        targetType: "portal_offer",
        details: JSON.stringify({ created }),
      }).catch(() => {});
    }
    return NextResponse.json({ data: { created } });
  }
  const fields = normalizeOfferFields(body, false);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });

  try {
    const offer = await createOffer(fields.value);
    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "offers.create",
      targetType: "portal_offer",
      targetId: offer.id,
      details: JSON.stringify({ title: offer.title, active: offer.active }),
    }).catch(() => {});
    return NextResponse.json({ data: offer }, { status: 201 });
  } catch (err) {
    if (err instanceof OfferValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

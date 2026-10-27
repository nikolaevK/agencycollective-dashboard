export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";
import { getOfferPage, resetOfferPage, saveOfferPage, type OfferPage } from "@/lib/portalOffers";
import { DEFAULT_OFFER_PAGE, normalizeOfferPage } from "@/lib/portalOfferRules";

/**
 * Page design of the portal "More from Agency Collective" tab: sidebar name,
 * header copy (the header image goes through …/offers/images/page/hero) and
 * every label around the service cards. PUT replaces the overrides; blank
 * fields mean the default, null hides an optional element.
 */
function respond(page: OfferPage) {
  return NextResponse.json({ data: { ...page, defaults: DEFAULT_OFFER_PAGE } });
}

function audit(admin: { id: string; username: string }, action: string) {
  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action,
    targetType: "portal_offers_page",
  }).catch(() => {});
}

export async function GET() {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  return respond(await getOfferPage());
}

export async function PUT(request: Request) {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const overrides = normalizeOfferPage(await request.json().catch(() => null));
  if (!overrides.ok) return NextResponse.json({ error: overrides.error }, { status: 400 });
  const page = await saveOfferPage(overrides.value);
  audit(guard.actor.admin, "offers.page_update");
  return respond(page);
}

/** Reset to the default copy and drop the header image. */
export async function DELETE() {
  await ensureMigrated();
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const page = await resetOfferPage();
  audit(guard.actor.admin, "offers.page_reset");
  return respond(page);
}

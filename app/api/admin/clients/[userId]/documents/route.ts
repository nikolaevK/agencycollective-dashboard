export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { readDocumentsByBrand } from "@/lib/payoutDocuments";
import { normalizeBrandName } from "@/lib/payouts";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

/**
 * Invoices + project scopes for a client, pulled from the Payout DB's document
 * store by brand. Uses the explicit payout_brand link when set, else the
 * display name. Metadata only — downloads go through the existing
 * /api/admin/payouts/documents/[id] endpoint.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const user = guard.user;

  const brand = user.payoutBrand ?? user.displayName;
  let docs = await readDocumentsByBrand(brand);

  // Cross-book isolation: for a client outside the main book, a document
  // qualifies when it was filed under that book OR its brand EXACTLY matches
  // the client's payout-brand link. The link is internally managed (external
  // actors can't set it), so exact-link docs — deal-import scopes, Payout
  // Tracker uploads, pre-feature invoice sends, all stamped 'main' — are
  // agency-authorized for this client. Display-name FUZZY matches stay
  // confined to the client's own book, which is what closes the
  // colliding-name leak ("Glow" ⊄ "Inner Glow").
  if (user.workspace !== "main") {
    const linkNorm = user.payoutBrand ? normalizeBrandName(user.payoutBrand) : "";
    docs = docs.filter(
      (d) =>
        d.workspace === user.workspace ||
        (linkNorm !== "" && d.normalizedBrand === linkNorm)
    );
  }

  return NextResponse.json({
    data: {
      brand,
      invoices: docs.filter((d) => d.docType === "invoice"),
      scopes: docs.filter((d) => d.docType === "project_scope"),
    },
  });
}

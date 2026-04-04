export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findDeal } from "@/lib/deals";

/**
 * Client portal endpoint to get signing URL for embedded signing.
 * Requires u_sess (portal session). Verifies client owns the deal.
 */
export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  // Verify the logged-in client owns this deal
  const deal = await findDeal(dealId);
  if (!deal || !deal.clientUserId || deal.clientUserId !== session.userId) {
    return NextResponse.json({ data: null });
  }

  const contract = await findDealContractByDealId(dealId);
  if (!contract) return NextResponse.json({ data: null });

  // Only provide signing URL if contract is pending/sent (not yet signed)
  if (contract.status === "signed" || contract.status === "expired" || contract.status === "declined") {
    return NextResponse.json({
      data: {
        status: contract.status,
        signedAt: contract.signedAt,
        signingUrl: null,
      },
    });
  }

  return NextResponse.json({
    data: {
      status: contract.status,
      signingUrl: contract.signingUrl,
    },
  });
}

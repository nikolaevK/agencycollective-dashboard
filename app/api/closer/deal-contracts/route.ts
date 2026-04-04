export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findDeal } from "@/lib/deals";

export async function GET(req: NextRequest) {
  const session = getCloserSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  // Verify closer owns this deal
  const deal = await findDeal(dealId);
  if (!deal || deal.closerId !== session.closerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contract = await findDealContractByDealId(dealId);
  if (!contract) return NextResponse.json({ data: null });

  // Return only status info to closers
  return NextResponse.json({
    data: {
      status: contract.status,
      sentAt: contract.sentAt,
      signedAt: contract.signedAt,
    },
  });
}

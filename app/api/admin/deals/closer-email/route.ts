export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findDeal } from "@/lib/deals";
import { findCloser } from "@/lib/closers";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const deal = await findDeal(dealId);
  if (!deal) return NextResponse.json({ data: { closerEmail: null, additionalCcEmails: [] } });

  const closer = await findCloser(deal.closerId);
  return NextResponse.json({
    data: {
      closerEmail: closer?.email ?? null,
      additionalCcEmails: deal.additionalCcEmails ?? [],
    },
  });
}

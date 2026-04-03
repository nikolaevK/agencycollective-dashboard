export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findDealInvoiceByDealId } from "@/lib/dealInvoices";
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

  const invoice = await findDealInvoiceByDealId(dealId);
  if (!invoice) return NextResponse.json({ data: null });

  // Return only status info to closers, not full invoice data
  return NextResponse.json({
    data: {
      status: invoice.status,
      invoiceNumber: invoice.invoiceNumber,
      sentAt: invoice.sentAt,
    },
  });
}

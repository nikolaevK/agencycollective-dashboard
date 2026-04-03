export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoice, getDealInvoicePdf } from "@/lib/dealInvoices";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const invoice = await findDealInvoice(id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const pdfBuffer = await getDealInvoicePdf(id);
  if (!pdfBuffer || pdfBuffer.length === 0) {
    return NextResponse.json({ error: "No PDF stored" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoiceByDealId, findDealInvoice, updateDealInvoice } from "@/lib/dealInvoices";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const invoice = await findDealInvoiceByDealId(dealId);
  if (!invoice) return NextResponse.json({ data: null });

  return NextResponse.json({ data: invoice });
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, invoiceData, clientEmail } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const invoice = await findDealInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const changes: Record<string, string | number | null> = {};
    if (invoiceData !== undefined) {
      const serialized = typeof invoiceData === "string" ? invoiceData : JSON.stringify(invoiceData);
      if (serialized.length > 1_000_000) {
        return NextResponse.json({ error: "Invoice data too large" }, { status: 413 });
      }
      changes.invoiceData = serialized;
    }
    if (clientEmail !== undefined) {
      if (clientEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) || clientEmail.length > 254)) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      changes.clientEmail = clientEmail || null;
    }

    await updateDealInvoice(id, changes);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[deal-invoices PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

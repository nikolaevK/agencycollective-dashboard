export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoiceByDealId, generateInvoiceNumber } from "@/lib/dealInvoices";
import {
  findAdditionalInvoicesByDealId,
  findAdditionalInvoice,
  insertAdditionalInvoice,
  updateAdditionalInvoice,
  deleteAdditionalInvoice,
  countAdditionalInvoices,
} from "@/lib/dealAdditionalInvoices";
import type { InvoiceData } from "@/types/invoice";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const invoices = await findAdditionalInvoicesByDealId(dealId);
  return NextResponse.json({ data: invoices });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { dealId } = body;
    if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 });

    const primaryInvoice = await findDealInvoiceByDealId(dealId);
    if (!primaryInvoice) {
      return NextResponse.json({ error: "Primary invoice not found" }, { status: 404 });
    }

    const existing = await countAdditionalInvoices(dealId);
    if (existing >= 10) {
      return NextResponse.json({ error: "Maximum of 10 additional invoices per deal" }, { status: 400 });
    }

    const invoiceNumber = await generateInvoiceNumber();
    const cloned: InvoiceData = JSON.parse(JSON.stringify(primaryInvoice.invoiceData));
    cloned.details.invoiceNumber = invoiceNumber;

    const sortOrder = await countAdditionalInvoices(dealId);
    const id = crypto.randomUUID();

    await insertAdditionalInvoice({
      id,
      dealId,
      invoiceNumber,
      invoiceData: JSON.stringify(cloned),
      sortOrder,
      createdBy: session.adminId,
    });

    return NextResponse.json({
      data: {
        id,
        dealId,
        invoiceNumber,
        invoiceData: cloned,
        status: "draft",
        sortOrder,
        hasPdf: false,
        createdBy: session.adminId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[deal-invoices/additional POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, invoiceData } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const invoice = await findAdditionalInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const changes: Record<string, string | number | null> = {};
    if (invoiceData !== undefined) {
      const serialized = typeof invoiceData === "string" ? invoiceData : JSON.stringify(invoiceData);
      if (serialized.length > 1_000_000) {
        return NextResponse.json({ error: "Invoice data too large" }, { status: 413 });
      }
      changes.invoiceData = serialized;
    }

    await updateAdditionalInvoice(id, changes);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[deal-invoices/additional PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const deleted = await deleteAdditionalInvoice(id);
  if (!deleted) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

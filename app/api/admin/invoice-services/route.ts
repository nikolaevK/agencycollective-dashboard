export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { readInvoiceServices, insertInvoiceService, updateInvoiceService, deleteInvoiceService } from "@/lib/invoiceServices";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const services = await readInvoiceServices();
  return NextResponse.json({ data: services });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, description, rate, dealServiceKey, sortOrder } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await insertInvoiceService({
      id,
      name: name.trim(),
      description: typeof description === "string" ? description : "",
      rate: typeof rate === "number" ? Math.round(rate) : 0,
      dealServiceKey: typeof dealServiceKey === "string" && dealServiceKey.trim() ? dealServiceKey.trim() : null,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    console.error("[invoice-services POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, ...changes } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sanitized: Record<string, string | number | null> = {};
    if (changes.name !== undefined) sanitized.name = String(changes.name).trim();
    if (changes.description !== undefined) sanitized.description = String(changes.description);
    if (changes.rate !== undefined) sanitized.rate = Math.round(Number(changes.rate) || 0);
    if (changes.dealServiceKey !== undefined) sanitized.dealServiceKey = changes.dealServiceKey ? String(changes.dealServiceKey).trim() : null;
    if (changes.sortOrder !== undefined) sanitized.sortOrder = Number(changes.sortOrder) || 0;

    await updateInvoiceService(id, sanitized);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invoice-services PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const deleted = await deleteInvoiceService(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

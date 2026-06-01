export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { findAdAccountInvoice, markInvoiceUnpaid } from "@/lib/adAccountInvoices";

interface RouteContext {
  params: { invoiceId: string };
}

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  return admin ? { admin, session } : null;
}

/** Admin marks a sent ad-account invoice as unpaid (historical marker only). */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  if (!invoice)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status !== "sent")
    return NextResponse.json(
      { error: `Cannot mark unpaid — invoice is ${invoice.status}` },
      { status: 409 }
    );

  let reason: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    if (typeof body.reason === "string") {
      const trimmed = body.reason.trim();
      reason = trimmed ? trimmed.slice(0, 500) : null;
    }
  } catch {
    // optional
  }

  let updated = false;
  try {
    updated = await markInvoiceUnpaid(params.invoiceId, auth.session.adminId, reason);
  } catch (err) {
    console.error("[ad-account-invoice/mark-unpaid]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!updated)
    return NextResponse.json(
      { error: "Invoice state changed — refresh and try again" },
      { status: 409 }
    );

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import {
  findRebillInvoice,
  markInvoiceUnpaid,
} from "@/lib/clientRebillInvoices";

interface RouteContext {
  params: { userId: string; invoiceId: string };
}

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  return admin ? { admin, session } : null;
}

/**
 * Admin marks a sent re-bill invoice as unpaid for that period. Historical
 * marker only — does NOT advance the re-bill schedule. The client returns to
 * the normal `due`/`overdue` flow until a payout lands or the admin
 * pauses/extends/resends as a separate, deliberate action (matches user
 * intent: 'we know this period went unpaid; deal with the next steps
 * explicitly').
 *
 * Only `sent` invoices can be marked unpaid — re-marking a paid or already
 * unpaid invoice is a no-op (UPDATE … WHERE status='sent' in the lib).
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAdminSession();
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findRebillInvoice(params.invoiceId);
  if (!invoice)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.userId !== params.userId)
    return NextResponse.json(
      { error: "Invoice does not belong to this client" },
      { status: 400 }
    );
  if (invoice.status !== "sent")
    return NextResponse.json(
      { error: `Cannot mark unpaid — invoice is ${invoice.status}` },
      { status: 409 }
    );

  let reason: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      reason?: unknown;
    };
    if (typeof body.reason === "string") {
      const trimmed = body.reason.trim();
      reason = trimmed ? trimmed.slice(0, 500) : null;
    }
  } catch {
    // Missing body is fine — reason is optional.
  }

  let updated = false;
  try {
    updated = await markInvoiceUnpaid(params.invoiceId, auth.session.adminId, reason);
  } catch (err) {
    console.error("[rebill-invoice/mark-unpaid]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // 0 rows affected = the row's status changed between the pre-flight read
  // and the UPDATE (auto-promotion to paid, or supersede by a concurrent
  // re-send). Surface as conflict so the client refetches.
  if (!updated)
    return NextResponse.json(
      { error: "Invoice state changed — refresh and try again" },
      { status: 409 }
    );

  return NextResponse.json({ success: true });
}

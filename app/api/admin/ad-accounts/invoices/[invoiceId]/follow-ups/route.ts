export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findAdAccountInvoice } from "@/lib/adAccountInvoices";
import {
  listFollowUps,
  parseFollowUpInput,
  recordInvoiceFollowUp,
} from "@/lib/invoiceFollowUps";
import { requireDirectoryActor, findAdInvoiceAccountInScope } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { invoiceId: string };
}

/** Follow-up history of one ad-account invoice, newest first. */
export async function GET(_req: Request, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  if (!invoice || !(await findAdInvoiceAccountInScope(actor.scope, invoice)).ok)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const followUps = await listFollowUps("ad_account", invoice.id);
  return NextResponse.json({ data: { followUps } });
}

/**
 * Follow up on a sent ad-account invoice: email a reminder (re-attaching the
 * PDF filed at send time) or log a call/message/note. The invoice row is never
 * modified or superseded — same contract as client re-bill follow-ups.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  // Workspace gate: out-of-book accounts read as not-found; free invoices and
  // orphans of a deleted account are internal-only.
  if (!invoice || !(await findAdInvoiceAccountInScope(actor.scope, invoice)).ok)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const parsed = parseFollowUpInput(
    await req.json().catch(() => null),
    invoice.recipientEmail
  );
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await recordInvoiceFollowUp({
      target: {
        kind: "ad_account",
        id: invoice.id,
        status: invoice.status,
        invoiceNumber: invoice.invoiceNumber,
        amountCents: invoice.amountCents,
        sentAt: invoice.sentAt,
        styleProfileId: invoice.styleProfileId,
        payoutDocumentId: invoice.payoutDocumentId,
      },
      input: parsed.value,
      actor: { id: actor.admin.id, name: actor.admin.username },
      // Same rule as /invoices/[id]/document: the PDF id on the row was
      // written server-side at send/register time, so an actor who can reach
      // the invoice can reach (and re-send) its own filed PDF.
      canAttach: () => true,
    });
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: result.status });

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "ad_account_invoice.follow_up",
      targetType: "ad_account_invoice",
      targetId: invoice.id,
      details: JSON.stringify({
        adAccountId: invoice.adAccountId,
        channel: result.followUp.channel,
        attachedPdf: result.followUp.attachedPdf,
        ccCount: result.followUp.ccEmails.length,
      }),
    }).catch(() => {});

    return NextResponse.json({ data: { followUp: result.followUp } });
  } catch (err) {
    console.error("[ad-account-invoice/follow-up]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

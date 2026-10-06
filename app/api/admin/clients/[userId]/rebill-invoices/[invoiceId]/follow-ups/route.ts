export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findRebillInvoice } from "@/lib/clientRebillInvoices";
import {
  listFollowUps,
  parseFollowUpInput,
  recordInvoiceFollowUp,
} from "@/lib/invoiceFollowUps";
import { isDocumentVisibleToClient } from "@/lib/payoutDocuments";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { userId: string; invoiceId: string };
}

/** Follow-up history of one client re-bill invoice, newest first. */
export async function GET(_req: Request, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  const invoice = await findRebillInvoice(params.invoiceId);
  if (!invoice || invoice.userId !== params.userId)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const followUps = await listFollowUps("client_rebill", invoice.id);
  return NextResponse.json({ data: { followUps } });
}

/**
 * Follow up on a sent re-bill invoice: email a reminder (re-attaching the PDF
 * filed at send time) or log a call/message/note. The invoice itself is never
 * modified — no supersede, no new number, sent date/cycle/amount unchanged —
 * so its lifecycle (awaiting → paid via the Payout DB, manual overrides)
 * carries on exactly as before.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const { actor, user } = guard;

  const invoice = await findRebillInvoice(params.invoiceId);
  if (!invoice || invoice.userId !== params.userId)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const parsed = parseFollowUpInput(
    await req.json().catch(() => null),
    invoice.recipientEmail ?? user.email
  );
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await recordInvoiceFollowUp({
      target: {
        kind: "client_rebill",
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
      canAttach: (doc) => isDocumentVisibleToClient(user, doc),
    });
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: result.status });

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "client_rebill_invoice.follow_up",
      targetType: "client_rebill_invoice",
      targetId: invoice.id,
      details: JSON.stringify({
        userId: params.userId,
        channel: result.followUp.channel,
        attachedPdf: result.followUp.attachedPdf,
        ccCount: result.followUp.ccEmails.length,
      }),
    }).catch(() => {});

    return NextResponse.json({ data: { followUp: result.followUp } });
  } catch (err) {
    console.error("[rebill-invoice/follow-up]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

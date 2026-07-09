export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { createRebillInvoice } from "@/lib/clientRebillInvoices";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Register an invoice sent OUTSIDE the app into the re-bill lifecycle (no
 * email). Body: { invoiceNumber, cycleAnchor (yyyy-mm-dd), amountCents,
 * sentAt?, recipientEmail?, payoutDocumentId? }. Mirrors the dashboard's
 * register route validation exactly.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const rawInvoice =
      typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
    const invoiceNumber = rawInvoice.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);
    if (!invoiceNumber) return fail("invalid_request", "invoiceNumber is required", 400);

    // Must be a REAL calendar date — drives cycle grouping + auto-paid match.
    const cycleAnchor = typeof body.cycleAnchor === "string" ? body.cycleAnchor.trim() : "";
    if (!DATE_RE.test(cycleAnchor)) {
      return fail("invalid_request", "cycleAnchor must be yyyy-mm-dd", 400);
    }
    const cycleProbe = new Date(`${cycleAnchor}T00:00:00Z`);
    if (isNaN(cycleProbe.getTime()) || cycleProbe.toISOString().slice(0, 10) !== cycleAnchor) {
      return fail("invalid_request", "cycleAnchor is not a real calendar date", 400);
    }

    const rawAmount = Number(body.amountCents);
    if (!Number.isFinite(rawAmount) || rawAmount < 0) {
      return fail("invalid_request", "amountCents must be a non-negative number", 400);
    }
    const amountCents = Math.min(Math.round(rawAmount), 1_000_000_000);

    let sentAt: string | undefined;
    if (body.sentAt !== undefined && body.sentAt !== null && body.sentAt !== "") {
      if (typeof body.sentAt !== "string" || !ISO_LIKE_RE.test(body.sentAt)) {
        return fail("invalid_request", "sentAt must be ISO-like (yyyy-mm-dd or timestamp)", 400);
      }
      if (DATE_RE.test(body.sentAt)) {
        sentAt = `${body.sentAt}T12:00:00.000Z`;
      } else {
        const d = new Date(body.sentAt);
        if (isNaN(d.getTime())) return fail("invalid_request", "sentAt is not a valid date", 400);
        sentAt = d.toISOString();
      }
    }

    let recipientEmail: string | null = null;
    if (body.recipientEmail !== undefined && body.recipientEmail !== null && body.recipientEmail !== "") {
      if (typeof body.recipientEmail !== "string") {
        return fail("invalid_request", "Invalid recipientEmail", 400);
      }
      const v = body.recipientEmail.trim();
      if (v && (!EMAIL_RE.test(v) || v.length > 254)) {
        return fail("invalid_request", "Invalid recipientEmail", 400);
      }
      recipientEmail = v || null;
    }

    const payoutDocumentId =
      typeof body.payoutDocumentId === "string" && body.payoutDocumentId
        ? body.payoutDocumentId
        : null;

    const actor = tokenAuditActor(auth.token);
    const invoice = await createRebillInvoice({
      userId: params.id,
      invoiceNumber,
      payoutDocumentId,
      cycleAnchor,
      amountCents,
      recipientEmail,
      sentByAdminId: actor.adminId,
      sentAt,
    });

    logAuditEvent({
      ...actor,
      action: "client.invoice_register",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ invoiceNumber, cycleAnchor, amountCents }),
    }).catch(() => {});

    return ok(invoice, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients/[id]/billing/invoices/register error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

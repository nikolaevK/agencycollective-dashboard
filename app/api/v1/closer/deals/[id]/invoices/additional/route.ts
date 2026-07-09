export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findDeal } from "@/lib/deals";
import { generateInvoiceNumber } from "@/lib/dealInvoices";
import {
  insertAdditionalInvoice,
  findAdditionalInvoice,
  deleteAdditionalInvoice,
  countAdditionalInvoices,
} from "@/lib/dealAdditionalInvoices";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

async function gateDeal(
  auth: { token: Parameters<typeof tokenHasResource>[0] },
  dealId: string
) {
  const deal = await findDeal(dealId);
  if (!deal) return { error: fail("not_found", "Deal not found", 404) };
  if (!tokenHasResource(auth.token, "closer", deal.closerId)) {
    return {
      error: fail("resource_forbidden", "This token is not allowed to access this closer", 403),
    };
  }
  return { deal };
}

/** Create an additional invoice draft: { invoiceData (object) }. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateDeal(auth, params.id);
    if (gate.error) return gate.error;

    const body = await readJsonBody(request);
    if (!body || typeof body.invoiceData !== "object" || body.invoiceData === null) {
      return fail("invalid_request", "Body must include an `invoiceData` object", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const id = crypto.randomUUID();
    const invoiceNumber = await generateInvoiceNumber();
    const sortOrder = await countAdditionalInvoices(params.id);
    await insertAdditionalInvoice({
      id,
      dealId: params.id,
      invoiceNumber,
      invoiceData: JSON.stringify(body.invoiceData),
      status: "draft",
      sortOrder,
      createdBy: actor.adminId,
    });

    logAuditEvent({
      ...actor,
      action: "deal_invoice.create_additional",
      targetType: "deal_invoice",
      targetId: id,
      details: JSON.stringify({ dealId: params.id, invoiceNumber }),
    }).catch(() => {});

    const record = await findAdditionalInvoice(id);
    return ok(record, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/deals/[id]/invoices/additional error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Delete an additional invoice: ?invoiceId=<id>. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateDeal(auth, params.id);
    if (gate.error) return gate.error;

    const invoiceId = new URL(request.url).searchParams.get("invoiceId");
    if (!invoiceId) return fail("invalid_request", "invoiceId query param is required", 400);

    const invoice = await findAdditionalInvoice(invoiceId);
    if (!invoice || invoice.dealId !== params.id) {
      return fail("not_found", "Invoice not found on this deal", 404);
    }

    await deleteAdditionalInvoice(invoiceId);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_invoice.delete_additional",
      targetType: "deal_invoice",
      targetId: invoiceId,
      details: JSON.stringify({ dealId: params.id, invoiceNumber: invoice.invoiceNumber }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/deals/[id]/invoices/additional error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

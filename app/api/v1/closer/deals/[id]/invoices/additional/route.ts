export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findDeal } from "@/lib/deals";
import { findDealInvoiceByDealId, generateInvoiceNumber } from "@/lib/dealInvoices";
import {
  insertAdditionalInvoice,
  findAdditionalInvoice,
  deleteAdditionalInvoice,
  countAdditionalInvoices,
} from "@/lib/dealAdditionalInvoices";
import { logAuditEvent } from "@/lib/auditLog";
import { applyInvoiceSpec, normalizeApiInvoiceData, parseInvoiceSpec } from "@/lib/invoice/invoiceSpec";

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

/**
 * Create an additional invoice draft (a person sends it from the deal's
 * invoice drawer): { invoiceData? (object), invoice? (InvoiceSpec, CENTS) }.
 * With only `invoice`, it starts from a copy of the deal's primary invoice —
 * same as "+ Invoice" in the drawer. Totals are recomputed and the printed
 * number is the allocated one.
 */
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
    const hasData = !!body && typeof body.invoiceData === "object" && body.invoiceData !== null;
    const hasSpec = !!body && typeof body.invoice === "object" && body.invoice !== null;
    if (!body || (!hasData && !hasSpec)) {
      return fail("invalid_request", "Body must include an `invoiceData` object or an `invoice` spec", 400);
    }
    if (hasData && JSON.stringify(body.invoiceData).length > 1_000_000) {
      return fail("payload_too_large", "invoiceData is too large", 413);
    }

    // Same rules as the dashboard's "+ Invoice".
    const primary = await findDealInvoiceByDealId(params.id);
    if (!primary) return fail("invalid_request", "This deal has no primary invoice yet (deal must be closed)", 400);
    if ((await countAdditionalInvoices(params.id)) >= 10) {
      return fail("invalid_request", "Maximum of 10 additional invoices per deal", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const id = crypto.randomUUID();
    const invoiceNumber = await generateInvoiceNumber();

    const norm = normalizeApiInvoiceData(hasData ? body.invoiceData : primary.invoiceData, invoiceNumber);
    if (!norm.ok) return fail("invalid_request", norm.error, 400);
    let data = norm.value;
    if (hasSpec) {
      const spec = parseInvoiceSpec(body.invoice);
      if (!spec.ok) return fail("invalid_request", spec.error, 400);
      // New lines on a copy of the primary are a new invoice — the primary's
      // discount belonged to the primary's lines, so it doesn't carry over
      // unless the spec says so.
      const value = !hasData && spec.value.items && spec.value.discount === undefined
        ? { ...spec.value, discount: null }
        : spec.value;
      data = applyInvoiceSpec(data, value);
    }

    const sortOrder = await countAdditionalInvoices(params.id);
    await insertAdditionalInvoice({
      id,
      dealId: params.id,
      invoiceNumber,
      invoiceData: JSON.stringify(data),
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

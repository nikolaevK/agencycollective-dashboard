export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, paginate, readJsonBody } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import {
  readDeals,
  insertDeal,
  sanitizeCcEmails,
  type DealRecord,
  type DealStatus,
} from "@/lib/deals";
import { findCloser } from "@/lib/closers";
import { isSetterTier } from "@/lib/appointments";
import { getDealInvoiceStatuses } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";
import { logAuditEvent } from "@/lib/auditLog";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: DealStatus[] = [
  "closed",
  "not_closed",
  "pending_signature",
  "rescheduled",
  "follow_up",
];
/** Deal values are integer CENTS throughout v1 ($10M cap). */
const MAX_DEAL_VALUE_CENTS = 10_000_000 * 100;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * List deals. Filters: ?since&until (yyyy-mm-dd), ?status, ?closerId.
 * Paginated; resource-scoped to the token's allowed closers. Each item
 * carries invoiceStatus/contractStatus badges (batched lookups).
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get("since");
    const untilRaw = url.searchParams.get("until");
    const statusRaw = url.searchParams.get("status");
    const closerId = url.searchParams.get("closerId");

    const since = sinceRaw && DATE_RE.test(sinceRaw) ? sinceRaw : undefined;
    const until = untilRaw && DATE_RE.test(untilRaw) ? untilRaw : undefined;
    const status =
      statusRaw && VALID_STATUSES.includes(statusRaw as DealStatus)
        ? (statusRaw as DealStatus)
        : undefined;

    let deals = await readDeals({ since, until, status });
    const allowed = allowedResourceIds(auth.token, "closer");
    if (allowed) deals = deals.filter((d) => allowed.includes(d.closerId));
    if (closerId) deals = deals.filter((d) => d.closerId === closerId);

    const { items, pagination } = paginate(deals, parsePagination(url));

    const dealIds = items.map((d) => d.id);
    const [invoiceStatuses, contractStatuses] = await Promise.all([
      getDealInvoiceStatuses(dealIds),
      getDealContractStatuses(dealIds),
    ]);
    const enriched = items.map((d) => ({
      ...d,
      invoiceStatus: invoiceStatuses[d.id]?.status ?? null,
      invoiceNumber: invoiceStatuses[d.id]?.invoiceNumber ?? null,
      contractStatus: contractStatuses[d.id]?.status ?? null,
    }));

    return okList(enriched, pagination);
  } catch (err) {
    console.error("GET /api/v1/closer/deals error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Create a deal. Body: { closerId, clientName, dealValue (int cents),
 * status?, clientEmail?, serviceCategory?, industry?, closingDate?, notes?,
 * paymentType?, brandName?, website?, paidStatus?, additionalCcEmails?,
 * setterId?, setterTier?, noRetainer?, googleEventId? }.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const closerId = String(body.closerId ?? "").trim();
    const clientName = String(body.clientName ?? "").trim();
    if (!closerId || !clientName) {
      return fail("invalid_request", "closerId and clientName are required", 400);
    }
    if (!(await findCloser(closerId))) {
      return fail("invalid_request", "Unknown closerId", 400);
    }
    // Resource gate on the deal's owning closer.
    const allowed = allowedResourceIds(auth.token, "closer");
    if (allowed && !allowed.includes(closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }

    const dealValue = Number(body.dealValue ?? 0);
    if (!Number.isInteger(dealValue) || dealValue < 0 || dealValue > MAX_DEAL_VALUE_CENTS) {
      return fail("invalid_request", "dealValue must be an integer amount in cents", 400);
    }
    const status =
      body.status != null ? (String(body.status) as DealStatus) : "closed";
    if (!VALID_STATUSES.includes(status)) {
      return fail("invalid_request", "Invalid status", 400);
    }
    const paidStatus = body.paidStatus != null ? String(body.paidStatus) : "unpaid";
    if (paidStatus !== "paid" && paidStatus !== "unpaid") {
      return fail("invalid_request", "Invalid paidStatus", 400);
    }
    let setterTier: DealRecord["setterTier"] = null;
    if (body.setterTier != null && body.setterTier !== "") {
      if (!isSetterTier(body.setterTier)) {
        return fail("invalid_request", "Invalid setter tier", 400);
      }
      setterTier = body.setterTier;
    }
    const setterId = body.setterId ? String(body.setterId).trim() : null;
    if (setterId && !(await findCloser(setterId))) {
      return fail("invalid_request", "Unknown setterId", 400);
    }
    const closingDate = body.closingDate ? String(body.closingDate).trim() : null;
    if (closingDate && !DATE_RE.test(closingDate)) {
      return fail("invalid_request", "closingDate must be yyyy-mm-dd", 400);
    }

    const nowIso = new Date().toISOString();
    const deal: DealRecord = {
      id: crypto.randomUUID(),
      closerId,
      setterId,
      clientName,
      clientUserId: body.clientUserId ? String(body.clientUserId).trim() : null,
      clientEmail: body.clientEmail ? String(body.clientEmail).trim() : null,
      dealValue,
      serviceCategory: body.serviceCategory ? String(body.serviceCategory).trim() : null,
      industry: body.industry ? String(body.industry).trim() : null,
      closingDate,
      status,
      showStatus:
        body.showStatus === "showed" || body.showStatus === "no_show"
          ? body.showStatus
          : null,
      notes: body.notes ? String(body.notes).trim() : null,
      googleEventId: body.googleEventId ? String(body.googleEventId).trim() : null,
      paymentType: body.paymentType ? String(body.paymentType).trim() : "local",
      brandName: body.brandName ? String(body.brandName).trim() : null,
      website: body.website ? String(body.website).trim() : null,
      paidStatus,
      additionalCcEmails: sanitizeCcEmails(body.additionalCcEmails),
      setterTier,
      noRetainer: Boolean(body.noRetainer),
      setterOverride: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await insertDeal(deal);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal.create",
      targetType: "deal",
      targetId: deal.id,
      details: JSON.stringify({ clientName, closerId, dealValue, status }),
    }).catch(() => {});

    return ok(deal, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/deals error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

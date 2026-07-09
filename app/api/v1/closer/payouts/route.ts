export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, paginate, readJsonBody } from "@/lib/api/respond";
import { readPayoutsByMonth, insertPayout, type PayoutRecord } from "@/lib/payouts";
import { parsePayoutFields } from "@/lib/api/payoutInput";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** List payouts for one month: ?month&year (default: current). Paginated. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const now = new Date();
    const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);
    const year = Number(url.searchParams.get("year") ?? now.getFullYear());
    if (
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2000 || year > 2100
    ) {
      return fail("invalid_request", "Invalid month or year", 400);
    }

    const payouts = await readPayoutsByMonth(month, year);
    const { items, pagination } = paginate(payouts, parsePagination(url));
    return okList(items, pagination);
  } catch (err) {
    console.error("GET /api/v1/closer/payouts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Create a payout. Body: { brandName (required), payoutMonth?, payoutYear?
 * (default current), amountDue?/amountPaid? (int cents), ... }.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const parsed = parsePayoutFields(body);
    if ("error" in parsed && parsed.error) return fail("invalid_request", parsed.error, 400);
    const changes = "changes" in parsed ? parsed.changes : {};

    if (!changes.brandName) {
      return fail("invalid_request", "brandName is required", 400);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const payout: PayoutRecord = {
      id: crypto.randomUUID(),
      payoutMonth: changes.payoutMonth ?? now.getMonth() + 1,
      payoutYear: changes.payoutYear ?? now.getFullYear(),
      dateJoined: changes.dateJoined ?? null,
      firstDayAdSpend: changes.firstDayAdSpend ?? null,
      brandName: changes.brandName,
      vertical: changes.vertical ?? null,
      pointOfContact: changes.pointOfContact ?? null,
      service: changes.service ?? null,
      isSigned: changes.isSigned ?? false,
      isPaid: changes.isPaid ?? false,
      addedToSlack: changes.addedToSlack ?? false,
      amountDue: changes.amountDue ?? 0,
      amountPaid: changes.amountPaid ?? 0,
      paymentNotes: changes.paymentNotes ?? null,
      salesRep: changes.salesRep ?? null,
      payDistributed: changes.payDistributed ?? "No",
      payDistributedDate: changes.payDistributedDate ?? null,
      commissionSplit: changes.commissionSplit ?? false,
      splitDetails: changes.splitDetails ?? [],
      referral: changes.referral ?? null,
      referralPct: changes.referralPct ?? null,
      sourceDealId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await insertPayout(payout);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "payout.create",
      targetType: "payout",
      targetId: payout.id,
      details: JSON.stringify({
        brandName: payout.brandName,
        month: payout.payoutMonth,
        year: payout.payoutYear,
        amountDue: payout.amountDue,
      }),
    }).catch(() => {});

    return ok(payout, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/payouts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

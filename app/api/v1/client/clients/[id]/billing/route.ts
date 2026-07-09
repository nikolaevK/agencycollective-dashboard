export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { getClientDetail } from "@/lib/clientDirectory";
import { upsertClientBilling, type ClientBillingInput } from "@/lib/clientBilling";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Billing config + computed schedule + payment history for one client. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const detail = await getClientDetail(params.id);
  if (!detail) return fail("not_found", "Client not found", 404);

  return ok({
    billing: detail.row.billing,
    schedule: detail.row.schedule,
    joinedAt: detail.row.joinedAt,
    payoutBrand: detail.row.payoutBrand,
    payoutMrr: detail.row.payoutMrr,
    totalRevenue: detail.row.totalRevenue,
    history: detail.history,
    activeSentInvoice: detail.row.activeSentInvoice,
  });
}

/** Update billing controls (mirrors the dashboard route's validation). */
export async function PATCH(
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

    const changes: ClientBillingInput = {};
    if (body.cadence !== undefined) changes.cadence = String(body.cadence);
    if (body.billingDay !== undefined) {
      const n = Number(body.billingDay);
      changes.billingDay =
        body.billingDay === null || !Number.isFinite(n)
          ? null
          : Math.min(31, Math.max(1, Math.trunc(n)));
    }
    if (body.paused !== undefined) changes.paused = Boolean(body.paused);
    if (body.pauseReason !== undefined) {
      changes.pauseReason = body.pauseReason ? String(body.pauseReason).slice(0, 500) : null;
    }
    if (body.extendUntil !== undefined) {
      changes.extendUntil = body.extendUntil ? String(body.extendUntil) : null;
    }
    if (body.lastRebilledOverride !== undefined) {
      changes.lastRebilledOverride = body.lastRebilledOverride
        ? String(body.lastRebilledOverride)
        : null;
    }
    if (body.mrrMonthOverride !== undefined) {
      const v = body.mrrMonthOverride ? String(body.mrrMonthOverride) : null;
      if (v !== null && !/^\d{4}-\d{2}$/.test(v)) {
        return fail("invalid_request", "mrrMonthOverride must be 'yyyy-mm' or null", 400);
      }
      changes.mrrMonthOverride = v;
    }
    if (body.leadDays !== undefined) {
      changes.leadDays = Math.max(0, Number(body.leadDays) || 0);
    }
    if (body.settingsNotes !== undefined) {
      changes.settingsNotes = body.settingsNotes ? String(body.settingsNotes).slice(0, 5000) : null;
    }

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await upsertClientBilling(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.billing_update",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ fields: Object.keys(changes) }),
    }).catch(() => {});

    const detail = await getClientDetail(params.id);
    return ok({
      billing: detail?.row.billing ?? null,
      schedule: detail?.row.schedule ?? null,
    });
  } catch (err) {
    console.error("PATCH /api/v1/client/clients/[id]/billing error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

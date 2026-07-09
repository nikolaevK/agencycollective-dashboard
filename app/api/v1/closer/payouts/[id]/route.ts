export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findPayout, updatePayout, deletePayout } from "@/lib/payouts";
import { parsePayoutFields } from "@/lib/api/payoutInput";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const payout = await findPayout(params.id);
  if (!payout) return fail("not_found", "Payout not found", 404);
  return ok(payout);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findPayout(params.id);
    if (!existing) return fail("not_found", "Payout not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const parsed = parsePayoutFields(body);
    if ("error" in parsed && parsed.error) return fail("invalid_request", parsed.error, 400);
    const changes = "changes" in parsed ? parsed.changes : {};

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updatePayout(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "payout.update",
      targetType: "payout",
      targetId: params.id,
      details: JSON.stringify({ fields: Object.keys(changes) }),
    }).catch(() => {});

    const updated = await findPayout(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/closer/payouts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findPayout(params.id);
    if (!existing) return fail("not_found", "Payout not found", 404);

    await deletePayout(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "payout.delete",
      targetType: "payout",
      targetId: params.id,
      details: JSON.stringify({ brandName: existing.brandName }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/payouts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

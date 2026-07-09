export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import {
  getAdAccount,
  updateAdAccount,
  deleteAdAccount,
  type UpdateAdAccountInput,
  type AdAccount,
} from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";
import type { ApiTokenRecord } from "@/lib/apiTokens";
import type { NextResponse } from "next/server";

export function OPTIONS() {
  return corsPreflight();
}

/** Attached accounts are gated by their client; unattached are scope-only. */
function gateAccount(token: ApiTokenRecord, account: AdAccount): NextResponse | null {
  if (!tokenHasResource(token, "client", account.userId)) {
    return fail("resource_forbidden", "This token is not allowed to access this client", 403);
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  const account = await getAdAccount(params.id);
  if (!account) return fail("not_found", "Ad account not found", 404);
  const gate = gateAccount(auth.token, account);
  if (gate) return gate;
  return ok(account);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const account = await getAdAccount(params.id);
    if (!account) return fail("not_found", "Ad account not found", 404);
    const gate = gateAccount(auth.token, account);
    if (gate) return gate;

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: UpdateAdAccountInput = {};
    if (body.accountName !== undefined) {
      const accountName = String(body.accountName).trim();
      if (!accountName) return fail("invalid_request", "accountName cannot be empty", 400);
      changes.accountName = accountName;
    }
    if (body.userId !== undefined) {
      if (body.userId === null || String(body.userId).trim() === "") {
        changes.userId = null;
      } else {
        const userId = String(body.userId).trim();
        if (!(await findUser(userId))) return fail("invalid_request", "Unknown userId", 400);
        if (!tokenHasResource(auth.token, "client", userId)) {
          return fail("resource_forbidden", "This token is not allowed to access this client", 403);
        }
        changes.userId = userId;
      }
    }
    if (body.vendor !== undefined) changes.vendor = body.vendor ? String(body.vendor).trim() : null;
    if (body.platform !== undefined) changes.platform = body.platform ? String(body.platform).trim() : null;
    if (body.adSpendFeeBps !== undefined) changes.adSpendFeeBps = Number(body.adSpendFeeBps);
    if (body.monthlyRetainerCents !== undefined) {
      changes.monthlyRetainerCents = Number(body.monthlyRetainerCents);
    }
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "inactive") {
        return fail("invalid_request", "Invalid status", 400);
      }
      changes.status = body.status;
    }
    if (body.notes !== undefined) changes.notes = body.notes != null ? String(body.notes) : null;
    if (body.billingPaused !== undefined) changes.billingPaused = Boolean(body.billingPaused);
    if (body.billingDay !== undefined) {
      changes.billingDay = body.billingDay === null ? null : Number(body.billingDay);
    }
    if (body.leadDays !== undefined) changes.leadDays = Number(body.leadDays);
    if (body.extendUntil !== undefined) {
      changes.extendUntil = body.extendUntil ? String(body.extendUntil) : null;
    }
    if (body.lastBilledOverride !== undefined) {
      changes.lastBilledOverride = body.lastBilledOverride ? String(body.lastBilledOverride) : null;
    }

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updateAdAccount(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "ad_account.update",
      targetType: "ad_account",
      targetId: params.id,
      details: JSON.stringify({ fields: Object.keys(changes) }),
    }).catch(() => {});

    const updated = await getAdAccount(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/client/ad-accounts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;

  try {
    const account = await getAdAccount(params.id);
    if (!account) return fail("not_found", "Ad account not found", 404);
    const gate = gateAccount(auth.token, account);
    if (gate) return gate;

    await deleteAdAccount(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "ad_account.delete",
      targetType: "ad_account",
      targetId: params.id,
      details: JSON.stringify({ accountName: account.accountName }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/ad-accounts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

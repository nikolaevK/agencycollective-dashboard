export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import {
  readAccountsForUser,
  toggleAccountActive,
  updateAccountLabel,
  removeAccountFromUser,
} from "@/lib/clientAccounts";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Update a linked account: { isActive? (boolean), label? (string|null) }. */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; accountId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    const accountId = decodeURIComponent(params.accountId);
    const accounts = await readAccountsForUser(params.id);
    if (!accounts.some((a) => a.accountId === accountId)) {
      return fail("not_found", "Account not linked to this client", 404);
    }

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    if (body.isActive === undefined && body.label === undefined) {
      return fail("invalid_request", "Provide `isActive` and/or `label`", 400);
    }

    if (body.isActive !== undefined) {
      await toggleAccountActive(params.id, accountId, Boolean(body.isActive));
    }
    if (body.label !== undefined) {
      await updateAccountLabel(
        params.id,
        accountId,
        body.label != null && String(body.label).trim() !== ""
          ? String(body.label).trim()
          : null
      );
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.account_update",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ accountId, fields: Object.keys(body) }),
    }).catch(() => {});

    const updated = await readAccountsForUser(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/client/clients/[id]/accounts/[accountId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Unlink a Meta account from this client. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; accountId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:delete", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    const accountId = decodeURIComponent(params.accountId);
    const removed = await removeAccountFromUser(params.id, accountId);
    if (!removed) return fail("not_found", "Account not linked to this client", 404);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.account_unlink",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ accountId }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/clients/[id]/accounts/[accountId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

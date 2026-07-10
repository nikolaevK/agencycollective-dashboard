export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getMetaAccount,
  updateMetaAccount,
  deleteMetaAccount,
  readMetaAccountInput,
  redactMetaAccount,
  DuplicateMetaAccountEmailError,
} from "@/lib/metaAccounts";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { id: string };
}

export function OPTIONS() {
  return corsPreflight();
}

/** One account (credentials redacted). */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "metaaccounts:read");
  if (!auth.ok) return auth.response;

  const account = await getMetaAccount(params.id);
  if (!account) return fail("not_found", "Meta account not found", 404);
  return ok(redactMetaAccount(account));
}

/** Partial update. Credential fields are accepted but never returned. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "metaaccounts:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    const changes = readMetaAccountInput(body);
    if ("fbEmail" in changes && !(changes.fbEmail ?? "").trim()) {
      return fail("invalid_request", "fbEmail cannot be empty", 400);
    }
    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No recognized fields to update", 400);
    }

    // No existence pre-read — UPDATE's rowsAffected already answers it.
    let updatedOk: boolean;
    try {
      updatedOk = await updateMetaAccount(params.id, changes);
    } catch (err) {
      if (err instanceof DuplicateMetaAccountEmailError) {
        return fail("conflict", err.message, 409);
      }
      throw err;
    }
    if (!updatedOk) return fail("not_found", "Meta account not found", 404);
    const updated = await getMetaAccount(params.id);
    if (!updated) return fail("not_found", "Meta account not found", 404);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "meta_account.update",
      targetType: "meta_account",
      targetId: params.id,
      details: JSON.stringify({ fields: Object.keys(changes) }),
    }).catch(() => {});

    return ok(redactMetaAccount(updated));
  } catch (err) {
    console.error("PATCH /api/v1/meta-accounts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateApiRequest(request, "metaaccounts:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await getMetaAccount(params.id);
    if (!existing) return fail("not_found", "Meta account not found", 404);

    await deleteMetaAccount(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "meta_account.delete",
      targetType: "meta_account",
      targetId: params.id,
      details: JSON.stringify({ fbEmail: existing.fbEmail }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/meta-accounts/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

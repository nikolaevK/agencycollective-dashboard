export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { getClientDetail } from "@/lib/clientDirectory";
import {
  findUser,
  findUserByEmail,
  updateUser,
  deleteUser,
  type UserRecord,
  type UserStatus,
} from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";
import { tokenIsExternal } from "@/lib/apiScopes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: UserStatus[] = ["active", "onboarding", "inactive", "archived"];

export function OPTIONS() {
  return corsPreflight();
}

/** Full directory row + payout history for one client. */
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
  return ok(detail);
}

/**
 * Update a client. Body (all optional): { displayName, email, status,
 * mrrCents, category, joinedAt, payoutBrand, analystEnabled,
 * designBoardEnabled }. Portal-critical fields (slug, accountId, password,
 * designBoardUrl) are not writable via v1.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const existing = await findUser(params.id);
    if (!existing) return fail("not_found", "Client not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: Partial<Omit<UserRecord, "id">> = {};
    if (body.displayName !== undefined) {
      const displayName = String(body.displayName).trim();
      if (!displayName) return fail("invalid_request", "displayName cannot be empty", 400);
      changes.displayName = displayName;
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return fail("invalid_request", "Invalid email address", 400);
      if (email !== (existing.email ?? "").toLowerCase()) {
        const clash = await findUserByEmail(email);
        if (clash && clash.id !== params.id) {
          return fail("conflict", "This email is already used by another client", 409);
        }
        changes.email = email;
      }
    }
    if (body.status !== undefined) {
      const status = String(body.status) as UserStatus;
      if (!VALID_STATUSES.includes(status)) return fail("invalid_request", "Invalid status", 400);
      changes.status = status;
    }
    if (body.mrrCents !== undefined) {
      const mrr = Number(body.mrrCents);
      if (!Number.isInteger(mrr) || mrr < 0) {
        return fail("invalid_request", "mrrCents must be a non-negative integer", 400);
      }
      changes.mrr = mrr;
    }
    if (body.category !== undefined) {
      changes.category = body.category ? String(body.category).trim() : null;
    }
    if (body.joinedAt !== undefined) {
      const joinedAt = body.joinedAt ? String(body.joinedAt).trim() : null;
      if (joinedAt && !DATE_RE.test(joinedAt)) {
        return fail("invalid_request", "joinedAt must be yyyy-mm-dd", 400);
      }
      changes.joinedAt = joinedAt;
    }
    if (body.payoutBrand !== undefined) {
      const nextBrand = body.payoutBrand ? String(body.payoutBrand).trim() : null;
      // Internally-managed link (see POST). Echoed-back unchanged values pass
      // so record round-trips keep working; only an actual change is blocked.
      if (tokenIsExternal(auth.token) && nextBrand !== (existing.payoutBrand ?? null)) {
        return fail(
          "resource_forbidden",
          "The payout brand link is managed by the agency for workspace-restricted tokens",
          403
        );
      }
      changes.payoutBrand = nextBrand;
    }
    if (body.analystEnabled !== undefined) changes.analystEnabled = Boolean(body.analystEnabled);
    if (body.designBoardEnabled !== undefined) {
      changes.designBoardEnabled = Boolean(body.designBoardEnabled);
    }

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updateUser(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.update",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findUser(params.id);
    if (!updated) return fail("not_found", "Client not found", 404);
    const { passwordHash: _, ...safe } = updated;
    return ok(safe);
  } catch (err) {
    console.error("PATCH /api/v1/client/clients/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:delete", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const existing = await findUser(params.id);
    if (!existing) return fail("not_found", "Client not found", 404);

    await deleteUser(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.delete",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ displayName: existing.displayName }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/clients/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

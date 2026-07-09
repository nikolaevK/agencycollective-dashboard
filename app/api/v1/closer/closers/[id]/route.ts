export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  findCloser,
  findCloserByEmail,
  updateCloser,
  deleteCloser,
  type CloserRecord,
  type CloserRole,
} from "@/lib/closers";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: CloserRole[] = [
  "senior_closer",
  "account_executive",
  "inbound_specialist",
  "closer",
  "setter",
];

function stripHash(closer: CloserRecord) {
  const { passwordHash, ...rest } = closer;
  return { ...rest, hasPassword: passwordHash !== null };
}

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read", {
    resource: { kind: "closer", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const closer = await findCloser(params.id);
  if (!closer) return fail("not_found", "Closer not found", 404);
  return ok(stripHash(closer));
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write", {
    resource: { kind: "closer", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const existing = await findCloser(params.id);
    if (!existing) return fail("not_found", "Closer not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: Partial<Omit<CloserRecord, "id">> = {};
    if (body.displayName !== undefined) {
      const displayName = String(body.displayName).trim();
      if (!displayName) return fail("invalid_request", "displayName cannot be empty", 400);
      changes.displayName = displayName;
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return fail("invalid_request", "Invalid email address", 400);
      if (email !== existing.email) {
        const clash = await findCloserByEmail(email);
        if (clash && clash.id !== params.id) {
          return fail("conflict", "This email is already used by another closer", 409);
        }
        changes.email = email;
      }
    }
    if (body.role !== undefined) {
      const role = String(body.role) as CloserRole;
      if (!VALID_ROLES.includes(role)) return fail("invalid_request", "Invalid role", 400);
      changes.role = role;
    }
    if (body.commissionRateBps !== undefined) {
      const bps = Number(body.commissionRateBps);
      if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
        return fail("invalid_request", "commissionRateBps must be an integer 0..10000", 400);
      }
      changes.commissionRate = bps;
    }
    if (body.quotaCents !== undefined) {
      const cents = Number(body.quotaCents);
      if (!Number.isInteger(cents) || cents < 0) {
        return fail("invalid_request", "quotaCents must be a non-negative integer", 400);
      }
      changes.quota = cents;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (status !== "active" && status !== "inactive") {
        return fail("invalid_request", "Invalid status", 400);
      }
      changes.status = status;
    }

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updateCloser(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "closer.update",
      targetType: "closer",
      targetId: params.id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findCloser(params.id);
    return ok(updated ? stripHash(updated) : null);
  } catch (err) {
    console.error("PATCH /api/v1/closer/closers/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete", {
    resource: { kind: "closer", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const existing = await findCloser(params.id);
    if (!existing) return fail("not_found", "Closer not found", 404);

    await deleteCloser(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "closer.delete",
      targetType: "closer",
      targetId: params.id,
      details: JSON.stringify({ displayName: existing.displayName }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/closers/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import {
  getClientProfile,
  upsertClientProfile,
  sanitizeProfileInput,
  defaultClientProfile,
} from "@/lib/clientProfile";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Roster profile (satellite row; absence = defaults). */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const user = await findUser(params.id);
  if (!user) return fail("not_found", "Client not found", 404);

  const profile = await getClientProfile(params.id);
  return ok(profile ?? defaultClientProfile(params.id));
}

/** Partial roster-profile update — validated by sanitizeProfileInput. */
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

    const parsed = sanitizeProfileInput(body);
    if (parsed.error) return fail("invalid_request", parsed.error, 400);
    if (!parsed.input || Object.keys(parsed.input).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }

    await upsertClientProfile(params.id, parsed.input);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.profile_update",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ fields: Object.keys(parsed.input) }),
    }).catch(() => {});

    const profile = await getClientProfile(params.id);
    return ok(profile ?? defaultClientProfile(params.id));
  } catch (err) {
    console.error("PATCH /api/v1/client/clients/[id]/profile error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

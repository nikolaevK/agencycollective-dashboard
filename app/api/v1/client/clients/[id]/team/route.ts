export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { getClientTeam, setClientTeam, type TeamRole } from "@/lib/clientProfile";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Head-of-Ads / Media Buyer assignments for one client. */
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

  const team = await getClientTeam(params.id);
  return ok(team);
}

/** Replace-set one role's assignments: { role: "media_buyer"|"lead", adminIds: string[] }. */
export async function PUT(
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

    const role = String(body.role ?? "") as TeamRole;
    if (role !== "media_buyer" && role !== "lead") {
      return fail("invalid_request", "role must be media_buyer or lead", 400);
    }
    if (!Array.isArray(body.adminIds)) {
      return fail("invalid_request", "adminIds must be an array of admin ids", 400);
    }
    const adminIds = body.adminIds
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);

    const actor = tokenAuditActor(auth.token);
    await setClientTeam(params.id, role, adminIds, actor.adminId);

    logAuditEvent({
      ...actor,
      action: "client.team_update",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ role, adminIds }),
    }).catch(() => {});

    const team = await getClientTeam(params.id);
    return ok(team);
  } catch (err) {
    console.error("PUT /api/v1/client/clients/[id]/team error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

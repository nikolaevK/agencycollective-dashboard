export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { tokenIsExternal } from "@/lib/apiScopes";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { getMaintenanceConfig, setMaintenanceConfig } from "@/lib/maintenance";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Client-portal maintenance banner config. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }
  return ok(await getMaintenanceConfig());
}

/** Update: { enabled: boolean, message? (≤500) }. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }

  try {
    const body = await readJsonBody(request);
    if (!body || typeof body.enabled !== "boolean") {
      return fail("invalid_request", "enabled (boolean) is required", 400);
    }

    const config = await setMaintenanceConfig({
      enabled: body.enabled,
      message: body.message != null ? String(body.message) : undefined,
    });

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "maintenance.update",
      targetType: "maintenance",
      targetId: "maintenance",
      details: JSON.stringify({ enabled: body.enabled }),
    }).catch(() => {});

    return ok(config);
  } catch (err) {
    console.error("PATCH /api/v1/client/maintenance error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

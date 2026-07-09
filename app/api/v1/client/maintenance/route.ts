export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  return ok(await getMaintenanceConfig());
}

/** Update: { enabled: boolean, message? (≤500) }. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  listCustomAdPlatformOptions,
  addCustomAdPlatformOption,
  renameCustomAdPlatformOption,
  removeCustomAdPlatformOption,
} from "@/lib/adPlatformOptions";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Admin-managed custom Ad Platform roster chips (on top of built-ins). */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;
  return ok(await listCustomAdPlatformOptions());
}

/** Add a custom option: { label }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    const result = await addCustomAdPlatformOption(body?.label);
    if (result.error) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "roster_option.add",
      targetType: "roster_option",
      targetId: `ad_platform:${result.option?.value}`,
    }).catch(() => {});

    return ok(result.option, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/ad-platform-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Rename a custom option: { value, label }. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    const value = String(body?.value ?? "").trim();
    if (!value) return fail("invalid_request", "value is required", 400);
    const result = await renameCustomAdPlatformOption(value, body?.label);
    if (result.error) return fail("invalid_request", result.error, 400);
    return ok(result.option);
  } catch (err) {
    console.error("PATCH /api/v1/client/ad-platform-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Remove a custom option: ?value=<slug>. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;

  try {
    const value = new URL(request.url).searchParams.get("value")?.trim();
    if (!value) return fail("invalid_request", "value query param is required", 400);
    await removeCustomAdPlatformOption(value);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "roster_option.remove",
      targetType: "roster_option",
      targetId: `ad_platform:${value}`,
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/ad-platform-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  listCustomRosterOptions,
  addCustomRosterOption,
  renameCustomRosterOption,
  removeCustomRosterOption,
  parseRosterOptionKind,
} from "@/lib/rosterOptions";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Custom Stage / Client Health chips: ?kind=stage|health. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  const kind = parseRosterOptionKind(new URL(request.url).searchParams.get("kind"));
  if (!kind) return fail("invalid_request", "kind must be stage or health", 400);
  return ok(await listCustomRosterOptions(kind));
}

/** Add a custom option: { kind, label }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    const kind = parseRosterOptionKind(body?.kind);
    if (!kind) return fail("invalid_request", "kind must be stage or health", 400);
    const result = await addCustomRosterOption(kind, body?.label);
    if (result.error) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "roster_option.add",
      targetType: "roster_option",
      targetId: `${kind}:${result.option?.value}`,
    }).catch(() => {});

    return ok(result.option, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/roster-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Rename a custom option: { kind, value, label }. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    const kind = parseRosterOptionKind(body?.kind);
    if (!kind) return fail("invalid_request", "kind must be stage or health", 400);
    const value = String(body?.value ?? "").trim();
    if (!value) return fail("invalid_request", "value is required", 400);
    const result = await renameCustomRosterOption(kind, value, body?.label);
    if (result.error) return fail("invalid_request", result.error, 400);
    return ok(result.option);
  } catch (err) {
    console.error("PATCH /api/v1/client/roster-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Remove a custom option: ?kind=stage|health&value=<slug>. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const kind = parseRosterOptionKind(url.searchParams.get("kind"));
    if (!kind) return fail("invalid_request", "kind must be stage or health", 400);
    const value = url.searchParams.get("value")?.trim();
    if (!value) return fail("invalid_request", "value query param is required", 400);
    await removeCustomRosterOption(kind, value);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "roster_option.remove",
      targetType: "roster_option",
      targetId: `${kind}:${value}`,
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/roster-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

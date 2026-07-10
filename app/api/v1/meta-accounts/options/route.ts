export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  listMetaAccountOptions,
  addMetaAccountOption,
  updateMetaAccountOption,
  removeMetaAccountOption,
  parseMetaOptionKind,
} from "@/lib/metaAccountOptions";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Stage / Status chip vocabulary: ?kind=stage|status. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:read");
  if (!auth.ok) return auth.response;

  const kind = parseMetaOptionKind(new URL(request.url).searchParams.get("kind"));
  if (!kind) return fail("invalid_request", "kind must be stage or status", 400);
  return ok(await listMetaAccountOptions(kind));
}

/** Add an option: { kind, label, color? }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    const kind = parseMetaOptionKind(body?.kind);
    if (!kind) return fail("invalid_request", "kind must be stage or status", 400);
    const result = await addMetaAccountOption(kind, body?.label, body?.color);
    if (result.error) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "meta_account_option.add",
      targetType: "meta_account_option",
      targetId: `${kind}:${result.option?.value}`,
    }).catch(() => {});

    return ok(result.option, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/meta-accounts/options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Edit an option's label and/or color: { kind, value, label?, color? }. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    const kind = parseMetaOptionKind(body?.kind);
    if (!kind) return fail("invalid_request", "kind must be stage or status", 400);
    const value = String(body?.value ?? "").trim();
    if (!value) return fail("invalid_request", "value is required", 400);
    const changes: { label?: unknown; color?: unknown } = {};
    if (body && "label" in body) changes.label = body.label;
    if (body && "color" in body) changes.color = body.color;
    const result = await updateMetaAccountOption(kind, value, changes);
    if (result.error) return fail("invalid_request", result.error, 400);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "meta_account_option.update",
      targetType: "meta_account_option",
      targetId: `${kind}:${value}`,
    }).catch(() => {});

    return ok(result.option);
  } catch (err) {
    console.error("PATCH /api/v1/meta-accounts/options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Remove an option: ?kind=stage|status&value=<slug>. Tagged accounts keep the slug. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:delete");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const kind = parseMetaOptionKind(url.searchParams.get("kind"));
    if (!kind) return fail("invalid_request", "kind must be stage or status", 400);
    const value = url.searchParams.get("value")?.trim();
    if (!value) return fail("invalid_request", "value query param is required", 400);
    await removeMetaAccountOption(kind, value);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "meta_account_option.remove",
      targetType: "meta_account_option",
      targetId: `${kind}:${value}`,
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/meta-accounts/options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

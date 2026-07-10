export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, readJsonBody, parsePagination } from "@/lib/api/respond";
import {
  queryMetaAccounts,
  createMetaAccount,
  readMetaAccountInput,
  redactMetaAccount,
  DuplicateMetaAccountEmailError,
} from "@/lib/metaAccounts";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** List accounts (credentials redacted). Filters: ?stage&status&batch&clientId. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    // Filters + pagination run in SQL (one batch round-trip), so the wire
    // payload is bounded by the page size, not the table size.
    const { rows, total } = await queryMetaAccounts({
      stage: url.searchParams.get("stage")?.trim() || undefined,
      status: url.searchParams.get("status")?.trim() || undefined,
      batch: url.searchParams.get("batch")?.trim() || undefined,
      clientId: url.searchParams.get("clientId")?.trim() || undefined,
      limit,
      offset,
    });
    return okList(rows.map(redactMetaAccount), { total, limit, offset });
  } catch (err) {
    console.error("GET /api/v1/meta-accounts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Create an account. Credential fields are accepted but never returned. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    const input = readMetaAccountInput(body);
    if (!(input.fbEmail ?? "").trim()) {
      return fail("invalid_request", "fbEmail is required", 400);
    }

    let created;
    try {
      created = await createMetaAccount(input);
    } catch (err) {
      if (err instanceof DuplicateMetaAccountEmailError) {
        return fail("conflict", err.message, 409);
      }
      throw err;
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "meta_account.create",
      targetType: "meta_account",
      targetId: created.id,
      details: JSON.stringify({ fbEmail: created.fbEmail }),
    }).catch(() => {});

    return ok(redactMetaAccount(created), undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/meta-accounts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

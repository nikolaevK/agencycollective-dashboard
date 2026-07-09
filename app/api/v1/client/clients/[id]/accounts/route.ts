export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { readAccountsForUser, addAccountToUser } from "@/lib/clientAccounts";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Meta ad accounts linked to this client. */
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

  const accounts = await readAccountsForUser(params.id);
  return ok(accounts);
}

/** Link a Meta account: { accountId (act_… or numeric), label? }. */
export async function POST(
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
    const accountId = String(body?.accountId ?? "").trim();
    if (!accountId) return fail("invalid_request", "accountId is required", 400);
    const label = body?.label ? String(body.label).trim() : undefined;

    await addAccountToUser(params.id, accountId, label);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.account_link",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ accountId }),
    }).catch(() => {});

    const accounts = await readAccountsForUser(params.id);
    return ok(accounts, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients/[id]/accounts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

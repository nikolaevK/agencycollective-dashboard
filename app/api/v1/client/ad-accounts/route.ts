export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { allowedResourceIds, tokenHasResource, tokenWorkspaceScope } from "@/lib/apiScopes";
import { buildAdAccountDirectory } from "@/lib/adAccountDirectory";
import { createAdAccount, type CreateAdAccountInput } from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Ad Accounts directory (rows + summary, schedules reconciled on read).
 * Rows for clients outside the token's allow-list are filtered out,
 * including unattached (orphan) accounts.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    const directory = await buildAdAccountDirectory();
    const allowed = allowedResourceIds(auth.token, "client");
    // Restricted tokens see only their clients' accounts — unassigned
    // (orphan) accounts are excluded, matching the single-item gates.
    const rows = allowed
      ? directory.rows.filter((r) => {
          const userId = (r as { userId?: string | null }).userId;
          return Boolean(userId) && allowed.includes(userId as string);
        })
      : directory.rows;
    return ok({ rows, summary: directory.summary });
  } catch (err) {
    console.error("GET /api/v1/client/ad-accounts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Create an ad account. Body: { accountName (required), userId?, vendor?,
 * platform?, adSpendFeeBps?, monthlyRetainerCents?, status?, notes?,
 * billingPaused?, billingDay?, leadDays?, extendUntil?, lastBilledOverride? }.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const accountName = String(body.accountName ?? "").trim();
    if (!accountName) return fail("invalid_request", "accountName is required", 400);

    let userId: string | undefined;
    let clientWorkspace: string | null = null;
    if (body.userId != null && String(body.userId).trim() !== "") {
      userId = String(body.userId).trim();
      const linked = await findUser(userId);
      if (!linked) {
        return fail("invalid_request", "Unknown userId", 400);
      }
      if (!tokenHasResource(auth.token, "client", userId)) {
        return fail("resource_forbidden", "This token is not allowed to access this client", 403);
      }
      clientWorkspace = linked.workspace;
    }

    // The account lands in the linked client's book, else a restricted
    // token's first book, else main (mirrors the admin create route).
    const wsRestriction = tokenWorkspaceScope(auth.token);
    const workspace = clientWorkspace ?? (wsRestriction ? wsRestriction[0] : "main");

    const input: CreateAdAccountInput = {
      accountName,
      userId,
      workspace,
      vendor: body.vendor != null ? String(body.vendor).trim() || null : undefined,
      platform: body.platform != null ? String(body.platform).trim() || null : undefined,
      adSpendFeeBps: body.adSpendFeeBps !== undefined ? Number(body.adSpendFeeBps) : undefined,
      monthlyRetainerCents:
        body.monthlyRetainerCents !== undefined ? Number(body.monthlyRetainerCents) : undefined,
      status:
        body.status === "active" || body.status === "inactive" ? body.status : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
      billingPaused: body.billingPaused !== undefined ? Boolean(body.billingPaused) : undefined,
      billingDay: body.billingDay !== undefined ? (body.billingDay === null ? null : Number(body.billingDay)) : undefined,
      leadDays: body.leadDays !== undefined ? Number(body.leadDays) : undefined,
      extendUntil: body.extendUntil != null ? String(body.extendUntil) || null : undefined,
      lastBilledOverride:
        body.lastBilledOverride != null ? String(body.lastBilledOverride) || null : undefined,
    };
    const account = await createAdAccount(input);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "ad_account.create",
      targetType: "ad_account",
      targetId: account.id,
      details: JSON.stringify({ accountName: account.accountName, userId: account.userId }),
    }).catch(() => {});

    return ok(account, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/ad-accounts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

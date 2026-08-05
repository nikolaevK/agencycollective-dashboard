import { NextResponse } from "next/server";
import { checkRate } from "@/lib/rateLimit";
import { verifyApiToken, bumpTokenUsage, ApiTokenRecord } from "@/lib/apiTokens";
import {
  tokenHasScope,
  tokenHasResource,
  tokenWorkspaceScope,
  ScopeKey,
} from "@/lib/apiScopes";
import { readUsers } from "@/lib/users";
import { fail } from "./respond";

/**
 * Sentinel client-id for a workspace-restricted token whose book currently
 * has no clients. clientIds semantics treat null/[] as "all", so an empty
 * derived list must NOT be stored as [] — this impossible id makes every
 * resource check deny and every list filter to zero rows instead.
 */
const NO_CLIENTS_SENTINEL = "__workspace_has_no_clients__";

/**
 * The single authoritative guard for the external API. Every `/api/v1/*`
 * route AND the MCP endpoint call this — auth logic lives ONLY here.
 *
 * Bearer extract → verify token (timing-safe, identical failure for
 * unknown/revoked/expired to avoid an oracle) → per-token rate limit →
 * scope check → resource check → fire-and-forget usage bump.
 *
 * Runs in the Node runtime (DB lookup) — never in Edge middleware.
 */

/** Per-token ceiling: requests per minute. */
export const API_RATE_LIMIT = 120;
const API_RATE_WINDOW_MS = 60_000;

export type ApiAuthResult =
  | { ok: true; token: ApiTokenRecord }
  | { ok: false; response: NextResponse };

export async function authenticateApiRequest(
  request: Request,
  requiredScope: ScopeKey,
  opts?: { resource?: { kind: "client" | "closer"; id: string } }
): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      response: fail(
        "missing_token",
        "Missing bearer token. Send `Authorization: Bearer ac_live_...`.",
        401
      ),
    };
  }

  let token = await verifyApiToken(match[1]);
  if (!token) {
    // Never log or echo the presented secret.
    return {
      ok: false,
      response: fail("invalid_token", "Invalid, expired, or revoked API token.", 401),
    };
  }

  // Workspace (book) restriction — translated into the EXISTING client_ids
  // resource-scoping machinery so no route or MCP tool changes behavior:
  // the token's effective clientIds become "clients in the allowed book(s)"
  // (intersected with an explicit clientIds allow-list when both are set).
  // Every existing enforcement point then just works — single-item lookups
  // 403 via tokenHasResource, list routes pre-filter via allowedResourceIds,
  // and the cross-brand payout pool already denies any client-restricted
  // token. Tokens without a workspace restriction skip this entirely
  // (identical behavior to before the feature existed).
  const wsScope = tokenWorkspaceScope(token);
  if (wsScope !== null) {
    const users = await readUsers();
    const wsIds = users
      .filter((u) => wsScope.includes(u.workspace || "main"))
      .map((u) => u.id);
    const explicit = token.clientIds;
    const merged =
      explicit && explicit.length > 0
        ? wsIds.filter((id) => explicit.includes(id))
        : wsIds;
    token = {
      ...token,
      clientIds: merged.length > 0 ? merged : [NO_CLIENTS_SENTINEL],
    };
  }

  const rate = checkRate(`apitoken:${token.id}`, API_RATE_LIMIT, API_RATE_WINDOW_MS);
  if (!rate.ok) {
    return {
      ok: false,
      response: fail("rate_limited", "Rate limit exceeded for this token.", 429, {
        retryAfter: rate.retryAfter,
      }),
    };
  }

  if (!tokenHasScope(token, requiredScope)) {
    return {
      ok: false,
      response: fail(
        "insufficient_scope",
        `This token does not have the required scope (${requiredScope}).`,
        403
      ),
    };
  }

  if (opts?.resource && !tokenHasResource(token, opts.resource.kind, opts.resource.id)) {
    return {
      ok: false,
      response: fail(
        "resource_forbidden",
        `This token is not allowed to access this ${opts.resource.kind}.`,
        403
      ),
    };
  }

  void bumpTokenUsage(token.id);
  return { ok: true, token };
}

/** Audit actor helpers — audit_log's actor columns are NOT NULL. */
export function tokenAuditActor(token: ApiTokenRecord): {
  adminId: string;
  adminUsername: string;
} {
  return { adminId: token.id, adminUsername: `api:${token.name}` };
}

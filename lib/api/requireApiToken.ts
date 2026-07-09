import { NextResponse } from "next/server";
import { checkRate } from "@/lib/rateLimit";
import { verifyApiToken, bumpTokenUsage, ApiTokenRecord } from "@/lib/apiTokens";
import { tokenHasScope, tokenHasResource, ScopeKey } from "@/lib/apiScopes";
import { fail } from "./respond";

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

  const token = await verifyApiToken(match[1]);
  if (!token) {
    // Never log or echo the presented secret.
    return {
      ok: false,
      response: fail("invalid_token", "Invalid, expired, or revoked API token.", 401),
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRate } from "@/lib/rateLimit";
import { redeemAuthorizationCode } from "@/lib/oauth";
import { findApiToken } from "@/lib/apiTokens";
import { RESOURCE_KEYS } from "@/lib/apiScopes";

/**
 * OAuth token endpoint — exchanges a single-use consent code (+ PKCE
 * verifier) for the api_token minted at consent. Returned verbatim as the
 * access token, so MCP/REST auth downstream is the standard verifyApiToken
 * path. No refresh tokens: our tokens are long-lived and revocable from
 * /dashboard/api-tokens; clients re-run the flow after a revoke.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function oauthError(error: string, description: string, status = 400): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } }
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRate(`oauth-token:${ip}`, 30, 60_000).ok) {
    return oauthError("invalid_request", "Rate limit exceeded", 429);
  }

  // Accept application/x-www-form-urlencoded (the OAuth standard) and JSON.
  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string") params.set(key, value);
      }
    } else {
      params = new URLSearchParams(await request.text());
    }
  } catch {
    return oauthError("invalid_request", "Unreadable request body");
  }

  if (params.get("grant_type") !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported");
  }
  const code = params.get("code") ?? "";
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const codeVerifier = params.get("code_verifier") ?? "";
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return oauthError(
      "invalid_request",
      "code, client_id, redirect_uri, and code_verifier are required"
    );
  }

  const result = await redeemAuthorizationCode({ code, clientId, redirectUri, codeVerifier });
  if (!result.ok) {
    return oauthError("invalid_grant", "Code is invalid, expired, or already used");
  }

  // Reflect the granted scopes + expiry in the standard response fields.
  const record = await findApiToken(result.apiTokenId);
  const scope = record
    ? RESOURCE_KEYS.filter((r) => record.scopes[r] && record.scopes[r] !== "none")
        .map((r) => `${r}:${record.scopes[r]}`)
        .join(" ")
    : undefined;
  let expiresIn: number | undefined;
  if (record?.expiresAt) {
    const ms = Date.parse(
      record.expiresAt.length <= 10 ? `${record.expiresAt}T23:59:59.999Z` : record.expiresAt
    );
    if (Number.isFinite(ms)) expiresIn = Math.max(0, Math.floor((ms - Date.now()) / 1000));
  }

  return NextResponse.json(
    {
      access_token: result.accessToken,
      token_type: "Bearer",
      ...(scope ? { scope } : {}),
      ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
    },
    { headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } }
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPublicOrigin } from "mcp-handler";
import { getAdminSession } from "@/lib/adminSession";
import { sanitizeScopes } from "@/lib/apiScopes";
import { createApiToken } from "@/lib/apiTokens";
import { findOAuthClient, createAuthorizationCode } from "@/lib/oauth";
import { logAuditEvent } from "@/lib/auditLog";

/**
 * Consent approval — cookie-authed (admin session + `apitokens` permission,
 * enforced here since /api/oauth is outside the middleware matcher). Mints a
 * regular api_token with the admin-chosen scopes and binds it to a one-time
 * authorization code for /api/oauth/token to redeem.
 */
export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.isSuper && !session.permissions.apitokens) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // CSRF defense in depth: a cross-site POST carries a foreign Origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== getPublicOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const clientId = String(body.clientId ?? "");
    const redirectUri = String(body.redirectUri ?? "");
    const codeChallenge = String(body.codeChallenge ?? "");
    const state = typeof body.state === "string" ? body.state : "";
    const tokenName = String(body.tokenName ?? "").trim().slice(0, 100);

    if (!clientId || !redirectUri || !codeChallenge || !tokenName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const client = await findOAuthClient(clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return NextResponse.json({ error: "Unknown client or redirect URI" }, { status: 400 });
    }
    const scopes = sanitizeScopes(body.scopes);
    if (Object.keys(scopes).length === 0) {
      return NextResponse.json({ error: "Grant at least one scope" }, { status: 400 });
    }

    const { record, token } = await createApiToken({
      name: tokenName,
      scopes,
      createdBy: session.adminId,
      createdByName: session.username,
    });

    const code = await createAuthorizationCode({
      clientId,
      redirectUri,
      codeChallenge,
      apiTokenId: record.id,
      accessToken: token,
    });

    logAuditEvent({
      adminId: session.adminId,
      adminUsername: session.username,
      action: "api_token.create",
      targetType: "api_token",
      targetId: record.id,
      details: JSON.stringify({
        name: tokenName,
        scopes,
        via: "oauth_consent",
        oauthClient: client.clientName ?? clientId,
      }),
    }).catch(() => {});

    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);
    return NextResponse.json({ redirectTo: redirect.toString() });
  } catch (err) {
    console.error("POST /api/oauth/authorize/decision error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

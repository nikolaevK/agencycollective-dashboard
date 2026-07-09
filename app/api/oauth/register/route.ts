export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { checkRate } from "@/lib/rateLimit";
import { registerOAuthClient, isAllowedRedirectUri } from "@/lib/oauth";

/**
 * RFC 7591 dynamic client registration — open (as the MCP spec expects) but
 * rate-limited per IP. Only public clients are issued (PKCE, no secret);
 * a client row grants nothing by itself — every authorization still goes
 * through the admin consent page.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRate(`oauth-register:${ip}`, 10, 60_000).ok) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Rate limit exceeded" },
      { status: 429, headers: CORS }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400, headers: CORS });
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be https (or localhost) URLs",
      },
      { status: 400, headers: CORS }
    );
  }

  const client = await registerOAuthClient({
    clientName: typeof body.client_name === "string" ? body.client_name : undefined,
    redirectUris,
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201, headers: CORS }
  );
}

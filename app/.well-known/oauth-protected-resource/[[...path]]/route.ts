export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { generateProtectedResourceMetadata, getPublicOrigin } from "mcp-handler";
import { supportedScopes } from "@/lib/oauth";

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint — points MCP
 * clients (Claude.ai custom connectors etc.) at our authorization server
 * (same origin). The optional catch-all also answers the path-suffixed form
 * (/.well-known/oauth-protected-resource/api/mcp/mcp).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
};

export function GET(request: Request) {
  const origin = getPublicOrigin(request);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp/mcp`,
    additionalMetadata: {
      scopes_supported: supportedScopes(),
      bearer_methods_supported: ["header"],
      resource_name: "Agency Collective API",
    },
  });
  return NextResponse.json(metadata, { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

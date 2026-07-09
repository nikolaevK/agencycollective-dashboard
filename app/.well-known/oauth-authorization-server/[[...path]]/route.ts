export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPublicOrigin } from "mcp-handler";
import { authServerMetadata } from "@/lib/oauth";

/**
 * RFC 8414 authorization-server metadata. The optional catch-all also
 * answers the path-suffixed form (/.well-known/oauth-authorization-server/
 * api/mcp/mcp) some MCP clients probe. Public + CORS (browser clients).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
};

export function GET(request: Request) {
  return NextResponse.json(authServerMetadata(getPublicOrigin(request)), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

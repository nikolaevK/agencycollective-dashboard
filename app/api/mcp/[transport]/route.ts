export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyApiToken, type ApiTokenRecord } from "@/lib/apiTokens";
import { RESOURCE_KEYS, type ScopeKey } from "@/lib/apiScopes";
import {
  buildMcpTools,
  dispatchOperation,
  resolveDispatchOrigin,
  toolAnnotations,
  toolDescription,
  McpDispatchError,
} from "@/lib/api/mcpTools";

/**
 * In-app MCP server (Streamable HTTP) — Bearer-authed with the same
 * `ac_live_…` tokens as /api/v1. One tool per OpenAPI operation (plus
 * `getStarted`); every call dispatches through the real v1 route, so
 * scope/resource gating, rate limiting, usage tracking, and audit logging
 * are identical to REST. Deliberately OUT of the middleware matcher
 * (Node-runtime token lookups).
 */

const TOOLS = buildMcpTools();

const SERVER_INSTRUCTIONS = `Agency Collective admin API — every tool maps 1:1 to a REST operation under /api/v1, gated by this token's scopes.

Conventions:
- Money is integer CENTS everywhere (dealValue, amountCents, quotaCents, …); commission rates are basis points (1250 = 12.5%).
- Dates are yyyy-mm-dd strings; timestamps are ISO 8601. Billing-schedule "today" is US Pacific.
- List tools page with limit (max 200) and offset; responses carry meta.pagination.hasMore.
- Errors return { error, code } with stable codes (invalid_request, insufficient_scope, resource_forbidden, not_found, conflict, rate_limited). Rate limit: 120 requests/min per token.
- File downloads return { fileName, contentType, size, dataBase64 } — pass maxBytes to avoid oversized payloads. File uploads take fileBase64 (+ fileName, and contentType for images).

Domains: closer (closers, deals, contracts, invoices, payouts, attendance/show rates), client (Client Directory: clients, billing + re-bill schedule, ad accounts + invoices, welcome kit), media (media-buyer PDF library), sops (standard operating procedures), audit (read-only audit trail), metaaccounts (FB account inventory & warm-up — credential fields are write-only, never returned), team (Team hub: roster members, tasks, action items — createTeamActionItem is the agent ingest path and auto-creates a linked task).

Start with getStarted to see this token's scopes and any client/closer restrictions. Use list tools to discover ids before calling item tools. Mutations are audit-logged as api:<token name>.`;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "getStarted",
      {
        title: "Get started",
        description:
          "Call this first: returns the API guide (conventions, domains) plus this token's name, scopes, resource restrictions, and expiry.",
        inputSchema: {},
        annotations: {
          title: "Get started",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (_args, extra) => {
        const record = extra.authInfo?.extra?.record as ApiTokenRecord | undefined;
        if (!record) {
          return {
            content: [{ type: "text" as const, text: "Error: missing or invalid bearer token." }],
            isError: true,
          };
        }
        const tokenInfo = {
          name: record.name,
          scopes: record.scopes,
          clientIds: record.clientIds ?? "all clients",
          closerIds: record.closerIds ?? "all closers",
          expiresAt: record.expiresAt ?? "never",
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `${SERVER_INSTRUCTIONS}\n\nThis token:\n${JSON.stringify(tokenInfo, null, 2)}`,
            },
          ],
        };
      }
    );

    for (const tool of TOOLS) {
      server.registerTool(
        tool.name,
        {
          title: tool.operation.summary,
          description: toolDescription(tool.operation),
          inputSchema: tool.inputSchema,
          annotations: toolAnnotations(tool.operation),
        },
        async (args: Record<string, unknown>, extra) => {
          const authInfo = extra.authInfo;
          const record = authInfo?.extra?.record as ApiTokenRecord | undefined;
          const origin = authInfo?.extra?.origin as string | undefined;
          if (!authInfo?.token || !record) {
            return {
              content: [{ type: "text" as const, text: "Error: missing or invalid bearer token." }],
              isError: true,
            };
          }
          if (!origin) {
            return {
              content: [{
                type: "text" as const,
                text: "Error: server misconfiguration — set API_INTERNAL_ORIGIN to this deployment's origin.",
              }],
              isError: true,
            };
          }
          try {
            const result = await dispatchOperation(tool, args ?? {}, {
              origin,
              bearer: authInfo.token,
              record,
            });
            return { content: [{ type: "text" as const, text: result }] };
          } catch (err) {
            const message =
              err instanceof McpDispatchError
                ? err.message
                : "Internal error executing the operation.";
            if (!(err instanceof McpDispatchError)) {
              console.error(`[mcp] ${tool.name} failed:`, err);
            }
            return {
              content: [{ type: "text" as const, text: `Error: ${message}` }],
              isError: true,
            };
          }
        }
      );
    }
  },
  {
    serverInfo: { name: "agency-collective", version: "1.1.0" },
    instructions: SERVER_INSTRUCTIONS,
  },
  {
    basePath: "/api/mcp",
    maxDuration: 60,
  }
);

/** Same token verification as /api/v1 — identical failure for unknown/revoked/expired. */
const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const record = await verifyApiToken(bearerToken);
  if (!record) return undefined;

  // Flatten the ordinal scopes to explicit scope keys for MCP metadata.
  const scopes: ScopeKey[] = [];
  for (const resource of RESOURCE_KEYS) {
    const level = record.scopes[resource];
    if (!level || level === "none") continue;
    scopes.push(`${resource}:read`);
    if (level === "write" || level === "delete") scopes.push(`${resource}:write`);
    if (level === "delete") scopes.push(`${resource}:delete`);
  }

  return {
    token: bearerToken,
    scopes,
    clientId: record.id,
    // Origin is pinned server-side (never the client-controlled Host header).
    extra: { record, origin: resolveDispatchOrigin(req) },
  };
};

// 401s carry WWW-Authenticate → resource metadata → our OAuth endpoints, so
// MCP clients without a token (Claude.ai custom connectors) can self-onboard
// via the consent flow at /oauth/authorize.
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };

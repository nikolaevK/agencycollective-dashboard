import { z, type ZodTypeAny } from "zod";
import {
  listOperations,
  type FlatOperation,
  type OpenApiSchema,
} from "./openapi";
import { tokenHasScope } from "@/lib/apiScopes";
import type { ApiTokenRecord } from "@/lib/apiTokens";

/**
 * Spec-driven MCP tools: one tool per OpenAPI operation (operationId = tool
 * name), input schema derived from the operation's params + request body,
 * and execution dispatched through the REAL /api/v1 route via an internal
 * fetch — so REST and MCP share one guard, one rate limit, one audit path.
 *
 * File operations are fully covered: binary downloads (x-binary) are forced
 * to `?format=base64` so the tool returns JSON { fileName, contentType,
 * size, dataBase64 }, and multipart uploads (x-multipart) take the JSON
 * body alternative with `fileBase64` — every spec operation is a tool.
 */

export interface McpToolDef {
  name: string;
  operation: FlatOperation;
  inputSchema: Record<string, ZodTypeAny>;
  /** Args that substitute into the URL path. */
  pathParams: string[];
  /** Args that become query-string params. */
  queryParams: string[];
  /** Args that form the JSON body (everything else). */
  bodyParams: string[];
}

function schemaToZod(schema: OpenApiSchema | undefined): ZodTypeAny {
  if (!schema) return z.any();
  if (schema.enum && schema.enum.length > 0) {
    return z.enum(schema.enum as [string, ...string[]]);
  }
  switch (schema.type) {
    case "string":
      return z.string();
    case "integer":
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schemaToZod(schema.items));
    case "object":
      return z.record(z.any());
    default:
      return z.any();
  }
}

function describe(zod: ZodTypeAny, description?: string): ZodTypeAny {
  return description ? zod.describe(description) : zod;
}

/** Build the tool definitions once at module load — the spec is static. */
export function buildMcpTools(): McpToolDef[] {
  const tools: McpToolDef[] = [];

  for (const operation of listOperations()) {
    const inputSchema: Record<string, ZodTypeAny> = {};
    const pathParams: string[] = [];
    const queryParams: string[] = [];
    const bodyParams: string[] = [];

    for (const param of operation.parameters ?? []) {
      // Binary downloads always dispatch as base64 JSON; `format` is forced
      // and `view` (inline vs attachment) is meaningless for tools.
      if (operation["x-binary"] && (param.name === "format" || param.name === "view")) {
        continue;
      }
      const base = describe(schemaToZod(param.schema), param.description);
      if (param.in === "path") {
        pathParams.push(param.name);
        inputSchema[param.name] = base;
      } else {
        queryParams.push(param.name);
        inputSchema[param.name] = param.required ? base : base.optional();
      }
    }

    const body = operation.requestBody?.schema;
    if (body?.properties) {
      const required = new Set(body.required ?? []);
      for (const [name, propSchema] of Object.entries(body.properties)) {
        if (name in inputSchema) continue; // path/query name wins
        bodyParams.push(name);
        const base = describe(schemaToZod(propSchema), propSchema.description);
        inputSchema[name] = required.has(name) ? base : base.optional();
      }
    }

    tools.push({
      name: operation.operationId,
      operation,
      inputSchema,
      pathParams,
      queryParams,
      bodyParams,
    });
  }

  return tools;
}

/**
 * MCP tool annotations derived from method + required scope so agent
 * harnesses can gate calls: GETs are read-only; DELETEs and anything
 * requiring a `:delete` scope are destructive; PUT/PATCH/DELETE re-apply
 * safely. Everything targets this app only (no open-world side effects).
 */
export function toolAnnotations(operation: FlatOperation): {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readOnly = operation.method === "get";
  return {
    title: operation.summary,
    readOnlyHint: readOnly,
    destructiveHint:
      operation.method === "delete" || operation["x-scope"].endsWith(":delete"),
    idempotentHint: readOnly || operation.method !== "post",
    openWorldHint: false,
  };
}

/** Agent-facing tool description: summary, behavior, route, scope, file hints. */
export function toolDescription(operation: FlatOperation): string {
  const parts = [operation.summary.endsWith(".") ? operation.summary : `${operation.summary}.`];
  if (operation.description) parts.push(operation.description);
  parts.push(
    `[${operation.method.toUpperCase()} /api/v1${operation.path}] Requires scope ${operation["x-scope"]}.`
  );
  if (operation["x-binary"]) {
    parts.push(
      "Returns { fileName, contentType, size, dataBase64 } — pass maxBytes to fail fast instead of receiving an oversized payload."
    );
  }
  if (operation["x-multipart"]) {
    parts.push("Send the file content base64-encoded via fileBase64.");
  }
  return parts.join(" ");
}

export class McpDispatchError extends Error {}

/**
 * Trusted base origin for the internal /api/v1 dispatch fetch. The request's
 * own origin is client-controlled (Host / x-forwarded-host), so trusting it
 * verbatim would let an authenticated caller point the server-side fetch —
 * bearer token attached — at an arbitrary internal host (SSRF). Resolution:
 * API_INTERNAL_ORIGIN env → Vercel deployment URL → loopback request origin
 * (local dev only). Anything else refuses to dispatch.
 */
export function resolveDispatchOrigin(req: Request): string | null {
  const pinned = process.env.API_INTERNAL_ORIGIN?.trim();
  if (pinned) return pinned.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  try {
    const url = new URL(req.url);
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      return url.origin;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Execute one operation by calling its real /api/v1 route with the caller's
 * bearer token. Scope is pre-checked here for a friendly error; the route's
 * guard remains authoritative (rate limit, resource gate, usage bump).
 */
export async function dispatchOperation(
  tool: McpToolDef,
  args: Record<string, unknown>,
  context: { origin: string; bearer: string; record: ApiTokenRecord }
): Promise<string> {
  const { operation } = tool;
  if (!tokenHasScope(context.record, operation["x-scope"])) {
    throw new McpDispatchError(
      `This token does not have the required scope (${operation["x-scope"]}).`
    );
  }

  let path = operation.path;
  for (const name of tool.pathParams) {
    const value = args[name];
    if (value === undefined || value === null || value === "") {
      throw new McpDispatchError(`Missing required path parameter: ${name}`);
    }
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }

  const url = new URL(`/api/v1${path}`, context.origin);
  for (const name of tool.queryParams) {
    const value = args[name];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }
  // Tools always receive file bytes as base64 JSON, never a raw stream.
  if (operation["x-binary"]) url.searchParams.set("format", "base64");

  const init: RequestInit = {
    method: operation.method.toUpperCase(),
    headers: { authorization: `Bearer ${context.bearer}` },
  };
  if (tool.bodyParams.length > 0 && operation.method !== "get") {
    const body: Record<string, unknown> = {};
    for (const name of tool.bodyParams) {
      if (args[name] !== undefined) body[name] = args[name];
    }
    init.headers = { ...init.headers, "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    // The v1 error envelope is already JSON with a stable code — pass through.
    throw new McpDispatchError(`HTTP ${response.status}: ${text.slice(0, 2000)}`);
  }
  return text;
}

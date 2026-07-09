"use client";

import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import type { FlatOperation, OpenApiSchema } from "@/lib/api/openapi";

const METHOD_BADGE: Record<string, string> = {
  get: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  post: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  put: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  patch: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  delete: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function schemaTypeLabel(schema?: OpenApiSchema): string {
  if (!schema) return "any";
  if (schema.enum) return schema.enum.join(" | ");
  if (schema.type === "array") return `${schemaTypeLabel(schema.items)}[]`;
  return schema.type ?? "any";
}

function exampleValue(name: string, schema?: OpenApiSchema): unknown {
  if (!schema) return "…";
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case "integer":
    case "number":
      return /cents|bps/i.test(name) ? 10000 : 1;
    case "boolean":
      return true;
    case "array":
      return [exampleValue(name, schema.items)];
    case "object":
      return {};
    default:
      return name.toLowerCase().includes("date") || name === "cycleAnchor"
        ? "2026-07-01"
        : `<${name}>`;
  }
}

function buildCurl(operation: FlatOperation): string {
  let path = operation.path.replace(/\{([^}]+)\}/g, "<$1>");
  const query = (operation.parameters ?? [])
    .filter((p) => p.in === "query" && p.required)
    .map((p) => `${p.name}=<${p.name}>`)
    .join("&");
  if (query) path += `?${query}`;

  const lines = [`curl -X ${operation.method.toUpperCase()} \\`];
  lines.push(`  "https://<your-domain>/api/v1${path}" \\`);
  lines.push(`  -H "Authorization: Bearer $AC_API_TOKEN"`);

  if (operation["x-multipart"]) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -F "file=@document.pdf"`);
  } else if (operation.requestBody?.schema.properties) {
    const body: Record<string, unknown> = {};
    const required = new Set(operation.requestBody.schema.required ?? []);
    for (const [name, schema] of Object.entries(operation.requestBody.schema.properties)) {
      if (required.size === 0 || required.has(name)) {
        body[name] = exampleValue(name, schema);
      }
    }
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '${JSON.stringify(body)}'`);
  }
  return lines.join("\n");
}

export function OperationCard({ operation }: { operation: FlatOperation }) {
  const params = operation.parameters ?? [];
  const bodyProps = operation.requestBody?.schema.properties;
  const bodyRequired = new Set(operation.requestBody?.schema.required ?? []);

  return (
    <div id={operation.operationId} className="scroll-mt-24 rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 font-mono text-xs font-bold uppercase",
            METHOD_BADGE[operation.method] ?? "bg-muted text-muted-foreground"
          )}
        >
          {operation.method}
        </span>
        <code className="font-mono text-sm break-all">/api/v1{operation.path}</code>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {operation["x-scope"]}
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold">{operation.summary}</h3>
        {operation.description && (
          <p className="mt-1 text-xs text-muted-foreground">{operation.description}</p>
        )}
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          operationId: {operation.operationId}
          {operation["x-binary"] && " · binary response"}
          {operation["x-multipart"] && " · multipart/form-data"}
        </p>
      </div>

      {params.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Parameter</th>
                <th className="py-1.5 pr-3 font-medium">In</th>
                <th className="py-1.5 pr-3 font-medium">Type</th>
                <th className="py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={`${p.in}-${p.name}`} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-mono">
                    {p.name}
                    {(p.required || p.in === "path") && <span className="text-red-500">*</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{p.in}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{schemaTypeLabel(p.schema)}</td>
                  <td className="py-1.5 text-muted-foreground">{p.description ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bodyProps && !operation["x-multipart"] && (
        <div className="overflow-x-auto">
          <p className="mb-1.5 text-xs font-medium">Request body (JSON)</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Field</th>
                <th className="py-1.5 pr-3 font-medium">Type</th>
                <th className="py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bodyProps).map(([name, schema]) => (
                <tr key={name} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-mono">
                    {name}
                    {bodyRequired.has(name) && <span className="text-red-500">*</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{schemaTypeLabel(schema)}</td>
                  <td className="py-1.5 text-muted-foreground">{schema.description ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CodeBlock code={buildCurl(operation)} language="curl" />
    </div>
  );
}

"use client";

import { CodeBlock } from "./CodeBlock";
import { METHOD_TONE } from "./methodTone";
import type { FlatOperation, OpenApiSchema } from "@/lib/api/openapi";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

// Compact docs tables: shorter header row, wrapping description cells.
const TH = "h-9 px-2 text-xs text-muted-foreground first:pl-0";
const TD = "px-2 py-1.5 text-xs whitespace-normal align-top first:pl-0";

export function OperationCard({ operation }: { operation: FlatOperation }) {
  const params = operation.parameters ?? [];
  const bodyProps = operation.requestBody?.schema.properties;
  const bodyRequired = new Set(operation.requestBody?.schema.required ?? []);

  return (
    <Card id={operation.operationId} className="scroll-mt-24 space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          tone={METHOD_TONE[operation.method] ?? "neutral"}
          className="font-mono font-semibold uppercase"
        >
          {operation.method}
        </Badge>
        <code className="min-w-0 font-mono text-sm break-all">/api/v1{operation.path}</code>
        <Badge variant="secondary" className="ml-auto font-mono">
          {operation["x-scope"]}
        </Badge>
      </div>

      <div>
        <h4 className="text-sm font-semibold">{operation.summary}</h4>
        {operation.description && (
          <p className="mt-1 text-xs text-muted-foreground">{operation.description}</p>
        )}
        <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
          operationId: {operation.operationId}
          {operation["x-binary"] && " · binary response"}
          {operation["x-multipart"] && " · multipart/form-data"}
        </p>
      </div>

      {params.length > 0 && (
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TH}>Parameter</TableHead>
              <TableHead className={TH}>In</TableHead>
              <TableHead className={TH}>Type</TableHead>
              <TableHead className={TH}>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {params.map((p) => (
              <TableRow key={`${p.in}-${p.name}`} className="hover:bg-transparent">
                <TableCell className={`${TD} font-mono whitespace-nowrap`}>
                  {p.name}
                  {(p.required || p.in === "path") && (
                    <span className="text-destructive" title="Required">*</span>
                  )}
                </TableCell>
                <TableCell className={`${TD} text-muted-foreground`}>{p.in}</TableCell>
                <TableCell className={`${TD} text-muted-foreground`}>{schemaTypeLabel(p.schema)}</TableCell>
                <TableCell className={`${TD} text-muted-foreground`}>{p.description ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {bodyProps && !operation["x-multipart"] && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Request body (JSON)</p>
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Field</TableHead>
                <TableHead className={TH}>Type</TableHead>
                <TableHead className={TH}>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(bodyProps).map(([name, schema]) => (
                <TableRow key={name} className="hover:bg-transparent">
                  <TableCell className={`${TD} font-mono whitespace-nowrap`}>
                    {name}
                    {bodyRequired.has(name) && (
                      <span className="text-destructive" title="Required">*</span>
                    )}
                  </TableCell>
                  <TableCell className={`${TD} text-muted-foreground`}>{schemaTypeLabel(schema)}</TableCell>
                  <TableCell className={`${TD} text-muted-foreground`}>{schema.description ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CodeBlock code={buildCurl(operation)} language="curl" />
    </Card>
  );
}

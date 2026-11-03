"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, KeyRound, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBlock } from "./CodeBlock";
import { OperationCard } from "./OperationCard";
import { METHOD_TONE } from "./methodTone";
import { ApiDocsJumpMenu, type JumpGroup } from "./ApiDocsJumpMenu";
import { listOperations, openApiSpec } from "@/lib/api/openapi";
import { SCOPE_MODULES } from "@/lib/apiScopes";

const REFERENCE_SECTIONS = [
  { id: "authentication", label: "Authentication" },
  { id: "scopes", label: "Scopes & access levels" },
  { id: "pagination", label: "Pagination & envelope" },
  { id: "rate-limits", label: "Rate limits" },
  { id: "errors", label: "Errors" },
  { id: "mcp-setup", label: "MCP setup" },
];

const ERROR_ROWS: { code: string; status: string; meaning: string }[] = [
  { code: "missing_token", status: "401", meaning: "No Authorization: Bearer header" },
  { code: "invalid_token", status: "401", meaning: "Unknown, revoked, or expired token" },
  { code: "rate_limited", status: "429", meaning: "Per-token limit exceeded (Retry-After header set)" },
  { code: "insufficient_scope", status: "403", meaning: "Token lacks the operation's scope" },
  { code: "resource_forbidden", status: "403", meaning: "Token is restricted to other clients/closers" },
  { code: "invalid_request", status: "400", meaning: "Validation failed (message explains)" },
  { code: "not_found", status: "404", meaning: "Resource does not exist" },
  { code: "conflict", status: "409", meaning: "Duplicate / stale optimistic-lock / already-processed" },
  { code: "payload_too_large", status: "413", meaning: "Upload exceeds the size cap" },
  { code: "internal_error", status: "500", meaning: "Unexpected server error" },
];

const MCP_CONFIG_EXAMPLE = `{
  "mcpServers": {
    "agency-collective": {
      "url": "https://<your-domain>/api/mcp/mcp",
      "headers": {
        "Authorization": "Bearer ac_live_..."
      }
    }
  }
}`;

/** Inline code in the reference prose. */
const IC = "rounded-md bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground";
// Compact reference tables: shorter header row, wrapping description cells.
const TH = "h-9 px-3 text-xs text-muted-foreground";
const TD = "px-3 py-2 text-xs whitespace-normal align-top";

export function ApiDocsPanel() {
  const [search, setSearch] = useState("");
  // Scope (= spec tag) filter; "all" shows every surface.
  const [scope, setScope] = useState("all");
  const operations = useMemo(() => listOperations(), []);

  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? operations.filter(
          (o) =>
            o.path.toLowerCase().includes(query) ||
            o.summary.toLowerCase().includes(query) ||
            o.operationId.toLowerCase().includes(query)
        )
      : operations;
  }, [operations, search]);

  const grouped = useMemo(
    () =>
      openApiSpec.tags.map((tag) => ({
        tag,
        operations:
          scope === "all" || scope === tag.name
            ? searched.filter((o) => o.tags[0] === tag.name)
            : [],
      })),
    [searched, scope]
  );

  const jumpGroups = useMemo<JumpGroup[]>(
    () => [
      { label: "Reference", items: REFERENCE_SECTIONS.map((s) => ({ id: s.id, label: s.label })) },
      ...grouped
        .filter(({ operations: ops }) => ops.length > 0)
        .map(({ tag, operations: ops }) => ({
          label: `${tag.name} (${ops.length})`,
          items: [
            { id: `surface-${tag.name}`, label: "Overview" },
            ...ops.map((o) => ({ id: o.operationId, label: `${o.method.toUpperCase()} ${o.path}` })),
          ],
        })),
    ],
    [grouped]
  );

  const visibleCount = grouped.reduce((n, g) => n + g.operations.length, 0);

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">API Documentation</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {openApiSpec.info.title} v{openApiSpec.info.version} — {operations.length} operations
              over REST (<code className="font-mono">/api/v1</code>) and MCP (
              <code className="font-mono">/api/mcp</code>).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                openapi.json
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild>
              <Link href="/dashboard/api-tokens">
                <KeyRound />
                Manage Tokens
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile jump-to nav — the sidebar is lg-only and the spec is ~200
            operations long; without this, phones can only scroll. */}
        <div className="lg:hidden sticky top-16 z-30 -mx-1 mb-4 rounded-3xl bg-background/90 p-1 shadow-sm ring-1 ring-foreground/5 backdrop-blur dark:ring-foreground/10">
          <ApiDocsJumpMenu groups={jumpGroups} />
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <nav aria-label="API reference" className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
              <div>
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference
                </p>
                {REFERENCE_SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block rounded-xl px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
              {grouped.map(({ tag, operations: ops }) =>
                ops.length === 0 ? null : (
                  <div key={tag.name}>
                    <a
                      href={`#surface-${tag.name}`}
                      className="mb-1.5 block px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      {tag.name} ({ops.length})
                    </a>
                    {ops.map((o) => (
                      <a
                        key={o.operationId}
                        href={`#${o.operationId}`}
                        className="flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={`${o.method.toUpperCase()} ${o.path}`}
                      >
                        <span
                          className={cn(
                            "inline-flex w-11 shrink-0 justify-center rounded-md border py-px font-mono text-[9px] font-bold uppercase",
                            badgeTone[METHOD_TONE[o.method] ?? "neutral"]
                          )}
                        >
                          {o.method}
                        </span>
                        <span className="truncate">{o.summary}</span>
                      </a>
                    ))}
                  </div>
                )
              )}
            </div>
          </nav>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-10">
            {/* Reference sections */}
            <section id="authentication" className="scroll-mt-24 space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">Authentication</h3>
              <p className="text-sm text-muted-foreground">
                Every request needs a bearer token minted at{" "}
                <Link href="/dashboard/api-tokens" className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
                  API Tokens
                </Link>
                . The plaintext secret (<code className={IC}>ac_live_…</code>) is shown once
                at creation and stored only as a SHA-256 hash. Revoked and expired tokens fail with
                the same <code className={IC}>invalid_token</code> error as unknown ones.
              </p>
              <CodeBlock
                language="curl"
                code={`curl "https://<your-domain>/api/v1/sops" \\\n  -H "Authorization: Bearer ac_live_..."`}
              />
            </section>

            <section id="scopes" className="scroll-mt-24 space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">Scopes & access levels</h3>
              <p className="text-sm text-muted-foreground">
                A token grants each resource one of <code className={IC}>read</code>,{" "}
                <code className={IC}>write</code>, or <code className={IC}>delete</code>{" "}
                — levels are ordinal (delete ⇒ write ⇒ read). Tokens can additionally be restricted
                to specific clients and/or closers; restricted list responses are filtered before
                pagination, and out-of-scope single items return{" "}
                <code className={IC}>resource_forbidden</code>.
              </p>
              <Card className="p-4">
                <Table className="min-w-[480px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>Resource</TableHead>
                      <TableHead className={TH}>Dashboard module</TableHead>
                      <TableHead className={TH}>Covers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SCOPE_MODULES.map((m) => (
                      <TableRow key={m.key} className="hover:bg-transparent">
                        <TableCell className={`${TD} font-mono`}>{m.key}</TableCell>
                        <TableCell className={TD}>{m.label}</TableCell>
                        <TableCell className={`${TD} text-muted-foreground`}>{m.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-muted-foreground">
                  Media manager-gated operations (delete documents, importance flags, readers)
                  require <code className={IC}>media:delete</code> — the token analogue of
                  the app&apos;s Head-of-Paid-Media permission.
                </p>
              </Card>
            </section>

            <section id="pagination" className="scroll-mt-24 space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">Pagination & envelope</h3>
              <p className="text-sm text-muted-foreground">
                Success responses are <code className={IC}>{"{ data, meta }"}</code>. Lists
                accept <code className={IC}>?limit</code> (max 200, default 50) and{" "}
                <code className={IC}>?offset</code>, and return{" "}
                <code className={IC}>meta.pagination</code>. All money fields are integer{" "}
                <strong className="text-foreground">cents</strong>; commission rates are basis points.
              </p>
              <CodeBlock
                language="json"
                code={`{
  "data": [ … ],
  "meta": {
    "cached": false,
    "timestamp": 1767225600000,
    "pagination": { "total": 132, "limit": 50, "offset": 0, "hasMore": true }
  }
}`}
              />
            </section>

            <section id="rate-limits" className="scroll-mt-24 space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">Rate limits</h3>
              <p className="text-sm text-muted-foreground">
                Each token is limited to <strong className="text-foreground">120 requests/minute</strong>. Exceeding it returns{" "}
                <code className={IC}>429 rate_limited</code> with a{" "}
                <code className={IC}>Retry-After</code> header (seconds). Usage is tracked
                per token per day and visible on the token card.
              </p>
            </section>

            <section id="errors" className="scroll-mt-24 space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">Errors</h3>
              <p className="text-sm text-muted-foreground">
                Errors are <code className={IC}>{"{ error, code }"}</code> with a stable
                machine-readable <code className={IC}>code</code>:
              </p>
              <Card className="p-4">
                <Table className="min-w-[420px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>Code</TableHead>
                      <TableHead className={TH}>Status</TableHead>
                      <TableHead className={TH}>Meaning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ERROR_ROWS.map((row) => (
                      <TableRow key={row.code} className="hover:bg-transparent">
                        <TableCell className={`${TD} font-mono`}>{row.code}</TableCell>
                        <TableCell className={`${TD} tabular-nums`}>{row.status}</TableCell>
                        <TableCell className={`${TD} text-muted-foreground`}>{row.meaning}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </section>

            <section id="mcp-setup" className="scroll-mt-24 space-y-3">
              <h3 className="text-lg font-semibold tracking-tight">MCP setup</h3>
              <p className="text-sm text-muted-foreground">
                The same tokens drive the in-app MCP server (Streamable HTTP) at{" "}
                <code className={IC}>/api/mcp/mcp</code>. Every REST operation (except binary
                downloads and file uploads) is exposed as an MCP tool named by its{" "}
                <code className={IC}>operationId</code>; scope and resource gating are
                identical to REST. Claude Desktop / Cursor config:
              </p>
              <CodeBlock language="json" code={MCP_CONFIG_EXAMPLE} />
            </section>

            {/* Operations: search + scope filter */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter operations by path, name, or summary…"
                  aria-label="Filter operations"
                  className="pl-9"
                />
              </div>
              <div role="group" aria-label="Filter by scope" className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant={scope === "all" ? "default" : "outline"}
                  aria-pressed={scope === "all"}
                  onClick={() => setScope("all")}
                >
                  All scopes
                  <span className="tabular-nums opacity-70">{searched.length}</span>
                </Button>
                {openApiSpec.tags.map((tag) => {
                  const count = searched.filter((o) => o.tags[0] === tag.name).length;
                  const active = scope === tag.name;
                  return (
                    <Button
                      key={tag.name}
                      type="button"
                      size="xs"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      onClick={() => setScope(active ? "all" : tag.name)}
                      className="font-mono"
                    >
                      {tag.name}
                      <span className="tabular-nums opacity-70">{count}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {visibleCount === 0 && (
              <Card className="px-6 py-12 text-center text-sm text-muted-foreground">
                No operations match this filter.
              </Card>
            )}

            {grouped.map(({ tag, operations: ops }) =>
              ops.length === 0 ? null : (
                <section key={tag.name} id={`surface-${tag.name}`} className="scroll-mt-24 space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight capitalize">{tag.name}</h3>
                    <p className="text-sm text-muted-foreground">{tag.description}</p>
                  </div>
                  {ops.map((operation) => (
                    <OperationCard key={operation.operationId} operation={operation} />
                  ))}
                </section>
              )
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CodeBlock } from "./CodeBlock";
import { OperationCard } from "./OperationCard";
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

export function ApiDocsPanel() {
  const [search, setSearch] = useState("");
  const operations = useMemo(() => listOperations(), []);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? operations.filter(
          (o) =>
            o.path.toLowerCase().includes(query) ||
            o.summary.toLowerCase().includes(query) ||
            o.operationId.toLowerCase().includes(query)
        )
      : operations;
    return openApiSpec.tags.map((tag) => ({
      tag,
      operations: filtered.filter((o) => o.tags[0] === tag.name),
    }));
  }, [operations, search]);

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black">API Documentation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {openApiSpec.info.title} v{openApiSpec.info.version} — {operations.length} operations
              over REST (<code className="font-mono">/api/v1</code>) and MCP (
              <code className="font-mono">/api/mcp</code>).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              openapi.json
            </a>
            <Link
              href="/dashboard/api-tokens"
              className="ac-gradient flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <KeyRound className="h-4 w-4" />
              Manage Tokens
            </Link>
          </div>
        </div>

        {/* Mobile jump-to nav — the sidebar is lg-only and the spec is ~170
            operations long; without this, phones can only scroll. */}
        <div className="lg:hidden sticky top-16 z-30 -mx-1 mb-4 rounded-lg border border-border bg-background/95 p-1.5 backdrop-blur">
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
              e.target.value = "";
            }}
            aria-label="Jump to section"
          >
            <option value="" disabled>
              Jump to section…
            </option>
            <optgroup label="Reference">
              {REFERENCE_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
            {grouped.map(({ tag, operations: ops }) =>
              ops.length === 0 ? null : (
                <optgroup key={tag.name} label={`${tag.name} (${ops.length})`}>
                  <option value={`surface-${tag.name}`}>Overview</option>
                  {ops.map((o) => (
                    <option key={o.operationId} value={o.operationId}>
                      {o.method.toUpperCase()} {o.path}
                    </option>
                  ))}
                </optgroup>
              )
            )}
          </select>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference
                </p>
                {REFERENCE_SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
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
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      {tag.name} ({ops.length})
                    </a>
                    {ops.map((o) => (
                      <a
                        key={o.operationId}
                        href={`#${o.operationId}`}
                        className="block truncate rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        title={`${o.method.toUpperCase()} ${o.path}`}
                      >
                        <span
                          className={cn(
                            "mr-1.5 font-mono text-[10px] font-bold uppercase",
                            o.method === "get" && "text-sky-500",
                            o.method === "post" && "text-emerald-500",
                            (o.method === "patch" || o.method === "put") && "text-amber-500",
                            o.method === "delete" && "text-red-500"
                          )}
                        >
                          {o.method}
                        </span>
                        {o.summary}
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
              <h2 className="text-lg font-bold">Authentication</h2>
              <p className="text-sm text-muted-foreground">
                Every request needs a bearer token minted at{" "}
                <Link href="/dashboard/api-tokens" className="text-primary hover:underline">
                  API Tokens
                </Link>
                . The plaintext secret (<code className="font-mono">ac_live_…</code>) is shown once
                at creation and stored only as a SHA-256 hash. Revoked and expired tokens fail with
                the same <code className="font-mono">invalid_token</code> error as unknown ones.
              </p>
              <CodeBlock
                language="curl"
                code={`curl "https://<your-domain>/api/v1/sops" \\\n  -H "Authorization: Bearer ac_live_..."`}
              />
            </section>

            <section id="scopes" className="scroll-mt-24 space-y-3">
              <h2 className="text-lg font-bold">Scopes & access levels</h2>
              <p className="text-sm text-muted-foreground">
                A token grants each resource one of <code className="font-mono">read</code>,{" "}
                <code className="font-mono">write</code>, or <code className="font-mono">delete</code>{" "}
                — levels are ordinal (delete ⇒ write ⇒ read). Tokens can additionally be restricted
                to specific clients and/or closers; restricted list responses are filtered before
                pagination, and out-of-scope single items return{" "}
                <code className="font-mono">resource_forbidden</code>.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Resource</th>
                      <th className="py-1.5 pr-3 font-medium">Dashboard module</th>
                      <th className="py-1.5 font-medium">Covers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCOPE_MODULES.map((m) => (
                      <tr key={m.key} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-mono">{m.key}</td>
                        <td className="py-1.5 pr-3">{m.label}</td>
                        <td className="py-1.5 text-muted-foreground">{m.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Media manager-gated operations (delete documents, importance flags, readers)
                  require <code className="font-mono">media:delete</code> — the token analogue of
                  the app&apos;s Head-of-Paid-Media permission.
                </p>
              </div>
            </section>

            <section id="pagination" className="scroll-mt-24 space-y-3">
              <h2 className="text-lg font-bold">Pagination & envelope</h2>
              <p className="text-sm text-muted-foreground">
                Success responses are <code className="font-mono">{"{ data, meta }"}</code>. Lists
                accept <code className="font-mono">?limit</code> (max 200, default 50) and{" "}
                <code className="font-mono">?offset</code>, and return{" "}
                <code className="font-mono">meta.pagination</code>. All money fields are integer{" "}
                <strong>cents</strong>; commission rates are basis points.
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
              <h2 className="text-lg font-bold">Rate limits</h2>
              <p className="text-sm text-muted-foreground">
                Each token is limited to <strong>120 requests/minute</strong>. Exceeding it returns{" "}
                <code className="font-mono">429 rate_limited</code> with a{" "}
                <code className="font-mono">Retry-After</code> header (seconds). Usage is tracked
                per token per day and visible on the token card.
              </p>
            </section>

            <section id="errors" className="scroll-mt-24 space-y-3">
              <h2 className="text-lg font-bold">Errors</h2>
              <p className="text-sm text-muted-foreground">
                Errors are <code className="font-mono">{"{ error, code }"}</code> with a stable
                machine-readable <code className="font-mono">code</code>:
              </p>
              <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Code</th>
                      <th className="py-1.5 pr-3 font-medium">Status</th>
                      <th className="py-1.5 font-medium">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ERROR_ROWS.map((row) => (
                      <tr key={row.code} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-mono">{row.code}</td>
                        <td className="py-1.5 pr-3">{row.status}</td>
                        <td className="py-1.5 text-muted-foreground">{row.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="mcp-setup" className="scroll-mt-24 space-y-3">
              <h2 className="text-lg font-bold">MCP setup</h2>
              <p className="text-sm text-muted-foreground">
                The same tokens drive the in-app MCP server (Streamable HTTP) at{" "}
                <code className="font-mono">/api/mcp/mcp</code>. Every REST operation (except binary
                downloads and file uploads) is exposed as an MCP tool named by its{" "}
                <code className="font-mono">operationId</code>; scope and resource gating are
                identical to REST. Claude Desktop / Cursor config:
              </p>
              <CodeBlock language="json" code={MCP_CONFIG_EXAMPLE} />
            </section>

            {/* Operations */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter operations by path, name, or summary…"
                  className="w-full bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {grouped.map(({ tag, operations: ops }) =>
              ops.length === 0 ? null : (
                <section key={tag.name} id={`surface-${tag.name}`} className="scroll-mt-24 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold capitalize">{tag.name}</h2>
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

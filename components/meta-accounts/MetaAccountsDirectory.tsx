"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Upload,
  Pencil,
  Trash2,
  Boxes,
  CheckCircle2,
  UserX,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipPopover } from "@/components/users/ChipPopover";
import { useMetaAccountOptions } from "@/hooks/useMetaAccountOptions";
import { MetaAccountFormModal } from "./MetaAccountFormModal";
import { MetaAccountOptionsModal } from "./MetaAccountOptionsModal";
import { MetaAccountImportModal } from "./MetaAccountImportModal";
import { CHIP_BASE, chipClass } from "./presentation";
import type {
  MetaAccountDirectoryRow,
  MetaAccountSummary,
  MetaClientOption,
} from "@/lib/metaAccountDirectory";
import { summarizeMetaAccounts } from "@/lib/metaAccountSummary";
import type { MetaAccount, MetaAccountInput } from "@/lib/metaAccounts";
import type { MetaOptionKind } from "@/lib/metaAccountOptions";

const PAGE_SIZE = 25;
const QUERY_KEY = ["admin-meta-accounts"];

interface DirectoryResponse {
  rows: MetaAccountDirectoryRow[];
  summary: MetaAccountSummary;
  clients: MetaClientOption[];
}

async function fetchDirectory(): Promise<DirectoryResponse> {
  const res = await fetch("/api/admin/meta-accounts");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as DirectoryResponse;
}

export function MetaAccountsDirectory() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [batchFilter, setBatchFilter] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<MetaAccountDirectoryRow | null>(null);
  const [manageKind, setManageKind] = useState<MetaOptionKind | null>(null);
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDirectory,
    staleTime: 30_000,
  });
  const { options: stages, labels: stageLabels, colors: stageColors } = useMetaAccountOptions("stage");
  const { options: statuses, labels: statusLabels, colors: statusColors } = useMetaAccountOptions("status");

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const summary = data?.summary;
  const clients = useMemo(() => data?.clients ?? [], [data]);
  // The last stage in the (admin-ordered) vocabulary is the warm-up goal —
  // never hardcode a slug, the vocabulary is fully editable.
  const finalStage = stages.length ? stages[stages.length - 1] : null;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  /**
   * Optimistically patch one row, PATCH the server, then reconcile the cache
   * from the returned row + a client-side summary recompute (shared
   * summarizeMetaAccounts) — no full-directory refetch per inline edit.
   * Errors fall back to invalidate (refetch = rollback to server truth).
   */
  async function patchAccount(id: string, changes: MetaAccountInput) {
    queryClient.setQueryData<DirectoryResponse>(QUERY_KEY, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...changes } as MetaAccountDirectoryRow;
          if ("clientId" in changes) {
            next.clientName = changes.clientId
              ? clients.find((c) => c.id === changes.clientId)?.name ?? null
              : null;
          }
          return next;
        }),
      };
    });
    try {
      const res = await fetch(`/api/admin/meta-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const server = ((await res.json()).data ?? null) as MetaAccount | null;
      if (server) {
        queryClient.setQueryData<DirectoryResponse>(QUERY_KEY, (prev) => {
          if (!prev) return prev;
          const rows = prev.rows.map((r) =>
            r.id === id
              ? {
                  ...server,
                  clientName: server.clientId
                    ? prev.clients.find((c) => c.id === server.clientId)?.name ?? null
                    : null,
                }
              : r
          );
          return { ...prev, rows, summary: summarizeMetaAccounts(rows) };
        });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save change");
      refresh();
    }
  }

  async function handleDelete(row: MetaAccountDirectoryRow) {
    if (!confirm(`Remove account "${row.fbEmail}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/meta-accounts/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove.");
    }
  }

  const batches = summary?.batches ?? [];

  // Precomputed per-row haystack (keyed on rows only) so typing in the search
  // box doesn't rebuild + lowercase every row's string per keystroke.
  const searchIndex = useMemo(
    () =>
      new Map(
        rows.map((r) => [
          r.id,
          `${r.fbEmail} ${r.profileLink ?? ""} ${r.assignee ?? ""} ${r.bmId ?? ""} ${r.clientName ?? ""} ${r.notes ?? ""}`.toLowerCase(),
        ])
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter.size && !(r.stage && stageFilter.has(r.stage))) return false;
      if (statusFilter.size && !(r.status && statusFilter.has(r.status))) return false;
      if (batchFilter && (r.batch ?? "Unbatched") !== batchFilter) return false;
      if (q && !(searchIndex.get(r.id) ?? "").includes(q)) return false;
      return true;
    });
  }, [rows, searchIndex, search, stageFilter, statusFilter, batchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  function toggle(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
    setPage(1);
  }

  const anyFilter = stageFilter.size > 0 || statusFilter.size > 0 || batchFilter !== "" || search !== "";

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={Boxes} label="Accounts" value={String(summary?.total ?? 0)} loading={isLoading} />
        <SummaryCard
          icon={CheckCircle2}
          label="Setup complete"
          value={String(summary?.setupComplete ?? 0)}
          sub="all 5 steps done"
          color="text-emerald-600 dark:text-emerald-400"
          loading={isLoading}
        />
        <SummaryCard
          icon={Boxes}
          label={finalStage?.label ?? "Final stage"}
          value={String((finalStage && summary?.byStage?.[finalStage.value]) ?? 0)}
          sub="final warm-up stage"
          color="text-emerald-600 dark:text-emerald-400"
          loading={isLoading}
        />
        <SummaryCard
          icon={UserX}
          label="Unassigned"
          value={String(summary?.unassignedClient ?? 0)}
          sub="no client linked"
          loading={isLoading}
        />
      </div>

      {/* Stage + Status filter cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FilterGroup
          title="Stage"
          onManage={() => setManageKind("stage")}
          pills={stages.map((o) => ({
            value: o.value,
            label: o.label,
            color: o.color,
            count: summary?.byStage?.[o.value] ?? 0,
            active: stageFilter.has(o.value),
          }))}
          onToggle={(v) => toggle(stageFilter, v, setStageFilter)}
        />
        <FilterGroup
          title="Status"
          onManage={() => setManageKind("status")}
          pills={statuses.map((o) => ({
            value: o.value,
            label: o.label,
            color: o.color,
            count: summary?.byStatus?.[o.value] ?? 0,
            active: statusFilter.has(o.value),
          }))}
          onToggle={(v) => toggle(statusFilter, v, setStatusFilter)}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search email, profile, access, BM ID…"
            className="w-full sm:max-w-xs rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {batches.length > 0 && (
            <select
              value={batchFilter}
              onChange={(e) => {
                setBatchFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.label} value={b.label}>
                  {b.label} ({b.count})
                </option>
              ))}
            </select>
          )}
          {anyFilter && (
            <button
              onClick={() => {
                setSearch("");
                setStageFilter(new Set());
                setStatusFilter(new Set());
                setBatchFilter("");
                setPage(1);
              }}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span className="whitespace-nowrap">Import</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap">Add account</span>
          </button>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to load accounts. Refresh the page to try again.
        </div>
      )}

      {/* Mobile card list — the 1500px table is unusable on a phone */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border/50 bg-muted/40" />
          ))
        ) : paginated.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No accounts yet. Import a sheet or click “Add account”."
              : "No accounts match your filters."}
          </div>
        ) : (
          paginated.map((row) => (
            <div key={row.id} className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground break-all">{row.fbEmail}</p>
                    {row.profileLink && (
                      <a
                        href={row.profileLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-muted-foreground hover:text-primary"
                        aria-label="Open FB profile"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {row.recoveryEmail && (
                    <p className="text-xs text-muted-foreground break-all">↳ {row.recoveryEmail}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconBtn title="Edit" onClick={() => setEditing(row)}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn title="Remove" danger onClick={() => handleDelete(row)}>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <InlineChipSelect
                  value={row.stage}
                  options={stages}
                  labels={stageLabels}
                  colors={stageColors}
                  placeholder="Set stage"
                  onChange={(v) => patchAccount(row.id, { stage: v })}
                />
                <InlineChipSelect
                  value={row.status}
                  options={statuses}
                  labels={statusLabels}
                  colors={statusColors}
                  placeholder="Set status"
                  onChange={(v) => patchAccount(row.id, { status: v })}
                />
              </div>

              <SetupToggles row={row} onPatch={(c) => patchAccount(row.id, c)} expanded />

              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Password</span>
                  <Secret value={row.fbPassword} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">2FA secret</span>
                  <Secret value={row.twofaSecret} link={row.twofaLink} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Mail pw</span>
                  <Secret value={row.mailPassword} />
                </div>
                {row.bmId && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">BM ID</span>
                    <CopyText value={row.bmId} className="text-xs font-mono text-foreground" />
                  </div>
                )}
                {row.assignee && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Access</span>
                    <span className="text-foreground">{row.assignee}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                <span className="text-xs text-muted-foreground">Client</span>
                <select
                  value={row.clientId ?? ""}
                  onChange={(e) => patchAccount(row.id, { clientId: e.target.value || null })}
                  className="min-w-0 max-w-[60%] rounded-md border border-border bg-background px-1.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">— Unassigned —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {row.notes && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">{row.notes}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Table */}
      <div className="hidden md:block rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1500px]">
            <thead>
              <tr className="bg-muted/30 dark:bg-white/[0.03] border-b border-border/50">
                <Th className="pl-4 sticky left-0 z-20 bg-muted/30 dark:bg-white/[0.03]">Account</Th>
                <Th>Password</Th>
                <Th>2FA secret</Th>
                <Th>Mail pw</Th>
                <Th>Setup</Th>
                <Th>BM ID</Th>
                <Th>Stage</Th>
                <Th>Status</Th>
                <Th>Client</Th>
                <Th>Access</Th>
                <Th className="text-right pr-4">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={11} className="px-4 py-3">
                      <div className="h-8 w-full animate-pulse rounded-lg bg-muted/60" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                      ? "No accounts yet. Import a sheet or click “Add account”."
                      : "No accounts match your filters."}
                  </td>
                </tr>
              ) : (
                paginated.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 dark:border-white/[0.06] hover:bg-muted/20 transition-colors align-top"
                  >
                    <td className="px-4 py-3 sticky left-0 z-10 bg-card">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-foreground truncate max-w-[220px]">{row.fbEmail}</p>
                        {row.profileLink && (
                          <a
                            href={row.profileLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                            title="Open FB profile"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      {row.recoveryEmail && (
                        <p className="text-xs text-muted-foreground truncate max-w-[220px]">↳ {row.recoveryEmail}</p>
                      )}
                      {row.notes && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate max-w-[220px]" title={row.notes}>
                          {row.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Secret value={row.fbPassword} />
                    </td>
                    <td className="px-4 py-3">
                      <Secret value={row.twofaSecret} link={row.twofaLink} />
                    </td>
                    <td className="px-4 py-3">
                      <Secret value={row.mailPassword} />
                    </td>
                    <td className="px-4 py-3">
                      <SetupToggles row={row} onPatch={(c) => patchAccount(row.id, c)} />
                    </td>
                    <td className="px-4 py-3">
                      {row.bmId ? (
                        <CopyText value={row.bmId} className="text-xs font-mono text-foreground" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <InlineChipSelect
                        value={row.stage}
                        options={stages}
                        labels={stageLabels}
                        colors={stageColors}
                        placeholder="Set stage"
                        onChange={(v) => patchAccount(row.id, { stage: v })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineChipSelect
                        value={row.status}
                        options={statuses}
                        labels={statusLabels}
                        colors={statusColors}
                        placeholder="Set status"
                        onChange={(v) => patchAccount(row.id, { status: v })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={row.clientId ?? ""}
                        onChange={(e) => patchAccount(row.id, { clientId: e.target.value || null })}
                        className="max-w-[150px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-foreground hover:border-border focus:border-primary focus:outline-none"
                      >
                        <option value="">— Unassigned —</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-foreground">{row.assignee || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Edit" onClick={() => setEditing(row)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn title="Remove" danger onClick={() => handleDelete(row)}>
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — shared by the mobile cards and the desktop table */}
      {totalPages > 1 && (
        <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Showing {paginated.length} of {filtered.length}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
              >
                &lsaquo;
              </button>
              <span className="px-2 flex items-center text-sm font-semibold text-foreground">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
              >
                &rsaquo;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <MetaAccountFormModal clients={clients} onClose={() => setShowAdd(false)} onSaved={refresh} />
      )}
      {editing && (
        <MetaAccountFormModal
          account={editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {manageKind && (
        <MetaAccountOptionsModal kind={manageKind} onClose={() => setManageKind(null)} />
      )}
      {showImport && (
        <MetaAccountImportModal onClose={() => setShowImport(false)} onImported={refresh} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider", className)}>
      {children}
    </th>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-md text-muted-foreground transition-colors",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  loading,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 w-20 rounded bg-muted/50 animate-pulse mt-1" />
      ) : (
        <>
          <p className={cn("text-2xl font-bold mt-1", color ?? "text-foreground")}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

function FilterGroup({
  title,
  pills,
  onToggle,
  onManage,
}: {
  title: string;
  pills: { value: string; label: string; color: string; count: number; active: boolean }[];
  onToggle: (value: string) => void;
  onManage: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <button
          onClick={onManage}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Manage
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {pills.length === 0 && <p className="text-xs text-muted-foreground">No options yet — click Manage.</p>}
        {pills.map((p) => (
          <button
            key={p.value}
            onClick={() => onToggle(p.value)}
            className={cn(
              CHIP_BASE,
              chipClass(p.color),
              "transition-all",
              p.active ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : "opacity-90 hover:opacity-100"
            )}
          >
            {p.label}
            <span className="ml-0.5 opacity-70">{p.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Inline chip that opens a small menu to change stage/status. */
function InlineChipSelect({
  value,
  options,
  labels,
  colors,
  placeholder,
  onChange,
}: {
  value: string | null;
  options: { value: string; label: string; color: string }[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  placeholder: string;
  onChange: (value: string | null) => void;
}) {
  // Rendered through the portal-based ChipPopover so the menu isn't clipped
  // by (or dragged along with) the table's overflow-x-auto scroll container.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = value ? labels[value] ?? value : null;
  const color = value ? colors[value] : undefined;

  return (
    <div className="relative">
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={cn(
          value ? cn(CHIP_BASE, chipClass(color)) : "text-xs text-muted-foreground italic px-2 py-0.5",
          "hover:opacity-80"
        )}
      >
        {label ?? placeholder}
      </button>
      {anchor && (
        <ChipPopover anchor={anchor} onClose={() => setAnchor(null)} width={200}>
          <div className="p-1">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value === value ? null : o.value);
                  setAnchor(null);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  o.value === value && "bg-muted/60"
                )}
              >
                <span className={cn(CHIP_BASE, chipClass(o.color))}>{o.label}</span>
              </button>
            ))}
            {value && (
              <button
                onClick={() => {
                  onChange(null);
                  setAnchor(null);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </ChipPopover>
      )}
    </div>
  );
}

/**
 * Five setup steps as toggleable badges: letters (L P A B C) in the dense
 * table, spelled-out labels when `expanded` (the mobile cards — letters alone
 * carry no meaning on touch, where title-tooltips don't exist).
 */
function SetupToggles({
  row,
  onPatch,
  expanded,
}: {
  row: MetaAccountDirectoryRow;
  onPatch: (changes: MetaAccountInput) => void;
  expanded?: boolean;
}) {
  const steps: { key: keyof MetaAccountInput; letter: string; title: string; on: boolean }[] = [
    { key: "loginOk", letter: "L", title: "Login OK", on: row.loginOk },
    { key: "pageMade", letter: "P", title: "Page made", on: row.pageMade },
    { key: "adAccountMade", letter: "A", title: "Ad account made", on: row.adAccountMade },
    { key: "bmMade", letter: "B", title: "BM made", on: row.bmMade },
    { key: "cardAdded", letter: "C", title: "Card added", on: row.cardAdded },
  ];
  return (
    <div className={cn("flex items-center gap-1", expanded && "flex-wrap gap-1.5")}>
      {steps.map((s) => (
        <button
          key={s.key}
          title={`${s.title}: ${s.on ? "yes" : "no"}`}
          onClick={() => onPatch({ [s.key]: !s.on } as MetaAccountInput)}
          className={cn(
            "rounded-md font-bold flex items-center justify-center transition-colors",
            expanded ? "h-8 px-2.5 text-[11px]" : "h-8 w-8 text-[11px]",
            s.on
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          {expanded ? s.title : s.letter}
        </button>
      ))}
    </div>
  );
}

/** Masked secret with reveal + copy. */
function Secret({ value, link }: { value: string | null; link?: string | null }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "text-xs font-mono text-foreground",
          shown ? "max-w-[220px] break-all" : "max-w-[130px] truncate"
        )}
      >
        {shown ? value : "••••••••"}
      </span>
      <button
        onClick={() => setShown((s) => !s)}
        className="p-2 -m-0.5 rounded text-muted-foreground hover:text-foreground"
        title={shown ? "Hide" : "Reveal"}
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <CopyBtn value={value} />
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded text-muted-foreground hover:text-primary"
          title="Open 2FA link"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function CopyText({ value, className }: { value: string; className?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn("max-w-[110px] truncate", className)} title={value}>
        {value}
      </span>
      <CopyBtn value={value} />
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="p-1 rounded text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

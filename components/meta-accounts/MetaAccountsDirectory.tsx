"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
  ChevronDown,
  ExternalLink,
  SlidersHorizontal,
  StickyNote,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeButtonClass, badgeTone, badgeToneHover, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TOUCH_TARGET } from "@/components/ui/touch";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/ui/use-confirm";
import { useMetaAccountOptions } from "@/hooks/useMetaAccountOptions";
import { chipClass, swatchClass } from "./presentation";
import type {
  MetaAccountDirectoryRow,
  MetaAccountSummary,
  MetaClientOption,
} from "@/lib/metaAccountDirectory";
import { summarizeMetaAccounts } from "@/lib/metaAccountSummary";
import { metaAccountLinkHref } from "@/lib/metaAccountRules";
import type { MetaAccount, MetaAccountInput } from "@/lib/metaAccounts";
import type { MetaOptionKind } from "@/lib/metaAccountOptions";

// Click-to-open UI stays out of the page chunk: the three modals and the
// stage/status chip menu (a Radix Popover) load on first open.
const MetaAccountFormModal = dynamic(
  () => import("./MetaAccountFormModal").then((m) => m.MetaAccountFormModal),
  { ssr: false }
);
const MetaAccountOptionsModal = dynamic(
  () => import("./MetaAccountOptionsModal").then((m) => m.MetaAccountOptionsModal),
  { ssr: false }
);
const MetaAccountImportModal = dynamic(
  () => import("./MetaAccountImportModal").then((m) => m.MetaAccountImportModal),
  { ssr: false }
);
const ChipPopover = dynamic(
  () => import("@/components/users/ChipPopover").then((m) => m.ChipPopover),
  { ssr: false }
);

const PAGE_SIZE = 25;
const QUERY_KEY = ["admin-meta-accounts"];
const COL_COUNT = 12;
// The pinned Account column's right divider. A box-shadow, not border-r: with
// border-collapse a cell border belongs to the table grid and scrolls away
// from the sticky cell.
const STICKY_DIVIDER = "shadow-[inset_-1px_0_0_hsl(var(--border))]";

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
  const { confirm, dialog } = useConfirm();
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
    if (
      !(await confirm({
        title: `Remove account "${row.fbEmail}"?`,
        description: "This cannot be undone.",
        confirmText: "Remove",
        destructive: true,
      }))
    )
      return;
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
          `${r.fbEmail} ${r.profileName ?? ""} ${r.profileLink ?? ""} ${r.assignee ?? ""} ${r.bmId ?? ""} ${r.clientName ?? ""} ${r.notes ?? ""}`.toLowerCase(),
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
  const emptyText =
    rows.length === 0
      ? "No accounts yet. Import a sheet or click “Add account”."
      : "No accounts match your filters.";

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
          loading={isLoading}
        />
        <SummaryCard
          icon={Boxes}
          label={finalStage?.label ?? "Final stage"}
          value={String((finalStage && summary?.byStage?.[finalStage.value]) ?? 0)}
          sub="final warm-up stage"
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search email, profile, access, BM ID…"
            aria-label="Search accounts"
            className="min-w-0 flex-1 basis-56 sm:max-w-xs"
          />
          {batches.length > 0 && (
            <NativeSelect
              value={batchFilter}
              onChange={(e) => {
                setBatchFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by batch"
              className="max-w-full"
            >
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.label} value={b.label}>
                  {b.label} ({b.count})
                </option>
              ))}
            </NativeSelect>
          )}
          {anyFilter && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStageFilter(new Set());
                setStatusFilter(new Set());
                setBatchFilter("");
                setPage(1);
              }}
              className="text-muted-foreground"
            >
              <X />
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="flex-1 sm:flex-none">
            <Upload />
            Import
          </Button>
          <Button onClick={() => setShowAdd(true)} className="flex-1 sm:flex-none">
            <Plus />
            Add account
          </Button>
        </div>
      </div>

      {isError && (
        <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
          Failed to load accounts. Refresh the page to try again.
        </div>
      )}

      <Card>
        {/* Desktop table — wide (12 columns), scrolls inside its own wrapper
            with the account column pinned. */}
        <div className="hidden md:block">
          <Table className="min-w-[1600px] text-left">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th className={cn("sticky left-0 z-20 bg-card", STICKY_DIVIDER)}>Account</Th>
                <Th>Profile name</Th>
                <Th>Password</Th>
                <Th>2FA secret</Th>
                <Th>Mail pw</Th>
                <Th>Setup</Th>
                <Th>BM ID</Th>
                <Th>Stage</Th>
                <Th>Status</Th>
                <Th>Client</Th>
                <Th>Access</Th>
                <Th className="text-right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell colSpan={COL_COUNT} className="px-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COL_COUNT} className="px-4 py-12 text-center text-muted-foreground">
                    {emptyText}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((row) => (
                  <TableRow key={row.id}>
                    <Td className={cn("sticky left-0 z-10 bg-card", STICKY_DIVIDER)}>
                      <div className="flex items-center gap-1.5">
                        <p className="max-w-[220px] truncate font-medium">{row.fbEmail}</p>
                        {row.profileLink && <ProfileLink value={row.profileLink} />}
                      </div>
                      {row.profileLink && (
                        <ProfileText value={row.profileLink} className="max-w-[220px] truncate" />
                      )}
                      {row.recoveryEmail && (
                        <p className="max-w-[220px] truncate text-xs text-muted-foreground">↳ {row.recoveryEmail}</p>
                      )}
                      {row.notes && (
                        <p
                          className="mt-0.5 flex max-w-[220px] items-center gap-1 text-xs text-muted-foreground"
                          title={row.notes}
                        >
                          <StickyNote className="size-3 shrink-0" />
                          <span className="truncate">{row.notes}</span>
                        </p>
                      )}
                    </Td>
                    <Td>
                      {row.profileName ? (
                        <span className="whitespace-nowrap">{row.profileName}</span>
                      ) : (
                        <Dash />
                      )}
                    </Td>
                    <Td>
                      <Secret value={row.fbPassword} label="FB password" />
                    </Td>
                    <Td>
                      <Secret value={row.twofaSecret} link={row.twofaLink} label="2FA secret" />
                    </Td>
                    <Td>
                      <Secret value={row.mailPassword} label="Mail password" />
                    </Td>
                    <Td>
                      <SetupToggles row={row} onPatch={(c) => patchAccount(row.id, c)} />
                    </Td>
                    <Td>
                      {row.bmId ? <CopyText value={row.bmId} label="BM ID" /> : <Dash />}
                    </Td>
                    <Td>
                      <InlineChipSelect
                        value={row.stage}
                        options={stages}
                        labels={stageLabels}
                        colors={stageColors}
                        placeholder="Set stage"
                        kindLabel="Stage"
                        onChange={(v) => patchAccount(row.id, { stage: v })}
                      />
                    </Td>
                    <Td>
                      <InlineChipSelect
                        value={row.status}
                        options={statuses}
                        labels={statusLabels}
                        colors={statusColors}
                        placeholder="Set status"
                        kindLabel="Status"
                        onChange={(v) => patchAccount(row.id, { status: v })}
                      />
                    </Td>
                    <Td>
                      <ClientSelect
                        value={row.clientId}
                        clients={clients}
                        account={row.fbEmail}
                        ghost
                        className="w-[170px]"
                        onChange={(clientId) => patchAccount(row.id, { clientId })}
                      />
                    </Td>
                    <Td>
                      <span className="text-xs">{row.assignee || "—"}</span>
                    </Td>
                    <Td>
                      <RowActions
                        onEdit={() => setEditing(row)}
                        onRemove={() => handleDelete(row)}
                        className="justify-end"
                      />
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards — the 1600px table is unusable on a phone */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            <div className="divide-y">
              {paginated.map((row) => (
                <div key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="break-all text-sm font-medium">{row.fbEmail}</p>
                        {row.profileLink && <ProfileLink value={row.profileLink} />}
                      </div>
                      {row.profileLink && <ProfileText value={row.profileLink} className="break-all" />}
                      {row.profileName && <p className="text-xs">{row.profileName}</p>}
                      {row.recoveryEmail && (
                        <p className="break-all text-xs text-muted-foreground">↳ {row.recoveryEmail}</p>
                      )}
                    </div>
                    <RowActions
                      onEdit={() => setEditing(row)}
                      onRemove={() => handleDelete(row)}
                      className="shrink-0"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <InlineChipSelect
                      value={row.stage}
                      options={stages}
                      labels={stageLabels}
                      colors={stageColors}
                      placeholder="Set stage"
                      kindLabel="Stage"
                      onChange={(v) => patchAccount(row.id, { stage: v })}
                    />
                    <InlineChipSelect
                      value={row.status}
                      options={statuses}
                      labels={statusLabels}
                      colors={statusColors}
                      placeholder="Set status"
                      kindLabel="Status"
                      onChange={(v) => patchAccount(row.id, { status: v })}
                    />
                  </div>

                  <SetupToggles row={row} onPatch={(c) => patchAccount(row.id, c)} expanded />

                  <div className="grid grid-cols-1 gap-1.5 text-xs">
                    <MobileField label="Password">
                      <Secret value={row.fbPassword} label="FB password" />
                    </MobileField>
                    <MobileField label="2FA secret">
                      <Secret value={row.twofaSecret} link={row.twofaLink} label="2FA secret" />
                    </MobileField>
                    <MobileField label="Mail pw">
                      <Secret value={row.mailPassword} label="Mail password" />
                    </MobileField>
                    {row.bmId && (
                      <MobileField label="BM ID">
                        <CopyText value={row.bmId} label="BM ID" />
                      </MobileField>
                    )}
                    {row.assignee && (
                      <MobileField label="Access">
                        <span className="min-w-0 truncate">{row.assignee}</span>
                      </MobileField>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs text-muted-foreground">Client</span>
                    <ClientSelect
                      value={row.clientId}
                      clients={clients}
                      account={row.fbEmail}
                      className="w-[60%]"
                      onChange={(clientId) => patchAccount(row.id, { clientId })}
                    />
                  </div>

                  {row.notes && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <StickyNote className="mt-0.5 size-3 shrink-0" />
                      <span className="min-w-0">{row.notes}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination — shared by the mobile cards and the desktop table */}
        {totalPages > 1 && (
          <div className="border-t px-4 pb-3">
            <Pagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              totalItems={filtered.length}
              onPageChange={setPage}
              itemLabel={`Showing ${paginated.length} of ${filtered.length}`}
            />
          </div>
        )}
      </Card>

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
      {dialog}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TableHead className={cn("px-4 text-muted-foreground", className)}>{children}</TableHead>;
}

/** Body cell with the directory's padding; content may wrap (revealed secrets, chips). */
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TableCell className={cn("px-4 py-3 align-top whitespace-normal", className)}>{children}</TableCell>;
}

function Dash() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * FB profile link icon — only for an http(s) URL. Stored values come from
 * sheets, the API and agents, so anything else (javascript:, plain text) is
 * never put in an href; ProfileText shows it as text instead.
 */
function ProfileLink({ value }: { value: string }) {
  const href = metaAccountLinkHref(value);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        TOUCH_TARGET,
        "shrink-0 rounded-full p-1.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 md:p-1 [@media(pointer:coarse)]:after:-inset-1.5"
      )}
      title="Open FB profile"
      aria-label="Open FB profile"
    >
      <ExternalLink className="size-3.5" />
    </a>
  );
}

/** A stored profile "link" that isn't a web link, shown as plain text. */
function ProfileText({ value, className }: { value: string; className?: string }) {
  if (metaAccountLinkHref(value)) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)} title={value}>
      Profile: {value}
    </p>
  );
}

/** Edit + Remove — 40px touch targets on phones, dense on desktop. */
function RowActions({
  onEdit,
  onRemove,
  className,
}: {
  onEdit: () => void;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onEdit}
        title="Edit"
        aria-label="Edit"
        className="size-10 text-muted-foreground md:size-8"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        title="Remove"
        aria-label="Remove"
        className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:size-8"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
        <CardDescription className="truncate">{label}</CardDescription>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className="truncate text-2xl font-semibold tracking-tight tabular-nums" title={value}>
              {value}
            </div>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Stage / Status count card — each pill is a one-click filter. */
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
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-4 pb-1 pt-3 md:px-4 md:pb-1 md:pt-3">
        <span className="text-xs text-muted-foreground">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onManage}
          className="-my-1 -mr-1.5 ml-auto text-muted-foreground"
          title={`Manage ${title.toLowerCase()} options`}
          aria-label={`Manage ${title.toLowerCase()} options`}
        >
          <SlidersHorizontal />
          Manage
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-1 px-2 pb-2 pt-0 md:px-2 md:pb-2 md:pt-0">
        {pills.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No options yet — click Manage.</p>
        )}
        {pills.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onToggle(p.value)}
            aria-pressed={p.active}
            title={p.active ? "Click to clear this filter" : "Click to filter"}
            className={cn(
              "rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30",
              p.active && "bg-muted ring-1 ring-foreground/10 hover:bg-muted"
            )}
          >
            <span className="block text-xl font-semibold leading-none tracking-tight tabular-nums">
              {p.count}
            </span>
            <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              <BadgeDot className={swatchClass(p.color)} />
              {p.label}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

/** Inline chip that opens a small menu to change stage/status. */
function InlineChipSelect({
  value,
  options,
  labels,
  colors,
  placeholder,
  kindLabel,
  onChange,
}: {
  value: string | null;
  options: { value: string; label: string; color: string }[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  placeholder: string;
  kindLabel: string;
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
        type="button"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        aria-label={`${kindLabel}: ${label ?? "not set"} — change`}
        className={cn(
          value
            ? chipClass(color, true)
            : cn(
                badgeVariants({ variant: "outline" }),
                "border-dashed font-normal text-muted-foreground",
                badgeToneHover.neutral
              ),
          // ≥24px touch target on phones; the dense badge height on desktop.
          "h-7 cursor-pointer px-2.5 md:h-5 md:px-2",
          // + a larger hit area on touch screens (tablets get the dense chip).
          badgeButtonClass
        )}
      >
        {value && <BadgeDot className={swatchClass(color)} />}
        {label ?? placeholder}
      </button>
      {anchor && (
        <ChipPopover
          anchor={anchor}
          onClose={() => setAnchor(null)}
          width={240}
          label={`${kindLabel} options`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value === value ? null : o.value);
                setAnchor(null);
              }}
              aria-pressed={o.value === value}
              title={o.label}
              className={cn(
                "flex w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                o.value === value && "bg-muted"
              )}
            >
              {/* Long labels (up to 40 chars) truncate inside the menu. */}
              <span className={cn(chipClass(o.color), "min-w-0 shrink")}>
                <BadgeDot className={swatchClass(o.color)} />
                <span className="truncate">{o.label}</span>
              </span>
              {o.value === value && <Check className="ml-auto size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
          {value && (
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setAnchor(null);
                }}
                aria-label={`Clear ${kindLabel.toLowerCase()}`}
                className="flex w-full items-center rounded-2xl px-2.5 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
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
          type="button"
          title={`${s.title}: ${s.on ? "yes" : "no"}`}
          aria-label={s.title}
          aria-pressed={s.on}
          onClick={() => onPatch({ [s.key]: !s.on } as MetaAccountInput)}
          className={cn(
            "flex h-8 items-center justify-center rounded-full border text-[11px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
            expanded ? "px-3" : "w-8",
            s.on
              ? cn(badgeTone.success, badgeToneHover.success)
              : // Outline = not done. Full muted-foreground on the card keeps
                // the letter ≥4.5:1 in both themes.
                "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {expanded ? s.title : s.letter}
        </button>
      ))}
    </div>
  );
}

/**
 * Masked secret with reveal + copy. Plaintext by product decision — never log
 * it. `link` (the 2FA link) opens only when it's an http(s) URL; any other
 * stored value is shown as text while revealed, never put in an href.
 */
function Secret({ value, link, label }: { value: string | null; link?: string | null; label: string }) {
  const [shown, setShown] = useState(false);
  if (!value) return <Dash />;
  const href = metaAccountLinkHref(link);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-0.5">
        <span
          className={cn(
            "mr-0.5 font-mono text-xs",
            shown ? "max-w-[220px] break-all" : "max-w-[130px] truncate"
          )}
        >
          {shown ? value : "••••••••"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setShown((s) => !s)}
          title={shown ? "Hide" : "Reveal"}
          aria-label={`${shown ? "Hide" : "Reveal"} ${label}`}
          className="size-8 shrink-0 text-muted-foreground md:size-6"
        >
          {shown ? <EyeOff /> : <Eye />}
        </Button>
        <CopyBtn value={value} label={label} />
        {href && (
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            className="size-8 shrink-0 text-muted-foreground md:size-6"
          >
            <a href={href} target="_blank" rel="noopener noreferrer" title="Open 2FA link" aria-label="Open 2FA link">
              <ExternalLink />
            </a>
          </Button>
        )}
      </div>
      {shown && link && !href && (
        <p className="max-w-[220px] break-all text-xs text-muted-foreground">2FA link: {link}</p>
      )}
    </div>
  );
}

function CopyText({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <span className="mr-0.5 max-w-[110px] truncate font-mono text-xs" title={value}>
        {value}
      </span>
      <CopyBtn value={value} label={label} />
    </div>
  );
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      title="Copy"
      aria-label={`Copy ${label}`}
      className="size-8 shrink-0 text-muted-foreground md:size-6"
    >
      {copied ? <Check className="text-foreground" /> : <Copy />}
    </Button>
  );
}

/** Client link picker — "" = unassigned (sent as null). */
function ClientSelect({
  value,
  clients,
  account,
  ghost,
  className,
  onChange,
}: {
  value: string | null;
  clients: MetaClientOption[];
  account: string;
  ghost?: boolean;
  className?: string;
  onChange: (clientId: string | null) => void;
}) {
  return (
    <NativeSelect
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={`Client for ${account}`}
      ghost={ghost}
      className={className}
    >
      <option value="">— Unassigned —</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * Native <select> dressed as the kit SelectTrigger. Kept native on purpose:
 * one per table row (25 a page) plus the batch filter — no Radix Select in
 * the page chunk, and phones get their own picker. `ghost` = the borderless
 * in-table look that fills on hover. `className` sizes the wrapper.
 */
function NativeSelect({
  className,
  ghost,
  ...props
}: React.ComponentProps<"select"> & { ghost?: boolean }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        {...props}
        className={cn(
          "flex w-full cursor-pointer appearance-none truncate rounded-3xl border border-transparent pl-3 pr-8 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:[color-scheme:dark] [&_option]:bg-popover [&_option]:text-popover-foreground",
          ghost ? "h-8 bg-transparent hover:bg-muted" : "h-9 bg-input/50"
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

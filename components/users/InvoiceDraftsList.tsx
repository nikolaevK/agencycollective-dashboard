"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import { formatCentsExact } from "@/lib/format";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { InvoiceDraftKind, InvoiceDraftSummary } from "@/lib/invoiceDrafts";
import type { AdAccountInvoiceTarget } from "./AdAccountInvoiceDrawer";
import { cn } from "@/lib/utils";

// Drawers pull in @react-pdf — mount only when a draft is opened.
const ClientInvoiceDrawer = dynamic(
  () => import("./ClientInvoiceDrawer").then((m) => m.ClientInvoiceDrawer),
  { ssr: false }
);
const AdAccountInvoiceDrawer = dynamic(
  () => import("./AdAccountInvoiceDrawer").then((m) => m.AdAccountInvoiceDrawer),
  { ssr: false }
);

export type InvoiceDraftRow = InvoiceDraftSummary & { clientName: string | null; accountName: string | null };

interface Filter {
  userId?: string;
  adAccountId?: string;
  kind?: InvoiceDraftKind;
}

/** Pending invoice drafts (scoped server-side to the viewer's books). */
export function useInvoiceDrafts(filter: Filter = {}) {
  return useQuery<InvoiceDraftRow[]>({
    queryKey: ["invoice-drafts", "pending", filter.userId ?? "", filter.adAccountId ?? "", filter.kind ?? ""],
    queryFn: async () => {
      const p = new URLSearchParams({ status: "pending" });
      if (filter.userId) p.set("userId", filter.userId);
      if (filter.adAccountId) p.set("adAccountId", filter.adAccountId);
      if (filter.kind) p.set("kind", filter.kind);
      const res = await fetch(`/api/admin/clients/invoice-drafts?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

interface AdAccountRowLite {
  id: string;
  accountName: string;
  vendor: string | null;
  adSpendFeeBps: number;
  monthlyRetainerCents: number;
  clientName: string | null;
  clientEmail: string | null;
  schedule: { nextRebillAt: string | null };
}

/**
 * Pending invoice drafts with Review / Reject / Discard. Review opens the
 * normal drawer seeded from the draft; sending there emails, files and
 * records it exactly like a fresh invoice, and marks the draft sent.
 */
export function InvoiceDraftsList({
  filter = {},
  emptyText,
  onChanged,
}: {
  filter?: Filter;
  /** Shown when empty; omit to render nothing. */
  emptyText?: string;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: drafts = [], isLoading, isError, refetch } = useInvoiceDrafts(filter);
  const [open, setOpen] = useState<
    | { kind: "client_rebill"; draft: InvoiceDraftRow }
    | { kind: "ad_account"; draft: InvoiceDraftRow; target: AdAccountInvoiceTarget }
    | null
  >(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  function refreshAfterSend(d: InvoiceDraftRow) {
    for (const key of [
      ["invoice-drafts"],
      ["admin-users"],
      ["admin-sent-invoices"],
      ["admin-rebill-alerts"],
      ["admin-ad-accounts"],
      ["admin-ad-account-invoices"],
      ["admin-ad-account-sent-invoices"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    if (d.userId) {
      queryClient.invalidateQueries({ queryKey: ["client-billing", d.userId] });
      queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", d.userId] });
      queryClient.invalidateQueries({ queryKey: ["client-documents", d.userId] });
    }
    onChanged?.();
  }

  async function review(d: InvoiceDraftRow) {
    setRowError(null);
    if (d.kind === "client_rebill") {
      setOpen({ kind: "client_rebill", draft: d });
      return;
    }
    // The drawer needs the account's billing context (fee, retainer, next
    // cycle) — the same rows the Ad Accounts tab shows (shared cache).
    setBusyId(d.id);
    try {
      const dir = await queryClient.fetchQuery<{ rows: AdAccountRowLite[] }>({
        queryKey: ["admin-ad-accounts"],
        queryFn: async () => {
          const res = await fetch("/api/admin/ad-accounts");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()).data;
        },
        staleTime: 30_000,
      });
      const row = dir.rows.find((r) => r.id === d.adAccountId);
      if (!row) throw new Error("Ad account not found");
      setOpen({
        kind: "ad_account",
        draft: d,
        target: {
          id: row.id,
          accountName: row.accountName,
          vendor: row.vendor,
          adSpendFeeBps: row.adSpendFeeBps,
          monthlyRetainerCents: row.monthlyRetainerCents,
          clientName: row.clientName,
          clientEmail: row.clientEmail,
          nextRebillAt: row.schedule.nextRebillAt,
        },
      });
    } catch (e) {
      setRowError({ id: d.id, message: e instanceof Error ? e.message : "Couldn't open the draft" });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(d: InvoiceDraftRow) {
    setBusyId(d.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/clients/invoice-drafts/${d.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: rejectNote.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRejectingId(null);
      setRejectNote("");
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
    } catch (e) {
      setRowError({ id: d.id, message: e instanceof Error ? e.message : "Couldn't reject" });
    } finally {
      setBusyId(null);
    }
  }

  async function discard(d: InvoiceDraftRow) {
    if (!window.confirm(`Discard draft ${d.invoiceNumber}? Nothing was sent; this just removes it.`)) return;
    setBusyId(d.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/clients/invoice-drafts/${d.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
    } catch (e) {
      setRowError({ id: d.id, message: e instanceof Error ? e.message : "Couldn't discard" });
    } finally {
      setBusyId(null);
    }
  }

  // The list body is built separately so the open drawer below ALWAYS stays
  // mounted — sending the last draft empties the list (or a background refetch
  // fails) and must not unmount the drawer mid-confirmation / with edits.
  let list: ReactNode = null;
  if (isLoading) {
    list = emptyText ? (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ) : null;
  } else if (drafts.length === 0) {
    list = emptyText && !isError ? <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p> : null;
  } else {
    list = (
      <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-violet-500/30 bg-violet-500/[0.03]">
        {drafts.map((d) => (
          <li key={d.id} className="px-4 py-3">
            {/* Actions wrap under the text on phones so the name/meta keep their width. */}
            <div className="flex flex-wrap items-start gap-3">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {d.kind === "ad_account" ? d.accountName : d.clientName}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-foreground">{formatCentsExact(d.amountCents)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      d.kind === "ad_account"
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                        : "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                    )}
                  >
                    {d.kind === "ad_account" ? "Ad account" : "Re-bill"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {d.kind === "ad_account" && d.clientName ? `${d.clientName} · ` : ""}
                  {d.invoiceNumber} · by {d.createdByName ?? (d.source === "api" ? "agent" : "teammate")} ·{" "}
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
                {d.note && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-foreground">{d.note}</p>}
                {rowError?.id === d.id && <p className="mt-1 text-xs text-destructive">{rowError.message}</p>}
                {rejectingId === d.id && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Reason (shared with whoever prepared it)"
                      aria-label="Rejection reason"
                      className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => reject(d)}
                        disabled={busyId === d.id}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-60 sm:h-auto"
                      >
                        {busyId === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Reject draft
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(null)}
                        className="h-9 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 basis-full items-center justify-end gap-1 sm:basis-auto">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(rejectingId === d.id ? null : d.id);
                    setRejectNote("");
                  }}
                  className="h-9 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:h-auto"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => discard(d)}
                  disabled={busyId === d.id}
                  className="flex h-9 w-9 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 sm:h-auto sm:w-auto"
                  aria-label={`Discard draft ${d.invoiceNumber}`}
                  title="Discard"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => review(d)}
                  disabled={busyId === d.id}
                  className="flex h-9 items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-60 sm:h-auto"
                >
                  {busyId === d.id && rejectingId !== d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Review
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {isError && (
        <p
          className={cn(
            "rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive",
            drafts.length > 0 && "mb-2"
          )}
        >
          Couldn&apos;t load invoice drafts.{" "}
          <button type="button" onClick={() => refetch()} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}
      {list}

      {open?.kind === "client_rebill" && open.draft.userId && (
        <ClientInvoiceDrawer
          userId={open.draft.userId}
          clientName={open.draft.clientName ?? ""}
          draftId={open.draft.id}
          onClose={() => setOpen(null)}
          onSent={() => refreshAfterSend(open.draft)}
        />
      )}
      {open?.kind === "ad_account" && (
        <AdAccountInvoiceDrawer
          adAccount={open.target}
          draftId={open.draft.id}
          onClose={() => setOpen(null)}
          onSent={() => refreshAfterSend(open.draft)}
        />
      )}
    </>
  );
}

/** Client Directory's "Drafts" panel — every pending invoice draft the viewer can see. */
export function InvoiceDraftsPanel({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invoice drafts"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Invoice drafts</h3>
            <p className="text-xs text-muted-foreground">
              Prepared by agents (API / MCP) or saved from a drawer. Nothing here has been sent — review, then send or reject.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <InvoiceDraftsList emptyText="No invoice drafts waiting for review." />
        </div>
      </div>
    </div>
  );
}

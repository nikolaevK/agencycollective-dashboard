"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import { formatCentsExact } from "@/lib/format";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { InvoiceDraftKind, InvoiceDraftSummary } from "@/lib/invoiceDrafts";
import type { AdAccountInvoiceTarget } from "./AdAccountInvoiceDrawer";
import { toOpenInvoiceRefs, type OpenInvoiceRef } from "./openInvoices";
import { cn } from "@/lib/utils";
import { Badge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";

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
  sentInvoices: OpenInvoiceRef[];
}

/** The slice of GET /clients/[id]/billing the client drawer's context needs. */
interface ClientBillingLite {
  schedule: { nextRebillAt: string | null };
  sentInvoices?: OpenInvoiceRef[];
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
    | {
        kind: "client_rebill";
        draft: InvoiceDraftRow;
        openInvoices: OpenInvoiceRef[];
        cycleAnchor: string | null;
      }
    | { kind: "ad_account"; draft: InvoiceDraftRow; target: AdAccountInvoiceTarget }
    | null
  >(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const { confirm, dialog } = useConfirm();

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
    setBusyId(d.id);
    try {
      if (d.kind === "client_rebill") {
        // The client's awaiting invoices + current cycle, so the drawer warns
        // what this send replaces — the Billing tab's query (shared cache).
        if (!d.userId) throw new Error("Client not found");
        const userId = d.userId;
        const billing = await queryClient.fetchQuery<ClientBillingLite>({
          queryKey: ["client-billing", userId],
          queryFn: async () => {
            const res = await fetch(`/api/admin/clients/${userId}/billing`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()).data;
          },
          staleTime: 30_000,
        });
        setOpen({
          kind: "client_rebill",
          draft: d,
          openInvoices: toOpenInvoiceRefs(billing.sentInvoices ?? []),
          cycleAnchor: billing.schedule.nextRebillAt,
        });
        return;
      }
      // The drawer needs the account's billing context (fee, retainer, next
      // cycle, awaiting invoices) — the same rows the Ad Accounts tab shows
      // (shared cache).
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
          openInvoices: toOpenInvoiceRefs(row.sentInvoices ?? []),
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
    if (
      !(await confirm({
        title: `Discard draft ${d.invoiceNumber}?`,
        description: "Nothing was sent; this just removes it.",
        confirmText: "Discard",
        destructive: true,
      }))
    )
      return;
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
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ) : null;
  } else if (drafts.length === 0) {
    list = emptyText && !isError ? <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p> : null;
  } else {
    list = (
      <ul className="divide-y overflow-hidden rounded-2xl ring-1 ring-foreground/5 dark:ring-foreground/10">
        {drafts.map((d) => (
          <li key={d.id} className="px-4 py-3">
            {/* Actions wrap under the text on phones so the name/meta keep their width. */}
            <div className="flex flex-wrap items-start gap-3">
              <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {d.kind === "ad_account" ? d.accountName : d.clientName}
                  </span>
                  <span className="text-sm tabular-nums text-foreground">{formatCentsExact(d.amountCents)}</span>
                  <Badge variant="outline">
                    {d.kind === "ad_account" ? "Ad account" : "Re-bill"}
                  </Badge>
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
                    <Textarea
                      rows={2}
                      maxLength={2000}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Reason (shared with whoever prepared it)"
                      aria-label="Rejection reason"
                      className="min-h-0 resize-y"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => reject(d)}
                        disabled={busyId === d.id}
                        className="h-9 sm:h-8"
                      >
                        {busyId === d.id && <Loader2 className="animate-spin" />}
                        Reject draft
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRejectingId(null)}
                        className="h-9 text-muted-foreground sm:h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 basis-full items-center justify-end gap-1 sm:basis-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRejectingId(rejectingId === d.id ? null : d.id);
                    setRejectNote("");
                  }}
                  className="h-9 text-muted-foreground sm:h-8"
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => discard(d)}
                  disabled={busyId === d.id}
                  className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:size-8"
                  aria-label={`Discard draft ${d.invoiceNumber}`}
                  title="Discard"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => review(d)}
                  disabled={busyId === d.id}
                  className="h-9 sm:h-8"
                >
                  {busyId === d.id && rejectingId !== d.id ? <Loader2 className="animate-spin" /> : null}
                  Review
                  <ChevronRight data-icon="inline-end" />
                </Button>
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
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
            badgeTone.danger,
            drafts.length > 0 && "mb-2"
          )}
        >
          Couldn&apos;t load invoice drafts.{" "}
          <Button type="button" variant="outline" size="xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {list}
      {dialog}

      {open?.kind === "client_rebill" && open.draft.userId && (
        <ClientInvoiceDrawer
          userId={open.draft.userId}
          clientName={open.draft.clientName ?? ""}
          draftId={open.draft.id}
          openInvoices={open.openInvoices}
          currentCycleAnchor={open.cycleAnchor}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className={dialogOverlayClass} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invoice drafts"
        className={cn(
          dialogPanelClass,
          "relative z-50 flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:rounded-b-4xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-medium leading-snug">Invoice drafts</h3>
            <p className="text-sm text-muted-foreground">
              Prepared by agents (API / MCP) or saved from a drawer. Nothing here has been sent — review, then send or reject.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0 bg-secondary"
            aria-label="Close"
          >
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <InvoiceDraftsList emptyText="No invoice drafts waiting for review." />
        </div>
      </div>
    </div>
  );
}

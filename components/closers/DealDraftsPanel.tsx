"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronRight, Loader2 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import type { DealDraft, DealDraftStatus } from "@/lib/dealDrafts";
import type { ApprovedDeal } from "@/components/closers/DealDraftReviewDrawer";
import { cn } from "@/lib/utils";

// Both drawers pull in @react-pdf — mount only when opened.
const DealDraftReviewDrawer = dynamic(
  () => import("@/components/closers/DealDraftReviewDrawer").then((m) => m.DealDraftReviewDrawer),
  { ssr: false }
);
const DealInvoiceDrawer = dynamic(
  () => import("@/components/closers/DealInvoiceDrawer").then((m) => m.DealInvoiceDrawer),
  { ssr: false }
);

type Row = DealDraft & { closerName: string | null };
type View = "pending" | "reviewed";

const STATUS_CHIP: Record<DealDraftStatus, string> = {
  pending: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

/**
 * Deal queue's approval inbox: deals proposed by agents (v1 API / MCP
 * createDealDraft) waiting for a person. Hidden entirely while there's
 * nothing pending and nothing was ever drafted.
 */
export function DealDraftsPanel() {
  const [view, setView] = useState<View>("pending");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [approved, setApproved] = useState<ApprovedDeal | null>(null);
  const [notice, setNotice] = useState<ApprovedDeal | null>(null);

  const pendingQ = useQuery<Row[]>({
    queryKey: ["deal-drafts", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deals/drafts?status=pending");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  // Always loaded (not just on the Reviewed tab): it decides whether there's
  // history to keep the panel up for when nothing is pending.
  const allQ = useQuery<Row[]>({
    queryKey: ["deal-drafts", "all"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deals/drafts?status=all");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data ?? [];
    },
    staleTime: 30_000,
  });
  const pending = pendingQ.data ?? [];
  const reviewed = (allQ.data ?? []).filter((d) => d.status !== "pending").slice(0, 25);
  // Failed with nothing to show — a failed background refetch keeps its rows.
  const pendingFailed = pendingQ.isError && !pendingQ.data;
  const allFailed = allQ.isError && !allQ.data;
  const overlayOpen = !!reviewingId || !!approved || !!notice;

  // Nothing until the first load settles (no header + spinner flashing in the
  // common zero-draft case); then only while there's something to show.
  if (!overlayOpen) {
    if (pendingQ.isLoading || allQ.isLoading) return null;
    if (!pendingFailed && !allFailed && pending.length === 0 && reviewed.length === 0) return null;
  }

  const activeQ = view === "pending" ? pendingQ : allQ;
  const activeFailed = view === "pending" ? pendingFailed : allFailed;
  const rows = view === "pending" ? pending : reviewed;

  return (
    <>
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-500/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <h3 className="text-sm font-semibold text-foreground">Agent drafts</h3>
            {pending.length > 0 && (
              <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {pending.length} awaiting approval
              </span>
            )}
          </div>
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {(["pending", "reviewed"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "h-9 rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors sm:h-auto",
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {activeQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeFailed ? (
          <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-4 text-xs text-destructive">
            Couldn&apos;t load agent drafts.
            <button
              type="button"
              onClick={() => activeQ.refetch()}
              disabled={activeQ.isFetching}
              className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 font-medium text-foreground hover:bg-accent disabled:opacity-60 sm:h-7"
            >
              {activeQ.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">
            {view === "pending" ? "Nothing waiting for approval." : "No reviewed drafts yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setReviewingId(d.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 max-w-full truncate text-sm font-semibold text-foreground">{d.fields.clientName}</span>
                      <span className="text-sm font-medium tabular-nums text-foreground">{formatCents(d.fields.dealValue)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_CHIP[d.status])}>
                        {d.status}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.closerName ?? "Unknown closer"} · by {d.createdByName ?? "agent"} ·{" "}
                      {new Date(d.createdAt).toLocaleDateString()}
                      {d.note ? ` · ${d.note}` : ""}
                      {d.status === "rejected" && d.reviewNote ? ` · Rejected: ${d.reviewNote}` : ""}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    {d.status === "pending" ? "Review" : "View"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reviewingId && (
        <DealDraftReviewDrawer
          draftId={reviewingId}
          onClose={() => setReviewingId(null)}
          onApproved={(result) => {
            setReviewingId(null);
            if (result.invoiceId) setApproved(result);
            if (!result.invoiceId || result.warnings.length > 0) setNotice(result);
          }}
        />
      )}

      {/* Approved: go straight on to the new deal's invoice (draft) for
          review + send. Nothing has been emailed yet. */}
      {approved && (
        <DealInvoiceDrawer
          dealId={approved.deal.id}
          dealValue={approved.deal.dealValue}
          dealPaymentType={approved.deal.paymentType}
          dealNotes={approved.deal.notes}
          onClose={() => setApproved(null)}
        />
      )}
      {notice && <ApprovedNotice result={notice} onClose={() => setNotice(null)} />}
    </>
  );
}

/** Approval warnings (no invoice for the status, or the proposed lines
 *  couldn't be applied) — sits above the invoice drawer if that opened, at
 *  the top (top-left on wider screens, over the backdrop) so it never covers
 *  the drawer's Save / Send footer. */
export function ApprovedNotice({ result, onClose }: { result: ApprovedDeal; onClose: () => void }) {
  return (
    <div role="status" className="fixed inset-x-4 top-4 z-[75] mx-auto max-w-md rounded-xl border border-emerald-500/30 bg-card p-4 shadow-2xl sm:left-6 sm:right-auto">
      <p className="text-sm font-semibold text-foreground">Deal created for {result.deal.clientName}</p>
      {result.warnings.map((w) => (
        <p key={w} className="mt-1 text-xs text-amber-600 dark:text-amber-400">{w}</p>
      ))}
      <button type="button" onClick={onClose} className="mt-2 h-9 text-xs font-medium text-primary hover:underline sm:h-7">
        Dismiss
      </button>
    </div>
  );
}

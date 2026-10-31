"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronRight, Loader2 } from "lucide-react";
import { DRAFT_STATUS_TONE, formatCents } from "@/components/closers/types";
import type { DealDraft } from "@/lib/dealDrafts";
import type { ApprovedDeal } from "@/components/closers/DealDraftReviewDrawer";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { dialogPanelClass } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b py-3 md:py-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Agent drafts</CardTitle>
            {pending.length > 0 && (
              <Badge>
                {pending.length} awaiting approval
              </Badge>
            )}
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => { if (v) setView(v as View); }}
          >
            {(["pending", "reviewed"] as View[]).map((v) => (
              <ToggleGroupItem key={v} value={v} className="h-9 px-3 capitalize sm:h-8">
                {v}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>

        {activeQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeFailed ? (
          <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-4 text-xs text-destructive">
            Couldn&apos;t load agent drafts.
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => activeQ.refetch()}
              disabled={activeQ.isFetching}
              className="h-9 sm:h-8"
            >
              {activeQ.isFetching && <Loader2 className="size-3.5 animate-spin" />}
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">
            {view === "pending" ? "Nothing waiting for approval." : "No reviewed drafts yet."}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setReviewingId(d.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 md:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 max-w-full truncate text-sm font-medium">{d.fields.clientName}</span>
                      <span className="text-sm tabular-nums">{formatCents(d.fields.dealValue)}</span>
                      <StatusBadge tone={DRAFT_STATUS_TONE[d.status]} className="capitalize">
                        {d.status}
                      </StatusBadge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.closerName ?? "Unknown closer"} · by {d.createdByName ?? "agent"} ·{" "}
                      {new Date(d.createdAt).toLocaleDateString()}
                      {d.note ? ` · ${d.note}` : ""}
                      {d.status === "rejected" && d.reviewNote ? ` · Rejected: ${d.reviewNote}` : ""}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                    {d.status === "pending" ? "Review" : "View"}
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
    <div role="status" className={cn(dialogPanelClass, "fixed inset-x-4 top-4 z-[75] mx-auto max-w-md rounded-3xl p-4 sm:left-6 sm:right-auto")}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
        Deal created for {result.deal.clientName}
      </p>
      {result.warnings.map((w) => (
        <p key={w} className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
          {w}
        </p>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={onClose} className="mt-2 h-9 sm:h-8">
        Dismiss
      </Button>
    </div>
  );
}

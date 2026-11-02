"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send, X, XCircle, Loader2, FileText, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCentsExact } from "@/lib/format";
import { badgeTone, badgeToneHover, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatDate } from "./format";
import type { AdInvoiceType } from "@/lib/adAccountLineItem";
import type { FollowUpSummary } from "@/lib/invoiceFollowUpRules";
import {
  InvoiceFollowUpDialog,
  FollowUpButton,
  FollowUpSummaryText,
} from "./InvoiceFollowUpDialog";

interface SentInvoice {
  id: string;
  adAccountId: string | null;
  userId: string | null;
  invoiceNumber: string;
  invoiceType: AdInvoiceType;
  cycleAnchor: string;
  amountCents: number;
  recipientEmail: string | null;
  payoutDocumentId: string | null;
  sentAt: string;
  status: string;
  ccEmails: string[];
  styleProfileId: string | null;
  accountName: string | null;
  clientName: string | null;
  followUps: FollowUpSummary;
}

interface SentInvoicesData {
  invoices: SentInvoice[];
  count: number;
}

async function fetchSentInvoices(): Promise<SentInvoicesData> {
  const res = await fetch("/api/admin/ad-accounts/sent-invoices");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as SentInvoicesData;
}

/**
 * Shared hook — same key dedupes the summary-card count and the panel fetch.
 * Mirrors the directory's `staleTime` so the "Invoices Sent" count and the
 * "Bills Due" count refresh on the same cadence (both refetch on the shared
 * invalidations fired by send/register/mark-unpaid).
 */
export function useAdAccountSentInvoices() {
  return useQuery({
    queryKey: ["admin-ad-account-sent-invoices"],
    queryFn: fetchSentInvoices,
    staleTime: 30_000,
  });
}

function typeLabel(t: AdInvoiceType): string {
  return t === "combined"
    ? "Retainer + ad spend"
    : t === "ad_spend"
    ? "Ad spend fee"
    : "Retainer";
}

export function AdAccountSentInvoicesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useAdAccountSentInvoices();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [followUpInv, setFollowUpInv] = useState<SentInvoice | null>(null);
  const { confirm, dialog } = useConfirm();

  const invoices = data?.invoices ?? [];

  async function handleMarkUnpaid(inv: SentInvoice) {
    const who = inv.accountName ?? inv.clientName ?? "this";
    if (
      !(await confirm({
        title: `Mark ${who} invoice ${inv.invoiceNumber} as unpaid?`,
        description:
          "Historical marker only — the account returns to its normal due/overdue flow until a payout lands.",
        confirmText: "Mark unpaid",
        destructive: true,
      }))
    )
      return;
    setBusyId(inv.id);
    setRowError(null);
    try {
      // Same path as the per-account drawer's Manage panel: sets the manual
      // lock (so "Resync with payouts" is offered later) and audits it.
      const res = await fetch(`/api/admin/ad-accounts/invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "unpaid" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] }),
        // The per-account history drawer (AdAccountInvoicesDrawer) — else it
        // keeps showing the row as Awaiting until its 30s staleTime lapses.
        ...(inv.adAccountId
          ? [queryClient.invalidateQueries({ queryKey: ["admin-ad-account-invoices", inv.adAccountId] })]
          : []),
      ]);
    } catch (e) {
      console.error("[ad-account-sent-invoices] mark-unpaid failed:", e);
      setRowError({
        id: inv.id,
        message: e instanceof Error ? e.message : "Failed to mark unpaid.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Send className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Sent ad-account invoices
            {data && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {invoices.length} awaiting payment
              </span>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="text-muted-foreground"
          aria-label="Close"
        >
          <X />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <p className="text-sm text-destructive">
            Couldn&rsquo;t load sent ad-account invoices.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Retry
          </Button>
        </div>
      ) : invoices.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No ad-account invoices awaiting payment.
        </p>
      ) : (
        <ul className="max-h-[45vh] divide-y overflow-y-auto">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
            >
              {/* Phones: the text takes the full line and the actions wrap under it. */}
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {inv.accountName ?? "Free invoice"}
                  {/* A span (Badge renders a div, invalid inside <p>). */}
                  <span className={cn(badgeVariants({ variant: "outline" }), "ml-2 align-middle text-muted-foreground")}>
                    {typeLabel(inv.invoiceType)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {inv.clientName ?? inv.recipientEmail ?? "—"} · {inv.invoiceNumber} · sent{" "}
                  {formatDate(inv.sentAt)} · cycle {formatDate(inv.cycleAnchor)}
                </p>
                <FollowUpSummaryText sentAt={inv.sentAt} summary={inv.followUps} />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {inv.amountCents > 0 && (
                  <span className="text-sm font-semibold tracking-tight tabular-nums text-foreground">
                    {formatCentsExact(inv.amountCents)}
                  </span>
                )}
                {inv.payoutDocumentId && (
                  <Button asChild variant="outline" size="xs" className="h-9 sm:h-6">
                    <a
                      href={`/api/admin/ad-accounts/invoices/${inv.id}/document`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View stored invoice PDF"
                    >
                      <FileText />
                      PDF
                    </a>
                  </Button>
                )}
                <FollowUpButton onClick={() => setFollowUpInv(inv)} />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleMarkUnpaid(inv)}
                  disabled={busyId === inv.id}
                  title="Mark unpaid (historical marker — schedule unaffected)"
                  className={cn(
                    "h-9 sm:h-6",
                    rowError?.id === inv.id
                      ? cn(badgeTone.danger, badgeToneHover.danger)
                      : "text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                  )}
                >
                  {busyId === inv.id ? <Loader2 className="animate-spin" /> : <XCircle />}
                  Mark unpaid
                </Button>
              </div>
              {rowError?.id === inv.id && (
                <p className="basis-full text-xs text-destructive">
                  {rowError.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {followUpInv && (
        <InvoiceFollowUpDialog
          invoice={followUpInv}
          subjectName={followUpInv.accountName ?? followUpInv.clientName ?? "Free invoice"}
          endpoint={`/api/admin/ad-accounts/invoices/${followUpInv.id}/follow-ups`}
          onClose={() => setFollowUpInv(null)}
          onRecorded={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] });
            if (followUpInv.adAccountId)
              queryClient.invalidateQueries({
                queryKey: ["admin-ad-account-invoices", followUpInv.adAccountId],
              });
          }}
        />
      )}
      {dialog}
    </Card>
  );
}

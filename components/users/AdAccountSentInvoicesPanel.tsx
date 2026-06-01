"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send, X, XCircle, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate } from "./format";
import type { AdInvoiceType } from "@/lib/adAccountLineItem";

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
  accountName: string | null;
  clientName: string | null;
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
  const { data, isLoading } = useAdAccountSentInvoices();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const invoices = data?.invoices ?? [];

  async function handleMarkUnpaid(inv: SentInvoice) {
    const who = inv.accountName ?? inv.clientName ?? "this";
    if (
      !confirm(
        `Mark ${who} invoice ${inv.invoiceNumber} as unpaid?\n\nHistorical marker only — the account returns to its normal due/overdue flow until a payout lands.`
      )
    )
      return;
    setBusyId(inv.id);
    setErrorId(null);
    try {
      const res = await fetch(
        `/api/admin/ad-accounts/invoices/${inv.id}/mark-unpaid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] }),
      ]);
    } catch (e) {
      console.error("[ad-account-sent-invoices] mark-unpaid failed:", e);
      setErrorId(inv.id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.04] dark:bg-violet-500/[0.06] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-violet-500/20">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <Send className="h-4 w-4" />
          </span>
          <p className="text-sm font-bold text-foreground">
            Sent ad-account invoices
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              {invoices.length} awaiting payment
            </span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-violet-500/10 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {isLoading ? (
        <div className="p-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No ad-account invoices awaiting payment.
        </p>
      ) : (
        <ul className="divide-y divide-violet-500/10 max-h-[45vh] overflow-y-auto">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-3 px-4 py-2.5 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {inv.accountName ?? "Free invoice"}
                  <span className="ml-2 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground align-middle">
                    {typeLabel(inv.invoiceType)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {inv.clientName ?? inv.recipientEmail ?? "—"} · {inv.invoiceNumber} · sent{" "}
                  {formatDate(inv.sentAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inv.amountCents > 0 && (
                  <span className="text-sm font-semibold text-foreground">
                    {formatMoney(inv.amountCents)}
                  </span>
                )}
                {inv.payoutDocumentId && (
                  <a
                    href={`/api/admin/ad-accounts/invoices/${inv.id}/document`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View stored invoice PDF"
                    className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    PDF
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleMarkUnpaid(inv)}
                  disabled={busyId === inv.id}
                  title="Mark unpaid (historical marker — schedule unaffected)"
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
                    errorId === inv.id
                      ? "border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      : "border-border/60 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10",
                    busyId === inv.id && "opacity-50"
                  )}
                >
                  {busyId === inv.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  Mark unpaid
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Send,
  ChevronDown,
  XCircle,
  Loader2,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCentsExact } from "@/lib/format";
import { formatDate } from "./format";

interface SentInvoice {
  id: string;
  userId: string;
  clientName: string;
  clientSlug: string;
  clientLogoPath: string | null;
  invoiceNumber: string;
  cycleAnchor: string;
  amountCents: number;
  sentAt: string;
  recipientEmail: string | null;
}

export interface SentInvoicesData {
  invoices: SentInvoice[];
  count: number;
}

async function fetchSentInvoices(): Promise<SentInvoicesData> {
  const res = await fetch("/api/admin/clients/sent-invoices");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as SentInvoicesData;
}

/**
 * Shared hook — same query key dedupes the summary card count and the panel
 * fetch. Same cadence as rebill-alerts so both panels refresh together.
 */
export function useSentInvoices() {
  return useQuery({
    queryKey: ["admin-sent-invoices"],
    queryFn: fetchSentInvoices,
    staleTime: 600_000,
    refetchInterval: 600_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Both helpers compare in the ADMIN's local timezone — `monthHeader` and the
 * per-row grouping must agree on what "this month" means, and the natural
 * frame for an admin scanning the panel is the calendar month they perceive
 * locally. Parsing via `new Date(iso)` produces a local-anchored Date, so
 * `getFullYear()/getMonth()` reads the local components. The known edge case
 * is an invoice sent at e.g. 01:00 UTC: an admin many timezones west sees it
 * as "yesterday's month" — that's the correct perception in their frame.
 */
function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isCurrentMonth(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  );
}

export function SentInvoicesPanel({
  open,
  onOpenChange,
  restrictToUserIds = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace context: when set, only invoices for these client ids render. */
  restrictToUserIds?: Set<string> | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useSentInvoices();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  // A failed load must not read as "nothing sent" (the panel used to vanish).
  if (isError && !data) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.04] px-4 py-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <p className="flex-1 min-w-0 text-sm text-foreground">
          Couldn&rsquo;t load sent invoices.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 transition-colors disabled:opacity-50 shrink-0"
        >
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
          Retry
        </button>
      </div>
    );
  }

  // Only surface the loading state when the admin asked for the panel (the
  // summary card opens it) — otherwise it would flash in and out on page load.
  if (isLoading) {
    if (!open) return null;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] dark:bg-violet-500/[0.06] px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading sent invoices…
      </div>
    );
  }

  const visible = (data?.invoices ?? []).filter(
    (i) => !restrictToUserIds || restrictToUserIds.has(i.userId)
  );
  const count = visible.length;
  if (count === 0) return null;

  // Split by month-of-sent_at so the panel reads as "this month + earlier
  // still-awaiting." Inside each group we keep the server's newest-first
  // order. An older still-`sent` invoice can mean the client hasn't paid yet
  // OR a payout for the cycle hasn't been recorded in the Payout DB.
  const now = new Date();
  const thisMonth = visible.filter((i) => isCurrentMonth(i.sentAt, now));
  const earlier = visible.filter((i) => !isCurrentMonth(i.sentAt, now));
  const monthHeader = monthLabel(now.toISOString());

  async function handleMarkUnpaid(inv: SentInvoice) {
    if (
      !confirm(
        `Mark ${inv.clientName}'s invoice ${inv.invoiceNumber} as unpaid for this period?\n\nThis is a historical marker — the client will return to overdue alerts until you Pause/Extend or a payout lands.`
      )
    )
      return;

    setBusyId(inv.id);
    setRowError(null);
    try {
      const res = await fetch(
        `/api/admin/clients/${inv.userId}/rebill-invoices/${inv.id}/mark-unpaid`,
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
      // Both panels recompute off the same directory build — invalidate them
      // together so the row moves from this panel back into the alerts panel
      // in one round-trip.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["client-billing", inv.userId] }),
      ]);
    } catch (e) {
      console.error("[sent-invoices] mark-unpaid failed:", e);
      setRowError({
        id: inv.id,
        message: e instanceof Error ? e.message : "Failed to mark unpaid.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.04] dark:bg-violet-500/[0.06] overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <Send className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">
            {count} invoice{count !== 1 ? "s" : ""} sent
            <span className="ml-2 font-normal text-muted-foreground">
              · {monthHeader}
              {earlier.length > 0 && ` (+${earlier.length} from earlier)`}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Awaiting payment in the Payout DB
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-violet-500/20 p-3 space-y-3 max-h-[40vh] overflow-y-auto">
          {thisMonth.length > 0 && (
            <Section title={monthHeader}>
              {thisMonth.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  busy={busyId === inv.id}
                  error={rowError?.id === inv.id ? rowError.message : null}
                  onOpenClient={() => router.push(`/dashboard/users/${inv.userId}`)}
                  onMarkUnpaid={() => handleMarkUnpaid(inv)}
                />
              ))}
            </Section>
          )}
          {earlier.length > 0 && (
            <Section title="Earlier — still awaiting payment">
              {earlier.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  busy={busyId === inv.id}
                  error={rowError?.id === inv.id ? rowError.message : null}
                  onOpenClient={() => router.push(`/dashboard/users/${inv.userId}`)}
                  onMarkUnpaid={() => handleMarkUnpaid(inv)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
        {title}
      </p>
      {children}
    </div>
  );
}

function InvoiceRow({
  inv,
  busy,
  error,
  onOpenClient,
  onMarkUnpaid,
}: {
  inv: SentInvoice;
  busy: boolean;
  /** Mark-unpaid failure message for this row, shown inline. */
  error: string | null;
  onOpenClient: () => void;
  onMarkUnpaid: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2.5">
      {/* Phones: Mark unpaid wraps under the row so name/meta/email keep their width. */}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onOpenClient}
          className="flex flex-1 basis-full min-w-0 items-center gap-3 text-left sm:basis-0"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
            <Send className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {inv.clientName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {inv.invoiceNumber} · sent {formatDate(inv.sentAt)} · cycle{" "}
              {formatDate(inv.cycleAnchor)}
            </p>
            {inv.recipientEmail && (
              <p className="text-[11px] text-muted-foreground truncate">
                to {inv.recipientEmail}
              </p>
            )}
          </div>
          {inv.amountCents > 0 && (
            <span className="text-sm font-semibold text-foreground shrink-0">
              {formatCentsExact(inv.amountCents)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onMarkUnpaid}
          disabled={busy}
          title="Mark this period as unpaid (historical marker — schedule unaffected)"
          className={cn(
            "ml-auto flex h-9 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors shrink-0 sm:h-auto",
            error
              ? "border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
              : "border-border/60 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10",
            busy && "opacity-50"
          )}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          Mark unpaid
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

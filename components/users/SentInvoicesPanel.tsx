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
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatCentsExact } from "@/lib/format";
import type { FollowUpSummary } from "@/lib/invoiceFollowUpRules";
import { formatDate } from "./format";
import {
  InvoiceFollowUpDialog,
  FollowUpButton,
  FollowUpSummaryText,
} from "./InvoiceFollowUpDialog";

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
  payoutDocumentId: string | null;
  ccEmails: string[];
  styleProfileId: string | null;
  status: string;
  /** Anchored to the client's current cycle (vs. an earlier one still owed). */
  isCurrentCycle: boolean;
  followUps: FollowUpSummary;
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
  const [followUpInv, setFollowUpInv] = useState<SentInvoice | null>(null);
  const { confirm, dialog } = useConfirm();

  // A failed load must not read as "nothing sent" (the panel used to vanish).
  if (isError && !data) {
    return (
      <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
        <AlertCircle className="size-4 shrink-0" />
        <p className="flex-1 min-w-0">
          Couldn&rsquo;t load sent invoices.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0"
        >
          {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
          Retry
        </Button>
      </div>
    );
  }

  // Only surface the loading state when the admin asked for the panel (the
  // summary card opens it) — otherwise it would flash in and out on page load.
  if (isLoading) {
    if (!open) return null;
    return (
      <Card className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground md:px-6">
        <Loader2 className="size-4 animate-spin" />
        Loading sent invoices…
      </Card>
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
      !(await confirm({
        title: `Mark ${inv.clientName}'s invoice ${inv.invoiceNumber} as unpaid for this period?`,
        description:
          "This is a historical marker — the client will return to overdue alerts until you Pause/Extend or a payout lands.",
        confirmText: "Mark unpaid",
        destructive: true,
      }))
    )
      return;

    setBusyId(inv.id);
    setRowError(null);
    try {
      // Same path as the Billing tab + Manage panel: sets the manual lock (so
      // "Resync with payouts" is offered later) and writes an audit row.
      const res = await fetch(
        `/api/admin/clients/${inv.userId}/rebill-invoices/${inv.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "unpaid" }),
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
        queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", inv.userId] }),
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
    <Card>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 md:px-6"
      >
        <Send className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
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
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="max-h-[40vh] space-y-4 overflow-y-auto border-t p-3 md:px-6">
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
                  onFollowUp={() => setFollowUpInv(inv)}
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
                  onFollowUp={() => setFollowUpInv(inv)}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {followUpInv && (
        <InvoiceFollowUpDialog
          invoice={followUpInv}
          subjectName={followUpInv.clientName}
          endpoint={`/api/admin/clients/${followUpInv.userId}/rebill-invoices/${followUpInv.id}/follow-ups`}
          onClose={() => setFollowUpInv(null)}
          onRecorded={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
            queryClient.invalidateQueries({
              queryKey: ["client-rebill-invoices", followUpInv.userId],
            });
          }}
        />
      )}
      {dialog}
    </Card>
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
    <div className="space-y-1">
      <p className="px-3 text-xs text-muted-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InvoiceRow({
  inv,
  busy,
  error,
  onOpenClient,
  onMarkUnpaid,
  onFollowUp,
}: {
  inv: SentInvoice;
  busy: boolean;
  /** Mark-unpaid failure message for this row, shown inline. */
  error: string | null;
  onOpenClient: () => void;
  onMarkUnpaid: () => void;
  onFollowUp: () => void;
}) {
  return (
    <div className="rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50">
      {/* Phones: Mark unpaid wraps under the row so name/meta/email keep their width. */}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onOpenClient}
          className="flex flex-1 basis-full min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:basis-0"
        >
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {inv.clientName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {inv.invoiceNumber} · sent {formatDate(inv.sentAt)} · cycle{" "}
              {formatDate(inv.cycleAnchor)}
              {!inv.isCurrentCycle && (
                <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">
                  (not current cycle)
                </span>
              )}
            </p>
            {inv.recipientEmail && (
              <p className="truncate text-xs text-muted-foreground">
                to {inv.recipientEmail}
              </p>
            )}
            <FollowUpSummaryText sentAt={inv.sentAt} summary={inv.followUps} />
          </div>
          {inv.amountCents > 0 && (
            <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
              {formatCentsExact(inv.amountCents)}
            </span>
          )}
        </button>
        <FollowUpButton onClick={onFollowUp} className="ml-auto" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMarkUnpaid}
          disabled={busy}
          title="Mark this period as unpaid (historical marker — schedule unaffected)"
          className={cn(
            "h-9 shrink-0 text-xs sm:h-8",
            error
              ? badgeTone.danger
              : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
          )}
        >
          {busy ? <Loader2 className="animate-spin" /> : <XCircle />}
          Mark unpaid
        </Button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

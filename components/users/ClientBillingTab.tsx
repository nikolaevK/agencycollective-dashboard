"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  Save,
  CalendarClock,
  History,
  Send,
  XCircle,
  Loader2,
  RotateCw,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCentsExact } from "@/lib/format";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { RebillStatusChip } from "./RebillStatusChip";
import { useAdmin } from "@/components/providers/AdminProvider";
import { InvoiceOverridePanel, InvoiceProvenance } from "./InvoiceOverridePanel";
import {
  InvoiceFollowUpDialog,
  FollowUpButton,
  FollowUpSummaryText,
} from "./InvoiceFollowUpDialog";
import { canFollowUp, type FollowUpSummary } from "@/lib/invoiceFollowUpRules";

// Lazy-loaded: pulls in @react-pdf/renderer only when the admin opens the
// invoice drawer, keeping the per-client page's initial bundle light.
import { InvoiceDraftsList } from "./InvoiceDraftsList";
const ClientInvoiceDrawer = dynamic(
  () => import("./ClientInvoiceDrawer").then((m) => m.ClientInvoiceDrawer),
  { ssr: false }
);
// Lazy-loaded too — only the admins backfilling a historical send need this.
const RegisterInvoiceModal = dynamic(
  () => import("./RegisterInvoiceModal").then((m) => m.RegisterInvoiceModal),
  { ssr: false }
);
import { formatMoney, formatDate } from "./format";
import { billingDateInputValue } from "@/lib/clientBilling";
import type { ClientBilling, RebillSchedule } from "@/lib/clientBilling";
import type { BrandHistory } from "@/lib/payouts";
import type { RebillInvoice } from "@/lib/clientRebillInvoices";
import { StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";

// Radix Select items can't carry an empty value — "Latest payment (default)"
// (mrrMonthOverride "") maps to this.
const NONE = "__none__";

const NOTICE = "rounded-2xl border px-4 py-3 text-sm";

interface BillingResponse {
  billing: ClientBilling | null;
  schedule: RebillSchedule;
  joinedAt: string | null;
  payoutBrand: string | null;
  payoutMrr: number;
  totalRevenue: number;
  history: BrandHistory[];
  activeSentInvoice: RebillInvoice | null;
  /** Every invoice still awaiting payment (any cycle), newest first. */
  sentInvoices: RebillInvoice[];
}

interface FormState {
  paused: boolean;
  pauseReason: string;
  billingDay: string;
  leadDays: string;
  extendUntil: string;
  lastRebilledOverride: string;
  mrrMonthOverride: string; // "yyyy-mm" or "" (= latest, default)
  settingsNotes: string;
}

function sameForm(a: FormState, b: FormState): boolean {
  return (Object.keys(a) as (keyof FormState)[]).every((k) => a[k] === b[k]);
}

/** Clamp a number input to the server's range; blank stays blank (= default). */
function clampNumberInput(v: string, min: number, max = Infinity): string {
  if (v === "") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n < min) return String(min);
  if (n > max) return String(max);
  return v;
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** History rows carry their follow-up summary (count + latest touch). */
type HistoryInvoice = RebillInvoice & { followUps?: FollowUpSummary };

async function fetchInvoiceHistory(userId: string): Promise<HistoryInvoice[]> {
  const res = await fetch(`/api/admin/clients/${userId}/rebill-invoices`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data?.invoices as HistoryInvoice[]) ?? [];
}

const INVOICE_STATUS_STYLES: Record<
  RebillInvoice["status"],
  { label: string; tone: BadgeTone }
> = {
  sent: { label: "Awaiting", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  unpaid: { label: "Unpaid", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};
const UNKNOWN_STATUS_TONE: BadgeTone = "neutral";

async function fetchBilling(userId: string): Promise<BillingResponse> {
  const res = await fetch(`/api/admin/clients/${userId}/billing`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as BillingResponse;
}

export function ClientBillingTab({
  userId,
  clientName,
  clientEmail,
  onChanged,
  isPepads,
}: {
  userId: string;
  clientName: string;
  /** Pre-fills the Register-existing modal's recipient field; null = no email on file. */
  clientEmail: string | null;
  onChanged?: () => void;
  /** PepAds book — computed schedule shown for reference only (statuses are manual). */
  isPepads?: boolean;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { isExternal } = useAdmin();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["client-billing", userId],
    queryFn: () => fetchBilling(userId),
    staleTime: 30_000,
  });
  const {
    data: invoiceHistoryData,
    isLoading: historyLoading,
    isError: historyError,
    isFetching: historyFetching,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["client-rebill-invoices", userId],
    queryFn: () => fetchInvoiceHistory(userId),
    staleTime: 30_000,
  });
  const invoiceHistory = invoiceHistoryData ?? [];

  function refreshAfterOverride() {
    queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", userId] });
    queryClient.invalidateQueries({ queryKey: ["client-billing", userId] });
    queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    onChanged?.();
  }

  const [form, setForm] = useState<FormState | null>(null);
  // The form as last seeded from the server; any difference = unsaved edits.
  const [seeded, setSeeded] = useState<FormState | null>(null);
  const formDirty = form !== null && seeded !== null && !sameForm(form, seeded);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [markingUnpaid, setMarkingUnpaid] = useState(false);
  const [unpaidError, setUnpaidError] = useState<string | null>(null);
  const [followUpInv, setFollowUpInv] = useState<RebillInvoice | null>(null);

  // Re-seed from the server only while the form is clean: sending an invoice,
  // marking unpaid and every override invalidate ["client-billing"], and that
  // refetch used to silently wipe unsaved billing-config edits.
  useEffect(() => {
    if (!data || formDirty) return;
    const b = data.billing;
    const next: FormState = {
      paused: b?.paused ?? false,
      pauseReason: b?.pauseReason ?? "",
      billingDay: b?.billingDay != null ? String(b.billingDay) : "",
      leadDays: b?.leadDays != null ? String(b.leadDays) : "5",
      extendUntil: billingDateInputValue(b?.extendUntil),
      lastRebilledOverride: billingDateInputValue(b?.lastRebilledOverride),
      mrrMonthOverride: b?.mrrMonthOverride ?? "",
      settingsNotes: b?.settingsNotes ?? "",
    };
    setSeeded(next);
    setForm(next);
    // Keyed on `data` only: re-running when formDirty flips (Save re-baselines
    // it before the refetch lands) would briefly restore pre-save values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function handleMarkUnpaid() {
    if (!data?.activeSentInvoice) return;
    const inv = data.activeSentInvoice;
    if (
      !(await confirm({
        title: `Mark invoice ${inv.invoiceNumber} as unpaid for this period?`,
        description:
          "This is a historical marker — the schedule is not advanced. The client returns to overdue alerts until you Pause/Extend or a payout lands.",
        confirmText: "Mark unpaid",
        destructive: true,
      }))
    )
      return;
    setMarkingUnpaid(true);
    setUnpaidError(null);
    try {
      // Same path as the Manage panel below (sets the manual lock) — one
      // "Mark unpaid" semantic on this tab.
      const res = await fetch(
        `/api/admin/clients/${userId}/rebill-invoices/${inv.id}`,
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-billing", userId] }),
        queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", userId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
      ]);
      onChanged?.();
    } catch (e) {
      setUnpaidError(e instanceof Error ? e.message : "Failed to mark unpaid");
    } finally {
      setMarkingUnpaid(false);
    }
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${userId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paused: form.paused,
          pauseReason: form.pauseReason || null,
          billingDay: form.billingDay ? Number(form.billingDay) : null,
          leadDays: form.leadDays ? Number(form.leadDays) : 5,
          extendUntil: form.extendUntil || null,
          lastRebilledOverride: form.lastRebilledOverride || null,
          mrrMonthOverride: form.mrrMonthOverride || null,
          settingsNotes: form.settingsNotes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      // Saved values are the new clean baseline, so the refetch below
      // re-seeds the form with the server-normalized values.
      setSeeded(form);
      await queryClient.invalidateQueries({ queryKey: ["client-billing", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
      onChanged?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save billing settings");
    } finally {
      setSaving(false);
    }
  }

  if (isError && !data) {
    return (
      <QueryErrorState
        title="Couldn't load billing"
        message="The billing details for this client failed to load."
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !data || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  // Merge months across all matched brands (a fuzzy match can hit >1 brand) so
  // the table shows one row per calendar month, figures reconcile to the total,
  // and React keys stay unique.
  const monthMap = new Map<
    string,
    { year: number; month: number; amountDue: number; amountPaid: number }
  >();
  for (const m of data.history.flatMap((h) => h.months)) {
    const key = `${m.year}-${m.month}`;
    const existing = monthMap.get(key);
    if (existing) {
      existing.amountDue += m.amountDue;
      existing.amountPaid += m.amountPaid;
    } else {
      monthMap.set(key, { ...m });
    }
  }
  const months = Array.from(monthMap.values()).sort(
    (a, b) => b.year - a.year || b.month - a.month
  );
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const activeInvoice = data.activeSentInvoice;
  // The MRR-month select shows "Latest payment (default)" for a pinned month
  // that's no longer in the list — what the native select displayed.
  const mrrMonthValues = months.map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`);

  return (
    <div className="space-y-6">
      {/* Awaiting-payment banner — only visible when a re-bill invoice is
          currently in the `sent` state for this client. Drops out the moment
          a payout for the cycle lands in the Payout DB (auto-promoted to
          paid) or the admin marks it unpaid below. */}
      {activeInvoice && (
        <div className={cn("rounded-2xl border p-4", badgeTone.info)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Send className="size-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Invoice {activeInvoice.invoiceNumber} sent ·{" "}
                <span className="tabular-nums">{formatCentsExact(activeInvoice.amountCents)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sent {formatDate(activeInvoice.sentAt)} for the{" "}
                {formatDate(activeInvoice.cycleAnchor)} cycle.{" "}
                {activeInvoice.reconcileLocked
                  ? "Reopened by hand — auto-matching is paused until you Resync it below."
                  : "Awaiting payment in the Payout DB — will auto-clear when a payout lands."}
              </p>
              {unpaidError && (
                <p className="text-xs text-destructive mt-1.5">
                  {unpaidError}
                </p>
              )}
            </div>
            <FollowUpButton onClick={() => setFollowUpInv(activeInvoice)} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkUnpaid}
              disabled={markingUnpaid}
              className="h-9 shrink-0 text-xs sm:h-8"
              title="Record that this period went unpaid. Schedule is not advanced."
            >
              {markingUnpaid ? <Loader2 className="animate-spin" /> : <XCircle />}
              Mark unpaid
            </Button>
          </div>
        </div>
      )}

      {/* PepAds: schedule below is informational only */}
      {isPepads && (
        <div className={cn(NOTICE, badgeTone.warning)}>
          <p>
            This client is on the PepAds book — billing status is maintained manually
            (see Settings or the directory row). The computed schedule below is shown
            for reference only and raises no alerts.
          </p>
        </div>
      )}

      {/* Invoice drafts for this client awaiting review (agent-prepared or
          saved from the drawer). Renders nothing when there are none. */}
      <InvoiceDraftsList filter={{ userId, kind: "client_rebill" }} onChanged={onChanged} />

      {/* Schedule summary */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
          <CalendarClock className="size-4 text-muted-foreground" />
          <CardTitle>Re-bill schedule</CardTitle>
          <RebillStatusChip status={data.schedule.status} paid={data.schedule.paid} />
          {/* Secondary, low-emphasis: backfill a historical/external send so
              it picks up the new invoice_sent state without re-emailing. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRegister(true)}
            className="ml-auto text-muted-foreground"
            title="Register an invoice that was sent outside this UI (no email goes out)"
          >
            Register existing
          </Button>
          <Button size="sm" onClick={() => setShowInvoice(true)}>
            <Send /> Send re-bill invoice
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Anchor (joined)" value={formatDate(data.schedule.anchorDate)} />
            <Stat
              label="Billing day"
              value={data.schedule.billingDay ? `Day ${data.schedule.billingDay}` : "—"}
            />
            <Stat label="Last re-bill" value={formatDate(data.schedule.lastRebilledAt)} />
            <Stat label="Next re-bill" value={formatDate(data.schedule.nextRebillAt)} />
          </div>
          {!data.payoutBrand && (
            <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
              Not linked to a Payout-DB brand — re-bill history is inferred by name.
              Set the link in Settings for accurate tracking.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle>Billing configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Pause (exception) */}
          <div className="flex items-start gap-3">
            <Switch
              id="billing-paused"
              checked={form.paused}
              onCheckedChange={(v) => set("paused", v)}
              className="mt-0.5"
            />
            <label htmlFor="billing-paused" className="cursor-pointer">
              <span className="block text-sm font-medium text-foreground">Pause re-billing (exception)</span>
              <span className="block text-xs text-muted-foreground">
                Suppresses all re-bill alerts for this client until unpaused.
              </span>
            </label>
          </div>
          {form.paused && (
            <Input
              type="text"
              value={form.pauseReason}
              onChange={(e) => set("pauseReason", e.target.value)}
              placeholder="Reason (optional)"
              aria-label="Pause reason"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Billing day of month" hint="Blank = same day as the join date" htmlFor="billing-day">
              <Input
                id="billing-day"
                type="number"
                min={1}
                max={31}
                value={form.billingDay}
                onChange={(e) => set("billingDay", clampNumberInput(e.target.value, 1, 31))}
                placeholder="auto"
              />
            </Field>
            <Field label="Alert lead time (days)" hint="How early a re-bill shows as due" htmlFor="billing-lead-days">
              <Input
                id="billing-lead-days"
                type="number"
                min={0}
                value={form.leadDays}
                onChange={(e) => set("leadDays", clampNumberInput(e.target.value, 0))}
              />
            </Field>
            <Field label="Extend until (extension)" hint="Defer the next re-bill to this date" htmlFor="billing-extend-until">
              <DatePicker
                id="billing-extend-until"
                value={form.extendUntil}
                onValueChange={(v) => set("extendUntil", v)}
              />
            </Field>
            <Field label="Manual last re-bill" hint="Overrides the date derived from payouts" htmlFor="billing-last-rebill">
              <DatePicker
                id="billing-last-rebill"
                value={form.lastRebilledOverride}
                onValueChange={(v) => set("lastRebilledOverride", v)}
              />
            </Field>
            <Field
              label="MRR source month"
              hint="Which payment counts as recurring MRR. Default = latest; pin a prior month to ignore one-off service charges."
              htmlFor="billing-mrr-month"
            >
              <Select
                value={mrrMonthValues.includes(form.mrrMonthOverride) ? form.mrrMonthOverride : NONE}
                onValueChange={(v) => set("mrrMonthOverride", v === NONE ? "" : v)}
              >
                <SelectTrigger id="billing-mrr-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Latest payment (default)</SelectItem>
                  {months.map((m) => (
                    <SelectItem
                      key={`${m.year}-${m.month}`}
                      value={`${m.year}-${String(m.month).padStart(2, "0")}`}
                    >
                      {monthLabel(m.year, m.month)} · {formatMoney(m.amountDue)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Internal billing notes" htmlFor="billing-notes">
            <Textarea
              id="billing-notes"
              value={form.settingsNotes}
              onChange={(e) => set("settingsNotes", e.target.value)}
              rows={3}
              className="resize-y"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save />
              {saving ? "Saving…" : "Save billing settings"}
            </Button>
            {saved && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>
            )}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Invoice history + manual overrides */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0 border-b">
          <Send className="size-4 text-muted-foreground" />
          <CardTitle>Re-bill invoices</CardTitle>
          {invoiceHistoryData && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {invoiceHistory.length} invoice{invoiceHistory.length !== 1 ? "s" : ""}
            </span>
          )}
        </CardHeader>
        {data.schedule.nextRebillAt && (
          <p className="px-4 pt-4 md:px-6 text-xs text-muted-foreground">
            Current billing cycle:{" "}
            <span className="font-medium text-foreground">
              {formatDate(data.schedule.nextRebillAt)}
            </span>
            {" "}— an awaiting invoice anchored to this date shows as &ldquo;Invoice sent&rdquo;.
            Use <span className="font-medium text-foreground">Manage</span> to mark an invoice paid/unpaid, link a
            payout, move it to another cycle, or hand it back to the automation.
          </p>
        )}
        {historyLoading ? (
          <div className="p-4 md:p-6 space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : historyError && !invoiceHistoryData ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-destructive">
              Couldn&rsquo;t load re-bill invoices.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetchHistory()}
              disabled={historyFetching}
            >
              {historyFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Retry
            </Button>
          </div>
        ) : invoiceHistory.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No re-bill invoices recorded for this client.
          </p>
        ) : (
          <ul className="p-4 md:p-6 space-y-2">
            {invoiceHistory.map((inv) => {
              // Fallback: an unexpected status must not crash the tab.
              const st = INVOICE_STATUS_STYLES[inv.status] ?? {
                label: String(inv.status),
                tone: UNKNOWN_STATUS_TONE,
              };
              const isCurrent =
                inv.status === "sent" &&
                data.schedule.nextRebillAt != null &&
                inv.cycleAnchor === data.schedule.nextRebillAt;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 ring-1 ring-foreground/5 dark:ring-foreground/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {inv.invoiceNumber}
                      </p>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      sent {formatDate(inv.sentAt)} · cycle {formatDate(inv.cycleAnchor)}
                      {isCurrent && (
                        <span className="ml-1 font-medium text-foreground">(current)</span>
                      )}
                    </p>
                    <InvoiceProvenance invoice={inv} />
                    {canFollowUp(inv.status) ? (
                      <FollowUpSummaryText sentAt={inv.sentAt} summary={inv.followUps} />
                    ) : (
                      (inv.followUps?.count ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setFollowUpInv(inv)}
                          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                          {inv.followUps!.count} follow-up
                          {inv.followUps!.count !== 1 ? "s" : ""} on record
                        </button>
                      )
                    )}
                  </div>
                  {inv.amountCents > 0 && (
                    <span className="text-sm font-semibold tracking-tight tabular-nums text-foreground shrink-0">
                      {formatCentsExact(inv.amountCents)}
                    </span>
                  )}
                  {inv.payoutDocumentId && (
                    <Button asChild variant="outline" size="sm" className="h-9 shrink-0 text-xs sm:h-8">
                      <a
                        href={`/api/admin/clients/${userId}/documents/${inv.payoutDocumentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download the invoice PDF filed at send time"
                      >
                        <FileText />
                        PDF
                      </a>
                    </Button>
                  )}
                  {canFollowUp(inv.status) && (
                    <FollowUpButton onClick={() => setFollowUpInv(inv)} />
                  )}
                  <div className="basis-full">
                    <InvoiceOverridePanel
                      invoice={inv}
                      currentCycle={data.schedule.nextRebillAt}
                      schedulePaid={data.schedule.paid}
                      patchUrl={`/api/admin/clients/${userId}/rebill-invoices/${inv.id}`}
                      payoutOptionsUrl={
                        isExternal
                          ? null
                          : `/api/admin/clients/${userId}/rebill-invoices/payout-options`
                      }
                      onChanged={refreshAfterOverride}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0 border-b">
          <History className="size-4 text-muted-foreground" />
          <CardTitle>Payment history</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {formatMoney(data.totalRevenue)} total paid
          </span>
        </CardHeader>
        {months.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No payout records found for this client.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 md:px-6 text-muted-foreground">Month</TableHead>
                <TableHead className="px-4 md:px-6 text-right text-muted-foreground">Due</TableHead>
                <TableHead className="px-4 md:px-6 text-right text-muted-foreground">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={`${m.year}-${m.month}`}>
                  <TableCell className="px-4 md:px-6 text-foreground">{monthLabel(m.year, m.month)}</TableCell>
                  <TableCell className="px-4 md:px-6 text-right tabular-nums text-muted-foreground">
                    {formatMoney(m.amountDue)}
                  </TableCell>
                  <TableCell className="px-4 md:px-6 text-right font-medium tabular-nums text-foreground">
                    {formatMoney(m.amountPaid)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {showInvoice && (
        <ClientInvoiceDrawer
          userId={userId}
          clientName={clientName}
          // A send for the current cycle replaces that cycle's awaiting
          // invoice — the drawer says so up front and offers a follow-up.
          openInvoices={data.sentInvoices ?? []}
          currentCycleAnchor={data.schedule.nextRebillAt}
          onFollowUpInstead={(invoiceId) => {
            const inv = (data.sentInvoices ?? []).find((i) => i.id === invoiceId);
            if (!inv) return;
            setShowInvoice(false);
            setFollowUpInv(inv);
          }}
          onClose={() => setShowInvoice(false)}
          onSent={() => {
            // Refresh everything the send touches: docs tab list, this tab's
            // schedule + activeSentInvoice, and the two panels on the
            // Directory page so the row moves into the Sent Invoices panel.
            queryClient.invalidateQueries({ queryKey: ["client-documents", userId] });
            queryClient.invalidateQueries({ queryKey: ["client-billing", userId] });
            queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", userId] });
            queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
            queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onChanged?.();
          }}
        />
      )}

      {followUpInv && (
        <InvoiceFollowUpDialog
          invoice={followUpInv}
          subjectName={clientName}
          endpoint={`/api/admin/clients/${userId}/rebill-invoices/${followUpInv.id}/follow-ups`}
          fallbackEmail={clientEmail}
          onClose={() => setFollowUpInv(null)}
          onRecorded={() => {
            queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", userId] });
            queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
          }}
        />
      )}

      {showRegister && (
        <RegisterInvoiceModal
          userId={userId}
          defaultCycleAnchor={data.schedule.nextRebillAt}
          defaultAmountCents={data.payoutMrr}
          defaultRecipientEmail={clientEmail}
          onClose={() => setShowRegister(false)}
          onRegistered={() => {
            // A registration can light "Invoice sent" and joins the Sent
            // Invoices panel — refresh those too, not just the history.
            queryClient.invalidateQueries({ queryKey: ["client-rebill-invoices", userId] });
            queryClient.invalidateQueries({ queryKey: ["client-billing", userId] });
            queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
            queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onChanged?.();
          }}
        />
      )}
      {dialog}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums text-foreground mt-1">{value}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

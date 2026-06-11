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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RebillStatusChip } from "./RebillStatusChip";

// Lazy-loaded: pulls in @react-pdf/renderer only when the admin opens the
// invoice drawer, keeping the per-client page's initial bundle light.
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
import type { ClientBilling, RebillSchedule } from "@/lib/clientBilling";
import type { BrandHistory } from "@/lib/payouts";
import type { RebillInvoice } from "@/lib/clientRebillInvoices";

interface BillingResponse {
  billing: ClientBilling | null;
  schedule: RebillSchedule;
  joinedAt: string | null;
  payoutBrand: string | null;
  payoutMrr: number;
  totalRevenue: number;
  history: BrandHistory[];
  activeSentInvoice: RebillInvoice | null;
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

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

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
  const { data, isLoading } = useQuery({
    queryKey: ["client-billing", userId],
    queryFn: () => fetchBilling(userId),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [markingUnpaid, setMarkingUnpaid] = useState(false);
  const [unpaidError, setUnpaidError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const b = data.billing;
    setForm({
      paused: b?.paused ?? false,
      pauseReason: b?.pauseReason ?? "",
      billingDay: b?.billingDay != null ? String(b.billingDay) : "",
      leadDays: b?.leadDays != null ? String(b.leadDays) : "5",
      extendUntil: b?.extendUntil ?? "",
      lastRebilledOverride: b?.lastRebilledOverride ?? "",
      mrrMonthOverride: b?.mrrMonthOverride ?? "",
      settingsNotes: b?.settingsNotes ?? "",
    });
  }, [data]);

  async function handleMarkUnpaid() {
    if (!data?.activeSentInvoice) return;
    const inv = data.activeSentInvoice;
    if (
      !confirm(
        `Mark invoice ${inv.invoiceNumber} as unpaid for this period?\n\nThis is a historical marker — the schedule is not advanced. The client returns to overdue alerts until you Pause/Extend or a payout lands.`
      )
    )
      return;
    setMarkingUnpaid(true);
    setUnpaidError(null);
    try {
      const res = await fetch(
        `/api/admin/clients/${userId}/rebill-invoices/${inv.id}/mark-unpaid`,
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
        queryClient.invalidateQueries({ queryKey: ["client-billing", userId] }),
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

  if (isLoading || !data || !form) {
    return (
      <div className="space-y-4">
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted/50" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-muted/50" />
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

  return (
    <div className="space-y-6">
      {/* Awaiting-payment banner — only visible when a re-bill invoice is
          currently in the `sent` state for this client. Drops out the moment
          a payout for the cycle lands in the Payout DB (auto-promoted to
          paid) or the admin marks it unpaid below. */}
      {activeInvoice && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.04] dark:bg-violet-500/[0.06] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 shrink-0">
              <Send className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">
                Invoice {activeInvoice.invoiceNumber} sent ·{" "}
                {formatMoney(activeInvoice.amountCents)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sent {formatDate(activeInvoice.sentAt)} for the{" "}
                {formatDate(activeInvoice.cycleAnchor)} cycle. Awaiting payment
                in the Payout DB — will auto-clear when a payout lands.
              </p>
              {unpaidError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                  {unpaidError}
                </p>
              )}
            </div>
            <button
              onClick={handleMarkUnpaid}
              disabled={markingUnpaid}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 transition-colors shrink-0",
                markingUnpaid && "opacity-50"
              )}
              title="Record that this period went unpaid. Schedule is not advanced."
            >
              {markingUnpaid ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Mark unpaid
            </button>
          </div>
        </div>
      )}

      {/* PepAds: schedule below is informational only */}
      {isPepads && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This client is on the PepAds book — billing status is maintained manually
            (see Settings or the directory row). The computed schedule below is shown
            for reference only and raises no alerts.
          </p>
        </div>
      )}

      {/* Schedule summary */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Re-bill schedule</h3>
          <RebillStatusChip status={data.schedule.status} paid={data.schedule.paid} className="ml-1" />
          {/* Secondary, low-emphasis: backfill a historical/external send so
              it picks up the new invoice_sent state without re-emailing. */}
          <button
            onClick={() => setShowRegister(true)}
            className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            title="Register an invoice that was sent outside this UI (no email goes out)"
          >
            Register existing
          </button>
          <button
            onClick={() => setShowInvoice(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all"
          >
            <Send className="h-3.5 w-3.5" /> Send re-bill invoice
          </button>
        </div>
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
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Not linked to a Payout-DB brand — re-bill history is inferred by name.
            Set the link in Settings for accurate tracking.
          </p>
        )}
      </div>

      {/* Config */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-foreground">Billing configuration</h3>

        {/* Pause (exception) */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.paused}
            onChange={(e) => set("paused", e.target.checked)}
            className="mt-1"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Pause re-billing (exception)</p>
            <p className="text-xs text-muted-foreground">
              Suppresses all re-bill alerts for this client until unpaused.
            </p>
          </div>
        </label>
        {form.paused && (
          <input
            type="text"
            value={form.pauseReason}
            onChange={(e) => set("pauseReason", e.target.value)}
            placeholder="Reason (optional)"
            className={FIELD}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Billing day of month" hint="Blank = same day as the join date">
            <input
              type="number"
              min={1}
              max={31}
              value={form.billingDay}
              onChange={(e) => set("billingDay", e.target.value)}
              placeholder="auto"
              className={FIELD}
            />
          </Field>
          <Field label="Alert lead time (days)" hint="How early a re-bill shows as due">
            <input
              type="number"
              min={0}
              value={form.leadDays}
              onChange={(e) => set("leadDays", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="Extend until (extension)" hint="Defer the next re-bill to this date">
            <input
              type="date"
              value={form.extendUntil}
              onChange={(e) => set("extendUntil", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="Manual last re-bill" hint="Overrides the date derived from payouts">
            <input
              type="date"
              value={form.lastRebilledOverride}
              onChange={(e) => set("lastRebilledOverride", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field
            label="MRR source month"
            hint="Which payment counts as recurring MRR. Default = latest; pin a prior month to ignore one-off service charges."
          >
            <select
              value={form.mrrMonthOverride}
              onChange={(e) => set("mrrMonthOverride", e.target.value)}
              className={FIELD}
            >
              <option value="">Latest payment (default)</option>
              {months.map((m) => (
                <option
                  key={`${m.year}-${m.month}`}
                  value={`${m.year}-${String(m.month).padStart(2, "0")}`}
                >
                  {monthLabel(m.year, m.month)} · {formatMoney(m.amountDue)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Internal billing notes">
          <textarea
            value={form.settingsNotes}
            onChange={(e) => set("settingsNotes", e.target.value)}
            rows={3}
            className={cn(FIELD, "resize-y")}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save billing settings"}
          </button>
          {saved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>

      {/* Payment history */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b border-border/50">
          <History className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Payment history</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {formatMoney(data.totalRevenue)} total paid
          </span>
        </div>
        {months.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No payout records found for this client.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5 font-bold">Month</th>
                <th className="px-5 py-2.5 font-bold text-right">Due</th>
                <th className="px-5 py-2.5 font-bold text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={`${m.year}-${m.month}`} className="border-b border-border/40">
                  <td className="px-5 py-2.5 text-foreground">{monthLabel(m.year, m.month)}</td>
                  <td className="px-5 py-2.5 text-right text-muted-foreground">
                    {formatMoney(m.amountDue)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium text-foreground">
                    {formatMoney(m.amountPaid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInvoice && (
        <ClientInvoiceDrawer
          userId={userId}
          clientName={clientName}
          onClose={() => setShowInvoice(false)}
          onSent={() => {
            // Refresh everything the send touches: docs tab list, this tab's
            // schedule + activeSentInvoice, and the two panels on the
            // Directory page so the row moves into the Sent Invoices panel.
            queryClient.invalidateQueries({ queryKey: ["client-documents", userId] });
            queryClient.invalidateQueries({ queryKey: ["client-billing", userId] });
            queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
            queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onChanged?.();
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
          onRegistered={() => onChanged?.()}
        />
      )}
    </div>
  );
}

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

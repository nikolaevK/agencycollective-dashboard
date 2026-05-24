"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Save, CalendarClock, History, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { RebillStatusChip } from "./RebillStatusChip";

// Lazy-loaded: pulls in @react-pdf/renderer only when the admin opens the
// invoice drawer, keeping the per-client page's initial bundle light.
const ClientInvoiceDrawer = dynamic(
  () => import("./ClientInvoiceDrawer").then((m) => m.ClientInvoiceDrawer),
  { ssr: false }
);
import { formatMoney, formatDate } from "./format";
import type { ClientBilling, RebillSchedule } from "@/lib/clientBilling";
import type { BrandHistory } from "@/lib/payouts";

interface BillingResponse {
  billing: ClientBilling | null;
  schedule: RebillSchedule;
  joinedAt: string | null;
  payoutBrand: string | null;
  payoutMrr: number;
  totalRevenue: number;
  history: BrandHistory[];
}

interface FormState {
  paused: boolean;
  pauseReason: string;
  billingDay: string;
  leadDays: string;
  extendUntil: string;
  lastRebilledOverride: string;
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
  onChanged,
}: {
  userId: string;
  clientName: string;
  onChanged?: () => void;
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
      settingsNotes: b?.settingsNotes ?? "",
    });
  }, [data]);

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

  return (
    <div className="space-y-6">
      {/* Schedule summary */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Re-bill schedule</h3>
          <RebillStatusChip status={data.schedule.status} className="ml-1" />
          <button
            onClick={() => setShowInvoice(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all"
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
            queryClient.invalidateQueries({ queryKey: ["client-documents", userId] });
            onChanged?.();
          }}
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

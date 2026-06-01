"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientPublic } from "./types";
import type { AdAccountDirectoryRow } from "@/lib/adAccountDirectory";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block leading-tight";

const PLATFORMS = ["Meta", "TikTok", "Google"];

// Ad-spend fee options: 2.0%–7.0% in 0.5% steps, value in basis points.
const FEE_OPTIONS: { bps: number; label: string }[] = [];
for (let bps = 200; bps <= 700; bps += 50) {
  FEE_OPTIONS.push({ bps, label: `${(bps / 100).toFixed(1)}%` });
}

async function fetchClients(): Promise<ClientPublic[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientPublic[];
}

/** Account name auto-generated from a client name: "AC_" + client name. */
function acName(clientName: string): string {
  return `AC_${clientName.trim()}`;
}

interface Props {
  /** Present = edit mode. */
  account?: AdAccountDirectoryRow | null;
  /** Preselect a client (e.g. opened from a client detail page). */
  presetUserId?: string | null;
  /** Name of the preselected client — seeds the auto-generated account name. */
  presetClientName?: string | null;
  /** Lock the client picker (opened from a specific client's page). */
  lockClient?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AdAccountFormModal({
  account,
  presetUserId,
  presetClientName,
  lockClient,
  onClose,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!account;

  const [userId, setUserId] = useState<string>(
    account?.userId ?? presetUserId ?? ""
  );
  // New accounts attached to a client default their name to "AC_<client>".
  const [accountName, setAccountName] = useState(
    account?.accountName ?? (presetClientName ? acName(presetClientName) : "")
  );
  const [vendor, setVendor] = useState(account?.vendor ?? "");
  const [platform, setPlatform] = useState(account?.platform ?? "");
  const [feeBps, setFeeBps] = useState(account?.adSpendFeeBps ?? 350);
  const [retainerDollars, setRetainerDollars] = useState(
    account ? String(account.monthlyRetainerCents / 100) : ""
  );
  const [status, setStatus] = useState<"active" | "inactive">(
    account?.status ?? "active"
  );
  const [notes, setNotes] = useState(account?.notes ?? "");
  // Billing-schedule controls
  const [billingPaused, setBillingPaused] = useState(account?.billingPaused ?? false);
  const [billingDay, setBillingDay] = useState(
    account?.billingDay != null ? String(account.billingDay) : ""
  );
  const [leadDays, setLeadDays] = useState(
    account?.leadDays != null ? String(account.leadDays) : "5"
  );
  const [extendUntil, setExtendUntil] = useState(account?.extendUntil ?? "");
  const [lastBilledOverride, setLastBilledOverride] = useState(
    account?.lastBilledOverride ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchClients,
    staleTime: 30_000,
    enabled: !lockClient, // no picker needed when locked to one client
  });

  async function handleSave() {
    if (!accountName.trim()) {
      setError("Account name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const retainerCents = Math.max(
        0,
        Math.round((Number(retainerDollars) || 0) * 100)
      );
      // Billing day: explicit value wins. On CREATE with no explicit day, anchor
      // on the admin's LOCAL day-of-month — the server stores createdAt in UTC,
      // so without this a late-evening (PT) creation would anchor a day ahead.
      const resolvedBillingDay = billingDay.trim()
        ? Number(billingDay)
        : isEdit
        ? null
        : new Date().getDate();
      const payload = {
        userId: userId || null,
        accountName: accountName.trim(),
        vendor: vendor.trim() || null,
        platform: platform || null,
        adSpendFeeBps: feeBps,
        monthlyRetainerCents: retainerCents,
        status,
        notes: notes.trim() || null,
        billingPaused,
        billingDay: resolvedBillingDay,
        leadDays: leadDays.trim() ? Number(leadDays) : 5,
        extendUntil: extendUntil || null,
        lastBilledOverride: lastBilledOverride || null,
      };
      const res = await fetch(
        isEdit ? `/api/admin/ad-accounts/${account!.id}` : "/api/admin/ad-accounts",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative mt-10 w-full max-w-lg rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="text-lg font-bold text-foreground">
            {isEdit ? "Edit ad account" : "Add ad account"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Client link */}
          {!lockClient && (
            <div>
              <label className={LABEL}>Client (optional)</label>
              <select
                className={FIELD}
                value={userId}
                onChange={(e) => {
                  const next = e.target.value;
                  setUserId(next);
                  // Selecting a client auto-generates the account name "AC_<client>".
                  const c = clients.find((x) => x.id === next);
                  if (c) setAccountName(acName(c.displayName));
                }}
              >
                <option value="">— Unattached —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.email ? ` · ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Account name</label>
              <input
                className={FIELD}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="OT_AC_orbitrexpeptide-CC"
              />
            </div>
            <div>
              <label className={LABEL}>Vendor</label>
              <input
                className={FIELD}
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="ConceptSF"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:items-end">
            <div className="flex flex-col">
              <label className={LABEL}>Platform</label>
              <select
                className={FIELD}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="">—</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className={LABEL}>Ad spend fee</label>
              <select
                className={FIELD}
                value={feeBps}
                onChange={(e) => setFeeBps(Number(e.target.value))}
              >
                {FEE_OPTIONS.map((o) => (
                  <option key={o.bps} value={o.bps}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col col-span-2 sm:col-span-1">
              <label className={LABEL}>Retainer ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={FIELD}
                value={retainerDollars}
                onChange={(e) => setRetainerDollars(e.target.value)}
                placeholder="1500"
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Status</label>
            <div className="flex rounded-lg border bg-background p-0.5 w-full max-w-[220px]">
              {(["active", "inactive"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize transition-colors",
                    status === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Billing schedule controls — drive the monthly bill status
              (upcoming / due / overdue / invoice sent) shown in the directory. */}
          <div className="rounded-lg border border-border/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Billing schedule
              </p>
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={billingPaused}
                  onChange={(e) => setBillingPaused(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Pause billing
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:items-end">
              <div className="flex flex-col">
                <label className={LABEL}>Billing day</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={FIELD}
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value)}
                  placeholder="auto"
                />
              </div>
              <div className="flex flex-col">
                <label className={LABEL}>Alert lead (days)</label>
                <input
                  type="number"
                  min={0}
                  className={FIELD}
                  value={leadDays}
                  onChange={(e) => setLeadDays(e.target.value)}
                  placeholder="5"
                />
              </div>
              <div className="flex flex-col">
                <label className={LABEL}>Extend until</label>
                <input
                  type="date"
                  className={FIELD}
                  value={extendUntil}
                  onChange={(e) => setExtendUntil(e.target.value)}
                />
              </div>
              <div className="flex flex-col">
                <label className={LABEL}>Last billed</label>
                <input
                  type="date"
                  className={FIELD}
                  value={lastBilledOverride}
                  onChange={(e) => setLastBilledOverride(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Billing day defaults to the account&apos;s creation day. &ldquo;Last
              billed&rdquo; overrides the date derived from payouts; the next bill
              is one month after it.
            </p>
          </div>

          <div>
            <label className={LABEL}>Notes (optional)</label>
            <textarea
              rows={2}
              className={cn(FIELD, "resize-y")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add account"}
          </button>
        </div>
      </div>
    </div>
  );
}

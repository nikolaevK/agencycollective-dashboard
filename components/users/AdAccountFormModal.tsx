"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ClientPublic } from "./types";
import type { AdAccountDirectoryRow } from "@/lib/adAccountDirectory";
import { billingDateInputValue } from "@/lib/clientBilling";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Radix SelectItem can't hold "" — the empty "Unattached" / "—" options map to this.
const NONE = "__none__";

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
  // Legacy unreadable values seed as "" (a save clears them rather than
  // re-submitting a value the API now rejects).
  const [extendUntil, setExtendUntil] = useState(billingDateInputValue(account?.extendUntil));
  const [lastBilledOverride, setLastBilledOverride] = useState(
    billingDateInputValue(account?.lastBilledOverride)
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X,
        // Cancel or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        // The old modal focused nothing on open — on phones focusing the
        // first input would pop the keyboard over the form.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>
            {isEdit ? "Edit ad account" : "Add ad account"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-2">
          {/* Client link */}
          {!lockClient && (
            <div className="grid gap-2">
              <Label htmlFor="ad-account-client">Client (optional)</Label>
              <Select
                value={userId || NONE}
                onValueChange={(v) => {
                  const next = v === NONE ? "" : v;
                  setUserId(next);
                  // Selecting a client auto-generates the account name "AC_<client>".
                  const c = clients.find((x) => x.id === next);
                  if (c) setAccountName(acName(c.displayName));
                }}
              >
                <SelectTrigger id="ad-account-client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Unattached —</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.displayName}
                      {c.email ? ` · ${c.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ad-account-name">Account name</Label>
              <Input
                id="ad-account-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="OT_AC_orbitrexpeptide-CC"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-account-vendor">Vendor</Label>
              <Input
                id="ad-account-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="ConceptSF"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="ad-account-platform">Platform</Label>
              <Select
                value={platform || NONE}
                onValueChange={(v) => setPlatform(v === NONE ? "" : v)}
              >
                <SelectTrigger id="ad-account-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                  {/* A platform stored outside the list (e.g. set via the API)
                      shows as itself instead of a blank trigger; it's saved
                      back unchanged either way. */}
                  {platform && !PLATFORMS.includes(platform) && (
                    <SelectItem value={platform}>{platform}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-account-fee">Ad spend fee</Label>
              <Select
                value={String(feeBps)}
                onValueChange={(v) => setFeeBps(Number(v))}
              >
                <SelectTrigger id="ad-account-fee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_OPTIONS.map((o) => (
                    <SelectItem key={o.bps} value={String(o.bps)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 col-span-2 sm:col-span-1">
              <Label htmlFor="ad-account-retainer">Retainer ($)</Label>
              <Input
                id="ad-account-retainer"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={retainerDollars}
                onChange={(e) => setRetainerDollars(e.target.value)}
                placeholder="1500"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Tabs
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "inactive")}
            >
              <TabsList className="w-full max-w-[220px]">
                {(["active", "inactive"] as const).map((s) => (
                  <TabsTrigger key={s} value={s} className="capitalize">
                    {s}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Billing schedule controls — drive the monthly bill status
              (upcoming / due / overdue / invoice sent) shown in the directory. */}
          <div className="space-y-3 rounded-2xl p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Billing schedule</p>
              <div className="flex items-center gap-2">
                <Switch
                  id="ad-account-billing-paused"
                  size="sm"
                  checked={billingPaused}
                  onCheckedChange={setBillingPaused}
                />
                <Label htmlFor="ad-account-billing-paused" className="cursor-pointer text-xs">
                  Pause billing
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="ad-account-billing-day">Billing day</Label>
                <Input
                  id="ad-account-billing-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value)}
                  placeholder="auto"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ad-account-lead-days">Alert lead (days)</Label>
                <Input
                  id="ad-account-lead-days"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={leadDays}
                  onChange={(e) => setLeadDays(e.target.value)}
                  placeholder="5"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ad-account-extend-until">Extend until</Label>
                <DatePicker
                  id="ad-account-extend-until"
                  value={extendUntil}
                  onValueChange={setExtendUntil}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ad-account-last-billed">Last billed</Label>
                <DatePicker
                  id="ad-account-last-billed"
                  value={lastBilledOverride}
                  onValueChange={setLastBilledOverride}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Billing day defaults to the account&apos;s creation day. &ldquo;Last
              billed&rdquo; overrides the date derived from payouts; the next bill
              is one month after it.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ad-account-notes">Notes (optional)</Label>
            <Textarea
              id="ad-account-notes"
              rows={2}
              className="resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 pt-4 pb-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {isEdit ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

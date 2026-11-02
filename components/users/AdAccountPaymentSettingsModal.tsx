"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentInfo, PaymentType } from "@/types/invoice";
import { badgeTone, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";

// Every editable field, with a friendly label and whether it's multi-line.
const FIELDS: { key: keyof PaymentInfo; label: string; area?: boolean; hint?: string }[] = [
  { key: "bankName", label: "Bank name" },
  { key: "accountName", label: "Account name (on file)" },
  { key: "accountNumber", label: "Account number" },
  { key: "routingNumber", label: "Routing number" },
  { key: "swiftBic", label: "SWIFT / BIC", hint: "International wires" },
  { key: "alternateRoutingNumber", label: "Alternate routing number" },
  { key: "zelleContact", label: "Zelle (phone / email)", hint: "Local payments" },
  { key: "bankAddress", label: "Bank address", area: true },
  { key: "beneficiaryName", label: "Beneficiary name" },
  { key: "beneficiaryAddress", label: "Beneficiary address", area: true },
  { key: "memo", label: "Memo / note", area: true },
];

type Forms = { local: PaymentInfo; international: PaymentInfo };

interface ApiData {
  local: PaymentInfo;
  international: PaymentInfo;
  configured: { local: boolean; international: boolean };
}

/**
 * Edit the payment details printed on AD-ACCOUNT invoices only — both the
 * Local and International blocks. Stored under dedicated config keys, so this
 * never affects deal or client re-bill invoices. "Reset to default" clears the
 * custom values and reverts to the shared agency template + ad-account bank
 * account.
 */
export function AdAccountPaymentSettingsModal({ onClose }: { onClose: () => void }) {
  const [forms, setForms] = useState<Forms | null>(null);
  const [configured, setConfigured] = useState<{ local: boolean; international: boolean }>({
    local: false,
    international: false,
  });
  const [activeType, setActiveType] = useState<PaymentType>("local");
  // Track which block(s) the admin actually edited, so saving Local doesn't
  // also pin International (which would stop it tracking the agency default).
  const [dirty, setDirty] = useState<{ local: boolean; international: boolean }>({
    local: false,
    international: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const { confirm, dialog } = useConfirm();

  function applyData(d: ApiData) {
    setForms({ local: d.local, international: d.international });
    setConfigured(d.configured);
    // Server is the new source of truth → nothing is unsaved.
    setDirty({ local: false, international: false });
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/ad-accounts/payment-settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => active && applyData(json.data as ApiData))
      .catch(() => active && setError("Failed to load payment settings."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function setField(key: keyof PaymentInfo, value: string) {
    setSavedOk(false);
    setDirty((d) => ({ ...d, [activeType]: true }));
    setForms((f) =>
      f ? { ...f, [activeType]: { ...f[activeType], [key]: value } } : f
    );
  }

  async function handleSave() {
    if (!forms) return;
    // Only persist the block(s) actually edited — leaves an untouched type on
    // the agency-tracking default instead of pinning it.
    const body: { local?: PaymentInfo; international?: PaymentInfo } = {};
    if (dirty.local) body.local = forms.local;
    if (dirty.international) body.international = forms.international;
    if (!body.local && !body.international) return; // nothing changed
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ad-accounts/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      applyData(json.data as ApiData);
      setSavedOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (
      !(await confirm({
        title: "Reset both Local and International ad-account payment details to the default?",
        description: "Custom values will be cleared.",
        confirmText: "Reset",
        destructive: true,
      }))
    ) {
      return;
    }
    setError(null);
    setResetting(true);
    try {
      const res = await fetch("/api/admin/ad-accounts/payment-settings", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      applyData(json.data as ApiData);
      setSavedOk(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset.");
    } finally {
      setResetting(false);
    }
  }

  const active = forms?.[activeType] ?? null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>Ad-account payment settings</DialogTitle>
          <DialogDescription>
            Bank details printed on ad-account invoices only — not deal or client re-bill invoices.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 px-6 pb-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !forms || !active ? (
          <div className="space-y-3 px-6 pb-8 pt-4 text-center">
            <p className="text-sm text-destructive">{error ?? "Failed to load."}</p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {/* Local / International switch */}
            <div className="shrink-0 px-6">
              <Tabs value={activeType} onValueChange={(v) => setActiveType(v as PaymentType)}>
                <TabsList className="w-full">
                  {(["local", "international"] as PaymentType[]).map((t) => (
                    <TabsTrigger key={t} value={t} className="capitalize">
                      {t}
                      <span
                        className={cn(
                          badgeVariants({ variant: "outline", tone: configured[t] ? "info" : "neutral" }),
                          "normal-case"
                        )}
                      >
                        {configured[t] ? "Custom" : "Default"}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Fields */}
            <div className="min-h-0 max-h-[55vh] flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
              {FIELDS.map(({ key, label, area, hint }) => (
                <div key={String(key)} className="grid gap-2">
                  <Label htmlFor={`ad-payment-${String(key)}`}>
                    {label}
                    {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}
                  </Label>
                  {area ? (
                    <Textarea
                      id={`ad-payment-${String(key)}`}
                      rows={2}
                      className="resize-y"
                      value={String(active[key] ?? "")}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={`ad-payment-${String(key)}`}
                      value={String(active[key] ?? "")}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Leave a field blank to omit it from the invoice. Changes apply to the{" "}
                <span className="font-medium capitalize text-foreground">{activeType}</span> block; switch tabs to edit the other.
              </p>

              {error && (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
                  {error}
                </div>
              )}
              {savedOk && (
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm",
                    badgeTone.success
                  )}
                >
                  <Check className="size-4 shrink-0" /> Saved. New ad-account invoices will use these details.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={saving || resetting}
              >
                {resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                Reset to default
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || resetting || (!dirty.local && !dirty.international)}
                >
                  {saving && <Loader2 className="animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </>
        )}
        {dialog}
      </DialogContent>
    </Dialog>
  );
}

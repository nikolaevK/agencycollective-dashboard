"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentInfo, PaymentType } from "@/types/invoice";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block leading-tight";

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

  // Lock body scroll + close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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
    if (!confirm("Reset both Local and International ad-account payment details to the default? Custom values will be cleared.")) {
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="relative mt-10 mb-10 w-full max-w-xl rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h2 className="text-lg font-bold text-foreground">Ad-account payment settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bank details printed on ad-account invoices only — not deal or client re-bill invoices.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : !forms || !active ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-destructive">{error ?? "Failed to load."}</p>
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Local / International switch */}
            <div className="px-5 pt-4">
              <div className="flex rounded-lg border bg-background p-0.5">
                {(["local", "international"] as PaymentType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveType(t)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors flex items-center justify-center gap-1.5",
                      activeType === t
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        configured[t]
                          ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                          : "bg-muted text-muted-foreground",
                        activeType === t && "bg-white/20 text-white"
                      )}
                    >
                      {configured[t] ? "Custom" : "Default"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
              {FIELDS.map(({ key, label, area, hint }) => (
                <div key={String(key)}>
                  <label className={LABEL}>
                    {label}
                    {hint && <span className="ml-1.5 normal-case font-medium text-muted-foreground/70">· {hint}</span>}
                  </label>
                  {area ? (
                    <textarea
                      rows={2}
                      className={cn(FIELD, "resize-y")}
                      value={String(active[key] ?? "")}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  ) : (
                    <input
                      className={FIELD}
                      value={String(active[key] ?? "")}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Leave a field blank to omit it from the invoice. Changes apply to the{" "}
                <span className="font-semibold capitalize">{activeType}</span> block; switch tabs to edit the other.
              </p>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              {savedOk && (
                <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" /> Saved. New ad-account invoices will use these details.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-5 py-3">
              <button
                onClick={handleReset}
                disabled={saving || resetting}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reset to default
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || resetting || (!dirty.local && !dirty.international)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

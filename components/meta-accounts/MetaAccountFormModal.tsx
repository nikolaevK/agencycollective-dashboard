"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMetaAccountOptions } from "@/hooks/useMetaAccountOptions";
import type { MetaAccountDirectoryRow, MetaClientOption } from "@/lib/metaAccountDirectory";

interface FormState {
  fbEmail: string;
  fbPassword: string;
  twofaSecret: string;
  twofaLink: string;
  mailPassword: string;
  recoveryEmail: string;
  profileName: string;
  profileLink: string;
  bmId: string;
  loginOk: boolean;
  pageMade: boolean;
  adAccountMade: boolean;
  bmMade: boolean;
  cardAdded: boolean;
  stage: string;
  status: string;
  assignee: string;
  clientId: string;
  batch: string;
  notes: string;
}

function initial(account?: MetaAccountDirectoryRow): FormState {
  return {
    fbEmail: account?.fbEmail ?? "",
    fbPassword: account?.fbPassword ?? "",
    twofaSecret: account?.twofaSecret ?? "",
    twofaLink: account?.twofaLink ?? "",
    mailPassword: account?.mailPassword ?? "",
    recoveryEmail: account?.recoveryEmail ?? "",
    profileName: account?.profileName ?? "",
    profileLink: account?.profileLink ?? "",
    bmId: account?.bmId ?? "",
    loginOk: account?.loginOk ?? false,
    pageMade: account?.pageMade ?? false,
    adAccountMade: account?.adAccountMade ?? false,
    bmMade: account?.bmMade ?? false,
    cardAdded: account?.cardAdded ?? false,
    stage: account?.stage ?? "",
    status: account?.status ?? "",
    assignee: account?.assignee ?? "",
    clientId: account?.clientId ?? "",
    batch: account?.batch ?? "",
    notes: account?.notes ?? "",
  };
}

/** Add or edit a single Meta account. */
export function MetaAccountFormModal({
  account,
  clients,
  onClose,
  onSaved,
}: {
  account?: MetaAccountDirectoryRow;
  clients: MetaClientOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial(account));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { options: stages } = useMetaAccountOptions("stage");
  const { options: statuses } = useMetaAccountOptions("status");
  const isEdit = Boolean(account);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.fbEmail.trim()) {
      setError("An account email is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = isEdit ? `/api/admin/meta-accounts/${account!.id}` : "/api/admin/meta-accounts";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-2xl rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="text-lg font-bold text-foreground">
            {isEdit ? "Edit account" : "Add account"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Section title="Credentials">
            <Field label="FB email" required>
              <input className={inputCls} value={form.fbEmail} onChange={(e) => set("fbEmail", e.target.value)} />
            </Field>
            <Field label="FB password">
              <input className={inputCls} value={form.fbPassword} onChange={(e) => set("fbPassword", e.target.value)} />
            </Field>
            <Field label="2FA secret">
              <input className={inputCls} value={form.twofaSecret} onChange={(e) => set("twofaSecret", e.target.value)} />
            </Field>
            <Field label="2FA link">
              <input className={inputCls} value={form.twofaLink} onChange={(e) => set("twofaLink", e.target.value)} />
            </Field>
            <Field label="Mail password">
              <input className={inputCls} value={form.mailPassword} onChange={(e) => set("mailPassword", e.target.value)} />
            </Field>
            <Field label="Recovery email">
              <input className={inputCls} value={form.recoveryEmail} onChange={(e) => set("recoveryEmail", e.target.value)} />
            </Field>
            <Field label="Profile name">
              <input className={inputCls} value={form.profileName} onChange={(e) => set("profileName", e.target.value)} />
            </Field>
            <Field label="Profile link">
              <input className={inputCls} value={form.profileLink} onChange={(e) => set("profileLink", e.target.value)} />
            </Field>
            <Field label="BM ID">
              <input className={inputCls} value={form.bmId} onChange={(e) => set("bmId", e.target.value)} />
            </Field>
          </Section>

          <Section title="Setup checklist">
            <div className="col-span-full flex flex-wrap gap-x-5 gap-y-2">
              <Check label="Login OK" checked={form.loginOk} onChange={(v) => set("loginOk", v)} />
              <Check label="Page made" checked={form.pageMade} onChange={(v) => set("pageMade", v)} />
              <Check label="Ad account made" checked={form.adAccountMade} onChange={(v) => set("adAccountMade", v)} />
              <Check label="BM made" checked={form.bmMade} onChange={(v) => set("bmMade", v)} />
              <Check label="Card added" checked={form.cardAdded} onChange={(v) => set("cardAdded", v)} />
            </div>
          </Section>

          <Section title="Pipeline & assignment">
            <Field label="Stage">
              <select className={inputCls} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
                <option value="">— None —</option>
                {stages.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="">— None —</option>
                {statuses.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Client">
              <select className={inputCls} value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
                <option value="">— Unassigned —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Who has access">
              <input className={inputCls} value={form.assignee} onChange={(e) => set("assignee", e.target.value)} />
            </Field>
            <Field label="Batch">
              <input className={inputCls} value={form.batch} onChange={(e) => set("batch", e.target.value)} placeholder="e.g. 50 Pcs Old FB 2017" />
            </Field>
          </Section>

          <Section title="Notes">
            <div className="col-span-full">
              <textarea
                className={cn(inputCls, "min-h-[70px] resize-y")}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border/50">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add account"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}

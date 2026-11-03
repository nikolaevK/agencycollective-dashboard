"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useMetaAccountOptions } from "@/hooks/useMetaAccountOptions";
import type { MetaAccountDirectoryRow, MetaClientOption } from "@/lib/metaAccountDirectory";

// Radix SelectItem can't hold "" — the empty "— None —" / "— Unassigned —"
// options map to this and back to "" in the form state.
const NONE = "__none__";

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

type TextKey = {
  [K in keyof FormState]: FormState[K] extends string ? K : never;
}[keyof FormState];

const CREDENTIAL_FIELDS: { key: TextKey; label: string; required?: boolean }[] = [
  { key: "fbEmail", label: "FB email", required: true },
  { key: "fbPassword", label: "FB password" },
  { key: "twofaSecret", label: "2FA secret" },
  { key: "twofaLink", label: "2FA link" },
  { key: "mailPassword", label: "Mail password" },
  { key: "recoveryEmail", label: "Recovery email" },
  { key: "profileName", label: "Profile name" },
  { key: "profileLink", label: "Profile link" },
  { key: "bmId", label: "BM ID" },
];

type CheckKey = "loginOk" | "pageMade" | "adAccountMade" | "bmMade" | "cardAdded";

const CHECKLIST: { key: CheckKey; label: string }[] = [
  { key: "loginOk", label: "Login OK" },
  { key: "pageMade", label: "Page made" },
  { key: "adAccountMade", label: "Ad account made" },
  { key: "bmMade", label: "BM made" },
  { key: "cardAdded", label: "Card added" },
];

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
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>{isEdit ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 pb-2">
          {error && (
            <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
              {error}
            </div>
          )}

          <Section title="Credentials">
            {CREDENTIAL_FIELDS.map((f) => (
              <Field key={f.key} id={`meta-account-${f.key}`} label={f.label} required={f.required}>
                <Input
                  id={`meta-account-${f.key}`}
                  value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </Field>
            ))}
          </Section>

          <Section title="Setup checklist">
            <div className="col-span-full flex flex-wrap gap-x-5 gap-y-3">
              {CHECKLIST.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`meta-account-${c.key}`}
                    checked={form[c.key]}
                    onCheckedChange={(v) => set(c.key, v === true)}
                  />
                  <Label htmlFor={`meta-account-${c.key}`} className="cursor-pointer font-normal">
                    {c.label}
                  </Label>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Pipeline & assignment">
            <Field id="meta-account-stage" label="Stage">
              <OptionSelect
                id="meta-account-stage"
                value={form.stage}
                onChange={(v) => set("stage", v)}
                noneLabel="— None —"
                options={stages.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
            <Field id="meta-account-status" label="Status">
              <OptionSelect
                id="meta-account-status"
                value={form.status}
                onChange={(v) => set("status", v)}
                noneLabel="— None —"
                options={statuses.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
            <Field id="meta-account-client" label="Client">
              <OptionSelect
                id="meta-account-client"
                value={form.clientId}
                onChange={(v) => set("clientId", v)}
                noneLabel="— Unassigned —"
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field id="meta-account-assignee" label="Who has access">
              <Input
                id="meta-account-assignee"
                value={form.assignee}
                onChange={(e) => set("assignee", e.target.value)}
              />
            </Field>
            <Field id="meta-account-batch" label="Batch">
              <Input
                id="meta-account-batch"
                value={form.batch}
                onChange={(e) => set("batch", e.target.value)}
                placeholder="e.g. 50 Pcs Old FB 2017"
              />
            </Field>
          </Section>

          <Section title="Notes">
            <div className="col-span-full">
              <Textarea
                aria-label="Notes"
                className="min-h-[70px] resize-y"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </Section>
        </div>

        <DialogFooter className="shrink-0 px-6 pt-4 pb-6">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {isEdit ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

/** Kit Select over a "" = none string value (mapped through the NONE sentinel). */
function OptionSelect({
  id,
  value,
  onChange,
  noneLabel,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  noneLabel: string;
  options: { value: string; label: string }[];
}) {
  // A stored value that's no longer in the vocabulary (e.g. a removed option)
  // shows as its raw value instead of a blank trigger — and, as before, it's
  // kept on save unless changed.
  const missing = value && !options.some((o) => o.value === value);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        {missing && <SelectItem value={value}>{value}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

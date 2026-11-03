"use client";

import { useId, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save, ChevronDown, Users, Check, Download, Loader2 } from "lucide-react";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type { PaymentInfo, PaymentType } from "@/types/invoice";
import { emptyPaymentInfo } from "@/lib/invoice/paymentUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";
import { cn } from "@/lib/utils";
import { InvoiceField, LogoField, TextField, ThemeSwatches } from "./InvoiceField";
import { isPdfImageType, PDF_IMAGE_ERROR } from "@/lib/invoice/pdfImage";

const MAX_LOGO_BYTES = 500 * 1024; // 500 KB

const SUBHEAD = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

interface Props {
  /** Load a saved profile's sender, logo, theme + payment into the current draft. */
  onApply: (profile: AgencyProfileRecord) => void;
}

export function InvoiceAgencyProfiles({ onApply }: Props) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgencyProfileRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useQuery<AgencyProfileRecord[]>({
    queryKey: ["invoice-agency-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-agency-profiles");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invoice-agency-profiles"] });

  const handleApply = (profile: AgencyProfileRecord) => {
    onApply(profile);
    setAppliedId(profile.id);
    setTimeout(() => setAppliedId((cur) => (cur === profile.id ? null : cur)), 2000);
  };

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 md:px-6"
      >
        <Users className="size-4 shrink-0 text-muted-foreground lg:max-xl:hidden" />
        {/* Wraps rather than truncates (three of these share a row from lg up). */}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
          Agency Profiles
          <span className="ml-1.5 whitespace-nowrap font-normal text-muted-foreground tabular-nums">({profiles.length})</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t p-4 md:px-6">
          <p className="text-xs text-muted-foreground">
            Save multiple agency identities — each with its own logo, sender, theme and payment
            templates — then apply one to the current invoice in a click.
          </p>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {profiles.map((profile) =>
            editing?.id === profile.id ? (
              <ProfileForm
                key={profile.id}
                initial={profile}
                onSave={async (input) => {
                  await fetch("/api/admin/invoice-agency-profiles", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: profile.id, ...input }),
                  });
                  setEditing(null);
                  refresh();
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={profile.id} className="flex items-center justify-between gap-2 rounded-2xl border p-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {profile.logo ? (
                    <img src={profile.logo} alt="" className="size-10 shrink-0 rounded-xl border bg-white object-contain" />
                  ) : (
                    // The profile's own theme color — a preview of how its invoices print.
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white"
                      style={{ backgroundColor: profile.themeColor }}
                    >
                      {profile.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{profile.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {profile.sender.name || "No sender set"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => handleApply(profile)}
                    title="Apply to current invoice"
                  >
                    {appliedId === profile.id ? <Check /> : <Download />}
                    {appliedId === profile.id ? "Applied" : "Apply"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing(profile)}
                    aria-label={`Edit ${profile.name}`}
                    className="text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete profile "${profile.name}"?`, destructive: true, confirmText: "Delete" }))) return;
                      await fetch(`/api/admin/invoice-agency-profiles?id=${profile.id}`, { method: "DELETE" });
                      refresh();
                    }}
                    aria-label={`Delete ${profile.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}

          {adding ? (
            <ProfileForm
              onSave={async (input) => {
                await fetch("/api/admin/invoice-agency-profiles", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(input),
                });
                setAdding(false);
                refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)} className="-ml-2 px-2">
              <Plus />
              Add Agency Profile
            </Button>
          )}
        </div>
      )}
      {dialog}
    </Card>
  );
}

interface ProfileInputData {
  name: string;
  sender: { name: string; address: string; city: string; zipCode: string; country: string; email: string; phone: string };
  logo: string;
  themeColor: string;
  website: string;
  paymentLocal: PaymentInfo;
  paymentInternational: PaymentInfo;
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: AgencyProfileRecord;
  onSave: (data: ProfileInputData) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [senderName, setSenderName] = useState(initial?.sender.name ?? "");
  const [senderAddress, setSenderAddress] = useState(initial?.sender.address ?? "");
  const [senderCity, setSenderCity] = useState(initial?.sender.city ?? "");
  const [senderZip, setSenderZip] = useState(initial?.sender.zipCode ?? "");
  const [senderCountry, setSenderCountry] = useState(initial?.sender.country ?? "");
  const [senderEmail, setSenderEmail] = useState(initial?.sender.email ?? "");
  const [senderPhone, setSenderPhone] = useState(initial?.sender.phone ?? "");
  const [logo, setLogo] = useState(initial?.logo ?? "");
  const [themeColor, setThemeColor] = useState(initial?.themeColor ?? "#2563eb");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [localTemplate, setLocalTemplate] = useState<PaymentInfo>(initial?.paymentLocal ?? emptyPaymentInfo("local"));
  const [intlTemplate, setIntlTemplate] = useState<PaymentInfo>(initial?.paymentInternational ?? emptyPaymentInfo("international"));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const id = useId();
  const logoRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      await onSave({
        name: name.trim(),
        sender: {
          name: senderName, address: senderAddress, city: senderCity,
          zipCode: senderZip, country: senderCountry, email: senderEmail, phone: senderPhone,
        },
        logo,
        themeColor,
        website: website.trim(),
        paymentLocal: { ...localTemplate, paymentType: "local" },
        paymentInternational: { ...intlTemplate, paymentType: "international" },
      });
    } catch {
      setErr("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-muted/50 p-3">
      {/* Profile name */}
      <InvoiceField label="Profile Name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Agency Collective, PepAds"
          className="font-medium"
          required
        />
      </InvoiceField>

      {/* Website — shown in the invoice email when this profile is used as an
          invoice style from the Client Directory / Ad Accounts drawers. */}
      <InvoiceField label="Website" htmlFor={`${id}-website`}>
        <Input
          id={`${id}-website`}
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="e.g. https://www.peptiscale.com"
        />
      </InvoiceField>

      {/* Logo */}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-logo`}>Logo</Label>
        <LogoField
          size="sm"
          id={`${id}-logo`}
          logo={logo}
          inputRef={logoRef}
          onRemove={() => { setLogo(""); if (logoRef.current) logoRef.current.value = ""; }}
          onFile={(file) => {
            if (!isPdfImageType(file.type)) { setErr(PDF_IMAGE_ERROR); return; }
            if (file.size > MAX_LOGO_BYTES) { setErr("Logo must be under 500 KB"); return; }
            setErr("");
            const reader = new FileReader();
            reader.onload = () => setLogo(reader.result as string);
            reader.readAsDataURL(file);
          }}
          hint="PNG / JPG, max 500 KB."
        />
      </div>

      {/* Theme color */}
      <div className="grid gap-3">
        <span className="text-sm font-medium leading-none">Theme Color</span>
        <ThemeSwatches size="sm" value={themeColor} onChange={setThemeColor} />
      </div>

      {/* Sender */}
      <section className="space-y-3">
        <h5 className={SUBHEAD}>Sender (Bill From)</h5>
        <div className="grid grid-cols-2 gap-3">
          <TextField wide label="Company Name" value={senderName} onChange={setSenderName} />
          <TextField wide label="Address" value={senderAddress} onChange={setSenderAddress} />
          <TextField label="City" value={senderCity} onChange={setSenderCity} />
          <TextField label="Zip Code" value={senderZip} onChange={setSenderZip} />
          <TextField label="Country" value={senderCountry} onChange={setSenderCountry} />
          <TextField email label="Email" value={senderEmail} onChange={setSenderEmail} />
          <TextField wide label="Phone" value={senderPhone} onChange={setSenderPhone} />
        </div>
      </section>

      {/* Payment — Local */}
      <PaymentTemplateFields
        title="Payment — Local (Zelle + Wire)"
        type="local"
        value={localTemplate}
        onChange={(field, val) => setLocalTemplate((prev) => ({ ...prev, [field]: val }))}
      />

      {/* Payment — International */}
      <PaymentTemplateFields
        title="Payment — International (Wire)"
        type="international"
        value={intlTemplate}
        onChange={(field, val) => setIntlTemplate((prev) => ({ ...prev, [field]: val }))}
      />

      {err && <p role="alert" className="text-xs font-medium text-destructive">{err}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X />
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

function PaymentTemplateFields({
  title,
  type,
  value,
  onChange,
}: {
  title: string;
  type: PaymentType;
  value: PaymentInfo;
  onChange: (field: keyof PaymentInfo, value: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h5 className={SUBHEAD}>{title}</h5>
      <div className="grid grid-cols-2 gap-3">
        {type === "local" && (
          <TextField wide label="Zelle Contact (Phone / Email)" value={value.zelleContact ?? ""} onChange={(v) => onChange("zelleContact", v)} />
        )}
        {type === "international" && (
          <TextField wide label="SWIFT / BIC Code" value={value.swiftBic ?? ""} onChange={(v) => onChange("swiftBic", v)} />
        )}
        <TextField label="Bank Name" value={value.bankName} onChange={(v) => onChange("bankName", v)} />
        <TextField label="Account Name" value={value.accountName} onChange={(v) => onChange("accountName", v)} />
        <TextField label="Account Number" value={value.accountNumber} onChange={(v) => onChange("accountNumber", v)} />
        <TextField label="Routing Number" value={value.routingNumber ?? ""} onChange={(v) => onChange("routingNumber", v)} />
        {type === "international" && (
          <TextField wide label="Alternate Routing Number" value={value.alternateRoutingNumber ?? ""} onChange={(v) => onChange("alternateRoutingNumber", v)} placeholder="If sending bank doesn't recognize primary ABA" />
        )}
        <TextField wide multiline label="Bank Address" value={value.bankAddress ?? ""} onChange={(v) => onChange("bankAddress", v)} />
        <TextField label="Beneficiary Name" value={value.beneficiaryName ?? ""} onChange={(v) => onChange("beneficiaryName", v)} />
        <TextField label="Beneficiary Address" value={value.beneficiaryAddress ?? ""} onChange={(v) => onChange("beneficiaryAddress", v)} />
        <TextField wide label="Memo / Reference" value={value.memo ?? ""} onChange={(v) => onChange("memo", v)} />
      </div>
    </section>
  );
}

"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save, ChevronDown, Users, Upload, Check, Download, Loader2 } from "lucide-react";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type { PaymentInfo, PaymentType } from "@/types/invoice";
import { emptyPaymentInfo } from "@/lib/invoice/paymentUtils";
import { THEME_COLORS } from "@/lib/invoice/validation";
import { cn } from "@/lib/utils";
import { INPUT_CLS, TEXTAREA_CLS } from "./styles";

const MAX_LOGO_BYTES = 500 * 1024; // 500 KB

interface Props {
  /** Load a saved profile's sender, logo, theme + payment into the current draft. */
  onApply: (profile: AgencyProfileRecord) => void;
}

export function InvoiceAgencyProfiles({ onApply }: Props) {
  const queryClient = useQueryClient();
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
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Agency Profiles</span>
          <span className="text-xs text-muted-foreground">({profiles.length})</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/50 px-5 py-4 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Save multiple agency identities — each with its own logo, sender, theme and payment
            templates — then apply one to the current invoice in a click.
          </p>

          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

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
              <div key={profile.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background p-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {profile.logo ? (
                    <img src={profile.logo} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-contain bg-background" />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-xs font-semibold text-white"
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
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleApply(profile)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      appliedId === profile.id
                        ? "text-emerald-600"
                        : "text-primary hover:bg-primary/10"
                    )}
                    title="Apply to current invoice"
                  >
                    {appliedId === profile.id ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                    {appliedId === profile.id ? "Applied" : "Apply"}
                  </button>
                  <button onClick={() => setEditing(profile)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete profile "${profile.name}"?`)) return;
                      await fetch(`/api/admin/invoice-agency-profiles?id=${profile.id}`, { method: "DELETE" });
                      refresh();
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Agency Profile
            </button>
          )}
        </div>
      )}
    </div>
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
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-4">
      {/* Profile name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Profile Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Agency Collective, PepAds"
          className={cn(INPUT_CLS, "font-medium")}
          required
        />
      </div>

      {/* Website — shown in the invoice email when this profile is used as an
          invoice style from the Client Directory / Ad Accounts drawers. */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Website</label>
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="e.g. https://www.peptiscale.com"
          className={INPUT_CLS}
        />
      </div>

      {/* Logo */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">Logo</label>
        <div className="flex items-center gap-3">
          {logo ? (
            <div className="relative group">
              <img src={logo} alt="Logo" className="h-14 w-14 rounded-lg border border-border object-contain bg-background" />
              <button
                type="button"
                onClick={() => { setLogo(""); if (logoRef.current) logoRef.current.value = ""; }}
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Upload className="h-4 w-4 mb-0.5" />
              <span className="text-[9px]">Upload</span>
            </button>
          )}
          <input
            ref={logoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!file.type.startsWith("image/")) { setErr("Please upload an image file"); return; }
              if (file.size > MAX_LOGO_BYTES) { setErr("Logo must be under 500 KB"); return; }
              setErr("");
              const reader = new FileReader();
              reader.onload = () => setLogo(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
          <p className="text-[10px] text-muted-foreground">PNG / JPG, max 500 KB.</p>
        </div>
      </div>

      {/* Theme color */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">Theme Color</label>
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setThemeColor(t.color)}
              title={t.label}
              className="relative h-7 w-7 rounded-full transition-all hover:scale-110"
              style={{
                backgroundColor: t.color,
                ...(themeColor === t.color ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${t.color}` } : {}),
              }}
            >
              {themeColor === t.color && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Sender */}
      <div className="space-y-2">
        <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Sender (Bill From)</h5>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Company Name</label>
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="col-span-2">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Address</label>
            <input value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">City</label>
            <input value={senderCity} onChange={(e) => setSenderCity(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Zip Code</label>
            <input value={senderZip} onChange={(e) => setSenderZip(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Country</label>
            <input value={senderCountry} onChange={(e) => setSenderCountry(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Email</label>
            <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="col-span-2">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Phone</label>
            <input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>
      </div>

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

      {err && <p className="text-xs font-medium text-destructive">{err}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5 inline mr-1" />Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white ac-gradient disabled:opacity-60">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </button>
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
    <div className="space-y-2">
      <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title}</h5>
      <div className="grid grid-cols-2 gap-2">
        {type === "local" && (
          <div className="col-span-2">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Zelle Contact (Phone / Email)</label>
            <input value={value.zelleContact ?? ""} onChange={(e) => onChange("zelleContact", e.target.value)} className={INPUT_CLS} />
          </div>
        )}
        {type === "international" && (
          <div className="col-span-2">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">SWIFT / BIC Code</label>
            <input value={value.swiftBic ?? ""} onChange={(e) => onChange("swiftBic", e.target.value)} className={INPUT_CLS} />
          </div>
        )}
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Bank Name</label>
          <input value={value.bankName} onChange={(e) => onChange("bankName", e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Account Name</label>
          <input value={value.accountName} onChange={(e) => onChange("accountName", e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Account Number</label>
          <input value={value.accountNumber} onChange={(e) => onChange("accountNumber", e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Routing Number</label>
          <input value={value.routingNumber ?? ""} onChange={(e) => onChange("routingNumber", e.target.value)} className={INPUT_CLS} />
        </div>
        {type === "international" && (
          <div className="col-span-2">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Alternate Routing Number</label>
            <input value={value.alternateRoutingNumber ?? ""} onChange={(e) => onChange("alternateRoutingNumber", e.target.value)} placeholder="If sending bank doesn't recognize primary ABA" className={INPUT_CLS} />
          </div>
        )}
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Bank Address</label>
          <textarea value={value.bankAddress ?? ""} onChange={(e) => onChange("bankAddress", e.target.value)} rows={2} className={TEXTAREA_CLS} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Beneficiary Name</label>
          <input value={value.beneficiaryName ?? ""} onChange={(e) => onChange("beneficiaryName", e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Beneficiary Address</label>
          <input value={value.beneficiaryAddress ?? ""} onChange={(e) => onChange("beneficiaryAddress", e.target.value)} className={INPUT_CLS} />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Memo / Reference</label>
          <input value={value.memo ?? ""} onChange={(e) => onChange("memo", e.target.value)} className={INPUT_CLS} />
        </div>
      </div>
    </div>
  );
}

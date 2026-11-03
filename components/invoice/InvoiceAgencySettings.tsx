"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Save, ChevronDown, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { INVOICE_NOTICE, LogoField, TextField, ThemeSwatches } from "./InvoiceField";
import { badgeTone } from "@/components/ui/badge";
import type { PaymentInfo } from "@/types/invoice";
import { parsePaymentNoteToPaymentInfo, emptyPaymentInfo } from "@/lib/invoice/paymentUtils";
import { isPdfImageType, PDF_IMAGE_ERROR } from "@/lib/invoice/pdfImage";

interface AgencyConfigs {
  sender: string;
  note_local: string;
  note_international: string;
  payment_template_local: string;
  payment_template_international: string;
  default_logo: string;
  default_theme_color: string;
  [key: string]: string;
}

type TemplateFields = Omit<PaymentInfo, "paymentType">;

const SUBHEAD = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

function emptyTemplate(): TemplateFields {
  const { paymentType: _, ...rest } = emptyPaymentInfo("local");
  return rest;
}

/**
 * Parse structured JSON template, or fall back to parsing old free-text note.
 */
function parseTemplate(
  structuredRaw: string | undefined,
  freeTextRaw: string | undefined,
  type: "local" | "international"
): TemplateFields {
  // Try structured JSON first
  if (structuredRaw) {
    try {
      const parsed = JSON.parse(structuredRaw);
      return { ...emptyTemplate(), ...parsed };
    } catch { /* fall through */ }
  }
  // Fallback: parse old free-text note
  if (freeTextRaw) {
    const { paymentType: _, ...rest } = parsePaymentNoteToPaymentInfo(freeTextRaw, type);
    return rest;
  }
  return emptyTemplate();
}

export function InvoiceAgencySettings() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: configs } = useQuery<AgencyConfigs>({
    queryKey: ["agency-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agency-config");
      if (!res.ok) return { sender: "{}", note_local: "", note_international: "", payment_template_local: "", payment_template_international: "" };
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderCity, setSenderCity] = useState("");
  const [senderZip, setSenderZip] = useState("");
  const [senderCountry, setSenderCountry] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [localTemplate, setLocalTemplate] = useState(emptyTemplate());
  const [intlTemplate, setIntlTemplate] = useState(emptyTemplate());
  const [defaultLogo, setDefaultLogo] = useState("");
  const [defaultThemeColor, setDefaultThemeColor] = useState("#475569");
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!configs) return;
    try {
      const s = JSON.parse(configs.sender);
      setSenderName(s.name ?? "");
      setSenderAddress(s.address ?? "");
      setSenderCity(s.city ?? "");
      setSenderZip(s.zipCode ?? "");
      setSenderCountry(s.country ?? "");
      setSenderEmail(s.email ?? "");
      setSenderPhone(s.phone ?? "");
    } catch { /* ignore */ }
    setLocalTemplate(parseTemplate(configs.payment_template_local, configs.note_local, "local"));
    setIntlTemplate(parseTemplate(configs.payment_template_international, configs.note_international, "international"));
    setDefaultLogo(configs.default_logo ?? "");
    setDefaultThemeColor(configs.default_theme_color ?? "#475569");
  }, [configs]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const sender = JSON.stringify({
        name: senderName, address: senderAddress, city: senderCity,
        zipCode: senderZip, country: senderCountry, email: senderEmail, phone: senderPhone,
      });
      const patch = async (key: string, value: string) => {
        const res = await fetch("/api/admin/agency-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `Failed to save ${key}`);
        }
      };
      await Promise.all([
        patch("sender", sender),
        patch("payment_template_local", JSON.stringify(localTemplate)),
        patch("payment_template_international", JSON.stringify(intlTemplate)),
        patch("default_logo", defaultLogo),
        patch("default_theme_color", defaultThemeColor),
      ]);
      setMsg("Saved!");
      queryClient.invalidateQueries({ queryKey: ["agency-config"] });
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (field: string, value: string) => setLocalTemplate((prev) => ({ ...prev, [field]: value }));
  const updateIntl = (field: string, value: string) => setIntlTemplate((prev) => ({ ...prev, [field]: value }));

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 md:px-6"
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Agency Settings</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-6 border-t p-4 md:px-6">
          {/* Sender Info */}
          <section className="space-y-3">
            <h4 className={SUBHEAD}>Sender (Bill From)</h4>
            <div className="grid grid-cols-2 gap-3">
              <TextField wide label="Company Name" value={senderName} onChange={setSenderName} />
              <TextField wide label="Address" value={senderAddress} onChange={setSenderAddress} />
              <TextField label="City" value={senderCity} onChange={setSenderCity} />
              <TextField label="Zip Code" value={senderZip} onChange={setSenderZip} />
              <TextField label="Country" value={senderCountry} onChange={setSenderCountry} />
              <TextField label="Email" value={senderEmail} onChange={setSenderEmail} />
              <TextField wide label="Phone" value={senderPhone} onChange={setSenderPhone} />
            </div>
          </section>

          {/* Default Logo */}
          <section className="space-y-3">
            <h4 className={SUBHEAD}>Default Invoice Logo</h4>
            <LogoField
              logo={defaultLogo}
              inputRef={logoRef}
              onRemove={() => { setDefaultLogo(""); if (logoRef.current) logoRef.current.value = ""; }}
              onFile={(file) => {
                if (!isPdfImageType(file.type)) {
                  setMsg(PDF_IMAGE_ERROR);
                  return;
                }
                if (file.size > 500 * 1024) {
                  setMsg("Logo must be under 500 KB");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setDefaultLogo(reader.result as string);
                reader.readAsDataURL(file);
              }}
              hint="Used on all auto-generated invoices. PNG / JPG, max 500 KB."
            />
          </section>

          {/* Default Theme Color */}
          <section className="space-y-3">
            <h4 className={SUBHEAD}>Default Theme Color</h4>
            <ThemeSwatches size="sm" value={defaultThemeColor} onChange={setDefaultThemeColor} />
          </section>

          {/* Payment Template — Local */}
          <section className="space-y-3">
            <h4 className={SUBHEAD}>Payment Template — Local (Zelle + Wire)</h4>
            <div className="grid grid-cols-2 gap-3">
              <TextField wide label="Zelle Contact (Phone / Email)" value={localTemplate.zelleContact ?? ""} onChange={(v) => updateLocal("zelleContact", v)} />
              <TextField label="Bank Name" value={localTemplate.bankName} onChange={(v) => updateLocal("bankName", v)} />
              <TextField label="Account Name" value={localTemplate.accountName} onChange={(v) => updateLocal("accountName", v)} />
              <TextField label="Account Number" value={localTemplate.accountNumber} onChange={(v) => updateLocal("accountNumber", v)} />
              <TextField label="Routing Number" value={localTemplate.routingNumber ?? ""} onChange={(v) => updateLocal("routingNumber", v)} />
              <TextField wide multiline label="Bank Address" value={localTemplate.bankAddress ?? ""} onChange={(v) => updateLocal("bankAddress", v)} />
              <TextField label="Beneficiary Name" value={localTemplate.beneficiaryName ?? ""} onChange={(v) => updateLocal("beneficiaryName", v)} />
              <TextField label="Beneficiary Address" value={localTemplate.beneficiaryAddress ?? ""} onChange={(v) => updateLocal("beneficiaryAddress", v)} />
              <TextField wide label="Memo / Reference" value={localTemplate.memo ?? ""} onChange={(v) => updateLocal("memo", v)} />
            </div>
          </section>

          {/* Payment Template — International */}
          <section className="space-y-3">
            <h4 className={SUBHEAD}>Payment Template — International (Wire)</h4>
            <div className="grid grid-cols-2 gap-3">
              <TextField wide label="SWIFT / BIC Code" value={intlTemplate.swiftBic ?? ""} onChange={(v) => updateIntl("swiftBic", v)} />
              <TextField label="Bank Name" value={intlTemplate.bankName} onChange={(v) => updateIntl("bankName", v)} />
              <TextField label="Account Name" value={intlTemplate.accountName} onChange={(v) => updateIntl("accountName", v)} />
              <TextField label="Account Number" value={intlTemplate.accountNumber} onChange={(v) => updateIntl("accountNumber", v)} />
              <TextField label="Routing Number" value={intlTemplate.routingNumber ?? ""} onChange={(v) => updateIntl("routingNumber", v)} />
              <TextField wide label="Alternate Routing Number" value={intlTemplate.alternateRoutingNumber ?? ""} onChange={(v) => updateIntl("alternateRoutingNumber", v)} placeholder="If sending bank doesn't recognize primary ABA" />
              <TextField wide multiline label="Bank Address" value={intlTemplate.bankAddress ?? ""} onChange={(v) => updateIntl("bankAddress", v)} />
              <TextField label="Beneficiary Name" value={intlTemplate.beneficiaryName ?? ""} onChange={(v) => updateIntl("beneficiaryName", v)} />
              <TextField label="Beneficiary Address" value={intlTemplate.beneficiaryAddress ?? ""} onChange={(v) => updateIntl("beneficiaryAddress", v)} />
              <TextField wide label="Memo / Reference" value={intlTemplate.memo ?? ""} onChange={(v) => updateIntl("memo", v)} />
            </div>
          </section>

          {/* Save */}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save Settings
            </Button>
            {msg && (
              <span role="status" className={cn(INVOICE_NOTICE, msg === "Saved!" ? badgeTone.success : badgeTone.danger)}>
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

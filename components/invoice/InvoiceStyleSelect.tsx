"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type { PaymentInfo, PaymentType } from "@/types/invoice";
import { badgeTone } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix SelectItem can't hold "" — the default style maps to this.
const DEFAULT_STYLE = "__default__";

/**
 * Invoice-style picker for the re-bill / ad-account invoice drawers: default
 * Agency Collective branding, or one of the saved Agency Profiles from the
 * Invoice page (e.g. PepAds). The PDF shell (sender / logo / theme / payment
 * block) AND the invoice email's branding (subject / body / sign-off with the
 * profile's contact email + website) follow the selection — recipients, line
 * items and the sending mailbox are untouched. Renders nothing when no
 * profiles are saved.
 */

/**
 * A profile's payment template for the given type, or null when the template
 * is blank — callers keep the current payment block in that case (mirrors the
 * Invoice page's applyProfile).
 */
export function profilePaymentBlock(
  profile: AgencyProfileRecord,
  type: PaymentType
): PaymentInfo | null {
  const template =
    type === "international" ? profile.paymentInternational : profile.paymentLocal;
  const hasContent = Object.entries(template).some(
    ([k, v]) => k !== "paymentType" && typeof v === "string" && v.trim() !== ""
  );
  return hasContent ? { ...template, paymentType: type } : null;
}

interface Props {
  /** Selected profile id, or null for the default Agency Collective style. */
  selectedId: string | null;
  onSelect: (profile: AgencyProfileRecord | null) => void;
  /**
   * The drawer's current Local/International selection — used to warn when
   * the selected profile has no payment template for it (the PDF then keeps
   * whatever payment block is currently loaded, which may be the default
   * Agency Collective one or the profile's other type).
   */
  paymentType: PaymentType;
}

export function InvoiceStyleSelect({ selectedId, onSelect, paymentType }: Props) {
  const { data: profiles = [] } = useQuery<AgencyProfileRecord[]>({
    queryKey: ["invoice-agency-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-agency-profiles");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  if (profiles.length === 0) return null;

  const selected = profiles.find((p) => p.id === selectedId);
  const templateMissing =
    selected !== undefined && profilePaymentBlock(selected, paymentType) === null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Invoice style</Label>
      <Select
        value={selectedId ?? DEFAULT_STYLE}
        onValueChange={(v) => onSelect(profiles.find((p) => p.id === v) ?? null)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_STYLE}>Agency Collective (default)</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Applies that profile&apos;s logo, sender and payment details to the PDF,
        and brands the invoice email (subject, body and sign-off) to match.
      </p>
      {selected && templateMissing && (
        <p className={cn("rounded-2xl border px-3 py-2 text-xs", badgeTone.warning)}>
          {selected.name} has no {paymentType} payment template, so the PDF
          keeps the payment details currently loaded — they may not belong to{" "}
          {selected.name}. Preview before sending, or add the template under
          Invoice → Agency Profiles.
        </p>
      )}
    </div>
  );
}

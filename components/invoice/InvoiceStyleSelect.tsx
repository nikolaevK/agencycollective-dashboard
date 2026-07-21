"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type { PaymentInfo, PaymentType } from "@/types/invoice";

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
    <div>
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
        Invoice style
      </label>
      <select
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        value={selectedId ?? ""}
        onChange={(e) =>
          onSelect(profiles.find((p) => p.id === e.target.value) ?? null)
        }
      >
        <option value="">Agency Collective (default)</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Applies that profile&apos;s logo, sender and payment details to the PDF,
        and brands the invoice email (subject, body and sign-off) to match.
      </p>
      {selected && templateMissing && (
        <p className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          {selected.name} has no {paymentType} payment template, so the PDF
          keeps the payment details currently loaded — they may not belong to{" "}
          {selected.name}. Preview before sending, or add the template under
          Invoice → Agency Profiles.
        </p>
      )}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { OfferPageOverrides, OfferPageSettings } from "@/lib/portalOfferRules";

export interface OfferPageResponse {
  settings: OfferPageSettings;
  /** Only what an admin changed (null = hidden); everything else follows the defaults. */
  overrides: OfferPageOverrides;
  heroImageUrl: string | null;
  defaults: OfferPageSettings;
}

export const OFFER_PAGE_KEY = ["admin-offer-page"];

/** The portal cross-sell page design (copy + header image). */
export function useOfferPage() {
  return useQuery({
    queryKey: OFFER_PAGE_KEY,
    queryFn: async (): Promise<OfferPageResponse> => {
      const res = await fetch("/api/admin/clients/offers/page");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data as OfferPageResponse;
    },
    staleTime: 60_000,
  });
}

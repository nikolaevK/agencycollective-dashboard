"use client";

import { useQuery } from "@tanstack/react-query";
import type { DealInvoiceRecord } from "@/lib/dealInvoices";

export function useDealInvoice(dealId: string | null) {
  return useQuery<DealInvoiceRecord | null>({
    queryKey: ["deal-invoice", dealId],
    queryFn: async () => {
      if (!dealId) return null;
      const res = await fetch(`/api/admin/deal-invoices?dealId=${dealId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? null;
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

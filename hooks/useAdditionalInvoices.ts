"use client";

import { useQuery } from "@tanstack/react-query";
import type { InvoiceData } from "@/types/invoice";

export interface AdditionalInvoiceRecord {
  id: string;
  dealId: string;
  invoiceNumber: string;
  invoiceData: InvoiceData;
  status: "draft" | "sent";
  sortOrder: number;
  hasPdf: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useAdditionalInvoices(dealId: string | null) {
  return useQuery<AdditionalInvoiceRecord[]>({
    queryKey: ["deal-additional-invoices", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const res = await fetch(`/api/admin/deal-invoices/additional?dealId=${dealId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

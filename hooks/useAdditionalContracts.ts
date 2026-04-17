"use client";

import { useQuery } from "@tanstack/react-query";
import type { DealContractStatus } from "@/lib/dealContracts";

export interface AdditionalContractRecord {
  id: string;
  dealId: string;
  contractTemplateId: string | null;
  docusealSubmissionId: number | null;
  docusealSubmitterId: number | null;
  docusealTemplateOverrideId: number | null;
  status: DealContractStatus;
  clientEmail: string | null;
  signingUrl: string | null;
  sentAt: string | null;
  signedAt: string | null;
  documentUrls: string[] | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useAdditionalContracts(dealId: string | null) {
  return useQuery<AdditionalContractRecord[]>({
    queryKey: ["deal-additional-contracts", dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const params = new URLSearchParams({ dealId });
      const res = await fetch(`/api/admin/deal-contracts/additional?${params}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!dealId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { DealContractRecord } from "@/lib/dealContracts";

export function useDealContract(dealId: string | null) {
  return useQuery<DealContractRecord | null>({
    queryKey: ["deal-contract", dealId],
    queryFn: async () => {
      if (!dealId) return null;
      const params = new URLSearchParams({ dealId });
      const res = await fetch(`/api/admin/deal-contracts?${params}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? null;
    },
    enabled: !!dealId,
    staleTime: 30_000,
  });
}

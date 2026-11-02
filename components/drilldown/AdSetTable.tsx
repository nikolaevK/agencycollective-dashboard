"use client";

import { Badge } from "@/components/ui/badge";
import { MetaEntityTable } from "@/components/drilldown/MetaEntityTable";
import { useDateRange } from "@/hooks/useDateRange";
import type { AdSetRow } from "@/types/dashboard";

interface AdSetTableProps {
  adsets?: AdSetRow[];
  isLoading?: boolean;
  /** The ad account's currency. */
  currency?: string;
  accountId: string;
  campaignId: string;
}

export function AdSetTable({ adsets, isLoading, accountId, campaignId, currency }: AdSetTableProps) {
  const { dateQuery } = useDateRange();
  return (
    <MetaEntityTable
      rows={adsets}
      isLoading={isLoading}
      currency={currency}
      nameLabel="Ad Set"
      emptyText="No ad sets found"
      href={(s) => `/dashboard/accounts/${accountId}/campaigns/${campaignId}/adsets/${s.id}${dateQuery ? `?${dateQuery}` : ""}`}
      subtitle={(s) => (
        <span className="flex items-center gap-1.5">
          {s.optimizationGoal || "No optimization goal"}
          {s.budgetSharing && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px]"
              title="Campaign Budget Optimization — Meta distributes the campaign budget across ad sets automatically to maximize results."
            >
              CBO
            </Badge>
          )}
        </span>
      )}
    />
  );
}

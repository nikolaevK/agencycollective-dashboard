"use client";

import { Badge } from "@/components/ui/badge";
import { MetaEntityTable } from "@/components/drilldown/MetaEntityTable";
import { useDateRange } from "@/hooks/useDateRange";
import { formatCurrency } from "@/lib/utils";
import type { CampaignRow } from "@/types/dashboard";

interface CampaignTableProps {
  campaigns?: CampaignRow[];
  isLoading?: boolean;
  /** The ad account's currency. */
  currency?: string;
  accountId: string;
}

export function CampaignTable({ campaigns, isLoading, accountId, currency }: CampaignTableProps) {
  const { dateQuery } = useDateRange();
  return (
    <MetaEntityTable
      rows={campaigns}
      isLoading={isLoading}
      currency={currency}
      nameLabel="Campaign"
      emptyText="No campaigns found"
      href={(c) => `/dashboard/accounts/${accountId}/campaigns/${c.id}${dateQuery ? `?${dateQuery}` : ""}`}
      subtitle={(c) => (
        <span className="flex items-center gap-1.5">
          {c.objective || "No objective"}
          {c.advantagePlus && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px]"
              title="Advantage+ campaign — Meta's AI fully automates audience targeting, placements, and creative optimization."
            >
              A+
            </Badge>
          )}
        </span>
      )}
      extraColumn={{
        label: "Budget",
        align: "right",
        sortValue: (c) => c.budget,
        render: (c) =>
          c.budget > 0 ? (
            <span className="text-xs">
              {c.budgetType === "daily" ? "D" : c.budgetType === "lifetime" ? "L" : ""} {formatCurrency(c.budget, currency)}
            </span>
          ) : (
            "—"
          ),
      }}
    />
  );
}

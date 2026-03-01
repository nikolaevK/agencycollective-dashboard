"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatNumber, formatRoas } from "@/lib/utils";
import type { CampaignRow } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas" | "budget";
type SortDir = "asc" | "desc";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "secondary",
  DELETED: "destructive",
  IN_PROCESS: "secondary",
  WITH_ISSUES: "destructive",
};

interface CampaignTableProps {
  campaigns?: CampaignRow[];
  isLoading?: boolean;
  accountId: string;
}

export function CampaignTable({ campaigns, isLoading, accountId }: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = campaigns
    ? [...campaigns].sort((a, b) => {
        let aVal: number | string =
          sortKey === "name" ? a.name :
          sortKey === "budget" ? a.budget :
          a.insights[sortKey as keyof typeof a.insights] as number;
        let bVal: number | string =
          sortKey === "name" ? b.name :
          sortKey === "budget" ? b.budget :
          b.insights[sortKey as keyof typeof b.insights] as number;
        if (typeof aVal === "string") {
          return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
        }
        return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      })
    : [];

  function SortHeader({ label, column }: { label: string; column: SortKey }) {
    const active = sortKey === column;
    return (
      <button onClick={() => toggleSort(column)} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    );
  }

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortHeader label="Campaign" column="name" /></TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Objective</TableHead>
          <TableHead className="text-right"><SortHeader label="Budget" column="budget" /></TableHead>
          <TableHead className="text-right"><SortHeader label="Spend" column="spend" /></TableHead>
          <TableHead className="text-right"><SortHeader label="Impr." column="impressions" /></TableHead>
          <TableHead className="text-right"><SortHeader label="CTR" column="ctr" /></TableHead>
          <TableHead className="text-right"><SortHeader label="CPC" column="cpc" /></TableHead>
          <TableHead className="text-right"><SortHeader label="ROAS" column="roas" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No campaigns found</TableCell>
          </TableRow>
        )}
        {sorted.map((campaign) => (
          <TableRow key={campaign.id}>
            <TableCell className="font-medium max-w-xs">
              <Link
                href={`/dashboard/accounts/${accountId}/campaigns/${campaign.id}`}
                className="line-clamp-1 hover:text-primary hover:underline"
              >
                {campaign.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[campaign.status] ?? "secondary"}>
                {campaign.status}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{campaign.objective || "—"}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {campaign.budget > 0 ? (
                <span className="text-xs">{campaign.budgetType === "daily" ? "D" : campaign.budgetType === "lifetime" ? "L" : ""} {formatCurrency(campaign.budget)}</span>
              ) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(campaign.insights.spend)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(campaign.insights.impressions)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(campaign.insights.ctr)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(campaign.insights.cpc)}</TableCell>
            <TableCell className="text-right font-mono">{formatRoas(campaign.insights.roas)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

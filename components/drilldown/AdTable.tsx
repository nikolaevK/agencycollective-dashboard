"use client";

import { useState } from "react";
import { ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatNumber, formatRoas } from "@/lib/utils";
import type { AdRow } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortDir = "asc" | "desc";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "secondary",
  DELETED: "destructive",
  IN_PROCESS: "secondary",
  WITH_ISSUES: "destructive",
  DISAPPROVED: "destructive",
};

interface AdTableProps {
  ads?: AdRow[];
  isLoading?: boolean;
}

export function AdTable({ ads, isLoading }: AdTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = ads
    ? [...ads].sort((a, b) => {
        const aVal = sortKey === "name" ? a.name : a.insights[sortKey as keyof typeof a.insights] as number;
        const bVal = sortKey === "name" ? b.name : b.insights[sortKey as keyof typeof b.insights] as number;
        if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
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
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortHeader label="Ad" column="name" /></TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right"><SortHeader label="Spend" column="spend" /></TableHead>
          <TableHead className="text-right"><SortHeader label="Impr." column="impressions" /></TableHead>
          <TableHead className="text-right"><SortHeader label="CTR" column="ctr" /></TableHead>
          <TableHead className="text-right"><SortHeader label="CPC" column="cpc" /></TableHead>
          <TableHead className="text-right"><SortHeader label="ROAS" column="roas" /></TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No ads found</TableCell>
          </TableRow>
        )}
        {sorted.map((ad) => (
          <TableRow key={ad.id}>
            <TableCell className="font-medium max-w-xs">
              <span className="line-clamp-1">{ad.name}</span>
              {ad.creativeId && <span className="text-xs text-muted-foreground">#{ad.creativeId}</span>}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[ad.status] ?? "secondary"}>{ad.status}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(ad.insights.spend)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(ad.insights.impressions)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(ad.insights.ctr)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(ad.insights.cpc)}</TableCell>
            <TableCell className="text-right font-mono">{formatRoas(ad.insights.roas)}</TableCell>
            <TableCell>
              {ad.previewUrl && (
                <a
                  href={ad.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

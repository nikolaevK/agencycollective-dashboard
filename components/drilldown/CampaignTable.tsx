"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SortHeader } from "@/components/ui/SortHeader";
import { formatCurrency, formatPercent, formatNumber, formatRoas, cn } from "@/lib/utils";
import { STATUS_STYLES, STATUS_STYLE_DEFAULT, ROAS_GOOD_THRESHOLD } from "@/lib/table-helpers";
import type { CampaignRow } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas" | "budget";
type SortDir = "asc" | "desc";

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

  function renderSortHeader(label: string, column: SortKey) {
    return (
      <SortHeader
        label={label}
        active={sortKey === column}
        direction={sortDir}
        onToggle={() => toggleSort(column)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 p-4 space-y-3 lg:hidden">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-14 rounded-full ml-auto" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
        <div className="hidden lg:block space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {sorted.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">No campaigns found</p>
        )}
        {sorted.map((campaign) => {
          const statusStyle = STATUS_STYLES[campaign.status] ?? STATUS_STYLE_DEFAULT;
          return (
            <Link
              key={campaign.id}
              href={`/dashboard/accounts/${accountId}/campaigns/${campaign.id}`}
              className="block rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 dark:border-white/[0.04] p-4 active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{campaign.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {campaign.objective || "No objective"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("px-2 py-0.5 text-[9px] font-black rounded-full uppercase", statusStyle)}>
                    {campaign.status}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Spend</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(campaign.insights.spend)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">ROAS</p>
                  <p className={cn("text-sm font-bold tabular-nums", campaign.insights.roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                    {formatRoas(campaign.insights.roas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">CPC</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(campaign.insights.cpc)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto -mx-4 lg:-mx-6 hidden lg:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 dark:bg-muted/20">
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {renderSortHeader("Campaign", "name")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">
                Status
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                Objective
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("Budget", "budget")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("Spend", "spend")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("Impr.", "impressions")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("CTR", "ctr")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("CPC", "cpc")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("ROAS", "roas")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 dark:divide-white/[0.04]">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted-foreground py-12 text-sm">No campaigns found</td>
              </tr>
            )}
            {sorted.map((campaign) => {
              const statusStyle = STATUS_STYLES[campaign.status] ?? STATUS_STYLE_DEFAULT;
              return (
                <tr key={campaign.id} className="hover:bg-muted/20 dark:hover:bg-muted/10 transition-colors group">
                  <td className="px-6 py-5">
                    <Link
                      href={`/dashboard/accounts/${accountId}/campaigns/${campaign.id}`}
                      className="block min-w-0"
                    >
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-xs">
                        {campaign.name}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className={cn("inline-block px-2 py-1 text-[10px] font-black rounded-md uppercase", statusStyle)}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-sm text-muted-foreground">{campaign.objective || "—"}</td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {campaign.budget > 0 ? (
                      <span className="text-xs">
                        {campaign.budgetType === "daily" ? "D" : campaign.budgetType === "lifetime" ? "L" : ""}{" "}
                        {formatCurrency(campaign.budget)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(campaign.insights.spend)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatNumber(campaign.insights.impressions)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatPercent(campaign.insights.ctr)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(campaign.insights.cpc)}
                  </td>
                  <td className="px-4 py-5 text-right">
                    <span className={cn("text-sm font-bold tabular-nums", campaign.insights.roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                      {formatRoas(campaign.insights.roas)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

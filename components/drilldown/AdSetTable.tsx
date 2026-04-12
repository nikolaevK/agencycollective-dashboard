"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SortHeader } from "@/components/ui/SortHeader";
import { formatCurrency, formatPercent, formatNumber, formatRoas, cn } from "@/lib/utils";
import { STATUS_STYLES, STATUS_STYLE_DEFAULT, ROAS_GOOD_THRESHOLD } from "@/lib/table-helpers";
import type { AdSetRow } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortDir = "asc" | "desc";

interface AdSetTableProps {
  adsets?: AdSetRow[];
  isLoading?: boolean;
  accountId: string;
  campaignId: string;
}

export function AdSetTable({ adsets, isLoading, accountId, campaignId }: AdSetTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = adsets
    ? [...adsets].sort((a, b) => {
        const aVal = sortKey === "name" ? a.name : a.insights[sortKey as keyof typeof a.insights] as number;
        const bVal = sortKey === "name" ? b.name : b.insights[sortKey as keyof typeof b.insights] as number;
        if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
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
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {sorted.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">No ad sets found</p>
        )}
        {sorted.map((adset) => {
          const statusStyle = STATUS_STYLES[adset.status] ?? STATUS_STYLE_DEFAULT;
          return (
            <Link
              key={adset.id}
              href={`/dashboard/accounts/${accountId}/campaigns/${campaignId}/adsets/${adset.id}`}
              className="block rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 dark:border-white/[0.04] p-4 active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{adset.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[10px] text-muted-foreground">
                      {adset.optimizationGoal || "No optimization goal"}
                    </p>
                    {adset.budgetSharing && (
                      <span className="relative group/cbo px-1.5 py-0.5 text-[8px] font-bold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 uppercase cursor-help">
                        CBO
                        <span className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg bg-popover border border-border shadow-lg p-2 text-[10px] leading-relaxed text-foreground/80 font-normal normal-case opacity-0 pointer-events-none group-hover/cbo:opacity-100 transition-opacity">
                          Campaign Budget Optimization — Meta distributes the campaign budget across ad sets automatically to maximize results.
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("px-2 py-0.5 text-[9px] font-black rounded-full uppercase", statusStyle)}>
                    {adset.status}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Spend</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(adset.insights.spend)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">ROAS</p>
                  <p className={cn("text-sm font-bold tabular-nums", adset.insights.roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                    {formatRoas(adset.insights.roas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">CPC</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(adset.insights.cpc)}</p>
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
                {renderSortHeader("Ad Set", "name")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">
                Status
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                Optimization
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
                <td colSpan={8} className="text-center text-muted-foreground py-12 text-sm">No ad sets found</td>
              </tr>
            )}
            {sorted.map((adset) => {
              const statusStyle = STATUS_STYLES[adset.status] ?? STATUS_STYLE_DEFAULT;
              return (
                <tr key={adset.id} className="hover:bg-muted/20 dark:hover:bg-muted/10 transition-colors group">
                  <td className="px-6 py-5">
                    <Link
                      href={`/dashboard/accounts/${accountId}/campaigns/${campaignId}/adsets/${adset.id}`}
                      className="block min-w-0"
                    >
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-xs">
                        {adset.name}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className={cn("inline-block px-2 py-1 text-[10px] font-black rounded-md uppercase", statusStyle)}>
                      {adset.status}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {adset.optimizationGoal || "—"}
                      {adset.budgetSharing && (
                        <span className="relative group/cbo px-1.5 py-0.5 text-[8px] font-bold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 uppercase cursor-help">
                        CBO
                        <span className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg bg-popover border border-border shadow-lg p-2 text-[10px] leading-relaxed text-foreground/80 font-normal normal-case opacity-0 pointer-events-none group-hover/cbo:opacity-100 transition-opacity">
                          Campaign Budget Optimization — Meta distributes the campaign budget across ad sets automatically to maximize results.
                        </span>
                      </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(adset.insights.spend)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatNumber(adset.insights.impressions)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatPercent(adset.insights.ctr)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(adset.insights.cpc)}
                  </td>
                  <td className="px-4 py-5 text-right">
                    <span className={cn("text-sm font-bold tabular-nums", adset.insights.roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                      {formatRoas(adset.insights.roas)}
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

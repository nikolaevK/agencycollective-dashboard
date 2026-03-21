"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SortHeader } from "@/components/ui/SortHeader";
import { formatCurrency, formatPercent, formatNumber, formatRoas, cn } from "@/lib/utils";
import { STATUS_STYLES, STATUS_STYLE_DEFAULT, ROAS_GOOD_THRESHOLD } from "@/lib/table-helpers";
import type { AdRow } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortDir = "asc" | "desc";

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
          <p className="text-center text-muted-foreground py-8 text-sm">No ads found</p>
        )}
        {sorted.map((ad) => {
          const statusStyle = STATUS_STYLES[ad.status] ?? STATUS_STYLE_DEFAULT;
          return (
            <div
              key={ad.id}
              className="rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 dark:border-white/[0.04] p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{ad.name}</p>
                  {ad.creativeId && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">#{ad.creativeId}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("px-2 py-0.5 text-[9px] font-black rounded-full uppercase", statusStyle)}>
                    {ad.status}
                  </span>
                  {ad.previewUrl && (
                    <a
                      href={ad.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      aria-label={`Preview ${ad.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Spend</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(ad.insights.spend)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">ROAS</p>
                  <p className={cn("text-sm font-bold tabular-nums", ad.insights.roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                    {formatRoas(ad.insights.roas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">CPC</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(ad.insights.cpc)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto -mx-4 lg:-mx-6 hidden lg:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 dark:bg-muted/20">
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {renderSortHeader("Ad", "name")}
              </th>
              <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">
                Status
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
              <th className="px-4 py-4 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 dark:divide-white/[0.04]">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-12 text-sm">No ads found</td>
              </tr>
            )}
            {sorted.map((ad) => {
              const statusStyle = STATUS_STYLES[ad.status] ?? STATUS_STYLE_DEFAULT;
              return (
                <tr key={ad.id} className="hover:bg-muted/20 dark:hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-foreground truncate max-w-xs">{ad.name}</p>
                    {ad.creativeId && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">#{ad.creativeId}</p>
                    )}
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className={cn("inline-block px-2 py-1 text-[10px] font-black rounded-md uppercase", statusStyle)}>
                      {ad.status}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(ad.insights.spend)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatNumber(ad.insights.impressions)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatPercent(ad.insights.ctr)}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(ad.insights.cpc)}
                  </td>
                  <td className="px-4 py-5 text-right">
                    <span className={cn("text-sm font-bold tabular-nums", ad.insights.roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                      {formatRoas(ad.insights.roas)}
                    </span>
                  </td>
                  <td className="px-4 py-5">
                    {ad.previewUrl && (
                      <a
                        href={ad.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                        aria-label={`Preview ${ad.name}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
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

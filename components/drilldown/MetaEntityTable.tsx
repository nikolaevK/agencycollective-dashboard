"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SortHeader } from "@/components/ui/SortHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import { cn, formatCurrency, formatNumber, formatPercent, formatRoas } from "@/lib/utils";
import { ROAS_GOOD_THRESHOLD } from "@/lib/table-helpers";
import type { InsightMetrics } from "@/types/dashboard";

export interface MetaEntityRow {
  id: string;
  name: string;
  status: string;
  insights: InsightMetrics;
}

type MetricSortKey = "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortKey = "name" | "extra" | MetricSortKey;

interface ExtraColumn<T> {
  label: string;
  render: (row: T) => React.ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => number;
  align?: "left" | "right";
}

interface MetaEntityTableProps<T extends MetaEntityRow> {
  rows?: T[];
  isLoading?: boolean;
  /** Name-column header ("Campaign", "Ad Set", "Ad"). */
  nameLabel: string;
  emptyText: string;
  /** Row → drill-down page. */
  href?: (row: T) => string;
  /** Under the name (objective, creative id …). */
  subtitle?: (row: T) => React.ReactNode;
  extraColumn?: ExtraColumn<T>;
  /** Trailing cell (e.g. an ad preview link). Not for rows with an `href`:
   *  on phones the whole row is a link. */
  action?: (row: T) => React.ReactNode;
  /** The ad account's currency. */
  currency?: string;
}

const METRIC_COLUMNS: { key: MetricSortKey; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "impressions", label: "Impr." },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "roas", label: "ROAS" },
];

function metricCell(key: MetricSortKey, m: InsightMetrics, currency?: string): string {
  if (key === "spend") return formatCurrency(m.spend, currency);
  if (key === "impressions") return formatNumber(m.impressions);
  if (key === "ctr") return formatPercent(m.ctr);
  if (key === "cpc") return formatCurrency(m.cpc, currency);
  return formatRoas(m.roas);
}

function roasClass(roas: number) {
  return roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-700 dark:text-emerald-400" : undefined;
}

/**
 * Sortable Meta entity table (campaigns / ad sets / ads) in the kit style:
 * a table on desktop, tappable cards on phones. Rows link to the next
 * drill-down level when `href` is given.
 */
export function MetaEntityTable<T extends MetaEntityRow>({
  rows,
  isLoading,
  nameLabel,
  emptyText,
  href,
  subtitle,
  extraColumn,
  action,
  currency,
}: MetaEntityTableProps<T>) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const valueOf = (r: T): number | string =>
      sortKey === "name"
        ? r.name
        : sortKey === "extra"
          ? (extraColumn?.sortValue?.(r) ?? 0)
          : r.insights[sortKey];
    return [...(rows ?? [])].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === "string" || typeof bv === "string") {
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir, extraColumn]);

  const sortHeader = (label: string, key: SortKey) => (
    <SortHeader label={label} active={sortKey === key} direction={sortDir} onToggle={() => toggleSort(key)} />
  );
  const ariaSort = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined;

  if (isLoading) {
    return (
      <>
        <div className="space-y-3 lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-5 w-16 rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </>
    );
  }

  const colCount = METRIC_COLUMNS.length + 2 + (extraColumn ? 1 : 0) + (action ? 1 : 0);

  return (
    <>
      {/* Phones + tablets: cards (the table needs ~900px) */}
      <div className="space-y-3 lg:hidden">
        {sorted.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>}
        {sorted.map((row) => {
          const body = (
            <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle(row)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={metaStatusTone(row.status)}>{metaStatusLabel(row.status)}</StatusBadge>
                  {href ? <ChevronRight className="size-4 text-muted-foreground" /> : action?.(row)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["spend", "roas", "cpc"] as const).map((key) => (
                  <div key={key} className="min-w-0">
                    <p className="text-xs text-muted-foreground">{METRIC_COLUMNS.find((c) => c.key === key)?.label}</p>
                    <p className={cn("truncate text-sm font-medium tabular-nums", key === "roas" && roasClass(row.insights.roas))}>
                      {metricCell(key, row.insights, currency)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          );
          return href ? (
            <Link
              key={row.id}
              href={href(row)}
              prefetch={false}
              className="block rounded-2xl border p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              {body}
            </Link>
          ) : (
            <div key={row.id} className="rounded-2xl border p-4">
              {body}
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead aria-sort={ariaSort("name")}>{sortHeader(nameLabel, "name")}</TableHead>
              <TableHead>Status</TableHead>
              {extraColumn && (
                <TableHead
                  aria-sort={extraColumn.sortValue ? ariaSort("extra") : undefined}
                  className={cn(extraColumn.align === "right" && "text-right [&>button]:ml-auto")}
                >
                  {extraColumn.sortValue ? sortHeader(extraColumn.label, "extra") : extraColumn.label}
                </TableHead>
              )}
              {METRIC_COLUMNS.map((c) => (
                <TableHead key={c.key} aria-sort={ariaSort(c.key)} className="text-right [&>button]:ml-auto">
                  {sortHeader(c.label, c.key)}
                </TableHead>
              ))}
              {action && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="py-12 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
            {sorted.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {href ? (
                    <Link
                      href={href(row)}
                      prefetch={false}
                      className="block max-w-xs truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    <p className="max-w-xs truncate font-medium">{row.name}</p>
                  )}
                  {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle(row)}</div>}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={metaStatusTone(row.status)}>{metaStatusLabel(row.status)}</StatusBadge>
                </TableCell>
                {extraColumn && (
                  <TableCell className={cn("text-muted-foreground", extraColumn.align === "right" && "text-right tabular-nums")}>
                    {extraColumn.render(row)}
                  </TableCell>
                )}
                {METRIC_COLUMNS.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn("text-right tabular-nums", c.key === "roas" && cn("font-medium", roasClass(row.insights.roas)))}
                  >
                    {metricCell(c.key, row.insights, currency)}
                  </TableCell>
                ))}
                {action && <TableCell className="text-right">{action(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

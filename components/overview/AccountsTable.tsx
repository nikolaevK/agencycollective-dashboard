"use client";

import { useState } from "react";
import Link from "next/link";
import { Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SortHeader } from "@/components/ui/SortHeader";
import { formatCurrency, formatNumber, formatRoas, cn } from "@/lib/utils";
import { ROAS_GOOD_THRESHOLD } from "@/lib/table-helpers";
import type { AccountSummary } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "ACTIVE" | "DISABLED";

interface AccountsTableProps {
  accounts?: AccountSummary[];
  isLoading?: boolean;
  dateRange?: string;
}

const AVATAR_COLORS = [
  "bg-violet-600", "bg-pink-500", "bg-amber-500", "bg-emerald-500",
  "bg-blue-600", "bg-cyan-500", "bg-indigo-500", "bg-orange-500",
];

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: "ACTIVE",
    className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  PAUSED: {
    label: "PAUSED",
    className: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  },
  DISABLED: {
    label: "DISABLED",
    className: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  },
  UNSETTLED: {
    label: "UNSETTLED",
    className: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  },
  PENDING_RISK_REVIEW: {
    label: "REVIEW",
    className: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  },
  IN_GRACE_PERIOD: {
    label: "GRACE",
    className: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  },
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DISABLED", label: "Disabled" },
];

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function hashIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % max;
}

export function AccountsTable({ accounts, isLoading, dateRange }: AccountsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // 1. Filter
  const filtered = (accounts ?? []).filter((a) => {
    const matchesSearch =
      !search.trim() ||
      a.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      a.id.toLowerCase().includes(search.trim().toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      a.status === statusFilter ||
      (statusFilter === "DISABLED" &&
        ["DISABLED", "UNSETTLED", "CLOSED"].includes(a.status));

    return matchesSearch && matchesStatus;
  });

  // 2. Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    if (sortKey === "name") {
      aVal = a.name;
      bVal = b.name;
    } else {
      aVal = a.insights[sortKey as keyof typeof a.insights] as number;
      bVal = b.insights[sortKey as keyof typeof b.insights] as number;
    }

    if (typeof aVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal);
    }
    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

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
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-4 w-14" />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop skeleton */}
        <div className="hidden md:block space-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-8 py-5">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header row: title + filter + view all */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        <h4 className="text-xl font-bold text-foreground">Top Performing Accounts</h4>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Filter search */}
          <div className="relative w-full md:w-64">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter accounts..."
              className="w-full pl-9 pr-4 py-2 bg-muted/40 dark:bg-muted/20 border-0 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 transition-all"
            />
          </div>

          {/* Status filter chips */}
          <div className="flex items-center gap-1">
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors",
                  statusFilter === opt.value
                    ? "bg-primary/5 text-primary dark:bg-primary/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result count */}
      {accounts && (search.trim() || statusFilter !== "all") && (
        <p className="text-xs text-muted-foreground mb-2 px-1">
          Showing {sorted.length} of {accounts.length} account{accounts.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {sorted.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">
            {search.trim() || statusFilter !== "all"
              ? "No accounts match your search or filter."
              : "No accounts found."}
          </p>
        )}
        {sorted.map((account) => {
          const statusStyle = STATUS_STYLES[account.status] ?? {
            label: account.status,
            className: "bg-muted text-muted-foreground",
          };
          const colorIdx = hashIndex(account.id, AVATAR_COLORS.length);

          return (
            <Link
              key={account.id}
              href={`/dashboard/accounts/${account.id}${dateRange ? `?${dateRange}` : ""}`}
              className="block rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 dark:border-white/[0.04] p-4 active:scale-[0.98] transition-all"
            >
              {/* Top: avatar + name + status */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm shrink-0",
                    AVATAR_COLORS[colorIdx]
                  )}
                >
                  {getInitials(account.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{account.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {account.currency} &middot; {account.timezone}
                  </p>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 text-[9px] font-black rounded-full uppercase shrink-0",
                    statusStyle.className
                  )}
                >
                  {statusStyle.label}
                </span>
              </div>

              {/* Bottom: key metrics grid */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Spend</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCurrency(account.insights.spend, account.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">ROAS</p>
                  <p
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      account.insights.roas >= ROAS_GOOD_THRESHOLD
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground"
                    )}
                  >
                    {formatRoas(account.insights.roas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">CPC</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCurrency(account.insights.cpc, account.currency)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto -mx-4 md:-mx-6 hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 dark:bg-muted/20">
              <th className="px-8 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {renderSortHeader("Account Name", "name")}
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("Spend", "spend")}
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right hidden md:table-cell">
                {renderSortHeader("Impressions", "impressions")}
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right hidden sm:table-cell">
                {renderSortHeader("CPC", "cpc")}
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                {renderSortHeader("ROAS", "roas")}
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center hidden sm:table-cell">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 dark:divide-white/[0.04]">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-12 text-sm">
                  {search.trim() || statusFilter !== "all"
                    ? "No accounts match your search or filter."
                    : "No accounts found."}
                </td>
              </tr>
            )}
            {sorted.map((account) => {
              const statusStyle = STATUS_STYLES[account.status] ?? {
                label: account.status,
                className: "bg-muted text-muted-foreground",
              };
              const colorIdx = hashIndex(account.id, AVATAR_COLORS.length);

              return (
                <tr
                  key={account.id}
                  className="hover:bg-muted/20 dark:hover:bg-muted/10 transition-colors group"
                >
                  <td className="px-8 py-5">
                    <Link
                      href={`/dashboard/accounts/${account.id}${dateRange ? `?${dateRange}` : ""}`}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0",
                          AVATAR_COLORS[colorIdx]
                        )}
                      >
                        {getInitials(account.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                          {account.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {account.currency} &middot; {account.timezone}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-5 text-sm font-medium text-foreground text-right tabular-nums">
                    {formatCurrency(account.insights.spend, account.currency)}
                  </td>
                  <td className="px-6 py-5 text-sm font-medium text-foreground text-right tabular-nums hidden md:table-cell">
                    {formatNumber(account.insights.impressions)}
                  </td>
                  <td className="px-6 py-5 text-sm font-medium text-foreground text-right tabular-nums hidden sm:table-cell">
                    {formatCurrency(account.insights.cpc, account.currency)}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        account.insights.roas >= ROAS_GOOD_THRESHOLD
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground"
                      )}
                    >
                      {formatRoas(account.insights.roas)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center hidden sm:table-cell">
                    <span
                      className={cn(
                        "inline-block px-2 py-1 text-[10px] font-black rounded-md uppercase",
                        statusStyle.className
                      )}
                    >
                      {statusStyle.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

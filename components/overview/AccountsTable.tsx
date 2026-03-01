"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Search } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatNumber, formatRoas, cn } from "@/lib/utils";
import type { AccountSummary } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "ACTIVE" | "DISABLED";

interface AccountsTableProps {
  accounts?: AccountSummary[];
  isLoading?: boolean;
  dateRange?: string;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DISABLED: "destructive",
  UNSETTLED: "destructive",
  PENDING_RISK_REVIEW: "warning",
  IN_GRACE_PERIOD: "warning",
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DISABLED", label: "Disabled" },
];

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

  function SortHeader({ label, column }: { label: string; column: SortKey }) {
    const active = sortKey === column;
    return (
      <button
        onClick={() => toggleSort(column)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-36" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by account name or ID…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center rounded-lg border border-input bg-background p-0.5 gap-0.5 shrink-0">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      {accounts && (search.trim() || statusFilter !== "all") && (
        <p className="text-xs text-muted-foreground">
          Showing {sorted.length} of {accounts.length} account{accounts.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto -mx-2 px-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Account" column="name" /></TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="text-right"><SortHeader label="Spend" column="spend" /></TableHead>
              <TableHead className="text-right hidden md:table-cell"><SortHeader label="Impressions" column="impressions" /></TableHead>
              <TableHead className="text-right hidden sm:table-cell"><SortHeader label="CTR" column="ctr" /></TableHead>
              <TableHead className="text-right hidden md:table-cell"><SortHeader label="CPC" column="cpc" /></TableHead>
              <TableHead className="text-right"><SortHeader label="ROAS" column="roas" /></TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {search.trim() || statusFilter !== "all"
                    ? "No accounts match your search or filter."
                    : "No accounts found."}
                </TableCell>
              </TableRow>
            )}
            {sorted.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/accounts/${account.id}${dateRange ? `?${dateRange}` : ""}`}
                    className="hover:text-primary hover:underline"
                  >
                    {account.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{account.currency} · {account.timezone}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={STATUS_STYLES[account.status] as "success" | "warning" | "destructive" ?? "secondary"}>
                    {account.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(account.insights.spend, account.currency)}
                </TableCell>
                <TableCell className="text-right font-mono hidden md:table-cell">
                  {formatNumber(account.insights.impressions)}
                </TableCell>
                <TableCell className="text-right font-mono hidden sm:table-cell">
                  {formatPercent(account.insights.ctr)}
                </TableCell>
                <TableCell className="text-right font-mono hidden md:table-cell">
                  {formatCurrency(account.insights.cpc, account.currency)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatRoas(account.insights.roas)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/accounts/${account.id}`}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

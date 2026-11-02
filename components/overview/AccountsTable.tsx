"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SortHeader } from "@/components/ui/SortHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
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

function roasClass(roas: number) {
  return roas >= ROAS_GOOD_THRESHOLD ? "text-emerald-700 dark:text-emerald-400" : undefined;
}

/** Initials in a circle — the kit Avatar's look without its Radix runtime. */
function Initials({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground"
    >
      {getInitials(name)}
    </span>
  );
}

/** Memoized: its props are stable query data, and the Overview re-renders as
 *  each of its other queries lands. */
export const AccountsTable = memo(function AccountsTable({ accounts, isLoading, dateRange }: AccountsTableProps) {
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
  const ariaSort = (column: SortKey) =>
    sortKey === column ? (sortDir === "asc" ? "ascending" : "descending") : undefined;

  const hrefOf = (a: AccountSummary) => `/dashboard/accounts/${a.id}${dateRange ? `?${dateRange}` : ""}`;
  const filtering = Boolean(search.trim()) || statusFilter !== "all";
  const emptyText = filtering ? "No accounts match your search or filter." : "No accounts found.";
  const spendDelta = (a: AccountSummary) =>
    a.previous ? <TrendDelta current={a.insights.spend} previous={a.previous.spend} /> : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle>Ad Accounts</CardTitle>
            {accounts && <Badge variant="secondary">{accounts.length}</Badge>}
          </div>
          <CardDescription className="text-xs">
            {accounts && filtering
              ? `Showing ${sorted.length} of ${accounts.length} account${accounts.length !== 1 ? "s" : ""}`
              : "Open an account for its campaigns, pixel and activity"}
          </CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter accounts..."
              aria-label="Filter accounts"
              className="pl-8"
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={statusFilter}
            onValueChange={(v) => {
              if (v) setStatusFilter(v as StatusFilter);
            }}
            aria-label="Account status"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Phones: cards */}
            <div className="space-y-3 lg:hidden">
              {sorted.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>}
              {sorted.map((account) => (
                <Link
                  key={account.id}
                  href={hrefOf(account)}
                  prefetch={false}
                  className="block rounded-2xl border p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <Initials name={account.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{account.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {account.currency} &middot; {account.timezone}
                      </p>
                    </div>
                    <StatusBadge tone={metaStatusTone(account.status)}>{metaStatusLabel(account.status)}</StatusBadge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Spend</p>
                      <p className="truncate text-sm font-medium tabular-nums">
                        {formatCurrency(account.insights.spend, account.currency)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">ROAS</p>
                      <p className={cn("truncate text-sm font-medium tabular-nums", roasClass(account.insights.roas))}>
                        {formatRoas(account.insights.roas)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">CPC</p>
                      <p className="truncate text-sm font-medium tabular-nums">
                        {formatCurrency(account.insights.cpc, account.currency)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead aria-sort={ariaSort("name")}>{renderSortHeader("Account", "name")}</TableHead>
                    <TableHead aria-sort={ariaSort("spend")} className="text-right [&>button]:ml-auto">
                      {renderSortHeader("Spend", "spend")}
                    </TableHead>
                    {/* Below xl the table would scroll sideways: impressions go first. */}
                    <TableHead aria-sort={ariaSort("impressions")} className="hidden text-right xl:table-cell [&>button]:ml-auto">
                      {renderSortHeader("Impressions", "impressions")}
                    </TableHead>
                    <TableHead aria-sort={ariaSort("cpc")} className="text-right [&>button]:ml-auto">
                      {renderSortHeader("CPC", "cpc")}
                    </TableHead>
                    <TableHead aria-sort={ariaSort("roas")} className="text-right [&>button]:ml-auto">
                      {renderSortHeader("ROAS", "roas")}
                    </TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        {emptyText}
                      </TableCell>
                    </TableRow>
                  )}
                  {sorted.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <Link href={hrefOf(account)} prefetch={false} className="group flex items-center gap-3 outline-none">
                          <Initials name={account.name} />
                          <div className="min-w-0">
                            <p className="max-w-xs truncate font-medium underline-offset-4 group-hover:underline group-focus-visible:underline">
                              {account.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {account.currency} &middot; {account.timezone}
                            </p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          {spendDelta(account)}
                          {formatCurrency(account.insights.spend, account.currency)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums xl:table-cell">
                        {formatNumber(account.insights.impressions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(account.insights.cpc, account.currency)}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium tabular-nums", roasClass(account.insights.roas))}>
                        {formatRoas(account.insights.roas)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={metaStatusTone(account.status)}>{metaStatusLabel(account.status)}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatNumber, formatRoas, cn } from "@/lib/utils";
import type { AccountSummary } from "@/types/dashboard";

type SortKey = "name" | "spend" | "impressions" | "ctr" | "cpc" | "roas";
type SortDir = "asc" | "desc";

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

export function AccountsTable({ accounts, isLoading, dateRange }: AccountsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = accounts
    ? [...accounts].sort((a, b) => {
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
      })
    : [];

  function SortHeader({
    label,
    column,
  }: {
    label: string;
    column: SortKey;
  }) {
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
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortHeader label="Account" column="name" /></TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right"><SortHeader label="Spend" column="spend" /></TableHead>
          <TableHead className="text-right"><SortHeader label="Impressions" column="impressions" /></TableHead>
          <TableHead className="text-right"><SortHeader label="CTR" column="ctr" /></TableHead>
          <TableHead className="text-right"><SortHeader label="CPC" column="cpc" /></TableHead>
          <TableHead className="text-right"><SortHeader label="ROAS" column="roas" /></TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              No accounts found
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
            <TableCell>
              <Badge variant={STATUS_STYLES[account.status] as "success" | "warning" | "destructive" ?? "secondary"}>
                {account.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(account.insights.spend, account.currency)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatNumber(account.insights.impressions)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatPercent(account.insights.ctr)}
            </TableCell>
            <TableCell className="text-right font-mono">
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
  );
}

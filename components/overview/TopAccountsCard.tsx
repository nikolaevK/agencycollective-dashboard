"use client";

import Link from "next/link";
import { PieChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { ROAS_GOOD_THRESHOLD } from "@/lib/table-helpers";
import type { AccountSummary } from "@/types/dashboard";

const TOP = 6;

const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold tracking-tight tabular-nums" title={value}>
        {value}
      </p>
    </div>
  );
}

/**
 * Where the period's ad spend went: the biggest spenders as share-of-spend
 * bars with their ROAS, each opening its account page.
 */
export function TopAccountsCard({
  accounts,
  isLoading,
  dateQuery,
  rangeLabel,
}: {
  accounts?: AccountSummary[];
  isLoading?: boolean;
  /** Carried into the account links ("preset=last_7d"). */
  dateQuery?: string;
  rangeLabel: string;
}) {
  const spending = (accounts ?? []).filter((a) => a.insights.spend > 0).sort((a, b) => b.insights.spend - a.insights.spend);
  const total = spending.reduce((s, a) => s + a.insights.spend, 0);
  const rest = spending.slice(TOP);
  const restSpend = rest.reduce((s, a) => s + a.insights.spend, 0);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <PieChart className="size-4 text-muted-foreground" />
          <CardTitle>Spend by Account</CardTitle>
        </div>
        <CardDescription className="text-xs">{rangeLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No ad spend in this period.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Accounts" value={String(spending.length)} />
              <Stat label="Top account" value={`${pctOf(spending[0].insights.spend, total)}%`} />
              <Stat label="Top 3" value={`${pctOf(spending.slice(0, 3).reduce((s, a) => s + a.insights.spend, 0), total)}%`} />
            </div>
            <ul className="space-y-1">
              {spending.slice(0, TOP).map((a) => {
                const pct = pctOf(a.insights.spend, total);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/dashboard/accounts/${a.id}${dateQuery ? `?${dateQuery}` : ""}`}
                      prefetch={false}
                      className="-mx-2 block space-y-1.5 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{a.name}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-medium">{formatCurrency(a.insights.spend, a.currency)}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {pct}% ·{" "}
                            <span className={cn(a.insights.roas >= ROAS_GOOD_THRESHOLD && "text-emerald-700 dark:text-emerald-400")}>
                              {formatRoas(a.insights.roas)}
                            </span>
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
              {rest.length > 0 && (
                <li className="space-y-1.5 px-0 py-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-muted-foreground">
                      {rest.length} other account{rest.length === 1 ? "" : "s"}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-medium">{formatCurrency(restSpend)}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{pctOf(restSpend, total)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-muted-foreground/40"
                      style={{ width: `${Math.max(pctOf(restSpend, total), 1)}%` }}
                    />
                  </div>
                </li>
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

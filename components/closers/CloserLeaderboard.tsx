"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/components/closers/types";
import { computeCloseRate } from "@/lib/deals";

interface CloserBreakdown {
  closerId: string;
  displayName: string;
  avatarPath: string | null;
  revenue: number;
  paidRevenue: number;
  closedCount: number;
  totalCount: number;
  /** In-flight (rescheduled/follow_up/not_closed) — part of the close-rate
   *  denominator so this rate matches the team Close Rate card. Optional so
   *  a stale cached payload without the field doesn't NaN the column. */
  inFlightCount?: number;
  commissionRate: number;
  showCount: number;
  noShowCount: number;
  showRate: number;
}

interface CloserLeaderboardProps {
  closerBreakdowns: CloserBreakdown[];
}

type SortKey = "revenue" | "paidRevenue" | "closeRate" | "showRate";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "paidRevenue", label: "Paid revenue" },
  { value: "closeRate", label: "Close rate" },
  { value: "showRate", label: "Show rate" },
];

/** The shared close-rate definition (lib/deals.ts) — same formula AND same
 *  rounding as the team Close Rate card, so the two never disagree.
 *  totalCount = closed + pending, so pending = totalCount − closed. */
function closeRateOf(c: CloserBreakdown): number {
  return computeCloseRate(
    c.closedCount,
    c.totalCount - c.closedCount,
    c.inFlightCount ?? 0
  );
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function InitialsAvatar({ name }: { name: string }) {
  return (
    <Avatar className="h-8 w-8">
      <AvatarFallback className="text-xs font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

// Gold / silver / bronze for the podium — a faint tint + ring, not a fill.
const MEDAL_STYLES: Record<number, string> = {
  1: "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300",
  2: "bg-zinc-400/10 text-zinc-600 ring-1 ring-inset ring-zinc-400/40 dark:text-zinc-300",
  3: "bg-orange-500/10 text-orange-700 ring-1 ring-inset ring-orange-500/25 dark:text-orange-300",
};

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center size-7 rounded-full text-xs tabular-nums",
        MEDAL_STYLES[rank] ? cn("font-semibold", MEDAL_STYLES[rank]) : "text-muted-foreground"
      )}
    >
      {rank}
    </span>
  );
}

export function CloserLeaderboard({ closerBreakdowns }: CloserLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");

  const sorted = useMemo(() => {
    const metric = (c: CloserBreakdown): number => {
      if (sortKey === "paidRevenue") return c.paidRevenue;
      if (sortKey === "closeRate") return closeRateOf(c);
      if (sortKey === "showRate") return c.showRate;
      return c.revenue;
    };
    return [...closerBreakdowns].sort((a, b) => metric(b) - metric(a)).slice(0, 10);
  }, [closerBreakdowns, sortKey]);

  // The bar always visualizes revenue share, whatever the ranking metric —
  // switching its meaning per sort would make rows incomparable at a glance.
  const maxRevenue = Math.max(...sorted.map((c) => c.revenue), 1);

  // The money column shows the metric the list is ranked by when that metric
  // is a dollar figure — sorting by an invisible number reads as mis-sorted.
  // Close/show-rate sorts already have their own visible columns.
  const paidSort = sortKey === "paidRevenue";
  const moneyLabel = paidSort ? "Paid Revenue" : "Revenue";
  const moneyValue = (c: CloserBreakdown) => (paidSort ? c.paidRevenue : c.revenue);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Top Closers</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="leaderboard-sort" className="text-xs text-muted-foreground">
            Sort by
          </label>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger id="leaderboard-sort" className="h-8 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No closer data available yet.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Closer</TableHead>
                    <TableHead className="text-right w-28">{moneyLabel}</TableHead>
                    <TableHead className="text-right whitespace-normal">Close Rate</TableHead>
                    <TableHead className="text-right whitespace-normal">Show Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((closer, index) => {
                    const rank = index + 1;
                    const closeRate = closeRateOf(closer);
                    const barWidth =
                      maxRevenue > 0
                        ? Math.max((closer.revenue / maxRevenue) * 100, 4)
                        : 0;

                    return (
                      <TableRow key={closer.closerId}>
                        <TableCell>
                          <RankBadge rank={rank} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <InitialsAvatar name={closer.displayName} />
                            {/* Revenue-share bar sits under the name — a column
                                of its own doesn't fit the half-width card. */}
                            <div className="min-w-0 w-36 space-y-1.5">
                              <p className="font-medium truncate">{closer.displayName}</p>
                              <Progress value={barWidth} aria-label="Revenue share" className="h-1.5 [&>div]:bg-chart-1" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCents(moneyValue(closer))}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {closeRate}%
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {closer.showRate}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden space-y-3">
              {sorted.map((closer, index) => {
                const rank = index + 1;
                const closeRate = closeRateOf(closer);
                const barWidth =
                  maxRevenue > 0
                    ? Math.max((closer.revenue / maxRevenue) * 100, 4)
                    : 0;

                return (
                  <div key={closer.closerId} className="rounded-2xl bg-muted/50 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <RankBadge rank={rank} />
                      <InitialsAvatar name={closer.displayName} />
                      <span className="font-medium text-sm truncate">{closer.displayName}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCents(moneyValue(closer))}
                        {paidSort && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">paid</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {closeRate}% close &middot; {closer.showRate}% show
                      </span>
                    </div>
                    <Progress value={barWidth} aria-label="Revenue share" className="h-2 mt-3 [&>div]:bg-chart-1" />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

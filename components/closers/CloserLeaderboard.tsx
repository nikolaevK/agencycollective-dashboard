"use client";

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";

interface CloserBreakdown {
  closerId: string;
  displayName: string;
  avatarPath: string | null;
  revenue: number;
  closedCount: number;
  totalCount: number;
  commissionRate: number;
  showCount: number;
  noShowCount: number;
  showRate: number;
}

interface CloserLeaderboardProps {
  closerBreakdowns: CloserBreakdown[];
}

function getInitialsColor(name: string): string {
  const colors = [
    "bg-violet-500/20 text-violet-600 dark:text-violet-400",
    "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    "bg-rose-500/20 text-rose-600 dark:text-rose-400",
    "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
    "bg-orange-500/20 text-orange-600 dark:text-orange-400",
    "bg-pink-500/20 text-pink-600 dark:text-pink-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, string> = {
    1: "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold",
    2: "bg-slate-300/30 text-slate-600 dark:text-slate-400 font-bold",
    3: "bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs",
        styles[rank] ?? "text-muted-foreground"
      )}
    >
      {rank}
    </span>
  );
}

export function CloserLeaderboard({ closerBreakdowns }: CloserLeaderboardProps) {
  const sorted = [...closerBreakdowns]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const maxRevenue = sorted[0]?.revenue ?? 1;

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <Trophy className="h-5 w-5 text-amber-500" />
        <h3 className="text-base font-semibold text-foreground">Top Closers</h3>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No closer data available yet.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 dark:border-white/[0.06]">
                  <th className="text-left pb-3 pr-2 text-xs font-medium text-muted-foreground w-10">
                    #
                  </th>
                  <th className="text-left pb-3 pr-2 text-xs font-medium text-muted-foreground">
                    Closer
                  </th>
                  <th className="text-right pb-3 pr-4 text-xs font-medium text-muted-foreground w-28">
                    Revenue
                  </th>
                  <th className="text-right pb-3 pr-4 text-xs font-medium text-muted-foreground w-24">
                    Close Rate
                  </th>
                  <th className="text-right pb-3 pr-4 text-xs font-medium text-muted-foreground w-24">
                    Show Rate
                  </th>
                  <th className="text-left pb-3 text-xs font-medium text-muted-foreground hidden lg:table-cell w-36">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((closer, index) => {
                  const rank = index + 1;
                  const closeRate =
                    closer.totalCount > 0
                      ? Math.round((closer.closedCount / closer.totalCount) * 100)
                      : 0;
                  const barWidth =
                    maxRevenue > 0
                      ? Math.max((closer.revenue / maxRevenue) * 100, 4)
                      : 0;

                  return (
                    <tr
                      key={closer.closerId}
                      className="border-b border-border/30 dark:border-white/[0.03] last:border-0"
                    >
                      <td className="py-3 pr-2">
                        <RankBadge rank={rank} />
                      </td>
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                              getInitialsColor(closer.displayName)
                            )}
                          >
                            {getInitials(closer.displayName)}
                          </div>
                          <span className="font-medium text-foreground truncate">
                            {closer.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-foreground tabular-nums">
                        {formatCents(closer.revenue)}
                      </td>
                      <td className="py-3 pr-4 text-right text-muted-foreground tabular-nums">
                        {closeRate}%
                      </td>
                      <td className="py-3 pr-4 text-right text-muted-foreground tabular-nums">
                        {closer.showRate}%
                      </td>
                      <td className="py-3 hidden lg:table-cell">
                        <div className="w-full bg-muted/50 dark:bg-white/5 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-violet-500/70"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {sorted.map((closer, index) => {
              const rank = index + 1;
              const closeRate =
                closer.totalCount > 0
                  ? Math.round((closer.closedCount / closer.totalCount) * 100)
                  : 0;
              const barWidth =
                maxRevenue > 0
                  ? Math.max((closer.revenue / maxRevenue) * 100, 4)
                  : 0;

              return (
                <div
                  key={closer.closerId}
                  className="rounded-lg border border-border/30 dark:border-white/[0.04] bg-muted/20 dark:bg-white/[0.02] p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <RankBadge rank={rank} />
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                          getInitialsColor(closer.displayName)
                        )}
                      >
                        {getInitials(closer.displayName)}
                      </div>
                      <span className="font-medium text-foreground text-sm truncate">
                        {closer.displayName}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatCents(closer.revenue)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {closeRate}% close &middot; {closer.showRate}% show
                    </span>
                  </div>
                  <div className="w-full bg-muted/50 dark:bg-white/5 rounded-full h-1.5 mt-2">
                    <div
                      className="h-1.5 rounded-full bg-violet-500/70"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

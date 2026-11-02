"use client";

import { RefreshCcw } from "lucide-react";
import { CardLink } from "@/components/overview/CardLink";
import { BadgeDot, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MONTHLY_REBILL_META, monthName } from "@/components/team/presentation";
import { MONTHLY_REBILL_BUCKETS, monthlyHeadline, type MonthlyRebillBucket } from "@/lib/teamRebill";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthlyRebillProgress, MonthlyRetention } from "@/components/team/types";

// Status colors (each segment is also named in the legend): collected = good,
// sent = awaiting payment, due = needs billing, overdue = late.
const BUCKET_TONE: Record<MonthlyRebillBucket, BadgeTone> = {
  collected: "success",
  sent: "info",
  due: "warning",
  overdue: "danger",
  scheduled: "neutral",
  untracked: "neutral",
};
const BAR: Partial<Record<MonthlyRebillBucket, string>> = {
  collected: "bg-emerald-500",
  sent: "bg-sky-500",
  due: "bg-amber-500",
  overdue: "bg-red-500",
};
const BAR_BUCKETS = ["collected", "sent", "due", "overdue"] as const;

/** Collected share of MRR managed (null without MRR) — the bar's green part. */
function collectedPct(monthly: MonthlyRebillProgress, mrrCents: number): number | null {
  return mrrCents > 0 ? Math.round((monthly.buckets.collected.mrrCents / mrrCents) * 100) : null;
}

/** Segmented bar over MRR managed — every client sits in one bucket, so the
 *  segments never overflow. */
export function RebillBar({
  monthly,
  mrrCents,
  className,
}: {
  monthly: MonthlyRebillProgress;
  mrrCents: number;
  className?: string;
}) {
  const headline = monthlyHeadline(monthly);
  return (
    <div
      className={cn("flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted", className)}
      title={BAR_BUCKETS.map(
        (b) => `${MONTHLY_REBILL_META[b].label}: ${monthly.buckets[b].count} · ${formatCents(monthly.buckets[b].mrrCents)}`
      ).join("  ·  ")}
      role="img"
      aria-label={`Re-bills ${monthName(monthly.month)}: ${formatCents(headline.cents)} ${
        headline.wholeBook ? "re-billed" : "collected"
      } of ${formatCents(mrrCents)} MRR`}
    >
      {mrrCents > 0 &&
        BAR_BUCKETS.map((b) => {
          const cents = monthly.buckets[b].mrrCents;
          if (cents <= 0) return null;
          return (
            <span
              key={b}
              className={cn("h-full min-w-[4px]", BAR[b])}
              style={{ width: `${(cents / mrrCents) * 100}%` }}
            />
          );
        })}
    </div>
  );
}

/**
 * This month's re-bill collection across the book (Team hub rollup): what's
 * collected, invoiced, due and late, as a share of MRR managed.
 */
export function RebillCollectionCard({
  monthly,
  mrrCents,
  retention,
  isLoading,
  isError,
  href,
  scopeLabel,
}: {
  monthly?: MonthlyRebillProgress;
  mrrCents: number;
  retention?: MonthlyRetention;
  isLoading?: boolean;
  isError?: boolean;
  href: string;
  /** "All books" / "Your clients". */
  scopeLabel: string;
}) {
  const headline = monthly ? monthlyHeadline(monthly) : null;
  const pct = monthly ? collectedPct(monthly, mrrCents) : null;

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <RefreshCcw className="size-4 text-muted-foreground" />
          <CardTitle>Re-bill Collection</CardTitle>
        </div>
        <CardLink href={href}>Team hub</CardLink>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isError && !monthly ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load the Team hub rollup.</p>
        ) : isLoading || !monthly || !headline ? (
          <>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-2 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCents(headline.cents)}</span>
                {/* The whole-book headline also counts brands outside the
                    directory, so it isn't a share of MRR — only the
                    collected bucket (the bar's green) is. */}
                <span className="text-xs text-muted-foreground">
                  {headline.wholeBook
                    ? `re-billed in ${monthName(monthly.month)} · whole book`
                    : `collected in ${monthName(monthly.month)}${pct !== null ? ` · ${pct}% of ${formatCents(mrrCents)} MRR` : ""}`}
                </span>
              </div>
              <CardDescription className="text-xs">{scopeLabel}</CardDescription>
            </div>
            <RebillBar monthly={monthly} mrrCents={mrrCents} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 2xl:grid-cols-3">
              {MONTHLY_REBILL_BUCKETS.map((b) => (
                <div key={b} className="min-w-0">
                  <dt className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <BadgeDot tone={BUCKET_TONE[b]} className={cn(b === "untracked" && "opacity-50")} />
                    <span className="truncate">{MONTHLY_REBILL_META[b].label}</span>
                  </dt>
                  <dd className="mt-0.5 truncate text-sm tabular-nums">
                    <span className="font-medium">{monthly.buckets[b].count}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{formatCents(monthly.buckets[b].mrrCents)}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {retention && retention.base > 0 && (
              <p className="mt-auto text-xs text-muted-foreground">
                Retention{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {Math.round((retention.retained / retention.base) * 100)}%
                </span>{" "}
                · {retention.retained} of {retention.base} clients re-billed this month
                {headline.wholeBook && pct !== null && ` · ${pct}% of ${formatCents(mrrCents)} MRR collected`}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { BadgeDot } from "@/components/ui/badge";
import { formatMoney } from "@/components/users/format";
import { MONTHLY_REBILL_BUCKETS, monthlyHeadline } from "@/lib/teamRebill";
import { MONTHLY_REBILL_META, monthName } from "./presentation";
import type {
  MonthlyRebillProgress,
  MonthlyRebillBucket,
  MonthlyRetention,
} from "./types";

/** Buckets that paint a bar segment, in draw order (rest = muted track). */
const BAR_BUCKETS: MonthlyRebillBucket[] = ["collected", "sent", "due", "overdue"];

/**
 * Monthly re-bill collection tracker — segmented progress over MRR managed.
 * Data comes straight from the server rollup (`summary.monthly`), which reads
 * the same computed Client Directory schedules + Payout-DB facts the Clients
 * page renders. The headline goes through `monthlyHeadline` (whole-book
 * Payout-DB aggregate for book-attribution scopes, collected-bucket sum
 * otherwise) so every surface shows the same number. Because every client
 * sits in exactly one bucket, segment widths sum to at most 100% of
 * `mrrManagedCents` and can never overflow.
 */
export function MonthlyRebillTracker({
  monthly,
  mrrManagedCents,
  goalCents,
  retention,
  className,
}: {
  monthly: MonthlyRebillProgress;
  mrrManagedCents: number;
  goalCents: number;
  retention?: MonthlyRetention;
  className?: string;
}) {
  const headline = monthlyHeadline(monthly);
  const pctOfMrr =
    mrrManagedCents > 0
      ? Math.round((headline.cents / mrrManagedCents) * 100)
      : null;
  const pctOfGoal =
    goalCents > 0 ? Math.round((headline.cents / goalCents) * 100) : null;

  const nonEmpty = MONTHLY_REBILL_BUCKETS.filter(
    (b) => monthly.buckets[b].count > 0
  );
  const titleParts = nonEmpty.map(
    (b) =>
      `${MONTHLY_REBILL_META[b].label}: ${monthly.buckets[b].count} · ${formatMoney(monthly.buckets[b].mrrCents)}`
  );
  if (headline.wholeBook) {
    titleParts.unshift(
      `All re-billed revenue this month: ${formatMoney(headline.cents)}`
    );
  }
  const barTitle = titleParts.join("  ·  ");

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="text-xs font-medium text-muted-foreground">
          Re-bills · {monthName(monthly.month)}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(headline.cents)}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {headline.wholeBook ? "re-billed · all book" : "collected"}
            {pctOfMrr !== null && ` · ${pctOfMrr}% of MRR`}
            {pctOfGoal !== null && ` · ${pctOfGoal}% of goal`}
          </span>
        </span>
      </div>

      <div
        className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
        title={barTitle || undefined}
        role="img"
        aria-label={`Re-bills ${monthName(monthly.month)}: ${formatMoney(headline.cents)} ${headline.wholeBook ? "re-billed" : "collected"}${pctOfMrr !== null ? `, ${pctOfMrr}% of MRR managed` : ""}`}
      >
        {mrrManagedCents > 0 &&
          BAR_BUCKETS.map((b) => {
            const cents = monthly.buckets[b].mrrCents;
            if (cents <= 0) return null;
            return (
              <span
                key={b}
                className={cn("h-full min-w-[4px]", MONTHLY_REBILL_META[b].bar)}
                style={{ width: `${(cents / mrrManagedCents) * 100}%` }}
              />
            );
          })}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          {nonEmpty.length > 0 ? (
            nonEmpty.map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <BadgeDot
                  tone={MONTHLY_REBILL_META[b].tone}
                  className={cn(b === "untracked" && "opacity-50")}
                />
                <span className="font-medium tabular-nums text-foreground">{monthly.buckets[b].count}</span>
                {MONTHLY_REBILL_META[b].label.toLowerCase()}
              </span>
            ))
          ) : (
            <span>No re-bills tracked yet</span>
          )}
        </p>
        {retention && retention.base > 0 && (
          <span
            className="text-muted-foreground"
            title={`${retention.retained} of ${retention.base} managed client${retention.base === 1 ? "" : "s"} re-billed this month`}
          >
            Retention{" "}
            <span className="font-medium tabular-nums text-foreground">
              {Math.round((retention.retained / retention.base) * 100)}%
            </span>{" "}
            <span className="tabular-nums">
              ({retention.retained}/{retention.base})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

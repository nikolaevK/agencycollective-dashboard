"use client";

import { cn } from "@/lib/utils";
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
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Re-bills · {monthName(monthly.month)}
        </span>
        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
          {formatMoney(headline.cents)}
          <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">
            {headline.wholeBook ? "re-billed · all book" : "collected"}
            {pctOfMrr !== null && ` · ${pctOfMrr}% of MRR`}
            {pctOfGoal !== null && ` · ${pctOfGoal}% of goal`}
          </span>
        </span>
      </div>

      <div
        className="mt-1.5 flex h-2 gap-0.5 rounded-full bg-muted overflow-hidden"
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

      <div className="mt-1.5 flex items-baseline justify-between gap-2 flex-wrap text-[11px] leading-4">
        <p>
          {nonEmpty.length > 0 ? (
            nonEmpty.map((b, i) => (
              <span key={b} className={cn("font-semibold", MONTHLY_REBILL_META[b].text)}>
                {i > 0 && <span className="text-muted-foreground/50 font-normal"> · </span>}
                {monthly.buckets[b].count} {MONTHLY_REBILL_META[b].label.toLowerCase()}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">No re-bills tracked yet</span>
          )}
        </p>
        {retention && retention.base > 0 && (
          <span
            className="font-semibold text-muted-foreground"
            title={`${retention.retained} of ${retention.base} managed client${retention.base === 1 ? "" : "s"} re-billed this month`}
          >
            Retention{" "}
            <span className="font-bold text-foreground">
              {Math.round((retention.retained / retention.base) * 100)}%
            </span>{" "}
            ({retention.retained}/{retention.base})
          </span>
        )}
      </div>
    </div>
  );
}

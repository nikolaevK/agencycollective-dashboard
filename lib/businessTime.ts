/**
 * The agency's business timezone — the single source of truth for "what day is
 * it" in all billing-cycle math. The re-bill engine is day-granular: a cycle
 * anchor, a "due" date, and a status (upcoming/due/overdue) are all calendar
 * dates with no time. Evaluating "today" against the server's UTC clock makes
 * those flip a day early every evening (UTC rolls over mid-afternoon Pacific),
 * so an invoice sent at 8pm PT would anchor to tomorrow. We pin "today" to the
 * Pacific calendar date instead.
 *
 * Both the send routes (which stamp `cycle_anchor`) and the directory builders
 * (which recompute `nextRebillAt` to decide the `invoice_sent` chip) MUST use
 * this same basis — otherwise a freshly-sent invoice's anchor won't match the
 * directory's recomputed cycle and the chip silently won't light.
 *
 * Overridable via `BILLING_TIME_ZONE` for agencies operating elsewhere.
 */
export const BUSINESS_TIME_ZONE =
  process.env.BILLING_TIME_ZONE || "America/Los_Angeles";

/** The current calendar date in the business timezone, as `yyyy-mm-dd`. */
export function businessTodayYmd(now: Date = new Date()): string {
  // Extract the parts explicitly (don't rely on a locale's string ordering) so
  // the result is always `yyyy-mm-dd`. `timeZone` shifts to the business day.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * UTC-midnight `Date` of the current business-timezone calendar date. The
 * re-bill engine treats `today` as a day-granular UTC instant (everything runs
 * through `toUtcMidnight` and compares `yyyy-mm-dd`), so we hand it the Pacific
 * date materialized at UTC midnight.
 */
export function businessToday(now: Date = new Date()): Date {
  return new Date(`${businessTodayYmd(now)}T00:00:00Z`);
}

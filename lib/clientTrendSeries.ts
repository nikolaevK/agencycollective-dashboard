// ---------------------------------------------------------------------------
// Client Directory trend series — pure, NO db imports (safe for "use client").
// The server folds each client's matched payout months into fixed 12-month
// arrays (lib/clientDirectory.ts getClientRevenueTrends); the page sums them
// over whatever subset it shows (workspace context, active clients), so the
// trend lines follow the same filters as the card numbers above them.
// ---------------------------------------------------------------------------

/** One client's payout activity per window month (cents, aligned to `months`). */
export interface ClientMonthSeries {
  id: string;
  /** Σ amount_due of the client's payout rows in the month (all kinds). */
  billed: number[];
  /** Σ amount_paid of the client's payout rows in the month. */
  collected: number[];
  /** Σ amount_due of the client's REBILL-flagged payout rows in the month. */
  rebilled: number[];
}

export interface ClientTrends {
  /** "yyyy-mm", oldest first, ending with the current business month. */
  months: string[];
  /** Clients in the caller's scope with any activity in the window. */
  clients: ClientMonthSeries[];
}

export const TREND_MONTHS = 12;

/** `count` consecutive "yyyy-mm" months ending with `endYm` (oldest first). */
export function trendMonths(endYm: string, count: number = TREND_MONTHS): string[] {
  const [y, m] = endYm.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

const ymOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/**
 * Fold one client's matched brand timelines into window arrays. `brands` are
 * the per-brand month entries (BrandHistory.months), `rebillBrands` the same
 * brands' REBILL-flagged months (getRebillPayoutMonthsByBrand). Months outside
 * the window are ignored.
 */
export function foldClientMonths(
  id: string,
  months: string[],
  brands: ReadonlyArray<ReadonlyArray<{ year: number; month: number; amountDue: number; amountPaid: number }>>,
  rebillBrands: ReadonlyArray<ReadonlyArray<{ year: number; month: number; amountDue: number }>>
): ClientMonthSeries {
  const index = new Map(months.map((ym, i) => [ym, i] as const));
  const billed = months.map(() => 0);
  const collected = months.map(() => 0);
  const rebilled = months.map(() => 0);
  for (const entries of brands) {
    for (const e of entries) {
      const i = index.get(ymOf(e.year, e.month));
      if (i === undefined) continue;
      billed[i] += e.amountDue;
      collected[i] += e.amountPaid;
    }
  }
  for (const entries of rebillBrands) {
    for (const e of entries) {
      const i = index.get(ymOf(e.year, e.month));
      if (i !== undefined) rebilled[i] += e.amountDue;
    }
  }
  return { id, billed, collected, rebilled };
}

export function hasActivity(s: ClientMonthSeries): boolean {
  return s.billed.some((v) => v !== 0) || s.collected.some((v) => v !== 0) || s.rebilled.some((v) => v !== 0);
}

/** Month-by-month sum of one series over the clients in `ids` (null = all). */
export function sumSeries(
  trends: ClientTrends,
  key: "billed" | "collected" | "rebilled",
  ids: ReadonlySet<string> | null
): number[] {
  const out = trends.months.map(() => 0);
  for (const c of trends.clients) {
    if (ids && !ids.has(c.id)) continue;
    c[key].forEach((v, i) => {
      out[i] += v;
    });
  }
  return out;
}

/**
 * Clients on the roster at the end of each month, by join date (yyyy-mm-dd).
 * Clients without a join date count from the start; the last point equals
 * the number of clients passed in.
 */
export function rosterByMonth(joinDates: ReadonlyArray<string | null>, months: string[]): number[] {
  return months.map(
    (ym) => joinDates.filter((d) => d == null || d.slice(0, 7) <= ym).length
  );
}

/** Clients that joined in each month (by join date). */
export function joinedByMonth(joinDates: ReadonlyArray<string | null>, months: string[]): number[] {
  return months.map((ym) => joinDates.filter((d) => d != null && d.slice(0, 7) === ym).length);
}

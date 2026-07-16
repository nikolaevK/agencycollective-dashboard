/**
 * Shared display formatters. Single source of truth for money and date
 * rendering — component-local copies had already drifted (some without the
 * NaN guard, one missing the zone-less-timestamp normalization).
 *
 * Money convention (CLAUDE.md): integer CENTS everywhere server-side;
 * `formatCents` renders them. `formatCurrency` takes DOLLARS (legacy admin
 * surfaces).
 */

/** Integer cents → "$1,235" (whole dollars, NaN-safe). */
export function formatCents(cents: number | null | undefined): string {
  const n = Number(cents);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((Number.isFinite(n) ? n : 0) / 100);
}

/** Dollars → "$1,234.56" under $1k, whole dollars above (legacy behavior). */
export function formatCurrency(value: number, currency = "USD"): string {
  const decimals = Math.abs(value) >= 1_000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * yyyy-mm-dd (or a timestamp) → "May 23, 2026". Returns "—" for null/invalid.
 *
 * - A pure calendar date ("yyyy-mm-dd", no time) is rendered in UTC so it never
 *   shifts a day (join / re-bill dates carry no time).
 * - A timestamp is rendered in the viewer's LOCAL timezone. The DB stores UTC
 *   without a zone ("yyyy-mm-dd HH:MM:SS"), so we normalize it to ISO-UTC first
 *   — otherwise an evening (UTC-negative) timestamp shows tomorrow's date.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const s = String(value);

  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const d = new Date(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    );
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  let iso = s;
  if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) &&
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
  ) {
    iso = s.replace(" ", "T") + "Z";
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

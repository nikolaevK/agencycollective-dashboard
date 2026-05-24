/** Shared formatters for the Client Directory UI. */

export function formatMoney(cents: number): string {
  const n = Number(cents);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((Number.isFinite(n) ? n : 0) / 100);
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

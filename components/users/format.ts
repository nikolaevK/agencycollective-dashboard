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

/** yyyy-mm-dd (or ISO) → "May 23, 2026". Returns "—" for null/invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Value formatting for the analyst's inline charts and tables (pure).
 * Model-supplied currency codes are validated — an unknown code would make
 * Intl.NumberFormat throw and take the whole message down with it.
 */

export type ValueFormat = "currency" | "percent" | "number" | "text";

/**
 * Lenient numeric parse for chart/table values: numbers pass through, strings
 * like "$1,234.50", "12.5%", "3.2x" or "1 200" become numbers. Returns null
 * for anything that isn't a number.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\s,]/g, "").replace(/^[^\d.+-]+/, "").replace(/[%x×]$/i, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const currencyCache = new Map<string, boolean>();

/** `code` if Intl knows it, otherwise USD. */
export function safeCurrency(code: string | undefined | null): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return "USD";
  if (!currencyCache.has(c)) {
    try {
      // Well-formed but unknown codes ("XYZ") don't throw — check the list when available.
      const known =
        typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency").includes(c) : true;
      new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(1);
      currencyCache.set(c, known);
    } catch {
      currencyCache.set(c, false);
    }
  }
  return currencyCache.get(c) ? c : "USD";
}

/** Formats a cell / tooltip value. Non-numeric values fall back to their text. */
export function formatValue(
  value: unknown,
  format: ValueFormat | undefined,
  currency?: string,
  opts: { compact?: boolean } = {}
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (!format || format === "text") return String(value);
  const n = toNumber(value);
  if (n === null) return String(value);
  const compact = opts.compact && Math.abs(n) >= 10_000;

  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: safeCurrency(currency),
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : Math.abs(n) >= 1_000 ? 0 : 2,
        minimumFractionDigits: compact || Math.abs(n) >= 1_000 ? 0 : 2,
      }).format(n);
    case "percent":
      return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
    case "number":
    default:
      return new Intl.NumberFormat("en-US", {
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : 2,
      }).format(n);
  }
}

/** Short axis / bar label (12.3K, 1.2M). */
export function formatAxisValue(value: unknown, format: ValueFormat | undefined, currency?: string): string {
  return formatValue(value, format ?? "number", currency, { compact: true });
}

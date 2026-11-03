/**
 * Shared shaping helpers for the document assistants' tool inputs (pure).
 *
 * The tools are presentational: the model writes the document into the tool
 * call and the UI renders it as a card. The route validates and normalizes
 * every call BEFORE the UI sees it — an invalid call goes back to the model
 * as an error result (so it can fix it) instead of being acknowledged as
 * "displayed" while the UI renders an empty card.
 */

import { stripMarkdownImages } from "./stripImages";

export type PreparedTool =
  | { ok: true; input: Record<string, unknown>; ack: string }
  | { ok: false; error: string };

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Trimmed string (numbers/booleans stringified), cut to `max`; "" for anything else. */
export function cleanText(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  return s.trim().slice(0, max);
}

/** One-line label: whitespace collapsed, trimmed, cut to `max`. */
export function cleanLabel(v: unknown, max: number): string {
  return cleanText(typeof v === "string" ? v.replace(/\s+/g, " ") : v, max);
}

/**
 * Markdown images become their alt text (parsed, not pattern-matched — see
 * lib/docChat/stripImages). Generated documents are rendered by markdown
 * renderers outside this chat (the SOP library, other viewers) — an image
 * there would fetch a model-chosen URL on view.
 */
export { stripMarkdownImages };

/** stripMarkdownImages on every string inside `value` (objects/arrays copied). */
export function deepStripImages(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return stripMarkdownImages(value);
  if (depth > 24) return value;
  if (Array.isArray(value)) return value.map((v) => deepStripImages(v, depth + 1));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepStripImages(v, depth + 1);
    return out;
  }
  return value;
}

export type TableFormat = "currency" | "percent" | "number" | "text";
const TABLE_FORMATS: readonly string[] = ["currency", "percent", "number", "text"];

export interface CleanTable {
  title: string;
  columns: { key: string; label: string; format?: TableFormat }[];
  rows: Record<string, unknown>[];
}

export const MAX_TABLE_COLUMNS = 12;
export const MAX_TABLE_ROWS = 200;

/**
 * A model-written table: columns need a key (label defaults to it), rows must
 * be objects (cells kept only for known columns, as strings or finite
 * numbers). Null when no usable column or row is left.
 */
export function cleanTable(raw: unknown): CleanTable | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null;
  const seen = new Set<string>();
  const columns: CleanTable["columns"] = [];
  for (const c of raw.columns) {
    if (!isPlainObject(c)) continue;
    const key = cleanLabel(c.key, 64);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const format = typeof c.format === "string" && TABLE_FORMATS.includes(c.format) ? (c.format as TableFormat) : undefined;
    columns.push({ key, label: cleanLabel(c.label, 80) || key, ...(format ? { format } : {}) });
    if (columns.length >= MAX_TABLE_COLUMNS) break;
  }
  if (columns.length === 0) return null;

  const rows: Record<string, unknown>[] = [];
  for (const r of raw.rows) {
    if (!isPlainObject(r)) continue;
    const row: Record<string, unknown> = {};
    for (const { key } of columns) {
      const v = r[key];
      if (typeof v === "number" && Number.isFinite(v)) row[key] = v;
      else if (typeof v === "string" || typeof v === "boolean") row[key] = cleanText(v, 500);
    }
    if (Object.keys(row).length > 0) rows.push(row);
    if (rows.length >= MAX_TABLE_ROWS) break;
  }
  if (rows.length === 0) return null;
  return { title: cleanLabel(raw.title, 200), columns, rows };
}

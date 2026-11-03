import type { AdCopyResult, CopyField, CopyVariant, KeptCopy } from "./types";

/**
 * Variant bookkeeping for the Ad Copy editor — pure, client-safe. Variants
 * carry stable ids (the old editor keyed inputs by index, so removing one
 * shifted text between fields and left the preview pointing past the end).
 */

export interface CopyLists {
  primaryText: CopyVariant[];
  headline: CopyVariant[];
  description: CopyVariant[];
}

export const EMPTY_LISTS: CopyLists = { primaryText: [], headline: [], description: [] };

let seq = 0;
export function newVariantId(): string {
  seq += 1;
  return `v${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function resultToLists(result: AdCopyResult): CopyLists {
  return {
    primaryText: result.primaryTexts.map((p) => ({ id: newVariantId(), text: p.text, angle: p.angle })),
    headline: result.headlines.map((text) => ({ id: newVariantId(), text })),
    description: result.descriptions.map((text) => ({ id: newVariantId(), text })),
  };
}

/** Per-field cap — matches the server's (lib/adCopy/request GENERATE_LIMITS.items). */
export const MAX_VARIANTS_PER_FIELD = 10;

/** A full regenerate: pinned items stay (in order, first), everything else is replaced. */
export function mergeFullResult(prev: CopyLists, result: AdCopyResult): CopyLists {
  const fresh = resultToLists(result);
  const keep = (list: CopyVariant[]) => list.filter((v) => v.pinned && v.text.trim());
  const merge = (a: CopyVariant[], b: CopyVariant[]) => [...a, ...b].slice(0, MAX_VARIANTS_PER_FIELD);
  return {
    primaryText: merge(keep(prev.primaryText), fresh.primaryText),
    headline: merge(keep(prev.headline), fresh.headline),
    description: merge(keep(prev.description), fresh.description),
  };
}

/** Replace one variant's text (regenerate), remembering the old text for undo. */
export function replaceVariant(list: CopyVariant[], id: string, text: string, angle?: string): CopyVariant[] {
  return list.map((v) => (v.id === id ? { ...v, previous: v.text, text, ...(angle !== undefined ? { angle } : {}) } : v));
}

export function undoVariant(list: CopyVariant[], id: string): CopyVariant[] {
  return list.map((v) => (v.id === id && v.previous !== undefined ? { ...v, text: v.previous, previous: undefined } : v));
}

function toKept(lists: CopyLists, only: (v: CopyVariant) => boolean): KeptCopy {
  const pick = (list: CopyVariant[]) => list.filter((v) => v.text.trim() && only(v));
  return {
    primaryTexts: pick(lists.primaryText).map((v) => ({ angle: v.angle ?? "", text: v.text })),
    headlines: pick(lists.headline).map((v) => v.text),
    descriptions: pick(lists.description).map((v) => v.text),
  };
}

/** Pinned items, for a full regenerate's "keep these" brief. Undefined when nothing is pinned. */
export function pinnedCopy(lists: CopyLists): KeptCopy | undefined {
  const kept = toKept(lists, (v) => Boolean(v.pinned));
  return kept.primaryTexts.length || kept.headlines.length || kept.descriptions.length ? kept : undefined;
}

/**
 * The current copy for a one-variant regenerate, plus the target's index in
 * it (blank variants are left out of the brief, so indexes are recomputed).
 */
export function variantRequest(lists: CopyLists, field: CopyField, id: string): { current: KeptCopy; index: number } | null {
  const current = toKept(lists, () => true);
  const nonEmpty = lists[field].filter((v) => v.text.trim());
  const index = nonEmpty.findIndex((v) => v.id === id);
  if (index === -1) return null;
  return { current, index };
}

/** The variant to preview/publish: the selected one if it still exists, else the first non-empty. */
export function pickVariant(list: CopyVariant[], selectedId: string | null): CopyVariant | null {
  return list.find((v) => v.id === selectedId) ?? list.find((v) => v.text.trim()) ?? list[0] ?? null;
}

/** Plain-text export of everything (Copy all). */
export function formatCopyAll(lists: CopyLists): string {
  const parts: string[] = [];
  const primaries = lists.primaryText.filter((v) => v.text.trim());
  if (primaries.length) {
    parts.push("PRIMARY TEXT");
    primaries.forEach((v, i) => parts.push(`\n${i + 1}. ${v.angle ? `${v.angle}\n` : ""}${v.text.trim()}`));
  }
  const list = (title: string, items: CopyVariant[]) => {
    const filled = items.filter((v) => v.text.trim());
    if (!filled.length) return;
    parts.push(`\n\n${title}`);
    filled.forEach((v, i) => parts.push(`${i + 1}. ${v.text.trim()}`));
  };
  list("HEADLINES", lists.headline);
  list("DESCRIPTIONS", lists.description);
  return parts.join("\n").trim();
}

/** Safely read whatever a streaming (partial) JSON value has so far. */
export function partialResult(value: unknown): AdCopyResult {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  const primaries = Array.isArray(v.primaryTexts) ? v.primaryTexts : [];
  return {
    detectedOffers: strings(v.detectedOffers),
    primaryTexts: primaries
      .map((p) => {
        const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
        return { angle: typeof o.angle === "string" ? o.angle : "", text: typeof o.text === "string" ? o.text : "" };
      })
      .filter((p) => p.angle || p.text),
    headlines: strings(v.headlines),
    descriptions: strings(v.descriptions),
  };
}

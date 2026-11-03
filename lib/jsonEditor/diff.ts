/**
 * Semantic JSON diff for the JSON Editor — pure. The client shows it as the
 * "what will change" list (and only enables Generate when it's non-empty);
 * the generate route sends it to the image model as the explicit edit list.
 * Whitespace, formatting and key order never count as changes.
 */

export type JsonObject = Record<string, unknown>;

export type JsonChange =
  | { kind: "added"; path: string; after: unknown }
  | { kind: "removed"; path: string; before: unknown }
  | { kind: "changed"; path: string; before: unknown; after: unknown };

export const MAX_DIFF_ENTRIES = 200;
const MAX_DIFF_DEPTH = 20;

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParsedJsonObject = { ok: true; value: JsonObject } | { ok: false; error: string };

/** Parse editor text that must hold a JSON object (not an array / scalar). */
export function parseJsonObject(text: string): ParsedJsonObject {
  if (!text.trim()) return { ok: false, error: "Empty" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
  if (!isPlainObject(value)) return { ok: false, error: "The JSON must be an object ({ … })" };
  return { ok: true, value };
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/** Own keys only — `"constructor" in {}` is true. */
function hasOwn(obj: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Fields that name an array item in the analysis schemas (objects, text elements, logos, light sources). */
const IDENTITY_KEYS = ["name", "content", "brand_name"] as const;
/** Above this many leftover pairs, leftovers pair up by position instead of by likeness. */
const MAX_PAIRING_CHECKS = 10_000;

function identityOf(item: unknown): string | null {
  if (!isPlainObject(item)) return null;
  for (const key of IDENTITY_KEYS) {
    const value = item[key];
    if (hasOwn(item, key) && typeof value === "string" && value.trim()) return `${key}:${value.trim().toLowerCase()}`;
  }
  return null;
}

/** Identity → index, for identities that occur exactly once in `items`. */
function uniqueIdentities(items: unknown[]): Map<string, number> {
  const seen = new Map<string, number>();
  const repeated = new Set<string>();
  items.forEach((item, i) => {
    const id = identityOf(item);
    if (id === null) return;
    if (seen.has(id)) repeated.add(id);
    else seen.set(id, i);
  });
  repeated.forEach((id) => seen.delete(id));
  return seen;
}

/** Share of an object's top-level fields that are equal in both (0 = nothing in common). */
function likeness(a: unknown, b: unknown): number {
  if (!isPlainObject(a) || !isPlainObject(b)) return jsonEqual(a, b) ? 1 : 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (keys.size === 0) return 1;
  let same = 0;
  keys.forEach((k) => {
    if (hasOwn(a, k) && hasOwn(b, k) && jsonEqual(a[k], b[k])) same++;
  });
  return same / keys.size;
}

/**
 * Pairs the items of two arrays of objects: first by a unique identity
 * (name / content / brand_name), then the leftovers by likeness (most alike
 * first; an edited name or text still pairs with its original through the
 * fields that didn't change). Unpaired items are removals / additions — so
 * deleting objects[0] is one removal, not a "changed" entry per later item.
 */
function pairItems(before: unknown[], after: unknown[]): { beforeOf: (number | null)[]; removed: number[] } {
  const beforeIds = uniqueIdentities(before);
  const afterIds = uniqueIdentities(after);
  const pairOfAfter = new Map<number, number>();
  const pairedBefore = new Set<number>();
  afterIds.forEach((ai, id) => {
    const bi = beforeIds.get(id);
    if (bi === undefined) return;
    pairOfAfter.set(ai, bi);
    pairedBefore.add(bi);
  });

  const leftBefore = before.map((_, i) => i).filter((i) => !pairedBefore.has(i));
  const leftAfter = after.map((_, i) => i).filter((i) => !pairOfAfter.has(i));
  if (leftBefore.length * leftAfter.length <= MAX_PAIRING_CHECKS) {
    const candidates: { bi: number; ai: number; score: number }[] = [];
    for (const ai of leftAfter) {
      for (const bi of leftBefore) {
        const score = likeness(before[bi], after[ai]);
        if (score > 0) candidates.push({ bi, ai, score });
      }
    }
    candidates.sort((x, y) => y.score - x.score || x.ai - y.ai || x.bi - y.bi);
    for (const { bi, ai } of candidates) {
      if (pairedBefore.has(bi) || pairOfAfter.has(ai)) continue;
      pairOfAfter.set(ai, bi);
      pairedBefore.add(bi);
    }
  } else {
    leftAfter.forEach((ai, k) => {
      if (k >= leftBefore.length) return;
      pairOfAfter.set(ai, leftBefore[k]);
      pairedBefore.add(leftBefore[k]);
    });
  }

  return {
    beforeOf: after.map((_, ai) => pairOfAfter.get(ai) ?? null),
    removed: before.map((_, i) => i).filter((i) => !pairedBefore.has(i)),
  };
}

function walk(before: unknown, after: unknown, path: string, depth: number, out: JsonChange[]): void {
  if (out.length >= MAX_DIFF_ENTRIES) return;
  if (isPlainObject(before) && isPlainObject(after) && depth <= MAX_DIFF_DEPTH) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (out.length >= MAX_DIFF_ENTRIES) return;
      const p = join(path, key);
      if (!hasOwn(after, key)) out.push({ kind: "removed", path: p, before: before[key] });
      else if (!hasOwn(before, key)) out.push({ kind: "added", path: p, after: after[key] });
      else walk(before[key], after[key], p, depth + 1, out);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && depth <= MAX_DIFF_DEPTH) {
    // Arrays of objects pair by identity; anything else (lists of words,
    // colors) stays positional, where order is part of the value.
    if ([...before, ...after].some(isPlainObject)) {
      // Paths use the item's index in the JSON it's in: the modified JSON
      // for changes / additions, the original for removals.
      const { beforeOf, removed } = pairItems(before, after);
      for (let ai = 0; ai < after.length; ai++) {
        if (out.length >= MAX_DIFF_ENTRIES) return;
        const bi = beforeOf[ai];
        const p = `${path}[${ai}]`;
        if (bi === null) out.push({ kind: "added", path: p, after: after[ai] });
        else walk(before[bi], after[ai], p, depth + 1, out);
      }
      for (const bi of removed) {
        if (out.length >= MAX_DIFF_ENTRIES) return;
        out.push({ kind: "removed", path: `${path}[${bi}]`, before: before[bi] });
      }
      return;
    }
    const len = Math.max(before.length, after.length);
    for (let i = 0; i < len; i++) {
      if (out.length >= MAX_DIFF_ENTRIES) return;
      const p = `${path}[${i}]`;
      if (i >= after.length) out.push({ kind: "removed", path: p, before: before[i] });
      else if (i >= before.length) out.push({ kind: "added", path: p, after: after[i] });
      else walk(before[i], after[i], p, depth + 1, out);
    }
    return;
  }
  if (!jsonEqual(before, after)) out.push({ kind: "changed", path, before, after });
}

/** Deep equality for JSON values (key order ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => hasOwn(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

/** Leaf-level changes from `before` to `after`, capped at MAX_DIFF_ENTRIES. */
export function diffJson(before: JsonObject, after: JsonObject): JsonChange[] {
  const out: JsonChange[] = [];
  walk(before, after, "", 0, out);
  return out;
}

/** Compact, length-capped JSON rendering of a value for change lists. */
export function previewValue(value: unknown, max = 300): string {
  const s = JSON.stringify(value) ?? String(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** One line per change, for the image-model prompt. */
export function formatChange(change: JsonChange): string {
  switch (change.kind) {
    case "added":
      return `Added ${change.path}: ${previewValue(change.after)}`;
    case "removed":
      return `Removed ${change.path} (was ${previewValue(change.before)})`;
    case "changed":
      return `Changed ${change.path}: ${previewValue(change.before)} → ${previewValue(change.after)}`;
  }
}

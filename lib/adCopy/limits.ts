import type { CopyField } from "./types";

/**
 * Meta placement text guidance — pure, client-safe.
 *
 * Source: Meta Ads Guide (facebook.com/business/ads-guide/update/image/…,
 * checked 2026-11-02): Facebook Feed primary text 50–150 / headline 27;
 * Instagram Feed primary 125 / headline 40; Stories primary 125 / headline 40.
 * The description number is the long-standing 27-character link-description
 * guidance (the current guide lists none). These are DISPLAY recommendations
 * — longer text is truncated behind "See more" / cut off — not API limits.
 */

export type PlacementId = "facebook_feed" | "instagram_feed" | "stories";

export interface PlacementSpec {
  id: PlacementId;
  label: string;
  /** Recommended max characters; null = the placement doesn't show the field. */
  limits: Record<CopyField, number | null>;
}

export const PLACEMENTS: readonly PlacementSpec[] = [
  { id: "facebook_feed", label: "Facebook Feed", limits: { primaryText: 150, headline: 27, description: 27 } },
  { id: "instagram_feed", label: "Instagram Feed", limits: { primaryText: 125, headline: 40, description: null } },
  { id: "stories", label: "Stories & Reels", limits: { primaryText: 125, headline: 40, description: null } },
];

export function placementById(id: PlacementId): PlacementSpec {
  return PLACEMENTS.find((p) => p.id === id) ?? PLACEMENTS[0];
}

/** Characters as people (and Meta's counters) count them — code points, so an emoji is 1, not 2. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

export interface FieldFit {
  placement: PlacementSpec;
  limit: number;
  count: number;
  over: boolean;
}

/**
 * How a piece of copy fits each placement that shows the field. Primary text
 * over the limit isn't wrong (long-form DR copy is normal) — it means the
 * reader sees the first `limit` characters before "See more".
 */
export function fitsByPlacement(field: CopyField, text: string): FieldFit[] {
  const count = charCount(text.trim());
  const out: FieldFit[] = [];
  for (const placement of PLACEMENTS) {
    const limit = placement.limits[field];
    if (limit == null) continue;
    out.push({ placement, limit, count, over: count > limit });
  }
  return out;
}

/** The tightest limit across placements (what the field badge compares against). */
export function tightestLimit(field: CopyField): number {
  const limits = PLACEMENTS.map((p) => p.limits[field]).filter((l): l is number => l != null);
  return Math.min(...limits);
}

/**
 * Cut text the way a feed does before "See more": at most `limit` code
 * points, backed off to the last word boundary (when there is one in the
 * last 20 characters), trailing punctuation/space trimmed. Line breaks count
 * as characters and are kept.
 */
export function truncateForFeed(text: string, limit: number): { visible: string; truncated: boolean } {
  const chars = Array.from(text);
  if (chars.length <= limit) return { visible: text, truncated: false };
  let cut = chars.slice(0, limit).join("");
  const lastSpace = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  if (lastSpace >= 0 && cut.length - lastSpace <= 20) cut = cut.slice(0, lastSpace);
  return { visible: cut.replace(/[\s.,;:!?-]+$/u, ""), truncated: true };
}

/** "https://www.shop.com/x?y" → "shop.com" for the link bar; null when not a URL. */
export function displayDomain(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!u.hostname.includes(".")) return null;
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

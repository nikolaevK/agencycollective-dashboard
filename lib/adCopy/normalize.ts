import type { AdCopyResult } from "./types";

/**
 * Normalizing the model's copy — pure and zod-free, so the client can run a
 * partial (stopped / cut-off) stream through the SAME rules the server
 * applies to a finished one (lib/adCopy/schema.ts re-exports these).
 */

const CAPS = { items: 10, offers: 20, offer: 120, angle: 60, primary: 5000, headline: 255, description: 255 } as const;

/**
 * Markdown the model shouldn't emit but sometimes does in copy: **bold**,
 * __bold__, leading "# " headings, "- " / "* " bullets turned into plain
 * lines. Meta shows these characters literally.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(text: string, max: number): string {
  return stripMarkdown(text).replace(/\s*\n+\s*/g, " ").slice(0, max).trim();
}

/** Trim, de-markdown, cap and drop empties — the shape the UI can trust. */
export function normalizeAdCopy(raw: AdCopyResult): AdCopyResult {
  const seen = new Set<string>();
  const offers: string[] = [];
  for (const o of raw.detectedOffers) {
    const v = oneLine(o, CAPS.offer);
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      offers.push(v);
    }
  }
  return {
    detectedOffers: offers.slice(0, CAPS.offers),
    primaryTexts: raw.primaryTexts
      .map((p) => ({ angle: oneLine(p.angle, CAPS.angle), text: stripMarkdown(p.text).slice(0, CAPS.primary) }))
      .filter((p) => p.text)
      .slice(0, CAPS.items),
    headlines: raw.headlines.map((h) => oneLine(h, CAPS.headline).replace(/(?<![.A-Z])\.$/, "")).filter(Boolean).slice(0, CAPS.items),
    descriptions: raw.descriptions.map((d) => oneLine(d, CAPS.description)).filter(Boolean).slice(0, CAPS.items),
  };
}

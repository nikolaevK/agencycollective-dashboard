import { z } from "zod";
import { normalizeAdCopy, stripMarkdown } from "./normalize";
import type { AdCopyResult } from "./types";

/**
 * Structured-output contract for POST /api/ad-copy (server-side: zod is kept
 * out of the client bundle — the client reads the already-validated result).
 *
 * ONE schema serves both a full generation and a single-variant regenerate,
 * so the rendered prompt prefix (and its cache) is identical across them.
 * Structured outputs don't support min/max constraints, so counts and
 * lengths are steered by the prompt and enforced in `normalizeAdCopy`.
 */
export const AD_COPY_JSON_SCHEMA = {
  type: "object",
  properties: {
    detectedOffers: {
      type: "array",
      description: "Promo codes, discounts, prices and product names seen in the creatives, verbatim.",
      items: { type: "string" },
    },
    primaryTexts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string", description: "2–5 word label for the angle." },
          text: { type: "string", description: "The full primary text, plain text with line breaks." },
        },
        required: ["angle", "text"],
        additionalProperties: false,
      },
    },
    headlines: { type: "array", items: { type: "string" } },
    descriptions: { type: "array", items: { type: "string" } },
  },
  required: ["detectedOffers", "primaryTexts", "headlines", "descriptions"],
  additionalProperties: false,
} as const;

const ResultSchema = z.object({
  detectedOffers: z.array(z.string()).default([]),
  primaryTexts: z.array(z.object({ angle: z.string().default(""), text: z.string() })).default([]),
  headlines: z.array(z.string()).default([]),
  descriptions: z.array(z.string()).default([]),
});

// The normalizer is zod-free (lib/adCopy/normalize.ts) so the client can reuse it.
export { normalizeAdCopy, stripMarkdown };

/** Parse the model's final JSON text; null when it isn't valid JSON of the right shape. */
export function parseAdCopy(text: string): AdCopyResult | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = ResultSchema.safeParse(json);
  return parsed.success ? normalizeAdCopy(parsed.data) : null;
}

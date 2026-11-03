/**
 * Image rules for the JSON Editor — pure, shared by the routes and the client.
 *
 * Request budget: on Vercel a function's request AND response body are capped
 * at 4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE, a non-JSON 413). The generate call
 * carries the source image, an optional reference image and two JSON
 * documents, so the client shrinks each image to UPLOAD_IMAGE_BUDGET_BYTES
 * before sending, and the generate route shrinks the returned image to
 * RESPONSE_IMAGE_BUDGET_BYTES when the model's output is bigger.
 */
import { sniffMatches } from "@/lib/clientAssetRules";

/** Types the routes accept (and Claude + Gemini both read). GIFs are converted client-side. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** What the uploader lets people pick (GIF → first frame, re-encoded before upload). */
export const PICKABLE_IMAGE_TYPES = [...ACCEPTED_IMAGE_TYPES, "image/gif"] as const;

/** Largest file the uploader takes before shrinking it in the browser. */
export const MAX_PICK_BYTES = 25 * 1024 * 1024;
/** Server-side cap per uploaded image (well under it in practice — the client shrinks). */
export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;

/** Longest edge of an uploaded image; larger photos are scaled down in the browser. */
export const UPLOAD_MAX_EDGE = 2048;
/** Per-image byte budget: two images + JSON stay well under the 4.5 MB request cap. */
export const UPLOAD_IMAGE_BUDGET_BYTES = 1_900_000;
/** Raw-byte budget for the generated image (base64 adds a third) — under the 4.5 MB response cap. */
export const RESPONSE_IMAGE_BUDGET_BYTES = 3_100_000;
/**
 * Cap per JSON document in the generate call (UTF-8 bytes). Three of them go
 * into the prompt, which must stay well inside the image models' ~131k-token
 * input window; checked by the client before uploading and by the route.
 */
export const MAX_JSON_BYTES = 100_000;

/** UTF-8 size of a string — what it costs in the request body (`length` counts UTF-16 units). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The ratio in `ratios` ("w:h" strings) closest in shape to width × height; null when there's none. */
export function nearestAspectRatio(width: number, height: number, ratios: readonly string[]): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  const target = Math.log(width / height);
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const ratio of ratios) {
    const [w, h] = ratio.split(":").map(Number);
    if (!(w > 0) || !(h > 0)) continue;
    // Compared in log space, so 2:1 and 1:2 are equally far from 1:1.
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
}

/** The image's real type from its first bytes — never the declared type. */
export function detectImageType(bytes: Uint8Array): AcceptedImageType | null {
  const head = bytes.subarray(0, 16);
  return ACCEPTED_IMAGE_TYPES.find((t) => sniffMatches(t, head)) ?? null;
}

/** Scale (w, h) down to fit `maxEdge` on the longer side; never up. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when a picked file can be uploaded as-is (no re-encode needed). */
export function canSendAsIs(file: { type: string; size: number }, dims: { width: number; height: number }): boolean {
  return (
    (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type) &&
    file.size <= UPLOAD_IMAGE_BUDGET_BYTES &&
    Math.max(dims.width, dims.height) <= UPLOAD_MAX_EDGE
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

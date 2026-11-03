/**
 * Image helpers shared by the Ad Copy routes and the browser encoder — pure,
 * no Node or DOM imports.
 */

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Identify an image by its magic bytes. The declared Content-Type of a CDN
 * response or a browser File isn't trusted: Claude rejects a block whose
 * media_type doesn't match the data, and Meta needs a real image.
 */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decoded size of a base64 string (no decode needed). */
export function base64DecodedBytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** Strict-enough base64 check: alphabet, padding, length multiple of 4. */
export function isBase64(b64: string): boolean {
  return b64.length > 0 && b64.length % 4 === 0 && BASE64_RE.test(b64);
}

/** First bytes of a base64 string, decoded without touching the rest (for sniffing). */
export function base64Head(b64: string, bytes = 16): Uint8Array {
  const chars = Math.ceil(bytes / 3) * 4;
  const head = b64.slice(0, chars);
  const bin = typeof atob === "function" ? atob(head) : Buffer.from(head, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Scale (w, h) to fit inside a `maxEdge` square, never upscaling. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Allowed hosts for creative images the server downloads — Meta's image CDNs
 * only. The creative fields we read (image_url, thumbnail_url, link_data
 * image_url/picture, video_data image_url) are served from *.fbcdn.net
 * (Instagram media from *.cdninstagram.com). facebook.com is deliberately NOT
 * here: it hosts l.facebook.com, Meta's outbound-link redirector.
 */
const META_IMAGE_HOST_SUFFIXES = [".fbcdn.net", ".cdninstagram.com"];

/**
 * Is this an https URL on a Meta CDN? The creative image URLs come from the
 * client's copy of Meta data, so the server only fetches what could have come
 * from Meta — on top of lib/publicImageFetch's connect-time IP guard. Pass it
 * to fetchPublicImage's `allowHost` too, so every redirect hop is held to it.
 */
export function isMetaImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return META_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

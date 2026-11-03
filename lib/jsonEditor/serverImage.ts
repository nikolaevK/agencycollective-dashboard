/**
 * Server-side image handling for the JSON Editor routes (sharp — server only;
 * never import this from a "use client" file).
 */
import sharp from "sharp";
import { readBodyCapped } from "@/lib/api/readBodyCapped";
import {
  detectImageType,
  MAX_UPLOAD_IMAGE_BYTES,
  RESPONSE_IMAGE_BUDGET_BYTES,
  type AcceptedImageType,
} from "./images";

/** Largest image sharp will decode (same cap as client assets) — a decompression bomb errors instead. */
const MAX_INPUT_PIXELS = 50_000_000;
const decodable = (input: Buffer) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });

/**
 * The request's multipart form, read under a byte cap: a declared or actual
 * body over `maxBytes` is refused before it's buffered whole (413); a body
 * that isn't a form is a 400.
 */
export async function readUploadForm(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; form: FormData } | { ok: false; status: 400 | 413 }> {
  try {
    const body = await readBodyCapped(request, maxBytes);
    if (!body) return { ok: false, status: 413 };
    const contentType = request.headers.get("content-type") ?? "";
    const form = await new Response(new Uint8Array(body), { headers: { "Content-Type": contentType } }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, status: 400 };
  }
}

export type ImageUpload =
  | { ok: true; buffer: Buffer; type: AcceptedImageType; width: number; height: number }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Validates one uploaded image form field: a non-empty file under the size
 * cap whose BYTES are PNG / JPEG / WebP (the declared type is ignored) and
 * whose pixel count sharp may decode, turned upright when its EXIF says it's
 * rotated (phones), so Claude and Gemini see the same pixels the user does.
 * `width` / `height` are the upright dimensions.
 */
export async function readImageUpload(value: FormDataEntryValue | null, label: string): Promise<ImageUpload> {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, status: 400, error: `${label} is required` };
  }
  if (value.size > MAX_UPLOAD_IMAGE_BYTES) {
    return { ok: false, status: 413, error: `${label} is too large (max 10 MB)` };
  }
  const buffer = Buffer.from(await value.arrayBuffer());
  const type = detectImageType(buffer);
  if (!type) {
    return { ok: false, status: 400, error: `${label} must be a PNG, JPEG or WebP image` };
  }
  try {
    // Header-only read, uncapped (a capped one just throws): the pixel cap is
    // checked here, with a clear message, before anything is decoded.
    const meta = await sharp(buffer, { limitInputPixels: false }).metadata();
    const { width, height } = meta.autoOrient;
    if (width * height > MAX_INPUT_PIXELS) {
      return { ok: false, status: 413, error: `${label} has too many pixels (max 50 megapixels)` };
    }
    if (meta.orientation && meta.orientation > 1) {
      const upright = await decodable(buffer).rotate().toFormat(formatOf(type)).toBuffer();
      return { ok: true, buffer: upright, type, width, height };
    }
    return { ok: true, buffer, type, width, height };
  } catch {
    return { ok: false, status: 400, error: `${label} couldn't be read — the file may be damaged` };
  }
}

function formatOf(type: AcceptedImageType): "jpeg" | "png" | "webp" {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpeg";
}

/** Claude rejects images over 5 MB of base64; base64 adds a third, so ≈ 3.75 MB raw. */
const CLAUDE_MAX_RAW_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);

/** Shrinks an image (as JPEG, transparency on white) until `maxBytes`; null if it can't get there. */
async function shrinkToJpeg(buffer: Buffer, maxBytes: number): Promise<Buffer | null> {
  const jpeg = (img: sharp.Sharp, quality: number) =>
    img.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
  for (const quality of [88, 80, 72]) {
    const out = await jpeg(decodable(buffer), quality);
    if (out.length <= maxBytes) return out;
  }
  const meta = await decodable(buffer).metadata();
  let width = meta.width ?? 2048;
  while (width > 400) {
    width = Math.round(width * 0.75);
    const out = await jpeg(decodable(buffer).resize({ width, withoutEnlargement: true }), 80);
    if (out.length <= maxBytes) return out;
  }
  return null;
}

/** Claude rejects images over 8000 px on a side. */
const CLAUDE_MAX_EDGE = 8000;

/** The image as Claude can take it: unchanged when within limits, else a JPEG that is. */
export async function fitForClaude(
  buffer: Buffer,
  type: AcceptedImageType
): Promise<{ data: Buffer; mediaType: AcceptedImageType } | null> {
  const { width = 0, height = 0 } = await decodable(buffer).metadata();
  let input = buffer;
  if (Math.max(width, height) > CLAUDE_MAX_EDGE) {
    input = await decodable(buffer)
      .resize({ width: CLAUDE_MAX_EDGE, height: CLAUDE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .toFormat(formatOf(type))
      .toBuffer();
  }
  if (input.length <= CLAUDE_MAX_RAW_BYTES) return { data: input, mediaType: type };
  const out = await shrinkToJpeg(input, CLAUDE_MAX_RAW_BYTES);
  return out ? { data: out, mediaType: "image/jpeg" } : null;
}

/**
 * The generated image as it can be returned: unchanged when it fits the
 * response budget (4.5 MB body cap on Vercel), else re-encoded as JPEG.
 * `compressed` tells the UI the download isn't the model's original bytes.
 */
export async function fitForResponse(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string; compressed: boolean } | null> {
  if (buffer.length <= RESPONSE_IMAGE_BUDGET_BYTES) return { data: buffer, mimeType, compressed: false };
  const out = await shrinkToJpeg(buffer, RESPONSE_IMAGE_BUDGET_BYTES);
  return out ? { data: out, mimeType: "image/jpeg", compressed: true } : null;
}

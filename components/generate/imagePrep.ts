// Browser-side image preparation for /api/generate.
// - Vercel caps a function request at 4.5 MB, so all images of one request
//   share UPLOAD_BUDGET_BYTES; big photos are downscaled + re-encoded instead
//   of failing with a 413 (Gemini reads inputs at ~1–1.5K anyway).
// - Gemini reads PNG / JPEG / WebP. Anything else the browser can decode (GIF,
//   AVIF, BMP, HEIC on Safari) is converted — judged by the file's bytes, not
//   its (renameable) declared type.
// Pure helpers (fitWithin, perImageBudget) are unit-tested; the canvas parts
// only run in the browser.

import { sniffMatches } from "@/lib/clientAssetRules";
import { GEMINI_UPLOAD_TYPES } from "@/lib/geminiModels";

const MB = 1024 * 1024;

/** Request-body budget for images (4.5 MB cap minus multipart + prompt overhead). */
export const UPLOAD_BUDGET_BYTES = Math.floor(3.8 * MB);
/** Largest source file we try to decode. */
export const MAX_SOURCE_BYTES = 25 * MB;
/** Longest edge sent to Gemini. */
export const MAX_UPLOAD_EDGE = 2048;
export const MAX_REFERENCE_IMAGES = 4;
/** Square thumbnail kept with each user turn (data URL in sessionStorage). */
const THUMB_EDGE = 160;

/** Shown to the user — a file we can't read or send. */
export class ImagePrepError extends Error {}

/** Scale (w, h) to fit `maxEdge` on the longest side; never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The real type from the magic bytes when Gemini reads it as is (same check as the server), else null. */
export function geminiTypeOf(head: Uint8Array): string | null {
  return GEMINI_UPLOAD_TYPES.find((type) => sniffMatches(type, head)) ?? null;
}

/** Byte budget for each of `count` images sent together. */
export function perImageBudget(count: number, budget: number = UPLOAD_BUDGET_BYTES): number {
  return Math.floor(budget / Math.max(1, count));
}

async function decode(blob: Blob, name: string): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new ImagePrepError(`Couldn't read "${name}" — use a JPEG, PNG or WebP image.`);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function drawScaled(bitmap: ImageBitmap, maxEdge: number, opaque: boolean): HTMLCanvasElement {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("This browser can't process images.");
  if (opaque) {
    // JPEG has no alpha — transparent areas would turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * The image as Gemini will get it: the original when it's already a
 * PNG/JPEG/WebP within `maxBytes` and MAX_UPLOAD_EDGE, otherwise a
 * downscaled WebP (JPEG where the browser can't encode WebP) that fits.
 */
export async function prepareForUpload(source: Blob, maxBytes: number, name = "image"): Promise<PreparedImage> {
  if (source.size > MAX_SOURCE_BYTES) {
    throw new ImagePrepError(`"${name}" is over ${MAX_SOURCE_BYTES / MB} MB.`);
  }
  const head = new Uint8Array(await source.slice(0, 16).arrayBuffer());
  const bitmap = await decode(source, name);
  try {
    if (
      geminiTypeOf(head) !== null &&
      source.size <= maxBytes &&
      Math.max(bitmap.width, bitmap.height) <= MAX_UPLOAD_EDGE
    ) {
      return { blob: source, width: bitmap.width, height: bitmap.height };
    }
    let edge = MAX_UPLOAD_EDGE;
    let quality = 0.9;
    for (let attempt = 0; attempt < 5; attempt++) {
      let canvas = drawScaled(bitmap, edge, false);
      let blob = await canvasBlob(canvas, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") {
        // No WebP encoder (older Safari): JPEG on white.
        canvas = drawScaled(bitmap, edge, true);
        blob = await canvasBlob(canvas, "image/jpeg", quality);
      }
      if (blob && blob.size <= maxBytes) return { blob, width: canvas.width, height: canvas.height };
      quality = Math.max(0.6, quality - 0.1);
      edge = Math.round(edge * 0.8);
    }
    throw new ImagePrepError(`"${name}" is too detailed to send — try a smaller image.`);
  } finally {
    bitmap.close();
  }
}

/** Decoded size + a small JPEG data-URL thumbnail, for the composer and the thread. */
export async function describeImage(source: Blob, name = "image"): Promise<{ width: number; height: number; thumb: string }> {
  if (source.size > MAX_SOURCE_BYTES) {
    throw new ImagePrepError(`"${name}" is over ${MAX_SOURCE_BYTES / MB} MB.`);
  }
  const bitmap = await decode(source, name);
  try {
    const canvas = drawScaled(bitmap, THUMB_EDGE, true);
    return { width: bitmap.width, height: bitmap.height, thumb: canvas.toDataURL("image/jpeg", 0.75) };
  } finally {
    bitmap.close();
  }
}

/** PNG copy of an image (the one type every browser's clipboard accepts). */
export async function toPng(source: Blob): Promise<Blob> {
  if (source.type === "image/png") return source;
  const bitmap = await decode(source, "image");
  try {
    const canvas = drawScaled(bitmap, Math.max(bitmap.width, bitmap.height), false);
    const blob = await canvasBlob(canvas, "image/png", 1);
    if (!blob) throw new ImagePrepError("Couldn't convert the image.");
    return blob;
  } finally {
    bitmap.close();
  }
}

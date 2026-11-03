import { fitWithin, sniffImageType, type ImageMediaType } from "./images";

/**
 * Browser-side image preparation for Ad Copy uploads (DOM APIs — client only).
 *
 * Vercel refuses request bodies over ~4.5 MB, and every upload rides inside a
 * JSON body as base64 (+33%). The old code sent originals (up to 5 MB each,
 * 10 of them) — any two phone photos broke generation with a 413. Now:
 *  - for Claude: each image is re-encoded to ≤ ANALYSIS_MAX_EDGE px and
 *    ≤ ANALYSIS_MAX_BYTES, so 10 uploads fit one request (text on the
 *    creative stays legible at this size);
 *  - for Meta (publish): the original is sent when it fits, else a
 *    high-quality JPEG ≤ PUBLISH_MAX_EDGE that fits the cap.
 */

export const ANALYSIS_MAX_EDGE = 1600;
export const ANALYSIS_MAX_BYTES = 300 * 1024;
export const PUBLISH_MAX_EDGE = 2560;
/** Keep in sync with DRAFT_LIMITS.imageBytes (lib/adCopy/draft.ts). */
export const PUBLISH_MAX_BYTES = 3 * 1024 * 1024;
/** Raw file size we accept from the picker at all. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export interface EncodedImage {
  base64: string;
  mediaType: ImageMediaType;
  width: number;
  height: number;
  bytes: number;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return btoa(bin);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function sniffFile(file: Blob): Promise<ImageMediaType | null> {
  return sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
}

/**
 * Re-encode to JPEG within `maxEdge` and `maxBytes`, stepping quality and
 * size down until it fits. Transparent pixels are flattened onto white
 * (JPEG has no alpha; black would be the default).
 */
async function encodeJpeg(bitmap: ImageBitmap, maxEdge: number, maxBytes: number): Promise<EncodedImage> {
  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58];
  let edge = maxEdge;
  for (let round = 0; round < 4; round++) {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, q);
      if (blob && blob.size <= maxBytes) {
        return { base64: await blobToBase64(blob), mediaType: "image/jpeg", width, height, bytes: blob.size };
      }
    }
    edge = Math.round(edge * 0.75);
  }
  throw new Error("Image is too detailed to compress — try a smaller file");
}

/** A picked/pasted/dropped file → the compact copy Claude reads. Throws a user-facing message. */
export async function prepareForAnalysis(file: File): Promise<EncodedImage> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
  const type = await sniffFile(file);
  if (!type) throw new Error(`${file.name} isn't a JPEG, PNG, WebP or GIF image`);
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`${file.name} couldn't be read`);
  try {
    const fits = Math.max(bitmap.width, bitmap.height) <= ANALYSIS_MAX_EDGE && file.size <= ANALYSIS_MAX_BYTES;
    if (fits && type !== "image/gif") {
      return { base64: await blobToBase64(file), mediaType: type, width: bitmap.width, height: bitmap.height, bytes: file.size };
    }
    return await encodeJpeg(bitmap, ANALYSIS_MAX_EDGE, ANALYSIS_MAX_BYTES);
  } finally {
    bitmap.close();
  }
}

/** The original upload → what Meta receives as the ad image (full quality when it fits). */
export async function prepareForPublish(file: File): Promise<EncodedImage> {
  const type = await sniffFile(file);
  if (!type) throw new Error(`${file.name} isn't a supported image`);
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`${file.name} couldn't be read`);
  try {
    // Meta takes JPEG/PNG/GIF as-is; WebP is converted.
    const passThrough = (type === "image/jpeg" || type === "image/png" || type === "image/gif") && file.size <= PUBLISH_MAX_BYTES;
    if (passThrough) {
      return { base64: await blobToBase64(file), mediaType: type, width: bitmap.width, height: bitmap.height, bytes: file.size };
    }
    return await encodeJpeg(bitmap, PUBLISH_MAX_EDGE, PUBLISH_MAX_BYTES);
  } finally {
    bitmap.close();
  }
}

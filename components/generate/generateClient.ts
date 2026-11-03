// Client side of POST /api/generate (see app/api/generate/protocol.ts):
// read the NDJSON stream, turn every failure shape (JSON error, Vercel's
// plain-text 413/504, a stream cut short) into one readable error, plus small
// pure helpers for the UI. No React, no DOM-only APIs (Blob and fetch run in
// Node too) — unit-tested.

import type {
  GenerateErrorBody,
  GenerateErrorCode,
  GenerateResult,
  GenerateStreamEvent,
} from "@/app/api/generate/protocol";

export type ClientErrorCode = GenerateErrorCode | "incomplete" | "network" | "http";

export class GenerateRequestError extends Error {
  constructor(
    message: string,
    readonly code: ClientErrorCode,
    readonly status: number,
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = "GenerateRequestError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** A non-stream (pre-generation) failure → GenerateRequestError. */
export function describeHttpFailure(status: number, body: unknown, retryAfterHeader: string | null): GenerateRequestError {
  const headerRetry = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
  if (isObject(body) && typeof body.error === "string") {
    const b = body as unknown as GenerateErrorBody;
    const retryAfter = typeof b.retryAfter === "number" ? b.retryAfter : Number.isFinite(headerRetry) ? headerRetry : undefined;
    return new GenerateRequestError(b.error, typeof b.code === "string" ? b.code : "http", status, retryAfter);
  }
  // Platform errors (Vercel's 413 / 504 pages) aren't JSON.
  switch (status) {
    case 401:
      return new GenerateRequestError("Your session has expired. Sign in again.", "unauthorized", status);
    case 403:
      return new GenerateRequestError("You don't have access to the Image Generator.", "forbidden", status);
    case 413:
      return new GenerateRequestError(
        "The upload is too large (4.5 MB per request). Remove a reference image or use smaller ones.",
        "too_large",
        status
      );
    case 429:
      return new GenerateRequestError(
        "Too many generations — wait a minute and try again.",
        "rate_limited",
        status,
        Number.isFinite(headerRetry) ? headerRetry : undefined
      );
    case 502:
    case 503:
      return new GenerateRequestError("The server is unavailable right now. Try again in a moment.", "http", status);
    case 504:
      return new GenerateRequestError(
        "The request timed out before the image was ready. Try again, or a lower resolution.",
        "http",
        status
      );
    default:
      return new GenerateRequestError(`Request failed (HTTP ${status}).`, "http", status);
  }
}

function isStreamEvent(v: unknown): v is GenerateStreamEvent {
  return isObject(v) && typeof v.type === "string";
}

/**
 * Resolve the generation: the `result` line of the NDJSON stream. Throws a
 * GenerateRequestError for a JSON error response, an `error` line, or a
 * stream that ends without a result (timeout / dropped connection).
 */
export async function readGenerateResponse(
  res: Response,
  onEvent?: (event: GenerateStreamEvent) => void
): Promise<GenerateResult> {
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("ndjson") || !res.body) {
    let body: unknown = null;
    try {
      body = type.includes("json") ? await res.json() : null;
    } catch {
      body = null;
    }
    throw describeHttpFailure(res.status, body, res.headers.get("retry-after"));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // A result line can be tens of MB (a 4K image): collect the pieces of the
  // current line and only search each new chunk for "\n" — never rescan.
  let pieces: string[] = [];

  const handleLine = (line: string): GenerateResult | null => {
    if (!line.trim()) return null;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return null; // a garbled keep-alive line is not fatal
    }
    if (!isStreamEvent(event)) return null;
    if (event.type === "result") return event.result;
    if (event.type === "error") {
      throw new GenerateRequestError(event.error, event.code, event.status, event.retryAfter);
    }
    onEvent?.(event);
    return null;
  };

  for (;;) {
    const { done, value } = await reader.read();
    let text = value ? decoder.decode(value, { stream: true }) : "";
    if (done) text += decoder.decode();
    let newline = text.indexOf("\n");
    while (newline !== -1) {
      pieces.push(text.slice(0, newline));
      const line = pieces.join("");
      pieces = [];
      const result = handleLine(line);
      if (result) {
        reader.cancel().catch(() => {});
        return result;
      }
      text = text.slice(newline + 1);
      newline = text.indexOf("\n");
    }
    if (text) pieces.push(text);
    if (done) {
      const result = handleLine(pieces.join(""));
      if (result) return result;
      throw new GenerateRequestError(
        "The connection closed before the image was ready (it may have timed out). Try again, or a lower resolution.",
        "incomplete",
        0
      );
    }
  }
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * A result image as a Blob. The browser decodes the data: URL natively —
 * atob + a byte loop over a 4K line (30 MB+) would freeze the tab. CSP
 * connect-src allows data:; base64ToBytes stays the fallback.
 */
export async function base64ToBlob(base64: string, mimeType: string): Promise<Blob> {
  try {
    const res = await fetch(`data:${mimeType};base64,${base64}`);
    if (res.ok) return await res.blob();
  } catch {
    /* fall back below */
  }
  return new Blob([base64ToBytes(base64)], { type: mimeType });
}

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...Array.from(bytes.subarray(start, start + length)));
}

/** Image headers sit at the start of the file (JPEG: after any EXIF / ICC segments). */
const IMAGE_HEADER_BYTES = 256 * 1024;

/** readImageSize from the first bytes of a Blob — never reads a whole 4K image. */
export async function readBlobImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  return readImageSize(new Uint8Array(await blob.slice(0, IMAGE_HEADER_BYTES).arrayBuffer()));
}

/** Pixel size from a PNG / JPEG / WebP header — no decode of a 4K image just to label it. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: IHDR is the first chunk.
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: walk the segments to the first start-of-frame.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (JPEG_SOF.has(marker)) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
    return null;
  }
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8 ") {
      return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const [b0, b1, b2, b3] = [bytes[21], bytes[22], bytes[23], bytes[24]];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === "VP8X") {
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    }
  }
  return null;
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** "sunset-over-the-mountains-20261102-1530.png" — from the prompt that made it. */
export function imageFileName(prompt: string | null, mimeType: string, when: Date, index = 0): string {
  const slug =
    (prompt ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "generated-image";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}`;
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `${slug}-${stamp}${suffix}.${EXTENSIONS[mimeType] ?? "png"}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 83_000 → "1:23". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "PNG", "JPEG", "WEBP" */
export function formatLabel(mimeType: string): string {
  return (mimeType.split("/")[1] ?? "image").toUpperCase();
}

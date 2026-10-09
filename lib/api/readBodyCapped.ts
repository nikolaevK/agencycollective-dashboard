/**
 * Read a request body with a hard byte cap, streaming — an oversized body is
 * rejected as soon as it crosses the cap instead of being buffered whole.
 * Vercel already refuses bodies over ~4.5 MB, but self-hosted / dev servers
 * don't, and `request.arrayBuffer()` / `request.json()` would happily buffer
 * gigabytes. A declared Content-Length over the cap fails before any read.
 *
 * Returns null when the body exceeds `maxBytes` (callers answer 413).
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts, total);
}

/**
 * JSON body under a byte cap. "too_large" → 413, "invalid" → 400 (also an
 * empty body, so callers that accept no body treat "invalid" as `{}`).
 */
export async function readJsonCapped(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too_large" | "invalid" }> {
  const raw = await readBodyCapped(request, maxBytes);
  if (!raw) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, value: JSON.parse(raw.toString("utf8")) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

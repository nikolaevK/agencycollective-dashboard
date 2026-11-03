import type { AdCopyStreamEvent } from "./types";

/**
 * Newline-delimited JSON framing for the /api/ad-copy stream — pure, shared
 * by the route (encode) and the client (decode). JSON.stringify escapes
 * newlines inside strings, so one event is always exactly one line.
 */

export function encodeEvent(event: AdCopyStreamEvent): string {
  return JSON.stringify(event) + "\n";
}

export interface NdjsonDecoder {
  /** Feed decoded text; returns every complete event in it. */
  push(chunk: string): AdCopyStreamEvent[];
  /** End of stream: parse a final line that had no trailing newline. */
  flush(): AdCopyStreamEvent[];
}

function parseLine(line: string): AdCopyStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === "object" && typeof (value as { t?: unknown }).t === "string") {
      return value as AdCopyStreamEvent;
    }
  } catch {
    // A malformed line (proxy noise, truncated tail) is skipped, not fatal.
  }
  return null;
}

export function createNdjsonDecoder(): NdjsonDecoder {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      const out: AdCopyStreamEvent[] = [];
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const event = parseLine(buffer.slice(0, nl));
        if (event) out.push(event);
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
      return out;
    },
    flush() {
      const event = parseLine(buffer);
      buffer = "";
      return event ? [event] : [];
    },
  };
}

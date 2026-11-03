/**
 * SSE (Server-Sent Events) parser for the chat API response streams.
 * Parses `event: <type>\ndata: <json>\n\n` frames from a ReadableStream.
 *
 * Shared by the AI Analyst, the client-portal analyst, Media Buyers chat and
 * SOP chat. The original five events (text_delta, tool_use, tool_result,
 * done, error) keep their exact shapes; the newer events (status,
 * turn_start, progress_delta, tool_start, fallback, refusal) and the optional
 * extra fields are sent by /api/chat, /api/media-chat and /api/sop-chat
 * (lib/docChat/route.ts) — never by the client-portal analyst.
 * Unknown event types are skipped, and so are frames without an event —
 * e.g. the `: ping` comment the admin chat routes send to keep a quiet
 * stream alive.
 */

import type { SSEEvent } from "@/types/chat";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Map one parsed frame to a typed event (null = unknown type, skipped). Exported for tests. */
export function toSSEEvent(eventType: string, parsed: Record<string, unknown>): SSEEvent | null {
  switch (eventType) {
    case "text_delta":
      return { type: "text_delta", text: str(parsed.text) };
    case "tool_use":
      return {
        type: "tool_use",
        id: str(parsed.id),
        name: str(parsed.name),
        input: (parsed.input as Record<string, unknown>) ?? {},
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: str(parsed.tool_use_id),
        result: parsed.result,
        ...(parsed.isError === true ? { isError: true } : {}),
        ...(typeof parsed.content === "string" ? { content: parsed.content } : {}),
      };
    case "done":
      return {
        type: "done",
        ...(typeof parsed.stopReason === "string" ? { stopReason: parsed.stopReason } : {}),
        ...(typeof parsed.servedBy === "string" ? { servedBy: parsed.servedBy } : {}),
      };
    case "error":
      return {
        type: "error",
        message: str(parsed.message, "Unknown error"),
        ...(typeof parsed.retryable === "boolean" ? { retryable: parsed.retryable } : {}),
      };
    case "status":
      return { type: "status", message: str(parsed.message) };
    case "turn_start":
      return { type: "turn_start", iteration: typeof parsed.iteration === "number" ? parsed.iteration : 0 };
    case "progress_delta":
      return { type: "progress_delta", key: str(parsed.key), text: str(parsed.text) };
    case "tool_start":
      return { type: "tool_start", id: str(parsed.id), name: str(parsed.name) };
    case "fallback":
      return {
        type: "fallback",
        from: str(parsed.from),
        to: str(parsed.to),
        category: typeof parsed.category === "string" ? parsed.category : null,
      };
    case "refusal":
      return {
        type: "refusal",
        category: typeof parsed.category === "string" ? parsed.category : null,
        message: str(parsed.message),
      };
    default:
      return null;
  }
}

function parseFrame(frame: string): SSEEvent | null {
  let eventType = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) eventType = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!eventType || !data) return null;
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    return toSSEEvent(eventType, parsed as Record<string, unknown>);
  } catch (e) {
    console.warn("[SSE parser] Malformed JSON frame:", data, e);
    return null;
  }
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any remaining bytes from the decoder
        buffer += decoder.decode();
        finished = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by double newlines
      const frames = buffer.split("\n\n");
      // Keep the last (potentially incomplete) frame in the buffer
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.trim()) continue;
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }

    // Process any remaining buffer content after stream ends
    if (buffer.trim()) {
      const event = parseFrame(buffer);
      if (event) yield event;
    }
  } finally {
    // The consumer stopped early (break/return/throw): release the connection
    // instead of leaving the response body open until GC.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * SSE (Server-Sent Events) parser for the chat API response stream.
 * Parses `event: <type>\ndata: <json>\n\n` frames from a ReadableStream.
 */

import type { SSEEvent } from "@/types/chat";

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any remaining bytes from the decoder
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by double newlines
      const frames = buffer.split("\n\n");
      // Keep the last (potentially incomplete) frame in the buffer
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.trim()) continue;

        let eventType = "";
        let data = "";

        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (!eventType || !data) continue;

        try {
          const parsed = JSON.parse(data);

          switch (eventType) {
            case "text_delta":
              yield { type: "text_delta", text: parsed.text ?? "" };
              break;
            case "tool_use":
              yield {
                type: "tool_use",
                id: parsed.id ?? "",
                name: parsed.name ?? "",
                input: parsed.input ?? {},
              };
              break;
            case "tool_result":
              yield {
                type: "tool_result",
                tool_use_id: parsed.tool_use_id ?? "",
                result: parsed.result,
              };
              break;
            case "done":
              yield { type: "done" };
              break;
            case "error":
              yield { type: "error", message: parsed.message ?? "Unknown error" };
              break;
          }
        } catch (e) {
          console.warn("[SSE parser] Malformed JSON frame:", data, e);
        }
      }
    }

    // Process any remaining buffer content after stream ends
    if (buffer.trim()) {
      let eventType = "";
      let data = "";
      for (const line of buffer.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (eventType && data) {
        try {
          const parsed = JSON.parse(data);
          switch (eventType) {
            case "text_delta":
              yield { type: "text_delta", text: parsed.text ?? "" };
              break;
            case "tool_use":
              yield {
                type: "tool_use",
                id: parsed.id ?? "",
                name: parsed.name ?? "",
                input: parsed.input ?? {},
              };
              break;
            case "tool_result":
              yield {
                type: "tool_result",
                tool_use_id: parsed.tool_use_id ?? "",
                result: parsed.result,
              };
              break;
            case "done":
              yield { type: "done" };
              break;
            case "error":
              yield { type: "error", message: parsed.message ?? "Unknown error" };
              break;
          }
        } catch (e) {
          console.warn("[SSE parser] Incomplete final frame:", data, e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Conversation-history parsing for the document assistants (pure). Same
 * rules as the AI Analyst's parseAnalystHistory, with caps sized for pasted
 * documents:
 *
 * - every block is shape-checked (tool ids, tool inputs as objects),
 * - over-long HISTORY is cut per block, never rejected — the client resends
 *   the whole history with every message, so one rejected block used to fail
 *   every later message in the chat,
 * - the new message must be the user's own text (Opus 5.5 rejects prefill)
 *   and is rejected, not cut, when it's over the cap,
 * - tool pairing is repaired server-side (never trust the client for it).
 */

import type { ApiChatMessage, ApiContentBlock } from "@/types/chat";
import { capText } from "@/lib/analyst/request";
import { repairToolPairs } from "@/lib/analyst/history";
import {
  DOC_CHAT_MAX_INPUT_CHARS,
  DOC_CHAT_MAX_MESSAGES,
  DOC_CHAT_MAX_REPLY_TEXT_CHARS,
  DOC_CHAT_MAX_TOOL_RESULT_CHARS,
} from "./limits";

const TOOL_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textCap(role: "user" | "assistant"): number {
  return role === "user" ? DOC_CHAT_MAX_INPUT_CHARS : DOC_CHAT_MAX_REPLY_TEXT_CHARS;
}

function validateBlock(block: unknown, role: "user" | "assistant"): ApiContentBlock | null {
  if (!isPlainObject(block)) return null;
  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: capText(block.text, textCap(role)) };
  }
  if (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    TOOL_ID_RE.test(block.id) &&
    typeof block.name === "string" &&
    TOOL_NAME_RE.test(block.name) &&
    isPlainObject(block.input)
  ) {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  }
  if (block.type === "tool_result" && typeof block.tool_use_id === "string" && TOOL_ID_RE.test(block.tool_use_id)) {
    const content = capText(
      typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""),
      DOC_CHAT_MAX_TOOL_RESULT_CHARS
    );
    return { type: "tool_result", tool_use_id: block.tool_use_id, content, ...(block.is_error === true ? { is_error: true } : {}) };
  }
  return null;
}

export type ParsedHistory = { ok: true; messages: ApiChatMessage[] } | { ok: false; error: string };

export function parseDocChatHistory(raw: unknown): ParsedHistory {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "messages is required" };
  if (raw.length > DOC_CHAT_MAX_MESSAGES) {
    return { ok: false, error: "This conversation is too long to send. Start a new chat." };
  }

  const parsed: ApiChatMessage[] = [];
  for (const [i, msg] of raw.entries()) {
    if (!isPlainObject(msg) || (msg.role !== "user" && msg.role !== "assistant")) {
      return { ok: false, error: "Invalid message format" };
    }
    if (typeof msg.content === "string") {
      const max = textCap(msg.role);
      if (i === raw.length - 1 && msg.content.length > max) {
        return { ok: false, error: `Message is too long (${max.toLocaleString("en-US")} characters max).` };
      }
      parsed.push({ role: msg.role, content: capText(msg.content, max) });
    } else if (Array.isArray(msg.content)) {
      const blocks: ApiContentBlock[] = [];
      for (const b of msg.content) {
        const valid = validateBlock(b, msg.role);
        if (!valid) return { ok: false, error: "Invalid message content" };
        blocks.push(valid);
      }
      parsed.push({ role: msg.role, content: blocks });
    } else {
      return { ok: false, error: "Invalid message content" };
    }
  }

  const last = parsed[parsed.length - 1];
  if (last.role !== "user" || typeof last.content !== "string" || !last.content.trim()) {
    return { ok: false, error: "The last message must be your request" };
  }
  const repaired = repairToolPairs(parsed);
  if (repaired.length === 0) return { ok: false, error: "messages is required" };
  return { ok: true, messages: repaired };
}

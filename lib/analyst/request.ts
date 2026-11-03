/**
 * AI Analyst request parsing (pure): the conversation history, the date range
 * and the analysis depth.
 */

import type { DatePreset, DateRangeInput } from "@/types/api";
import type { ApiChatMessage, ApiContentBlock } from "@/types/chat";
import { isRealYmd } from "@/lib/businessTime";
import { repairToolPairs } from "@/lib/analyst/history";

/** Every preset the dashboard's date picker offers (today/yesterday included). */
export const ANALYST_PRESETS: readonly DatePreset[] = [
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
];

/** Meta's insights look-back is 37 months. */
const MAX_RANGE_DAYS = 37 * 31;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// ─── History ─────────────────────────────────────────────────────────────────

export const MAX_MESSAGES = 50;
/** A message the user typed (the composer enforces the same cap). */
export const MAX_MESSAGE_CHARS = 8_000;
/** An earlier assistant reply's text — long analyses run well past the typed-message cap. */
export const MAX_REPLY_TEXT_CHARS = 100_000;
/** A tool result echoed back in history (a report's JSON, a page's text). */
export const MAX_TOOL_RESULT_CHARS = 60_000;
/**
 * Marks history text cut to the caps above. Over-long history is cut, never
 * rejected: the client resends the same history with every message, so one
 * rejected block would fail the rest of the chat.
 */
export const TRUNCATED_MARK = "\n[truncated]";

const TOOL_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `text` cut to `max` characters, marker included (never splitting a surrogate pair). */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - TRUNCATED_MARK.length;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last < 0xdc00) end--;
  return text.slice(0, end) + TRUNCATED_MARK;
}

function validateBlock(block: unknown, role: "user" | "assistant"): ApiContentBlock | null {
  if (!isPlainObject(block)) return null;
  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: capText(block.text, role === "user" ? MAX_MESSAGE_CHARS : MAX_REPLY_TEXT_CHARS) };
  }
  if (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    TOOL_ID_RE.test(block.id) &&
    typeof block.name === "string" &&
    block.name.length <= 64 &&
    isPlainObject(block.input)
  ) {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  }
  if (block.type === "tool_result" && typeof block.tool_use_id === "string" && TOOL_ID_RE.test(block.tool_use_id)) {
    const content = capText(
      typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""),
      MAX_TOOL_RESULT_CHARS
    );
    return { type: "tool_result", tool_use_id: block.tool_use_id, content, ...(block.is_error === true ? { is_error: true } : {}) };
  }
  return null;
}

/** Shape-check the client's history, then repair tool pairing (never trust the client for it). */
export function parseAnalystHistory(raw: unknown): { ok: true; messages: ApiChatMessage[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "messages is required" };
  if (raw.length > MAX_MESSAGES) return { ok: false, error: `messages exceeds limit of ${MAX_MESSAGES}` };

  const parsed: ApiChatMessage[] = [];
  for (const [i, msg] of raw.entries()) {
    if (!isPlainObject(msg) || (msg.role !== "user" && msg.role !== "assistant")) {
      return { ok: false, error: "Invalid message format" };
    }
    if (typeof msg.content === "string") {
      const max = msg.role === "user" ? MAX_MESSAGE_CHARS : MAX_REPLY_TEXT_CHARS;
      // The new question is rejected (the composer enforces the cap); history is cut.
      if (i === raw.length - 1 && msg.content.length > max) return { ok: false, error: "Message is too long" };
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
    return { ok: false, error: "The last message must be your question" };
  }
  const repaired = repairToolPairs(parsed);
  if (repaired.length === 0) return { ok: false, error: "messages is required" };
  return { ok: true, messages: repaired };
}

// ─── Date range ──────────────────────────────────────────────────────────────

export function parseAnalystDateRange(raw: unknown): Parsed<DateRangeInput> {
  if (raw === undefined || raw === null) return { ok: true, value: { preset: "last_7d" } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid date range" };
  const r = raw as Record<string, unknown>;

  if (r.preset !== undefined) {
    if (typeof r.preset !== "string" || !(ANALYST_PRESETS as readonly string[]).includes(r.preset)) {
      return { ok: false, error: "Invalid date preset" };
    }
    return { ok: true, value: { preset: r.preset as DatePreset } };
  }

  if (r.since === undefined && r.until === undefined) return { ok: true, value: { preset: "last_7d" } };
  if (typeof r.since !== "string" || typeof r.until !== "string" || !isRealYmd(r.since) || !isRealYmd(r.until)) {
    return { ok: false, error: "Invalid custom range (expected since and until as YYYY-MM-DD)" };
  }
  if (r.since > r.until) return { ok: false, error: "Invalid custom range (since is after until)" };
  const days = (Date.parse(`${r.until}T00:00:00Z`) - Date.parse(`${r.since}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, error: "Custom range is too long (37 months max)" };
  return { ok: true, value: { since: r.since, until: r.until } };
}

/**
 * Analysis depth → Opus 5.5 effort. "thorough" (high) is the default: answers
 * mix several tool calls with benchmark scoring and recommendations, the kind
 * of multi-step data analysis that repays deeper thinking. "quick" / "balanced"
 * trade depth for latency on simple lookups.
 */
export const ANALYSIS_DEPTHS = {
  quick: "low",
  balanced: "medium",
  thorough: "high",
} as const;

export type AnalysisDepth = keyof typeof ANALYSIS_DEPTHS;
export const DEFAULT_ANALYSIS_DEPTH: AnalysisDepth = "thorough";

export function parseAnalysisDepth(raw: unknown): AnalysisDepth {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(ANALYSIS_DEPTHS, raw)
    ? (raw as AnalysisDepth)
    : DEFAULT_ANALYSIS_DEPTH;
}

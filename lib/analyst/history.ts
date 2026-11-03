/**
 * Conversation history for the AI Analyst API (pure — client and server).
 *
 * The UI keeps each assistant reply as an ordered list of blocks (text,
 * tool calls, tool results, progress notes, notices). The API needs
 * alternating turns where every `tool_use` is answered by a `tool_result` in
 * the very next user message — one unanswered call (a stopped reply, a tool
 * that failed without a result) used to make every later request in the
 * chat fail with a 400. This module:
 *
 * - converts UI messages to API turns IN ORDER (text and tool calls up to the
 *   first result form one assistant turn, consecutive results one user turn),
 * - drops display-only blocks (progress notes, notices) and empty text,
 * - repairs tool pairing (unanswered calls and orphan results are dropped;
 *   a tool round the reply never continued is closed with a short assistant
 *   turn),
 * - trims the oldest exchanges to a message/byte budget, cutting only before
 *   a user's own message so no tool pair is split.
 *
 * Thinking blocks are never part of this history: each request re-plans from
 * the visible conversation (the server replays thinking only inside one
 * request's tool loop), so trimming or repairing here can't invalidate them.
 */

import type { ApiChatMessage, ApiContentBlock, ChatMessage } from "@/types/chat";

export interface HistoryBudget {
  /** Max API messages (the route rejects more than 50). */
  maxMessages: number;
  /**
   * Cap on the messages' size as sent: UTF-8 bytes of their JSON. The routes
   * cap the whole request body at 512 KB (bytes, not characters), so this
   * leaves room for the rest of the body (selection ids, date range).
   */
  maxBytes: number;
}

export const DEFAULT_HISTORY_BUDGET: HistoryBudget = { maxMessages: 40, maxBytes: 450_000 };

/** Closes a tool round the reply never continued (see repairToolPairs). */
export const INTERRUPTED_REPLY_TEXT = "(reply interrupted)";

function blocksOf(msg: ApiChatMessage): ApiContentBlock[] | null {
  return Array.isArray(msg.content) ? msg.content : null;
}

function isEmpty(msg: ApiChatMessage): boolean {
  return typeof msg.content === "string" ? msg.content.trim() === "" : msg.content.length === 0;
}

/** True for a user message the person typed (not a tool_result carrier). */
function isUserText(msg: ApiChatMessage): boolean {
  if (msg.role !== "user") return false;
  if (typeof msg.content === "string") return msg.content.trim() !== "";
  return msg.content.some((b) => b.type === "text" && b.text.trim() !== "");
}

/**
 * Drop unanswered `tool_use` blocks and `tool_result` blocks that don't answer
 * a call in the immediately preceding assistant turn; drop text blocks that
 * are empty; drop messages left empty; drop anything before the first user
 * message the person typed.
 *
 * A reply stopped (Stop, refusal, error) right after its tool results leaves
 * `assistant[…, tool_use] → user[tool_result]` followed by the next question.
 * The API merges consecutive user turns, so it would read that question as
 * the continuation of an open tool round — and with thinking always on and
 * thinking blocks never replayed here, an open round whose assistant turn
 * has no thinking block is a 400 on every later message. Such a round is
 * closed with a short assistant turn (INTERRUPTED_REPLY_TEXT), which keeps
 * the results the model already fetched.
 */
export function repairToolPairs(messages: ApiChatMessage[]): ApiChatMessage[] {
  const out: ApiChatMessage[] = [];

  messages.forEach((msg, i) => {
    let blocks = blocksOf(msg);
    if (!blocks) {
      out.push(msg);
      return;
    }
    blocks = blocks.filter((b) => b.type !== "text" || b.text.trim() !== "");

    if (msg.role === "assistant") {
      const next = messages[i + 1];
      const nextBlocks = next && next.role === "user" ? blocksOf(next) : null;
      const answered = new Set(
        (nextBlocks ?? []).flatMap((b) => (b.type === "tool_result" ? [b.tool_use_id] : []))
      );
      blocks = blocks.filter((b) => b.type !== "tool_use" || answered.has(b.id));
      blocks = blocks.filter((b) => b.type !== "tool_result");
    } else {
      const prev = out[out.length - 1];
      const prevBlocks = prev && prev.role === "assistant" ? blocksOf(prev) : null;
      const calls = new Set((prevBlocks ?? []).flatMap((b) => (b.type === "tool_use" ? [b.id] : [])));
      blocks = blocks.filter((b) => b.type !== "tool_result" || calls.has(b.tool_use_id));
      blocks = blocks.filter((b) => b.type !== "tool_use");
    }
    out.push({ role: msg.role, content: blocks });
  });

  const nonEmpty = out.filter((m) => !isEmpty(m));
  const firstUser = nonEmpty.findIndex(isUserText);
  return firstUser < 0 ? [] : closeOpenToolRounds(nonEmpty.slice(firstUser));
}

/** Insert an assistant turn after tool results that more user content follows (see repairToolPairs). */
function closeOpenToolRounds(messages: ApiChatMessage[]): ApiChatMessage[] {
  const out: ApiChatMessage[] = [];
  messages.forEach((msg, i) => {
    const blocks = msg.role === "user" ? blocksOf(msg) : null;
    if (!blocks || !blocks.some((b) => b.type === "tool_result")) {
      out.push(msg);
      return;
    }
    const results = blocks.filter((b) => b.type === "tool_result");
    const rest = blocks.filter((b) => b.type !== "tool_result");
    const next = messages[i + 1];
    if (rest.length === 0 && next?.role !== "user") {
      out.push(msg); // answered by the next assistant turn, or the open round a request continues
      return;
    }
    out.push({ role: "user", content: results });
    out.push({ role: "assistant", content: [{ type: "text", text: INTERRUPTED_REPLY_TEXT }] });
    if (rest.length > 0) out.push({ role: "user", content: rest });
  });
  return out;
}

/** UTF-8 byte length (lone surrogates never reach here: JSON.stringify escapes them). */
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      n += 4; // a surrogate pair
      i++;
    } else n += 3;
  }
  return n;
}

/** Bytes the message's content adds to the request body. */
function size(msg: ApiChatMessage): number {
  return utf8Bytes(JSON.stringify(msg.content));
}

/** Keep the newest messages within budget, starting at a user's own message. */
export function trimHistory(messages: ApiChatMessage[], budget: HistoryBudget = DEFAULT_HISTORY_BUDGET): ApiChatMessage[] {
  let start = 0;
  let total = messages.reduce((s, m) => s + size(m), 0);
  const fits = () => messages.length - start <= budget.maxMessages && total <= budget.maxBytes;

  while (!fits()) {
    // Advance to the next user text message after `start` (a safe cut point).
    let next = start + 1;
    while (next < messages.length && !isUserText(messages[next])) next++;
    if (next >= messages.length) break; // only the newest exchange is left — keep it
    for (let i = start; i < next; i++) total -= size(messages[i]);
    start = next;
  }
  return messages.slice(start);
}

function toolResultContent(content: unknown, historyContent: string | undefined): string {
  if (typeof historyContent === "string") return historyContent;
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content ?? "");
  } catch {
    return "";
  }
}

/** UI messages → API turns (ordered, display-only blocks dropped). Not yet repaired or trimmed. */
export function toApiMessages(messages: ChatMessage[]): ApiChatMessage[] {
  const out: ApiChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (msg.content.trim()) out.push({ role: "user", content: msg.content });
      continue;
    }
    if (!msg.blocks || msg.blocks.length === 0) {
      if (msg.content.trim()) out.push({ role: "assistant", content: msg.content });
      continue;
    }

    let assistant: ApiContentBlock[] = [];
    let results: ApiContentBlock[] = [];
    const flush = () => {
      if (assistant.length > 0) out.push({ role: "assistant", content: assistant });
      if (results.length > 0) out.push({ role: "user", content: results });
      assistant = [];
      results = [];
    };

    for (const b of msg.blocks) {
      if (b.type === "text" || b.type === "tool_use") {
        // Text or a call after results starts the next assistant turn.
        if (results.length > 0) flush();
        if (b.type === "text") {
          if (!b.text.trim()) continue;
          const last = assistant[assistant.length - 1];
          if (last && last.type === "text") assistant[assistant.length - 1] = { type: "text", text: last.text + b.text };
          else assistant.push({ type: "text", text: b.text });
        } else {
          assistant.push({ type: "tool_use", id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
        }
      } else if (b.type === "tool_result") {
        results.push({
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          content: toolResultContent(b.content, b.historyContent),
          ...(b.isError ? { is_error: true } : {}),
        });
      }
      // progress / notice blocks are display-only.
    }
    flush();
  }
  return out;
}

/** The history to send: converted, repaired and trimmed to budget. */
export function buildApiHistory(messages: ChatMessage[], budget: HistoryBudget = DEFAULT_HISTORY_BUDGET): ApiChatMessage[] {
  return repairToolPairs(trimHistory(repairToolPairs(toApiMessages(messages)), budget));
}

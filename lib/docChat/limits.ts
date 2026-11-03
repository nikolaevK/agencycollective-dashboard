/**
 * Limits shared by the document assistants (Media Buyers + SOP chat) — the
 * client trims to them and the routes enforce them, so they can't drift.
 * Pure: imported by both the routes and the chat UI.
 */

import type { HistoryBudget } from "@/lib/analyst/history";

/** Request body cap (bytes). Pasted documents and earlier generated documents ride along. */
export const DOC_CHAT_MAX_BODY_BYTES = 1_000_000;

/** API messages per request (the client trims to DOC_CHAT_HISTORY_BUDGET first). */
export const DOC_CHAT_MAX_MESSAGES = 50;

/** A message the user typed or pasted (the composer enforces the same cap). */
export const DOC_CHAT_MAX_INPUT_CHARS = 60_000;

/** An earlier assistant reply's text in history. */
export const DOC_CHAT_MAX_REPLY_TEXT_CHARS = 100_000;

/** A tool result echoed back in history (these are short acknowledgements). */
export const DOC_CHAT_MAX_TOOL_RESULT_CHARS = 20_000;

/**
 * What the client sends: the newest exchanges within 40 messages and 900 KB
 * of UTF-8 (room left under the 1 MB body cap for the rest of the body).
 */
export const DOC_CHAT_HISTORY_BUDGET: HistoryBudget = { maxMessages: 40, maxBytes: 900_000 };

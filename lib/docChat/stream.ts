/**
 * Streaming reducer for the document assistants (pure). Delegates to the AI
 * Analyst's reduceStreamEvent (same SSE protocol: a refusal drops the
 * declined turn's partial output, `fallback` sets servedBy, notices are
 * display-only and never sent back as history) and only rewords what's
 * specific to documents:
 *
 * - a reply that hit its length limit or the time limit WHILE writing a
 *   document (a tool call was still pending) can't be continued — the cut-off
 *   call is dropped whole and isn't in the history — so it says to ask for the
 *   document in parts instead of offering "Continue",
 * - a reply the route's wrap-up turn finished (stopReason "wrap_up": its
 *   step or time budget ran out) says to ask for anything missing next —
 *   a second requested document can't be produced in that reply,
 * - refusal hints talk about documents, not ad metrics.
 */

import { endNotice, reduceStreamEvent, type StreamState } from "@/lib/analyst/streamReducer";
import type { NoticeBlock, SSEEvent } from "@/types/chat";

const REFUSAL_HINTS: Record<string, string> = {
  bio: "Claude's safety filters flagged this as a biology topic. Documents for health or supplement brands usually work — keep the request on the marketing process rather than the product's science, and try again.",
  cyber: "Claude's safety filters flagged this as a security topic. Try rephrasing the request.",
  reasoning_extraction: "Claude doesn't show its internal reasoning. Ask for a short explanation instead.",
  frontier_llm: "Claude's safety filters flagged this as AI-model development. Try rephrasing the request.",
};

export function docRefusalText(category: string | null, message?: string): string {
  if (category && REFUSAL_HINTS[category]) return REFUSAL_HINTS[category];
  return message?.trim() || "Claude declined this request. Try rephrasing it.";
}

const ASK_IN_PARTS = "Ask for it in parts — for example, a few sections at a time.";

/** How a reply ended → notice (null = ended normally). `writing` = a tool call was still being written. */
export function docEndNotice(stopReason: string | undefined, writing: boolean): NoticeBlock | null {
  switch (stopReason) {
    case "max_tokens":
      return writing
        ? { type: "notice", kind: "truncated", text: `The document was too long to finish in one reply. ${ASK_IN_PARTS}` }
        : endNotice(stopReason);
    case "timeout":
      return writing
        ? { type: "notice", kind: "limit", text: `The document took too long to write in one reply. ${ASK_IN_PARTS}` }
        : { type: "notice", kind: "limit", text: "The reply ran out of time before it finished.", action: "continue" };
    case "iteration_limit":
      return { type: "notice", kind: "limit", text: "Stopped after the maximum number of steps for one reply.", action: "continue" };
    case "wrap_up":
      return {
        type: "notice",
        kind: "limit",
        text: "This reply used up its steps or time, so Claude wrapped it up. If a document you asked for is missing, ask for it next.",
        action: "continue",
      };
    default:
      return endNotice(stopReason);
  }
}

export function reduceDocChatEvent(state: StreamState, event: SSEEvent): StreamState {
  if (event.type === "refusal") {
    return reduceStreamEvent(state, { ...event, category: null, message: docRefusalText(event.category, event.message) });
  }
  if (event.type === "done") {
    const notice = docEndNotice(event.stopReason, state.pendingTools.length > 0);
    const next = reduceStreamEvent(state, { type: "done", ...(event.servedBy ? { servedBy: event.servedBy } : {}) });
    return notice ? { ...next, message: { ...next.message, blocks: [...(next.message.blocks ?? []), notice] } } : next;
  }
  return reduceStreamEvent(state, event);
}

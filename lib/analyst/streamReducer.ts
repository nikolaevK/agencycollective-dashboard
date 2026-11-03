/**
 * Builds the streaming assistant message from the AI Analyst's SSE events
 * (pure — the chat UI calls it per event). Kept out of React so the event
 * semantics are testable:
 *
 * - text and progress deltas append to the current block of their kind,
 * - `tool_start` registers a pending call (a placeholder until its
 *   `tool_use` arrives, cleared at the next turn / end),
 * - `refusal` discards everything streamed since the current `turn_start`
 *   (a declined turn's partial output is incomplete) and adds a notice,
 * - `fallback` marks the reply as answered by another model (`servedBy`),
 * - `done` / `error` / a local stop end the stream with the right notice.
 */

import type { ChatMessage, ContentBlock, NoticeBlock, ReportResult, SSEEvent } from "@/types/chat";

export interface PendingTool {
  id: string;
  name: string;
}

export interface StreamState {
  message: ChatMessage;
  /** blocks.length when the current model turn started. */
  turnStart: number;
  /** Tool calls the model is still writing. */
  pendingTools: PendingTool[];
  /** Latest server phase ("Loading Meta data…"), cleared once output arrives. */
  status: string | null;
  finished: boolean;
}

export function initialStreamState(id: string): StreamState {
  return {
    message: { id, role: "assistant", content: "", blocks: [] },
    turnStart: 0,
    pendingTools: [],
    status: null,
    finished: false,
  };
}

function textOf(blocks: ContentBlock[]): string {
  return blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
}

function withBlocks(state: StreamState, blocks: ContentBlock[], extra: Partial<StreamState> = {}): StreamState {
  return { ...state, ...extra, message: { ...state.message, blocks, content: textOf(blocks) } };
}

function notice(kind: NoticeBlock["kind"], text: string, action?: NoticeBlock["action"]): NoticeBlock {
  return { type: "notice", kind, text, ...(action ? { action } : {}) };
}

const REFUSAL_HINTS: Record<string, string> = {
  bio: "Claude's safety filters flagged this as a biology topic. Ad-performance questions about health or supplement brands usually work — try rephrasing around the ad metrics rather than the product's science.",
  cyber: "Claude's safety filters flagged this as a security topic. Try rephrasing the question.",
  reasoning_extraction: "Claude doesn't show its internal reasoning. Ask for a short explanation of the answer instead.",
  frontier_llm: "Claude's safety filters flagged this as AI-model development. Try rephrasing the question.",
};

export function refusalNoticeText(category: string | null, message?: string): string {
  if (category && REFUSAL_HINTS[category]) return REFUSAL_HINTS[category];
  return message?.trim() || "Claude declined to answer this request. Try rephrasing it.";
}

/** Notice for how a reply ended (null = ended normally). */
export function endNotice(stopReason: string | undefined): NoticeBlock | null {
  switch (stopReason) {
    case "max_tokens":
      return notice("truncated", "The reply hit its length limit.", "continue");
    case "model_context_window_exceeded":
      return notice("truncated", "This conversation is too long for the model. Start a new chat to continue.");
    case "iteration_limit":
      return notice("limit", "Stopped after the maximum number of analysis steps.", "continue");
    case "timeout":
      return notice("limit", "The analysis ran out of time before it finished.", "continue");
    default:
      return null;
  }
}

export function reduceStreamEvent(state: StreamState, event: SSEEvent): StreamState {
  const blocks = state.message.blocks ?? [];

  switch (event.type) {
    case "status":
      return { ...state, status: event.message || null };

    case "turn_start":
      return { ...state, turnStart: blocks.length, pendingTools: [] };

    case "text_delta": {
      if (!event.text) return state;
      const next = [...blocks];
      const last = next[next.length - 1];
      if (last?.type === "text") next[next.length - 1] = { ...last, text: last.text + event.text };
      else next.push({ type: "text", text: event.text });
      return withBlocks(state, next, { status: null });
    }

    case "progress_delta": {
      if (!event.text) return state;
      const next = [...blocks];
      const last = next[next.length - 1];
      if (last?.type === "progress" && last.key === event.key) {
        next[next.length - 1] = { ...last, text: last.text + event.text };
      } else {
        next.push({ type: "progress", key: event.key, text: event.text });
      }
      return withBlocks(state, next, { status: null });
    }

    case "tool_start":
      if (state.pendingTools.some((t) => t.id === event.id)) return state;
      return { ...state, status: null, pendingTools: [...state.pendingTools, { id: event.id, name: event.name }] };

    case "tool_use":
      return withBlocks(state, [...blocks, { type: "tool_use", id: event.id, name: event.name, input: event.input }], {
        pendingTools: state.pendingTools.filter((t) => t.id !== event.id),
      });

    case "tool_result":
      return withBlocks(state, [
        ...blocks,
        {
          type: "tool_result",
          tool_use_id: event.tool_use_id,
          content: event.result as string | ReportResult,
          ...(event.isError ? { isError: true } : {}),
          ...(typeof event.content === "string" ? { historyContent: event.content } : {}),
        },
      ]);

    case "fallback":
      // The only writer of `servedBy`, so it flags "a fallback model answered":
      // `done.servedBy` is just the last request's model (a later turn may be
      // the requested model again; a dated id never equals DEFAULT_MODEL).
      return { ...state, message: { ...state.message, servedBy: event.to || state.message.servedBy } };

    case "refusal":
      return withBlocks(
        state,
        [...blocks.slice(0, state.turnStart), notice("refusal", refusalNoticeText(event.category, event.message))],
        { pendingTools: [], status: null }
      );

    case "error":
      return withBlocks(
        state,
        [...blocks, notice("error", event.message, event.retryable === false ? undefined : "retry")],
        { pendingTools: [], status: null, finished: true }
      );

    case "done": {
      const end = endNotice(event.stopReason);
      return withBlocks(state, end ? [...blocks, end] : blocks, { pendingTools: [], status: null, finished: true });
    }

    default:
      return state;
  }
}

/** The user pressed Stop (or the request failed client-side). */
export function finishStreamLocally(state: StreamState, kind: "stopped" | "error", text: string): StreamState {
  if (state.finished) return state;
  const blocks = state.message.blocks ?? [];
  return withBlocks(state, [...blocks, notice(kind, text, kind === "error" ? "retry" : undefined)], {
    pendingTools: [],
    status: null,
    finished: true,
  });
}

/**
 * Streaming client-tool loop for Claude Opus 5.5 (server-only).
 *
 * One function, `runToolLoop`, drives the request → tools → request cycle the
 * way Opus 5.5 requires it:
 *
 * - Thinking is always on (adaptive). `display` defaults to "updates": the
 *   model's short progress notes between tool calls stream back as text
 *   (`progress_delta` events) while its reasoning stays hidden.
 * - Each assistant turn goes back into the transcript EXACTLY as received
 *   (`stream.finalMessage().content` — thinking blocks and signatures
 *   included). The transcript is append-only: nothing earlier is edited, and
 *   `system` / `tools` never change mid-loop (preserved-thinking check).
 * - Server-side refusal fallback (`fallbacks: "default"`) is on by default.
 *   After a mid-stream fallback the turn is echoed back per the documented
 *   rule (`echoContentAfterFallback`) and only tool calls made AFTER the last
 *   fallback boundary are run.
 * - `stop_reason` is checked before any content is used: `refusal` ends the
 *   loop (no tool from that turn runs), `max_tokens` with a pending tool call
 *   ends it (a truncated input is never executed), `pause_turn` resumes.
 * - Prompt caching: the caller marks its stable `system` blocks with
 *   `cache_control`; this adds top-level automatic caching so every loop
 *   iteration re-reads the growing transcript from cache.
 * - A wrap-up turn: when the iteration budget or the soft deadline is spent,
 *   the last request runs with `tool_choice: none` plus an appended note, so
 *   the model answers from what it has instead of being cut off mid-tool.
 *
 * Errors: an abort (caller's signal) resolves with `stopReason: "aborted"`;
 * every other failure is the SDK's typed error, rethrown for the caller to map
 * (see lib/claude/errors.ts).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaStopReason,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type ThinkingDisplay = "updates" | "summarized" | "omitted";

/** Server-side refusal fallback, routed by refusal category ("default" form). */
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Progress-update text between tool calls (`thinking.display: "updates"`). */
export const THINKING_DISPLAY_UPDATES_BETA = "thinking-display-updates-2026-08-18";

/** Appended after the last tool results when the loop's budget is spent. */
export const WRAP_UP_NOTE =
  "The tool budget for this reply is used up. Answer now from the data and tool results you already have, and say briefly what you could not get to.";

export type ToolLoopEvent =
  /** A new model request started (1-based). Text streamed after this belongs to it. */
  | { type: "turn_start"; iteration: number }
  | { type: "text_delta"; text: string }
  /** Non-empty thinking text — under display "updates", a progress note. `key` groups one block's deltas. */
  | { type: "progress_delta"; key: string; text: string }
  /** The model began writing a client tool call (input still streaming). */
  | { type: "tool_start"; id: string; name: string }
  /** A model declined and another one continued (server-side fallback). */
  | { type: "fallback"; from: string; to: string; category: string | null }
  | { type: "refusal"; category: string | null; explanation: string | null };

export interface ToolLoopUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ToolLoopOptions {
  client: Anthropic;
  model: string;
  /** Stable system blocks — mark the last stable one with `cache_control`. */
  system: BetaTextBlockParam[];
  /** Every tool the session may use, declared up front and never changed. */
  tools: BetaToolUnion[];
  /** History so far; must end with a user turn (Opus 5.5 rejects prefill). */
  messages: BetaMessageParam[];
  effort: ClaudeEffort;
  /** Per request; covers thinking + reply. */
  maxTokens: number;
  /** Model requests per loop, wrap-up turn included (≥ 2). */
  maxIterations: number;
  /** Epoch ms; once passed, the next request is the wrap-up turn. */
  softDeadline?: number;
  display?: ThinkingDisplay;
  /** `fallbacks: "default"` (on unless explicitly false). */
  fallbacks?: boolean;
  /** Extra beta flags (merged with the ones this helper needs). */
  betas?: string[];
  signal?: AbortSignal;
  /** Time to response headers per request (the SDK's `timeout`). */
  requestTimeoutMs?: number;
  /**
   * Run one assistant turn's tool calls; return one `tool_result` per call
   * (missing ones are filled in as errors). Calls arrive in the turn's order.
   */
  runTools: (calls: BetaToolUseBlock[]) => Promise<BetaToolResultBlockParam[]>;
  onEvent?: (event: ToolLoopEvent) => void;
}

export type ToolLoopStopReason = BetaStopReason | "aborted" | "iteration_limit";

export interface ToolLoopResult {
  stopReason: ToolLoopStopReason;
  /** Model requests made. */
  iterations: number;
  /** The full transcript (input history + every turn this loop appended). */
  messages: BetaMessageParam[];
  usage: ToolLoopUsage;
  /** Model that produced the last response (differs from `model` after a fallback). */
  servedBy: string;
  /** True when the last request was the forced wrap-up turn. */
  wrappedUp: boolean;
  refusal?: { category: string | null; explanation: string | null };
}

/** Blocks the declining model produced before a fallback boundary that must not be echoed. */
const DROP_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "connector_text", "tool_use"]);
/** Server-side tool calls are kept before the boundary only when their result is present. */
const SERVER_TOOL_CALLS = new Set(["server_tool_use", "mcp_tool_use"]);

/**
 * The assistant turn to send back, per the server-side fallback echo rule:
 * after the LAST `fallback` block everything is kept; before it, thinking,
 * redacted_thinking, connector_text and client `tool_use` blocks are dropped,
 * as are server-tool calls without a matching result. The `fallback` block
 * stays exactly where it was. Without a fallback block the turn is returned
 * unchanged (same array contents, same order).
 */
export function echoContentAfterFallback(content: BetaContentBlock[]): BetaContentBlockParam[] {
  let boundary = -1;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === "fallback") {
      boundary = i;
      break;
    }
  }
  const asParams = content as unknown as BetaContentBlockParam[];
  if (boundary < 0) return asParams;

  const resultIds = new Set<string>();
  for (const block of content) {
    const id = (block as { tool_use_id?: unknown }).tool_use_id;
    if (typeof id === "string") resultIds.add(id);
  }

  return asParams.filter((block, i) => {
    if (i >= boundary) return true;
    const type = (block as { type: string }).type;
    if (DROP_BEFORE_FALLBACK.has(type)) return false;
    if (SERVER_TOOL_CALLS.has(type)) {
      const id = (block as { id?: unknown }).id;
      return typeof id === "string" && resultIds.has(id);
    }
    return true;
  });
}

/** Pairs every call with a result (a missing one becomes an error result), in call order. */
export function pairToolResults(
  calls: Pick<BetaToolUseBlock, "id" | "name">[],
  results: BetaToolResultBlockParam[]
): BetaToolResultBlockParam[] {
  const byId = new Map(results.map((r) => [r.tool_use_id, r]));
  return calls.map(
    (call) =>
      byId.get(call.id) ?? {
        type: "tool_result",
        tool_use_id: call.id,
        is_error: true,
        content: `Tool "${call.name}" produced no result.`,
      }
  );
}

function addUsage(total: ToolLoopUsage, usage: BetaUsage | null | undefined) {
  if (!usage) return;
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
}

function isAbort(err: unknown, signal: AbortSignal | undefined): boolean {
  return err instanceof Anthropic.APIUserAbortError || Boolean(signal?.aborted);
}

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    client,
    model,
    system,
    tools,
    effort,
    maxTokens,
    signal,
    onEvent,
    runTools,
    display = "updates",
    fallbacks = true,
  } = opts;
  const maxIterations = Math.max(2, opts.maxIterations);
  const transcript: BetaMessageParam[] = [...opts.messages];
  const usage: ToolLoopUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const betas = Array.from(
    new Set([
      ...(fallbacks ? [SERVER_SIDE_FALLBACK_BETA] : []),
      ...(display === "updates" ? [THINKING_DISPLAY_UPDATES_BETA] : []),
      ...(opts.betas ?? []),
    ])
  );

  let iteration = 0;
  let servedBy = model;
  let wrapUp = false;

  const result = (stopReason: ToolLoopStopReason, extra: Partial<ToolLoopResult> = {}): ToolLoopResult => ({
    stopReason,
    iterations: iteration,
    messages: transcript,
    usage,
    servedBy,
    wrappedUp: wrapUp,
    ...extra,
  });

  while (true) {
    if (signal?.aborted) return result("aborted");
    iteration++;
    onEvent?.({ type: "turn_start", iteration });

    let message: BetaMessage;
    try {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          system,
          tools,
          messages: transcript,
          thinking: { type: "adaptive", display },
          output_config: { effort },
          // Automatic caching of the last cacheable block: each iteration
          // re-reads the transcript the previous one wrote.
          cache_control: { type: "ephemeral" },
          ...(fallbacks ? { fallbacks: "default" as const } : {}),
          ...(wrapUp ? { tool_choice: { type: "none" as const } } : {}),
          ...(betas.length > 0 ? { betas } : {}),
        },
        { signal, ...(opts.requestTimeoutMs ? { timeout: opts.requestTimeoutMs } : {}) }
      );

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            onEvent?.({ type: "tool_start", id: block.id, name: block.name });
          } else if (block.type === "fallback") {
            onEvent?.({
              type: "fallback",
              from: block.from.model,
              to: block.to.model,
              category: block.trigger?.category ?? null,
            });
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            if (delta.text) onEvent?.({ type: "text_delta", text: delta.text });
          } else if (delta.type === "thinking_delta") {
            // Empty under "updates" for reasoning blocks; non-empty = progress note.
            if (delta.thinking) {
              onEvent?.({ type: "progress_delta", key: `${iteration}:${event.index}`, text: delta.thinking });
            }
          }
        }
      }
      message = await stream.finalMessage();
    } catch (err) {
      if (isAbort(err, signal)) return result("aborted");
      throw err;
    }

    addUsage(usage, message.usage);
    servedBy = message.model;

    // Check the stop reason before using any content.
    if (message.stop_reason === "refusal") {
      const refusal = {
        category: message.stop_details?.category ?? null,
        explanation: message.stop_details?.explanation ?? null,
      };
      onEvent?.({ type: "refusal", ...refusal });
      return result("refusal", { refusal });
    }

    const content = echoContentAfterFallback(message.content);

    if (message.stop_reason === "pause_turn") {
      transcript.push({ role: "assistant", content });
      if (iteration >= maxIterations) return result("iteration_limit");
      continue;
    }

    const calls = content.filter((b): b is BetaToolUseBlock => (b as { type: string }).type === "tool_use");

    if (message.stop_reason !== "tool_use" || calls.length === 0) {
      transcript.push({ role: "assistant", content });
      return result(message.stop_reason ?? "end_turn");
    }

    if (wrapUp) {
      // tool_choice "none" makes this unreachable; never run tools past the budget.
      return result("iteration_limit");
    }

    transcript.push({ role: "assistant", content });
    const toolResults = pairToolResults(calls, await runTools(calls));
    if (signal?.aborted) return result("aborted");

    const budgetSpent =
      iteration >= maxIterations - 1 || (opts.softDeadline !== undefined && Date.now() >= opts.softDeadline);
    const userContent: BetaContentBlockParam[] = [...toolResults];
    if (budgetSpent) {
      wrapUp = true;
      userContent.push({ type: "text", text: WRAP_UP_NOTE });
    }
    transcript.push({ role: "user", content: userContent });
  }
}
